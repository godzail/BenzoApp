"""Tests for geocoding fallback behavior when provider is rate-limited."""

import json

import httpx
import pytest
from fastapi import HTTPException

from src.models import Settings
from src.services.geocoding import geocode_city
from tests.conftest import DummyClientException


@pytest.fixture(autouse=True)
def clear_geocoding_cache():
    """Clear geocoding cache before each test."""
    import src.services.geocoding as geo

    geo._LOCAL_CITY_COORDS = None
    geo.geocoding_cache.clear()
    yield
    geo._LOCAL_CITY_COORDS = None
    geo.geocoding_cache.clear()


@pytest.mark.asyncio
async def test_geocode_fallback_to_local_coords(tmp_path):
    """When the geocoding provider returns 509, local cities.json coordinates are used as fallback."""
    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")

    cities = {"firenze": {"latitude": 43.77, "longitude": 11.25}}
    (tmp_path / "cities.json").write_text(json.dumps(cities), encoding="utf-8")

    req = httpx.Request("GET", "https://nominatim.openstreetmap.org/search")
    resp = httpx.Response(509, request=req, headers={"Retry-After": "1"})
    exc = httpx.HTTPStatusError("bandwidth", request=req, response=resp)

    client = DummyClientException(exc)

    result = await geocode_city("Firenze", settings, client)  # type: ignore[arg-type]
    assert isinstance(result, dict)
    assert round(result["latitude"], 2) == 43.77
    assert round(result["longitude"], 2) == 11.25


@pytest.mark.asyncio
async def test_geocode_raises_503_when_rate_limited_and_no_fallback(tmp_path):
    """When provider is rate-limited and no local fallback exists, a 503 HTTPException is raised."""
    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")

    req = httpx.Request("GET", "https://nominatim.openstreetmap.org/search")
    resp = httpx.Response(509, request=req)
    exc = httpx.HTTPStatusError("bandwidth", request=req, response=resp)

    client = DummyClientException(exc)

    with pytest.raises(HTTPException) as ei:
        await geocode_city("NowhereCity", settings, client)  # type: ignore[arg-type]
    assert ei.value.status_code == 503
