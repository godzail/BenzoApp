import asyncio
from typing import cast

import httpx

from src.models import Settings
from src.services.geocoding import geocode_city


class DummyResponse:
    def __init__(self, json_data, status_code: int = 200, text: str = ""):
        self._json = json_data
        self.status_code = status_code
        self.text = text
        self.reason_phrase = "OK"

    def raise_for_status(self):
        if self.status_code >= 400:
            # Avoid constructing httpx.HTTPStatusError in the test stub
            raise RuntimeError("HTTP error")

    def json(self):
        return self._json


class DummyClient:
    def __init__(self):
        self.called_with: dict | None = None

    async def get(self, url, params=None, headers=None):
        self.called_with = {"url": url, "params": params, "headers": headers}
        return DummyResponse([{"lat": "43.7696", "lon": "11.2558"}], text='[{"lat":"43.7696","lon":"11.2558"}]')


def test_geocoding_country_bias_and_alias():
    client = DummyClient()
    settings = Settings()

    result = asyncio.run(geocode_city("Florence", settings, cast("httpx.AsyncClient", client)))

    assert client.called_with is not None
    params = client.called_with["params"]
    assert params["countrycodes"] == "it"
    assert params["accept-language"] == "it"
    # Alias mapping should normalize 'Florence' to 'firenze'
    assert params["q"] == "firenze"

    assert result == {"latitude": 43.7696, "longitude": 11.2558}
