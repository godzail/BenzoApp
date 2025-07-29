"""Gas Station Finder API."""
# sourcery skip: avoid-global-variables, require-return-annotation

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import httpx
from cachetools.func import lru_cache
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from tenacity import RetryError, retry, stop_after_attempt, wait_exponential

from .models import FuelPrice, SearchRequest, SearchResponse, Settings, Station


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Returns a cached instance of the application settings."""
    return Settings()  # pyright: ignore[reportCallIssue]


# --- Lifespan Management ---
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Lifespan context manager to handle startup and shutdown events."""
    # Create a shared HTTP client for connection pooling
    async with httpx.AsyncClient() as client:
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
    CORSMiddleware,
    allow_origins=get_settings().cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# --- API Service Functions ---
@retry(stop=stop_after_attempt(3), wait=wait_exponential(), reraise=True)
async def geocode_city(
    city: str,
    settings: Annotated[Settings, Depends(get_settings)],
    http_client: Annotated[httpx.AsyncClient, Depends(lambda: app.state.http_client)],
) -> dict[str, float]:
    """Geocode a city name to latitude and longitude using OpenStreetMap Nominatim."""
    try:
        response = await http_client.get(
            settings.nominatim_api_url,
            params={"q": city, "format": "json", "limit": 1},
            headers={"User-Agent": settings.user_agent},
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            raise HTTPException(status_code=404, detail="City not found")
        location = data[0]
        return {"latitude": float(location["lat"]), "longitude": float(location["lon"])}
    except httpx.RequestError as err:
        logger.warning(f"Geocoding request error: {err}")
        raise HTTPException(status_code=503, detail=f"Geocoding service unavailable: {err}") from err


@retry(stop=stop_after_attempt(3), wait=wait_exponential(), reraise=True)
async def fetch_gas_stations(
    latitude: float,
    longitude: float,
    distance: int,
    fuel: str,
    settings: Annotated[Settings, Depends(get_settings)],
    http_client: Annotated[httpx.AsyncClient, Depends(lambda: app.state.http_client)],
    results: int = 5,
) -> dict:
    """Fetch gas stations from Prezzi Carburante API."""
    try:
        logger.info(
            "Making request to gas station API: URL={}, params={}",
            settings.prezzi_carburante_api_url,
            {
                "latitude": latitude,
                "longitude": longitude,
                "distance": distance,
                "fuel": fuel,
                "results": results,
            },
        )
        response = await http_client.get(
            settings.prezzi_carburante_api_url,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "distance": distance,
                "fuel": fuel,
                "results": results,
            },
        )
        logger.info(
            "Received response from gas station API: status_code={}, response_text={}",
            response.status_code,
            response.text[:500] if response.text else "No response text",
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as err:
        logger.error(
            "Gas station API HTTP error: {} - {} - Response: {}",
            err.response.status_code,
            err.response.reason_phrase,
            err.response.text[:500] if err.response.text else "No response text",
        )
        raise HTTPException(
            status_code=err.response.status_code, detail=f"Gas station API error: {err.response.reason_phrase}"
        ) from err
    except httpx.RequestError as err:
        logger.error(f"Gas station API request error: {err}")
        raise HTTPException(status_code=503, detail=f"Gas station API unavailable: {err}") from err


# --- API Endpoints ---
@app.get("/favicon.png", include_in_schema=False)
async def favicon():
    """Serve the favicon."""
    return FileResponse(
        static_dir / "favicon.png",
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@app.post("/search")
async def search_gas_stations(
    request: SearchRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> SearchResponse:
    """Search for gas stations near a city within a given radius."""
    logger.info(
        "Received search request: city={}, radius={}km, fuel={}, results={}",
        request.city,
        request.radius,
        request.fuel,
        request.results,
    )
    try:
        location = await geocode_city(request.city, settings, app.state.http_client)
        logger.info(
            "Geocoded city '{}' to coordinates: latitude={}, longitude={}",
            request.city,
            location["latitude"],
            location["longitude"],
        )
    except RetryError as err:
        logger.warning(f"Geocoding failed after retries: {err}")
        warning_msg = "City geocoding service is temporarily unavailable. Please try again later."
        return SearchResponse(stations=[], warning=warning_msg)
    except HTTPException as err:
        logger.warning(f"Geocoding HTTP error: {err}")
        warning_msg = "City not found. Please check the city name and try again."
        return SearchResponse(stations=[], warning=warning_msg)

    try:
        stations_data = await fetch_gas_stations(
            location["latitude"],
            location["longitude"],
            request.radius,
            request.fuel,
            settings,
            app.state.http_client,
            request.results,
        )
        logger.info(
            "Retrieved {} gas stations for city '{}' within {}km radius",
            len(stations_data),
            request.city,
            request.radius,
        )
    except RetryError as err:
        logger.warning(f"Gas station API failed after retries: {err}")
        warning_msg = "Gas station data is temporarily unavailable. Please try again later."
        return SearchResponse(stations=[], warning=warning_msg)
    except HTTPException as err:
        logger.warning(f"Gas station API HTTP error: {err}")
        warning_msg = "Failed to fetch gas station data. Please try again later."
        return SearchResponse(stations=[], warning=warning_msg)

    stations = []
    for station_id, data in stations_data.items():
        try:
            # Since the API returns data for the specific fuel type requested,
            # we can directly use the fuel type from the request
            fuel_price = float(data.get("prezzo", 0.0))
            station = Station(
                id=station_id,
                address=data.get("indirizzo", ""),
                latitude=float(data.get("latitudine", 0.0)),
                longitude=float(data.get("longitudine", 0.0)),
                fuel_prices=[FuelPrice(type=request.fuel, price=fuel_price)],
            )
            stations.append(station)
        except (ValueError, TypeError) as err:
            logger.warning(f"Skipping station {station_id} due to data parsing error: {err}")
            continue

    stations.sort(key=lambda s: s.fuel_prices[0].price if s.fuel_prices else float("inf"))
    limited_stations = stations[: max(1, request.results)]
    return SearchResponse(stations=limited_stations)


@app.get("/", response_class=HTMLResponse)
async def read_root():
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
