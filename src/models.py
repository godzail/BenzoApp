"""Pydantic models for the Gas Station Finder API.

This module defines data models and configuration settings for the Gas Station Finder API, including:
- Application settings (Settings)
- Search request/response models
- Gas station and fuel price models
- Search parameter grouping for API calls
"""

import os

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# --- Search Parameters Model ---
class StationSearchParams(BaseModel):
    """Parameters for searching gas stations by location and fuel type.

    Parameters:
    - latitude: Latitude of the search location.
    - longitude: Longitude of the search location.
    - distance: Search radius in kilometers.
    - fuel: Fuel type to search for.
    - results: Number of results to return (default: 5).
    """

    latitude: float
    longitude: float
    distance: int
    fuel: str
    results: int = 5


# --- Settings and Configuration ---
class Settings(BaseSettings):
    """Manages application configuration using environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    nominatim_api_url: str = Field(
        "https://nominatim.openstreetmap.org/search",
        description="The base URL for the OpenStreetMap Nominatim API.",
    )
    prezzi_carburante_api_url: str = Field(
        "https://prezzi-carburante.onrender.com/api/distributori",
        description="The base URL for the Prezzi Carburante API.",
    )
    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",  # Frontend dev server
        ).split(","),
        description="A list of allowed origins for CORS.",
    )
    user_agent: str = Field("GasStationFinder/1.0", description="User-Agent header for external API requests.")

    # Server configuration
    server_host: str = Field("127.0.0.1", description="Host address for the uvicorn server.")
    server_port: int = Field(8000, description="Port number for the uvicorn server.")
    server_reload: bool = Field(default=True, description="Enable auto-reload on code changes.")
    server_workers: int = Field(1, description="Number of worker processes.")


class SearchRequest(BaseModel):
    """Represents a search request for gas stations."""

    city: str = Field(min_length=2)
    radius: int = Field(ge=1, le=200)
    fuel: str = Field(min_length=3)
    results: int = Field(default=5, ge=1, le=20)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "city": "Venezia",
                    "radius": 10,
                    "fuel": "gasolio",
                    "results": 5,
                },
            ],
        },
    }


class FuelPrice(BaseModel):
    """Represents the price of a specific fuel type."""

    type: str
    price: float

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "type": "gasolio",
                    "price": 1.85,
                },
            ],
        },
    }

    def __str__(self) -> str:
        """Return a string representation of the fuel price."""
        return f"{self.type}: {self.price:.3f}"


class Station(BaseModel):
    """Represents a single gas station."""

    id: str
    address: str
    latitude: float
    longitude: float
    fuel_prices: list[FuelPrice]

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "12345",
                    "address": "Via Roma 1, 30100 Venezia VE",
                    "latitude": 45.438759,
                    "longitude": 12.327145,
                    "fuel_prices": [
                        {
                            "type": "gasolio",
                            "price": 1.85,
                        },
                    ],
                },
            ],
        },
    }

    def __str__(self) -> str:
        """Return a string representation of the station."""
        return f"{self.address} - {', '.join(str(fp) for fp in self.fuel_prices)}"


# Configuration constants
MAX_SEARCH_RADIUS_KM = 200
MIN_SEARCH_RADIUS_KM = 1
DEFAULT_RESULTS_COUNT = 5
MAX_RESULTS_COUNT = 20
MAX_ZOOM_LEVEL = 14
MAP_PADDING_PX = 50


class SearchResponse(BaseModel):
    """Represents the response of a gas station search."""

    stations: list[Station]
    warning: str | None = None
    error: bool = False
