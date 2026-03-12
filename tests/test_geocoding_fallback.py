"""Tests for geocoding fallback behavior when provider is rate-limited."""

import json
from datetime import UTC

import httpx
import pytest
from fastapi import HTTPException

from src.models import Settings
from src.services.geocoding import geocode_city
from tests.conftest import DummyClientException


@pytest.fixture(autouse=True)
def clear_geocoding_cache():
    """Clear geocoding cache before each test."""
    import src.services.geocoding as geo  # noqa: PLC0415

    geo._LOCAL_CITY_COORDS = None  # noqa: SLF001
    geo.geocoding_cache.clear()
    yield
    geo._LOCAL_CITY_COORDS = None  # noqa: SLF001
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

    result = await geocode_city("Firenze", settings, client)  # type: ignore[arg-type] - DummyClientException is a test mock, not full AsyncClient
    assert isinstance(result, dict)
    assert round(result["latitude"], 2) == 43.77  # noqa: PLR2004
    assert round(result["longitude"], 2) == 11.25  # noqa: PLR2004


@pytest.mark.asyncio
async def test_geocode_respects_retry_after_http_date_and_uses_local_fallback(tmp_path, monkeypatch):
    """A Retry-After provided as an HTTP-date is parsed and respected (clamped), and local fallback is used."""
    from datetime import datetime, timedelta  # noqa: PLC0415

    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")

    cities = {"firenze": {"latitude": 43.77, "longitude": 11.25}}
    (tmp_path / "cities.json").write_text(json.dumps(cities), encoding="utf-8")

    # Create a Retry-After HTTP-date in the future (large), ensure clamping
    future = datetime.now(tz=UTC) + timedelta(seconds=120)
    retry_date = future.strftime("%a, %d %b %Y %H:%M:%S GMT")

    req = httpx.Request("GET", "https://nominatim.openstreetmap.org/search")
    resp = httpx.Response(429, request=req, headers={"Retry-After": retry_date})
    exc = httpx.HTTPStatusError("rate", request=req, response=resp)

    client = DummyClientException(exc)

    # Patch asyncio.sleep so test doesn't actually wait and to assert clamp behavior
    called: list[float] = []

    async def fake_sleep(secs: float):
        called.append(secs)

    monkeypatch.setattr("asyncio.sleep", fake_sleep)

    result = await geocode_city("Firenze", settings, client)  # type: ignore[arg-type]
    assert isinstance(result, dict)
    assert called, "asyncio.sleep should have been called for Retry-After"
    # should be clamped to MAX_RETRY_AFTER_SECONDS (60)
    assert called[0] <= 60  # noqa: PLR2004


@pytest.mark.asyncio
async def test_geocode_handles_malformed_retry_after_gracefully(tmp_path, monkeypatch):
    """A malformed Retry-After header should not raise — local fallback is attempted immediately."""
    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")

    cities = {"firenze": {"latitude": 43.77, "longitude": 11.25}}
    (tmp_path / "cities.json").write_text(json.dumps(cities), encoding="utf-8")

    req = httpx.Request("GET", "https://nominatim.openstreetmap.org/search")
    resp = httpx.Response(429, request=req, headers={"Retry-After": "not-a-valid-value"})
    exc = httpx.HTTPStatusError("rate", request=req, response=resp)

    client = DummyClientException(exc)

    called: list[float] = []

    async def fake_sleep(secs: float):
        called.append(secs)

    monkeypatch.setattr("asyncio.sleep", fake_sleep)

    result = await geocode_city("Firenze", settings, client)  # type: ignore[arg-type]
    assert isinstance(result, dict)
    # Malformed header -> no sleep attempted, local fallback used immediately
    assert called == []


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
        await geocode_city("NowhereCity", settings, client)  # type: ignore[arg-type] - DummyClientException is a test mock, not full AsyncClient
    assert ei.value.status_code == 503
