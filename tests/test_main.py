"""Tests for Gas Station Finder API using FastAPI TestClient."""

from fastapi.testclient import TestClient
from starlette import status

from src.main import app


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


def test_search_surfaces_csv_schema_error(client: TestClient, monkeypatch) -> None:
    """When upstream CSV parsing reports a schema error (422) surface that exact message to the client."""
    from fastapi import HTTPException  # noqa: PLC0415

    def _raise_schema(_params, _settings, _http_client):
        raise HTTPException(status_code=422, detail="CSV schema error (prezzi): missing required column 'prezzo'")

    monkeypatch.setattr("src.services.fuel_api.fetch_gas_stations", _raise_schema)

    payload = {"city": "Florence", "radius": 5, "fuel": "benzina", "results": 2}
    response = client.post("/search", json=payload)
    assert response.status_code == 200  # noqa: PLR2004
    data = response.json()
    assert data["stations"] == []
    assert data["warning"] == "CSV schema error (prezzi): missing required column 'prezzo'"


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


def test_search_timeout_behavior(client: TestClient, monkeypatch) -> None:
    """Ensure server-side search timeout returns a warning instead of hanging."""
    import asyncio  # noqa: PLC0415

    from src.main import get_settings  # noqa: PLC0415
    from src.models import Settings  # noqa: PLC0415

    # Override dependency to use a very short timeout and patch fetch_gas_stations to be slow
    class FastTimeoutSettings(Settings):
        search_timeout_seconds: int = 1

    async def _slow_fetch(params, settings, http_client) -> list:
        await asyncio.sleep(5)
        return []

    # Apply overrides - pass a lambda that returns an instance, not the class itself
    # Use try/finally to ensure cleanup even if test fails
    original_override = app.dependency_overrides.get(get_settings)
    app.dependency_overrides[get_settings] = lambda: FastTimeoutSettings()

    # Monkeypatch the actual fetcher using monkeypatch for automatic cleanup
    import src.services.fuel_api as _fa

    monkeypatch.setattr(_fa, "fetch_gas_stations", _slow_fetch)

    try:
        payload = {"city": "Rome", "radius": 5, "fuel": "benzina", "results": 2}
        response = client.post("/search", json=payload)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["stations"] == []
        assert "warning" in data
        assert "timed out" in data["warning"].lower()
    finally:
        # Restore original dependency override
        if original_override is None:
            app.dependency_overrides.pop(get_settings, None)
        else:
            app.dependency_overrides[get_settings] = original_override


async def _fake_fetch_csvs(http_client, settings):
    """Return minimal CSV contents without making network calls."""
    anag = "id;nome;gestore\n1;Stazione A;Gestore A\n"
    prezzi = "id;prezzo\n1;1.459\n"
    return anag, prezzi


def _fake_parse_and_combine_sync(anag_text, prezzi_text, force_delimiter=None):
    """Return a tiny combined structure as produced by the real parser."""
    return [{"id": "1", "gestore": "Gestore A", "prices": {"benzina": 1.459}}]


async def _fake_write_json_file(path, combined):
    return None


async def _fake_save_csv_files(anag_text, prezzi_text, settings):
    return None


def test_reload_csv_triggers_fetch_and_saves(client: TestClient, monkeypatch) -> None:
    """POST /api/reload-csv should trigger CSV fetch/parse/save flow and return success.

    The test monkeypatches network and file operations to make the endpoint deterministic
    and fast.
    """
    # Patch imported symbols in src.main (where reload_csv references them)
    import src.main as _main

    # Ensure startup reload does not run during this test (avoids file-lock races)
    class _NoStartupSettings(_main.Settings):
        prezzi_reload_on_startup: bool = False

    monkeypatch.setattr(_main, "get_settings", _NoStartupSettings)

    monkeypatch.setattr(_main, "_fetch_csvs", _fake_fetch_csvs)
    monkeypatch.setattr(_main, "_parse_and_combine_sync", _fake_parse_and_combine_sync)
    monkeypatch.setattr(_main, "_write_json_file", _fake_write_json_file)
    monkeypatch.setattr(_main, "_save_csv_files", _fake_save_csv_files)
    monkeypatch.setattr(_main, "get_latest_csv_timestamp", lambda s: "2026-02-13T12:00:00+00:00")

    response = client.post("/api/reload-csv")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "success"
    assert data.get("last_updated") == "2026-02-13T12:00:00+00:00"


def test_startup_triggers_background_reload(monkeypatch) -> None:
    """When a fresh cache exists the app should schedule a background CSV reload."""
    import asyncio

    import src.main as _main
    from src.models import Settings

    class StartupSettings(Settings):
        prezzi_reload_on_startup: bool = True
        prezzi_preload_on_startup: bool = False

    # Ensure the lifespan uses our test settings
    monkeypatch.setattr(_main, "get_settings", StartupSettings)

    started = {"val": False}

    async def _fake_fetch_and_combine(settings, http_client, params=None):
        # Mark started and keep task alive briefly so status endpoint can observe it
        started["val"] = True
        await asyncio.sleep(0.2)
        return []

    # Simulate a fresh cache so the startup path schedules a background task
    async def _cache_fresh(path, hours):
        return True

    # Patch the references used by src.main (imported symbols)
    monkeypatch.setattr(_main, "_is_cache_fresh", _cache_fresh)
    monkeypatch.setattr(_main, "fetch_and_combine_csv_data", _fake_fetch_and_combine)

    from fastapi.testclient import TestClient

    from src.main import app as _app

    with TestClient(_app) as client:
        resp = client.get("/api/csv-status")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("reload_in_progress") is True
        assert started["val"] is True


async def _fake_fetch_and_combine_blocking(settings, http_client, params=None):
    # Keep task alive briefly to simulate work
    import asyncio

    await asyncio.sleep(0.05)
    return []


def test_startup_blocks_when_cache_missing(monkeypatch) -> None:
    """If the on-disk cache is missing/stale the startup reload should block until complete."""
    import asyncio

    import src.main as _main
    from src.models import Settings

    class StartupSettings(Settings):
        prezzi_reload_on_startup: bool = True
        prezzi_preload_on_startup: bool = False

    monkeypatch.setattr(_main, "get_settings", StartupSettings)

    started = {"val": False}

    async def _fake_fetch_and_combine(settings, http_client, params=None):
        started["val"] = True
        await asyncio.sleep(0.05)
        return []

    # Simulate missing/stale cache so the startup path performs a blocking reload
    async def _cache_missing(path, hours):
        return False

    monkeypatch.setattr(_main, "_is_cache_fresh", _cache_missing)
    monkeypatch.setattr(_main, "fetch_and_combine_csv_data", _fake_fetch_and_combine)

    from fastapi.testclient import TestClient

    from src.main import app as _app

    with TestClient(_app) as client:
        # Because startup blocks until fetch completes, the status endpoint should
        # show no in-progress reload (it already finished);
        resp = client.get("/api/csv-status")
        assert resp.status_code == 200
        data = resp.json()
    assert data.get("reload_in_progress") is False
    assert started["val"] is True
