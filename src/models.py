"""Pydantic models for the Gas Station Finder API."""

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


# --- Settings and Configuration ---
class Settings(BaseSettings):
    """Manages application configuration using environment variables."""

    nominatim_api_url: str = Field(
        "https://nominatim.openstreetmap.org/search",
        description="The base URL for the OpenStreetMap Nominatim API.",
    )
    prezzi_carburante_api_url: str = Field(
        "https://prezzi-carburante.onrender.com/api/distributori",
        description="The base URL for the Prezzi Carburante API.",
    )
    cors_allowed_origins: list[str] = Field(
        ["http://127.0.0.1:8000"],
        description="A list of allowed origins for CORS.",
    )
    user_agent: str = Field("GasStationFinder/1.0", description="User-Agent header for external API requests.")

    class Config:
        """Pydantic settings configuration."""

        env_file = ".env"
        env_file_encoding = "utf-8"


class SearchRequest(BaseModel):
    """Represents a search request for gas stations."""

    city: str
    radius: int
    fuel: str
    results: int = 5

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


class SearchResponse(BaseModel):
    """Represents the response of a gas station search."""

    stations: list[Station]
    warning: str | None = None
