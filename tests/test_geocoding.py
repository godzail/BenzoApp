"""Unit tests for geocoding service."""

import pytest

from src.models import Settings
from src.services.geocoding import geocode_city
from tests.conftest import DummyClient


@pytest.mark.asyncio
async def test_geocoding_country_bias_and_alias() -> None:
    """Test that geocoding uses country bias and city name aliases."""
    # Clear global cache to force actual API call (not cached)
    from src.services.geocoding import geocoding_cache

    geocoding_cache.clear()

    client = DummyClient()
    settings = Settings(
        photon_api_url="https://photon.komoot.io/api/",
        geocoding_cache_maxsize=1000,
        geocoding_cache_ttl_seconds=86400,
    )

    result = await geocode_city("Florence", settings, client)  # type: ignore[arg-type] - DummyClient is a test mock, not full AsyncClient

    assert client.called_with is not None
    params = client.called_with["params"]
    assert params["countrycodes"] == "it"
    assert params["accept-language"] == "it"
    # Alias mapping should normalize 'Florence' to 'firenze'
    assert params["q"] == "firenze"

    assert result == {"latitude": 43.7696, "longitude": 11.2558}
