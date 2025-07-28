"""Tests for Gas Station Finder API using FastAPI TestClient."""

import pytest
from fastapi.testclient import TestClient
from starlette import status

from src.main import app


@pytest.fixture
def client() -> TestClient:
    """Fixture to provide a TestClient for the FastAPI app."""
    return TestClient(app)


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
    assert "geocoding failed" in data["warning"].lower()


def test_search_gas_stations_missing_field(client: TestClient) -> None:
    """Test /search returns 422 if required fields are missing."""
    payload = {
        "radius": 5,
        "fuel": "benzina",
    }
    response = client.post("/search", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "city" in response.text.lower()


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
