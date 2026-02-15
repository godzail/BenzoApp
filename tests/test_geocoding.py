"""Unit tests for geocoding service."""

from typing import Any

import pytest

from src.models import Settings
from src.services.geocoding import geocode_city


class DummyResponse:
    """Mock HTTP response for testing."""

    def __init__(self, json_data: Any, status_code: int = 200, text: str = "") -> None:
        """Initialize mock response with JSON data, status code, and text."""
        self._json = json_data
        self.status_code = status_code
        self.text = text
        self.reason_phrase = "OK"

    def raise_for_status(self) -> None:
        """Raise an error for status codes >= 400."""
        http_error_code = 400
        if self.status_code >= http_error_code:
            msg = "HTTP error"
            raise RuntimeError(msg)

    def json(self) -> Any:
        """Return the JSON data."""
        return self._json


class DummyClient:
    """Mock HTTP client for testing geocoding."""

    def __init__(self) -> None:
        """Initialize with empty called_with dict."""
        self.called_with: dict | None = None

    async def get(self, url: str, params: dict | None = None, headers: dict | None = None) -> DummyResponse:
        """Mock GET request that returns dummy geocoding data."""
        self.called_with = {"url": url, "params": params, "headers": headers}
        return DummyResponse([{"lat": "43.7696", "lon": "11.2558"}], text='[{"lat":"43.7696","lon":"11.2558"}]')


@pytest.mark.asyncio
async def test_geocoding_country_bias_and_alias() -> None:
    """Test that geocoding uses country bias and city name aliases."""
    # Clear global cache to force actual API call (not cached)
    from src.services.geocoding import geocoding_cache

    geocoding_cache.clear()

    client = DummyClient()
    settings = Settings()

    result = await geocode_city("Florence", settings, client)  # type: ignore[arg-type]

    assert client.called_with is not None
    params = client.called_with["params"]
    assert params["countrycodes"] == "it"
    assert params["accept-language"] == "it"
    # Alias mapping should normalize 'Florence' to 'firenze'
    assert params["q"] == "firenze"

    assert result == {"latitude": 43.7696, "longitude": 11.2558}
