"""Tests for Gas Station Finder API using FastAPI TestClient."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from starlette import status

from src.main import app
from src.services.fuel_type_utils import normalize_fuel_type


@pytest.fixture
def client() -> Generator[TestClient]:
    """Fixture to provide a TestClient for the FastAPI app with lifespan handled."""
    with TestClient(app) as client:
        yield client


def test_health_check(client: TestClient) -> None:
    """Test the /health endpoint returns status ok."""
    response = client.get("/health")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok"}


def test_read_root(client: TestClient) -> None:
    """Test the root endpoint returns the HTML main page."""
    response = client.get("/")
    assert response.status_code == status.HTTP_200_OK
    assert "<html" in response.text.lower()
    assert "gas station" in response.text.lower() or "finder" in response.text.lower()


def test_search_gas_stations_invalid_city(client: TestClient) -> None:
    """Test /search returns a warning for a non-existent city."""
    payload = {
        "city": "NonExistentCity12345",
        "radius": 5,
        "fuel": "benzina",
        "results": 2,
    }
    response = client.post("/search", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["stations"] == []
    # message may vary; ensure warning present
    assert "warning" in data
    assert isinstance(data["warning"], str)


def test_normalize_fuel_type() -> None:
    """Test fuel type normalization utility."""
    assert normalize_fuel_type("diesel") == "gasolio"
    assert normalize_fuel_type("Diesel") == "gasolio"
    assert normalize_fuel_type("BENZINA") == "benzina"
    assert normalize_fuel_type("gpl") == "GPL"
    assert normalize_fuel_type("metano") == "metano"
    assert normalize_fuel_type("unknown") == "unknown"


def test_search_gas_stations_missing_field(client: TestClient) -> None:
    """Test /search returns 422 if required fields are missing."""
    payload = {
        "radius": 5,
        "fuel": "benzina",
    }
    response = client.post("/search", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "city" in response.text.lower()


def test_search_gas_stations_radius_bounds(client: TestClient) -> None:
    """Radius below 1 should be rejected by validation (Pydantic ge=1)."""
    payload = {"city": "Rome", "radius": 0, "fuel": "benzina", "results": 2}
    response = client.post("/search", json=payload)
    # Pydantic validation should reject radius < 1 with 422
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_search_timeout_behavior(client: TestClient) -> None:
    """Ensure server-side search timeout returns a warning instead of hanging."""
    import asyncio

    from src.main import get_settings
    from src.models import Settings

    # Override dependency to use a very short timeout and patch fetch_gas_stations to be slow
    class FastTimeoutSettings(Settings):
        search_timeout_seconds = 1

    async def _slow_fetch(params, settings, http_client) -> list:
        await asyncio.sleep(5)
        return []

    # Apply overrides
    app.dependency_overrides[get_settings] = lambda: FastTimeoutSettings()

    # Monkeypatch the actual fetcher
    import src.services.fuel_api as _fa

    _fa.fetch_gas_stations = _slow_fetch

    payload = {"city": "Rome", "radius": 5, "fuel": "benzina", "results": 2}
    response = client.post("/search", json=payload)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["stations"] == []
    assert "warning" in data
    assert "timed out" in data["warning"].lower()


# Note: For a successful /search test, you need a real city and working external APIs.
# This test is skipped by default to avoid flakiness.
@pytest.mark.skip(reason="Depends on external API and real data.")
def test_search_gas_stations_success(client: TestClient) -> None:
    """Test /search returns stations for a real city (skipped by default)."""
    payload = {
        "city": "Rome",
        "radius": 5,
        "fuel": "benzina",
        "results": 2,
    }
    response = client.post("/search", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "stations" in data
    assert isinstance(data["stations"], list)
