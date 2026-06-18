"""Fixtures for testing the FastAPI application."""

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture
def client() -> Generator[TestClient]:
    """Fixture to provide a TestClient for the FastAPI app with lifespan handled."""
    with TestClient(app) as client:
        yield client


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


HTTP_ERROR_THRESHOLD = 400


class DummyResponseCsv:
    """Simple response stub mimicking httpx.Response for CSV tests."""

    def __init__(
        self,
        content: bytes,
        status_code: int = 200,
        url: str = "http://test",
        headers: dict | None = None,
    ):
        """Initialize a dummy response with raw content, status code, url, and headers."""
        self.content = content
        self.status_code = status_code
        self.url = url
        self.headers = headers or {"content-type": "text/csv"}

    def raise_for_status(self):
        """Raise a RuntimeError for non-success HTTP status codes."""
        if self.status_code >= HTTP_ERROR_THRESHOLD:
            msg = "HTTP error"
            raise RuntimeError(msg)


class DummyClientCsv:
    """Test-double for an AsyncClient that returns predefined CSV bytes."""

    def __init__(self, anag_text: bytes, prezzi_text: bytes):
        """Store CSV payloads for subsequent `get` calls."""
        self._anag = anag_text
        self._prezzi = prezzi_text
        self.calls = 0

    async def get(self, url: str, _params: Any = None, headers: dict | None = None) -> DummyResponseCsv:
        """Return the appropriate dummy response based on the requested URL path."""
        self.calls += 1
        if url.endswith("anagrafica_impianti_attivi.csv"):
            return DummyResponseCsv(self._anag, url=url)
        if url.endswith("prezzo_alle_8.csv"):
            return DummyResponseCsv(self._prezzi, url=url)
        msg = "Unexpected URL"
        raise RuntimeError(msg)


class DummyClientCsvConditional:
    """Mock async HTTP client per testare richieste CSV condizionali (ETag/304)."""

    def __init__(
        self,
        anag_status: int = 200,
        prezzi_status: int = 200,
        anag_content: bytes = b"anag",
        prezzi_content: bytes = b"prezzi",
        anag_resp_headers: dict | None = None,
        prezzi_resp_headers: dict | None = None,
    ) -> None:
        """Configura le risposte mock per i due endpoint CSV."""
        self.sent_headers: list[dict] = []
        self._anag_status = anag_status
        self._prezzi_status = prezzi_status
        self._anag_content = anag_content
        self._prezzi_content = prezzi_content
        self._anag_resp_headers = anag_resp_headers or {}
        self._prezzi_resp_headers = prezzi_resp_headers or {}

    async def get(self, url: str, headers: dict | None = None, **kwargs: Any) -> DummyResponseCsv:
        """Registra gli header inviati e ritorna la risposta configurata."""
        self.sent_headers.append(headers or {})
        if "anagrafica" in url:
            return DummyResponseCsv(
                self._anag_content,
                status_code=self._anag_status,
                url=url,
                headers=self._anag_resp_headers,
            )
        return DummyResponseCsv(
            self._prezzi_content,
            status_code=self._prezzi_status,
            url=url,
            headers=self._prezzi_resp_headers,
        )


class DummyClientException:
    """Minimal async client that raises a pre-configured exception from get()."""

    def __init__(self, exc: Exception) -> None:
        """Initialize the dummy client with an exception to raise.

        Parameters:
        - exc: The exception to raise when get() is called.
        """
        self._exc = exc

    async def get(self, *_: Any, **__: Any):
        """Mock get method that always raises the configured exception."""
        raise self._exc
