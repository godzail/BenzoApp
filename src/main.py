"""Gas Station Finder API."""
# sourcery skip: avoid-global-variables, require-return-annotation

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from pydantic import BaseModel


# Custom lifespan handler to suppress CancelledError on shutdown
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Lifespan context manager to suppress CancelledError and KeyboardInterrupt on shutdown.

    Parameters:
    - _app: FastAPI application instance (unused).

    Yields:
    - None. Used for FastAPI lifespan events.
    """
    try:
        yield
    except (asyncio.CancelledError, KeyboardInterrupt):
        logger.info("Shutdown: CancelledError or KeyboardInterrupt caught, exiting cleanly.")
    except Exception as err:
        logger.exception(f"Unexpected error in lifespan: {err}")


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

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
# Mount static files using absolute path to src/static
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# Pydantic models for request/response


class SearchRequest(BaseModel):
    """Request model for searching gas stations.

    Parameters:
    - city: Name of the city to search in.
    - radius: Search radius in kilometers.
    - fuel: Type of fuel to search for.
    - results: Number of results to return (optional, default 5).
    """

    city: str
    radius: int
    fuel: str
    results: int = 5


class FuelPrice(BaseModel):
    """Model representing a fuel price.

    Parameters:
    - type: Type of fuel.
    - price: Price of the fuel.
    """

    type: str
    price: float


class Station(BaseModel):
    """Model representing a gas station.

    Parameters:
    - id: Station identifier.
    - address: Station address.
    - latitude: Latitude of the station.
    - longitude: Longitude of the station.
    - fuel_prices: List of fuel prices at the station.
    """

    id: str
    address: str
    latitude: float
    longitude: float
    fuel_prices: list[FuelPrice]


class SearchResponse(BaseModel):
    """Response model for search results.

    Parameters:
    - stations: List of found stations.
    - warning: Optional warning message for the user.
    """

    stations: list[Station]
    warning: str | None = None


async def geocode_city(city: str) -> dict[str, float]:
    """Geocode a city name to latitude and longitude using OpenStreetMap Nominatim.

    Parameters:
    - city: Name of the city to geocode.

    Returns:
    - Dictionary with latitude and longitude.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": city, "format": "json", "limit": 1},
                headers={"User-Agent": "GasStationFinder/1.0"},
            )
            response.raise_for_status()
            data = response.json()
            if not data:
                raise HTTPException(status_code=404, detail="City not found")
            location = data[0]
            return {
                "latitude": float(location["lat"]),
                "longitude": float(location["lon"]),
            }
        except httpx.RequestError as err:
            raise HTTPException(status_code=503, detail=f"Geocoding service unavailable: {err}") from err


