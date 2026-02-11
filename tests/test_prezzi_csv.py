"""Unit tests for Prezzi CSV parsing and combine helpers."""

import asyncio
import json
import os
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING, cast

import pytest

if TYPE_CHECKING:
    import httpx

import src.services.prezzi_csv as prezzi_csv
from src.models import Settings, StationSearchParams
from src.services.prezzi_csv import (
    _fetch_csvs,
    _is_cache_fresh,
    _is_recent,
    _parse_date,
    _read_json_file,
    fetch_and_combine_csv_data,
)

# Test constants
HTTP_ERROR_THRESHOLD = 400
EXPECTED_PRICE_A = 1.5
EXPECTED_PRICE_B = 1.4
EXPECTED_PRICE_C = 1.6
LAT = 43.7696
LON = 11.2558

# Use typing.cast when passing dummy clients to async function to satisfy typecheckers


class DummyResponse:
    """Simple response stub mimicking httpx.Response for tests."""

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


class DummyClient:
    """Test-double for an AsyncClient that returns predefined CSV bytes."""

    def __init__(self, anag_text: bytes, prezzi_text: bytes):
        """Store CSV payloads for subsequent `get` calls."""
        self._anag = anag_text
        self._prezzi = prezzi_text
        self.calls = 0

    async def get(self, url, _params=None):
        """Return the appropriate dummy response based on the requested URL path."""
        self.calls += 1
        if url.endswith("anagrafica_impianti_attivi.csv"):
            return DummyResponse(self._anag, url=url)
        if url.endswith("prezzo_alle_8.csv"):
            return DummyResponse(self._prezzi, url=url)
        msg = "Unexpected URL"
        raise RuntimeError(msg)


def _make_anagrafica_row(id_: str, lat: str, lon: str) -> str:
    # minimal row: id(0); ...; gestore(2); ...; address parts at 5,6,7; lat at 8; lon at 9
    row = ["0"] * 10
    row[0] = id_
    row[2] = "GestoreX"
    row[5] = "Via"
    row[6] = "Test"
    row[7] = "City"
    row[8] = lat
    row[9] = lon
    return "|".join(row)


def _make_prezzi_row(id_: str, fuel: str, price: str, selfflag: str, date: str) -> str:
    row = ["0"] * 6
    row[0] = id_
    row[1] = fuel
    row[2] = price
    row[3] = selfflag
    row[4] = date
    return "|".join(row)


def test_fetch_and_combine_csv_parses_and_filters(tmp_path):
    """Verify CSV parsing, decoding, price parsing, and distance filtering."""
    # Build recent date
    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y %H:%M:%S")

    anag_header = "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9"
    anag_row = _make_anagrafica_row("123", "43,7696", "11,2558")

    prezzi_header = "col0|col1|col2|col3|col4"
    prezzi_row = _make_prezzi_row("123", "benzina", "1,50", "1", date_str)

    anag_text = f"{anag_header}\n{anag_row}\n"
    prezzi_text = f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))

    assert isinstance(result, list)
    assert len(result) == 1
    station = result[0]
    assert station["prezzo"] == EXPECTED_PRICE_A
    assert "latitudine" in station
    assert station["latitudine"] == LAT


def test_fetch_and_combine_csv_uses_cache(tmp_path):
    """Verify cached combined data is used when fresh and no external fetch occurs."""
    # Prepare cached combined dict
    cached = {
        "123": {
            "gestore": "GestoreX",
            "indirizzo": "Via Test City",
            "latitudine": LAT,
            "longitudine": LON,
            "prezzi": {
                "benzina": {
                    "prezzo": EXPECTED_PRICE_B,
                    "self": True,
                    "data": datetime.now(tz=UTC).strftime("%d/%m/%Y %H:%M:%S"),
                },
            },
        },
    }
    cache_path = tmp_path / "prezzi_cache.json"
    cache_path.write_text(json.dumps(cached), encoding="utf-8")

    settings = Settings()
    settings.prezzi_cache_path = str(cache_path)

    class NoCallsClient:
        async def get(self, _url, _params=None):
            msg = "Should not fetch when cache is fresh"
            raise RuntimeError(msg)

    client = NoCallsClient()
    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["prezzo"] == EXPECTED_PRICE_B


# Additional unit tests for refactor helpers


def test_is_cache_fresh(tmp_path):
    """Verify the cache freshness logic respects mtime and cache hours."""
    cache_path = tmp_path / "prezzi_cache.json"
    cache_path.write_text("{}", encoding="utf-8")

    settings = Settings()
    settings.prezzi_cache_path = str(cache_path)

    stale_at = time.time() - (float(settings.prezzi_cache_hours) + 1) * 3600
    os.utime(cache_path, (stale_at, stale_at))
    assert asyncio.run(_is_cache_fresh(str(cache_path), settings.prezzi_cache_hours)) is False

    # set to recent => fresh
    now = time.time()
    os.utime(cache_path, (now, now))
    assert asyncio.run(_is_cache_fresh(str(cache_path), settings.prezzi_cache_hours)) is True


