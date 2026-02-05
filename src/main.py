"""Gas Station Finder API.

This module implements a FastAPI-based backend service for searching gas stations near a specified city.
It provides endpoints for geocoding city names, fetching gas station data, and serving static frontend assets.

Features:
- Geocodes city names to latitude/longitude using OpenStreetMap Nominatim.
- Fetches gas station data from Prezzi Carburante API with retry logic.
- Serves static files and frontend HTML.
- Provides health check and favicon endpoints.

Intended for use as the backend of a web application to help users find nearby gas stations and compare fuel prices.
"""

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from tenacity import RetryError

from src.models import (
    DEFAULT_RESULTS_COUNT,
    MAX_RESULTS_COUNT,
    MAX_SEARCH_RADIUS_KM,
    SearchRequest,
    SearchResponse,
    Settings,
    StationSearchParams,
)
from src.services.fuel_api import fetch_gas_stations, parse_and_normalize_stations
from src.services.fuel_type_utils import normalize_fuel_type
from src.services.geocoding import geocode_city


def get_settings() -> Settings:
    """Returns application settings instance."""
    return Settings()  # pyright: ignore[reportCallIssue]


# --- Lifespan Management ---
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Lifespan context manager to handle startup and shutdown events."""
    # Create a shared HTTP client for connection pooling with timeout
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        # Store the client in app state for use in endpoints
        _app.state.http_client = client
        try:
            yield
        except (asyncio.CancelledError, KeyboardInterrupt):
            logger.info("Shutdown: CancelledError or KeyboardInterrupt caught, exiting cleanly.")
        except Exception as err:
            logger.exception(f"Unexpected error in lifespan: {err}")


# --- FastAPI App Initialization ---
HTTP_503_SERVICE_UNAVAILABLE = 503
app = FastAPI(title="Gas Station Finder API", lifespan=lifespan)

# Configure Loguru logger
logger.remove()
logger.add(
    sys.stdout,
    level="INFO",
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>",
    colorize=True,
)

# Add CORS middleware using settings
app.add_middleware(
    CORSMiddleware,  # ty:ignore[invalid-argument-type]
    allow_origins=get_settings().cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# --- API Endpoints ---
@app.get("/favicon.png", include_in_schema=False)
async def favicon() -> FileResponse:
    """Serve the favicon."""
    return FileResponse(
        static_dir / "favicon.png",
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@app.post("/search", response_class=JSONResponse)
async def search_gas_stations(
    request: SearchRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> SearchResponse:
    """Search for gas stations near a city within a given radius.

    Parameters:
    - request: SearchRequest containing city, radius, fuel, and results.
    - settings: Application settings (injected).

    Returns:
    - SearchResponse: List of stations and an optional warning message.
    """
    logger.info(
        "Received search request: city=%s, radius=%skm, fuel=%s, results=%s",
        request.city,
        request.radius,
        request.fuel,
        request.results,
    )

    # Normalize inputs without mutating the incoming request object
    city: str = (request.city or "").strip()
    if not city:
        raise HTTPException(status_code=400, detail="City name is required")

    results: int = request.results if request.results and request.results > 0 else DEFAULT_RESULTS_COUNT
    radius: int = min(max(request.radius or 1, 1), MAX_SEARCH_RADIUS_KM)

    # Geocode city
    try:
        location = await geocode_city(city, settings, app.state.http_client)
    except RetryError:
        return SearchResponse(
            stations=[],
            warning="City geocoding service is temporarily unavailable. Please try again later.",
            error=True,
        )
    except HTTPException:
        return SearchResponse(stations=[], warning="City not found. Please check the city name and try again.")

    # Fetch stations
    try:
        normalized_fuel = normalize_fuel_type(request.fuel)
        params = StationSearchParams(
            latitude=location["latitude"],
            longitude=location["longitude"],
            distance=radius,
            fuel=normalized_fuel,
            results=min(results, MAX_RESULTS_COUNT),
        )
        stations_payload = await fetch_gas_stations(params, settings, app.state.http_client)
    except RetryError:
        return SearchResponse(
            stations=[],
            warning="Gas station data is temporarily unavailable. Please try again later.",
            error=True,
        )
    except HTTPException:
        return SearchResponse(stations=[], warning="Failed to fetch gas station data. Please try again later.")

    # Parse and normalize stations
    stations, skipped_count = parse_and_normalize_stations(stations_payload, normalized_fuel, results)

    return SearchResponse(
        stations=stations,
        warning=f"{skipped_count} stations were excluded due to incomplete data." if skipped_count else None,
    )


@app.get("/", response_class=HTMLResponse)
async def read_root() -> FileResponse:
    """Serve the main HTML page."""
    index_path = static_dir / "index.html"
    return FileResponse(
        index_path,
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
