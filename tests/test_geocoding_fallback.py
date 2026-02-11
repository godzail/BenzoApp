"""Tests for geocoding fallback behavior when provider is rate-limited."""

import json
from typing import Any

import httpx
import pytest
from fastapi import HTTPException

from src.models import Settings
from src.services.geocoding import geocode_city


class DummyClient:
    """Minimal async client that raises a pre-configured exception from get()."""

    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    async def get(self, *_: Any, **__: Any):
        raise self._exc


@pytest.mark.asyncio
async def test_geocode_fallback_to_local_coords(tmp_path):
    """When the geocoding provider returns 509, local cities.json coordinates are used as fallback."""
    settings = Settings()
    # Point cache path parent to tmp so _load_local_city_coords will look here
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")

    # write a cities.json with firenze coords
    cities = {"firenze": {"latitude": 43.77, "longitude": 11.25}}
    (tmp_path / "cities.json").write_text(json.dumps(cities), encoding="utf-8")

    # Build an HTTPStatusError that simulates a 509 response
    req = httpx.Request("GET", "https://nominatim.openstreetmap.org/search")
    resp = httpx.Response(509, request=req, headers={"Retry-After": "1"})
    exc = httpx.HTTPStatusError("bandwidth", request=req, response=resp)

    client = DummyClient(exc)

    result = await geocode_city("Firenze", settings, client)
    assert isinstance(result, dict)
    assert round(result["latitude"], 2) == 43.77
    assert round(result["longitude"], 2) == 11.25


@pytest.mark.asyncio
async def test_geocode_raises_503_when_rate_limited_and_no_fallback(tmp_path):
    """When provider is rate-limited and no local fallback exists, a 503 HTTPException is raised."""
    settings = Settings()
    # Use a tmp path without writing a cities.json so no fallback is available
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")

    req = httpx.Request("GET", "https://nominatim.openstreetmap.org/search")
    resp = httpx.Response(509, request=req)
    exc = httpx.HTTPStatusError("bandwidth", request=req, response=resp)

    client = DummyClient(exc)

    with pytest.raises(HTTPException) as ei:
        await geocode_city("NowhereCity", settings, client)
    assert ei.value.status_code == 503