def test_read_json_file_invalid(tmp_path):
    """Invalid JSON returns None instead of raising."""
    p = tmp_path / "bad.json"
    p.write_text("not json", encoding="utf-8")
    assert asyncio.run(_read_json_file(str(p))) is None


def test_fetch_csvs_raises_on_http_error(monkeypatch):
    """_fetch_csvs should raise if one of the responses signals an HTTP error and local fallback is unavailable."""

    # Simulate that local fallback files are missing to force re-raising the original exception
    async def raise_missing(settings):
        raise FileNotFoundError("local CSVs missing for test")

    monkeypatch.setattr(prezzi_csv, "_load_local_csvs", raise_missing)

    class ErrResp:
        def __init__(self):
            self.content = b""
            self.status_code = 500

        def raise_for_status(self):
            msg = "HTTP error"
            raise RuntimeError(msg)

    class ErrClient:
        async def get(self, _url, _params=None):
            return ErrResp()

    settings = Settings()
    err_client = ErrClient()

    with pytest.raises(RuntimeError):
        asyncio.run(_fetch_csvs(cast("httpx.AsyncClient", err_client), settings))


def test_parse_date_accepts_date_only():
    """_parse_date should accept date-only strings (no time component)."""

    date_str = datetime.now(tz=UTC).strftime("%d/%m/%Y")
    dt = _parse_date(date_str)

    assert dt is not None
    assert _is_recent(dt)


def test_fetch_and_combine_accepts_date_only(tmp_path):
    """Verify that a price row with date-only is treated as recent and returned."""
    # Build date-only string
    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y")

    anag_header = "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9"
    anag_row = _make_anagrafica_row("321", "43,7696", "11,2558")

    prezzi_header = "col0|col1|col2|col3|col4"
    prezzi_row = _make_prezzi_row("321", "benzina", "1,60", "1", date_str)

    anag_text = f"{anag_header}\n{anag_row}\n"
    prezzi_text = f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache2.json")

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))

    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["prezzo"] == EXPECTED_PRICE_C


def test_ignores_empty_cache_and_fetches_fresh(tmp_path):
    """If cache file exists but contains an empty object, it should be ignored and CSVs fetched."""
    cache_path = tmp_path / "prezzi_cache.json"
    cache_path.write_text("{}", encoding="utf-8")

    # Ensure file is fresh
    now_ts = time.time()
    os.utime(cache_path, (now_ts, now_ts))

    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y %H:%M:%S")

    anag_header = "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9"
    anag_row = _make_anagrafica_row("999", "43,7696", "11,2558")

    prezzi_header = "col0|col1|col2|col3|col4"
    prezzi_row = _make_prezzi_row("999", "benzina", "1,50", "1", date_str)

    anag_text = f"{anag_header}\n{anag_row}\n"
    prezzi_text = f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    settings = Settings()
    settings.prezzi_cache_path = str(cache_path)

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))

    # Two calls should have been made to fetch the two CSVs
    assert client.calls == 2
    assert isinstance(result, list)
    assert len(result) == 1


def test_fuel_name_variants_match(tmp_path):
    """A prezzo row like 'benzina senza piombo' should match a request for 'benzina'."""
    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y %H:%M:%S")

    anag_header = "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9"
    anag_row = _make_anagrafica_row("222", "43,7696", "11,2558")

    prezzi_header = "col0|col1|col2|col3|col4"
    prezzi_row = _make_prezzi_row("222", "benzina senza piombo", "1,55", "1", date_str)

    anag_text = f"{anag_header}\n{anag_row}\n"
    prezzi_text = f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache_variant.json")

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))

    assert isinstance(result, list)
    assert len(result) == 1
    assert abs(result[0]["prezzo"] - 1.55) < 1e-6


def test_pipe_delimiter_is_detected(tmp_path):
    """Verify that pipe-delimited CSVs are detected and parsed correctly."""
    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y %H:%M:%S")

    anag_header = "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9"
    anag_row = _make_anagrafica_row("555", "43,7696", "11,2558").replace(";", "|")

    prezzi_header = "col0|col1|col2|col3|col4"
    prezzi_row = _make_prezzi_row("555", "benzina", "1,55", "1", date_str).replace(";", "|")

    anag_text = f"{anag_header}\n{anag_row}\n"
    prezzi_text = f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache_pipe.json")

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))

    assert isinstance(result, list)
    assert len(result) == 1
    assert abs(result[0]["prezzo"] - 1.55) < 1e-6


