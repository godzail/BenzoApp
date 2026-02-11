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
import html as _html
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
from markdown import markdown as py_markdown
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
from src.services.prezzi_csv import preload_local_csv_cache


def get_settings() -> Settings:
    """Returns application settings instance.

    This function is used as a FastAPI dependency to provide configuration
    settings loaded from environment variables.

    Returns:
        Settings: The application settings object.
    """
    return Settings()


# --- Lifespan Management ---
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Lifespan context manager to handle startup and shutdown events."""
    settings = get_settings()
    # Create a shared HTTP client for connection pooling with timeout
    timeout = httpx.Timeout(60.0, connect=15.0)
    headers = {
        "User-Agent": settings.user_agent,
        "Accept": "text/csv",
    }
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        # Store the client in app state for use in endpoints
        _app.state.http_client = client
        # Optionally preload local CSV data into cache (non-blocking)
        if settings.prezzi_preload_on_startup:
            try:
                task = asyncio.create_task(preload_local_csv_cache(settings))
                # keep a reference to avoid GC and aid debugging
                _app.state._preload_task = task
                task.add_done_callback(lambda t: logger.debug("Prezzi preload task finished"))
            except Exception as err:
                logger.warning("Failed to start prezzi preload task: {}", err)
        try:
            yield
        except (asyncio.CancelledError, KeyboardInterrupt):
            logger.info("Shutdown: CancelledError or KeyboardInterrupt caught, exiting cleanly.")
        except Exception as err:
            logger.exception("Unexpected error in lifespan: {}", err)


# --- FastAPI App Initialization ---
# HTTP status code for service unavailable responses
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

# Serve docs assets (images, included files) under a static route
docs_dir = Path(__file__).parent.parent / "docs"
app.mount("/docs-static", StaticFiles(directory=docs_dir), name="docs_static")


# --- API Endpoints ---
@app.get("/favicon.png", include_in_schema=False)
async def favicon() -> FileResponse:
    """Serve the favicon PNG."""
    return FileResponse(
        static_dir / "favicon.png",
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@app.get("/favicon.ico", include_in_schema=False)
async def favicon_ico() -> FileResponse:
    """Serve a favicon.ico by returning the PNG (browsers will accept it)."""
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
        "Received search request: city={}, radius={}km, fuel={}, results={}",
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


@app.get("/help/{page}", response_class=HTMLResponse)
async def render_docs(page: str) -> HTMLResponse:
    """Render Markdown docs pages from the `docs` directory (safe filename)."""
    # Basic filename validation to prevent path traversal
    if ".." in page or "/" in page or "\\" in page:
        raise HTTPException(status_code=400, detail="Invalid page")

    docs_dir = Path(__file__).parent.parent / "docs"
    md_path = docs_dir / f"{page}.md"

    # If the exact page filename is missing, try language-specific fallbacks
    if not md_path.exists():
        for alt in (f"{page}-en.md", f"{page}-it.md"):
            alt_path = docs_dir / alt
            if alt_path.exists():
                md_path = alt_path
                break

    if not md_path.exists():
        raise HTTPException(status_code=404, detail="Not found")

    md_text = md_path.read_text(encoding="utf-8")

    # Preferred renderers: MarkdownIt
    rendered = None

    try:
        rendered = py_markdown(md_text, extensions=["tables", "fenced_code", "attr_list"])
    except Exception:
        logger.exception("Python-Markdown fallback failed; rendering raw markdown as escaped text")
        rendered = f"<pre>{_html.escape(md_text)}</pre>"

    html_page = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<link rel='stylesheet' href='/static/css/styles.split.css'>"
        "<link rel='stylesheet' href='/static/css/docs.css'>"
        "<link rel='icon' href='/favicon.ico'>"
        "<base href='/docs-static/'>"
        "<title>Documentation</title></head><body>"
        f"<div class='docs-container' style='padding:24px;max-width:1000px;margin:72px auto;'>"
        '<button id="docs-theme-toggle" aria-label="Toggle theme" '
        "style='padding:6px 8px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);"
        "background:var(--docs-toggle-bg,#fff);font-size:16px;line-height:1;'> </button>"
        f"{rendered}</div>"
        "<script src='/static/js/docs-theme.js' defer></script>"
        "</body></html>"
    )

    return HTMLResponse(content=html_page, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