async def fetch_gas_stations(latitude: float, longitude: float, distance: int, fuel: str, results: int = 5) -> dict:
    """Fetch gas stations from Prezzi Carburante API.

    Parameters:
    - latitude: Latitude of the search center.
    - longitude: Longitude of the search center.
    - distance: Search radius in kilometers.
    - fuel: Type of fuel to search for.
    - results: Number of results to request from the API.

    Returns:
    - Dictionary of stations data.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "https://prezzi-carburante.onrender.com/api/distributori",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "distance": distance,
                    "fuel": fuel,
                    "results": results,
                },
            )
            response.raise_for_status()
            data = response.json()
            logger.info("API response data: {}", data)
            logger.info("API response data type: {}", type(data))
        except httpx.RequestError as err:
            raise HTTPException(status_code=503, detail=f"Gas station API unavailable: {err}") from err
        else:
            return data


@app.post("/search")
async def search_gas_stations(request: SearchRequest, req: Request) -> SearchResponse:
    """Search for gas stations near a city within a given radius.

    Parameters:
    - request: SearchRequest object containing city, radius, and fuel.
    - req: FastAPI Request object.

    Returns:
    - SearchResponse containing a list of stations.
    """
    logger.info("=== ENTERING search_gas_stations ===")
    logger.info("Received search request: city={}, radius={}, fuel={}", request.city, request.radius, request.fuel)
    # Log the raw request body for debugging
    body = await req.body()
    logger.info("Raw request body: {}", body)
    logger.info("Request headers: {}", req.headers)
    logger.info("Request type: {}", type(request))
    logger.info("City type: {}", type(request.city))
    logger.info("Radius type: {}", type(request.radius))
    logger.info("Fuel type: {}", type(request.fuel))

    try:
        # Geocode the city to get coordinates
        location = await geocode_city(request.city)

        # Try to fetch gas stations from Prezzi Carburante API
        try:
            stations_data = await fetch_gas_stations(
                location["latitude"],
                location["longitude"],
                request.radius,
                request.fuel,
                request.results,
            )
            logger.info("Received stations data: {}", stations_data)
            logger.info("Stations data type: {}", type(stations_data))
        except HTTPException as err:
            if err.status_code == HTTP_503_SERVICE_UNAVAILABLE:
                logger.warning("Prezzi Carburante API unavailable: {}", err.detail)
                warning_msg = "Gas station data is temporarily unavailable. Please try again later."
                response_data = SearchResponse(stations=[], warning=warning_msg)
                logger.info("Response data (API unavailable): {}", response_data)
                logger.info("Response data dict: {}", response_data.model_dump())
                return response_data
            logger.exception("HTTPException in fetch_gas_stations: {}", err.detail)
            raise

        # Process and sort stations by fuel price
        logger.info("Processing stations data: {}", stations_data)
        stations = []
        for station_id, station_data in stations_data.items():
            logger.info("Processing station {}: {}", station_id, station_data)
            # Extract fuel prices and sort them
            fuel_prices = []
            try:
                fuel_price = float(station_data.get("prezzo", 0.0))
                logger.info("Fuel price for station {}: {}", station_id, fuel_price)
                fuel_prices.append(
                    FuelPrice(
                        type=request.fuel,  # Use the requested fuel type
                        price=fuel_price,
                    ),
                )
            except ValueError as err:
                logger.exception("Error converting fuel price for station {}: {}", station_id, err)
                fuel_prices.append(
                    FuelPrice(
                        type=request.fuel,
                        price=0.0,
                    ),
                )

            try:
                latitude = float(station_data.get("latitudine", 0.0))
                longitude = float(station_data.get("longitudine", 0.0))
                logger.info("Station {} coordinates: lat={}, lon={}", station_id, latitude, longitude)
            except ValueError as err:
                logger.exception("Error converting coordinates for station {}: {}", station_id, err)
                latitude = 0.0
                longitude = 0.0

            station = Station(
                id=station_id,  # Use the dictionary key as the station ID
                address=station_data.get("indirizzo", ""),
                latitude=latitude,
                longitude=longitude,
                fuel_prices=fuel_prices,
            )
            stations.append(station)

        # Sort stations by price (ascending)
        stations.sort(key=lambda s: s.fuel_prices[0].price if s.fuel_prices else float("inf"))

        # Limit the number of results to the requested amount
        limited_stations = stations[: max(1, request.results)]

        # Log the response data for debugging
        response_data = SearchResponse(stations=limited_stations)
        logger.info("Response data: {}", response_data)
        logger.info("Response data dict: {}", response_data.dict())

    except HTTPException as err:
        logger.exception("HTTPException in search_gas_stations: {}", err.detail)
        raise
    except Exception as err:
        logger.exception("Exception in search_gas_stations: {}", str(err))
        raise HTTPException(status_code=500, detail=f"An error occurred: {err}") from err
    else:
        # Return JSON response
        logger.info("=== EXITING search_gas_stations ===")
        return response_data


# Serve the main page
@app.get("/", response_class=HTMLResponse)
async def read_root() -> str:
    """Serve the main HTML page.

    Returns:
    - Contents of index.html as a string.
    """
    # Use absolute path to static/index.html based on this file's location
    index_path = Path(__file__).parent / "static" / "index.html"
    return index_path.read_text()


# Health check endpoint
@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint.

    Returns:
    - Status dictionary.
    """
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    # For production, bind to 127.0.0.1 or use a reverse proxy
    uvicorn.run(app, host="127.0.0.1", port=8000)