def test_bom_stripped(tmp_path):
    """Test that BOM (mis-decoded as ISO-8859-1) is stripped and parsing succeeds."""
    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y %H:%M:%S")

    # Prepare pipe-delimited data with BOM prefix (mis-decoded UTF-8 BOM)
    anag_header = "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9"
    anag_row = _make_anagrafica_row("777", "43,7696", "11,2558")
    anag_text = "ï»¿" + f"{anag_header}\n{anag_row}\n"

    prezzi_header = "col0|col1|col2|col3|col4"
    prezzi_row = _make_prezzi_row("777", "benzina", "1,65", "1", date_str)
    prezzi_text = "ï»¿" + f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache_bom.json")

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))
    assert len(result) == 1
    assert abs(result[0]["prezzo"] - 1.65) < 1e-6


def test_force_delimiter_override(tmp_path):
    """Verify that forcing a delimiter overrides auto-detection and mismatches yield no results."""
    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y %H:%M:%S")

    # Create semicolon-delimited CSV
    anag_header = "col0;col1;col2;col3;col4;col5;col6;col7;col8;col9"
    row = ["0"] * 10
    row[0] = "888"
    row[2] = "GestoreX"
    row[5] = "Via"
    row[6] = "Test"
    row[7] = "City"
    row[8] = "43.7696"
    row[9] = "11.2558"
    anag_row = ";".join(row)

    prezzi_header = "col0;col1;col2;col3;col4"
    rowp = ["0"] * 6
    rowp[0] = "888"
    rowp[1] = "diesel"
    rowp[2] = "1.70"
    rowp[3] = "1"
    rowp[4] = date_str
    prezzi_row = ";".join(rowp)

    anag_text = f"{anag_header}\n{anag_row}\n"
    prezzi_text = f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    # Test with force ';' => should succeed
    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache_override.json")
    settings.prezzi_csv_delimiter = ";"

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="diesel", results=5)

    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))
    assert len(result) == 1
    assert abs(result[0]["prezzo"] - 1.70) < 1e-6

    # Test with force '|' (wrong delimiter) => should return empty
    # Use a fresh settings with a different cache path to avoid reusing the previous cache
    settings2 = Settings()
    settings2.prezzi_cache_path = str(tmp_path / "prezzi_cache_override_pipe.json")
    settings2.prezzi_csv_delimiter = "|"
    # Use a fresh client with same data
    client2 = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))
    result2 = asyncio.run(fetch_and_combine_csv_data(settings2, cast("httpx.AsyncClient", client2), params=params))
    assert len(result2) == 0


def test_fetch_and_save_csvs_and_cleanup(tmp_path):
    """Verify fetched CSVs are saved with timestamped names and old versions are purged."""
    now = datetime.now(tz=UTC)
    date_str = now.strftime("%d/%m/%Y %H:%M:%S")

    anag_header = "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9"
    anag_row = _make_anagrafica_row("321", "43,7696", "11,2558")

    prezzi_header = "col0|col1|col2|col3|col4"
    prezzi_row = _make_prezzi_row("321", "benzina", "1,60", "1", date_str)

    anag_text = f"{anag_header}\n{anag_row}\n"
    prezzi_text = f"{prezzi_header}\n{prezzi_row}\n"

    client = DummyClient(anag_text.encode("iso-8859-1"), prezzi_text.encode("iso-8859-1"))

    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache_save.json")
    settings.prezzi_local_data_dir = str(tmp_path)
    settings.prezzi_keep_versions = 1

    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    # First fetch -> saves one set
    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))
    assert isinstance(result, list)

    anag_files = list(tmp_path.glob("anagrafica_impianti_attivi_*.csv"))
    prezzi_files = list(tmp_path.glob("prezzo_alle_8_*.csv"))
    assert len(anag_files) == 1
    assert len(prezzi_files) == 1

    # Wait to ensure timestamp difference then fetch again -> should save a new set and cleanup old one
    import time as _time

    _time.sleep(1)
    result2 = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))
    anag_files2 = list(tmp_path.glob("anagrafica_impianti_attivi_*.csv"))
    prezzi_files2 = list(tmp_path.glob("prezzo_alle_8_*.csv"))
    assert len(anag_files2) == 1
    assert len(prezzi_files2) == 1


def test_load_local_csvs_uses_custom_dir(tmp_path):
    """_load_local_csvs should find CSVs in a custom directory set via settings.prezzi_local_data_dir."""
    anag = tmp_path / "anagrafica_impianti_attivi.csv"
    pre = tmp_path / "prezzo_alle_8.csv"
    anag.write_text(
        "col0|col1|col2|col3|col4|col5|col6|col7|col8|col9\n" + _make_anagrafica_row("10", "43,7696", "11,2558") + "\n",
        encoding="iso-8859-1",
    )
    pre.write_text(
        "col0|col1|col2|col3|col4\n"
        + _make_prezzi_row("10", "benzina", "1.23", "1", datetime.now(tz=UTC).strftime("%d/%m/%Y %H:%M:%S"))
        + "\n",
        encoding="iso-8859-1",
    )

    settings = Settings()
    settings.prezzi_local_data_dir = str(tmp_path)

    anag_text, prezzi_text = asyncio.run(prezzi_csv._load_local_csvs(settings))
    assert "anagrafica" in anag_text
    assert "prezzo" in prezzi_text
