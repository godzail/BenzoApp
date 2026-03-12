# Testing Guide

**Version 1.1** | Last Updated: February 2026

---

## Introduction

This guide covers how to run tests, write new tests, and maintain test quality in the BenzoApp project.

BenzoApp uses:
- **pytest**: Test runner and framework
- **pytest-asyncio**: Async test support
- **pytest-cov**: Coverage reporting
- **pytest-xdist**: Parallel test execution
- **pytest-sugar**: Improved test output
- **pytest-randomly**: Randomize test order to detect order dependencies
- **pytest-env**: Environment variable management for tests
- **httpx**: Mocking async HTTP clients
- **FastAPI TestClient**: Integration testing

---

## Quick Start

### Run All Tests

```bash
uv run pytest
```

### Run with Coverage

```bash
uv run pytest --cov=src --cov-report=html --cov-report=lcov
```

Coverage HTML report will be in `coverage/index.html`.

### Run Specific Test File

```bash
uv run pytest tests/test_geocoding.py
```

### Run Specific Test Function

```bash
uv run pytest tests/test_main.py::test_health_check
```

### Run Tests in Parallel (faster)

```bash
uv run pytest -n auto  # uses all CPU cores
```

### Verbose Output

```bash
uv run pytest -v
```

### Show Print Statements

```bash
uv run pytest -s
```

---

## Test Structure

```
tests/
├── conftest.py           # Shared fixtures
├── test_main.py          # API endpoint tests
├── test_geocoding.py     # Geocoding service unit tests
├── test_geocoding_fallback.py  # Fallback behavior tests
├── test_fuel_api.py      # Fuel API service tests
├── test_fuel_type_utils.py    # Fuel type normalization tests
├── test_prezzi_csv.py    # CSV service tests
├── test_models.py        # Pydantic model tests
├── test_docs_page.py     # Docs page rendering test
├── test_ui_accessibility.py   # Accessibility tests
├── test_ui_buttons.py    # UI button tests
└── e2e/                  # Playwright E2E tests
```

---

## Writing Tests

### 1. Test File Naming

Always name test files with `test_` prefix and `.py` extension:
- ✅ `test_geocoding.py`
- ❌ `geocoding_tests.py`
- ❌ `testfile.py`

### 2. Test Function Naming

Use descriptive names starting with `test_`:

```python
def test_geocoding_country_bias_and_alias() -> None:
    """Test that geocoding uses Italy bias and normalizes city aliases."""
    ...

@pytest.mark.asyncio
async def test_geocode_fallback_to_local_coords(tmp_path) -> None:
    """When rate-limited, local cities.json coordinates are used."""
    ...
```

### 3. Async Tests

All async tests **must** use `@pytest.mark.asyncio` and `async def`:

```python
import pytest

@pytest.mark.asyncio
async def test_my_async_function() -> None:
    result = await some_async_call()
    assert result == expected
```

❌ **Avoid**: `asyncio.run()` in tests. Use proper async/await.
✅ **Correct**:

```python
# GOOD
result = await my_async_function()
```

```python
# BAD (anti-pattern)
result = asyncio.run(my_async_function())
```

See `tests/test_geocoding_fallback.py` for correct pattern.

### 4. Fixtures

Define reusable fixtures in `conftest.py` or at module level.

Example (`conftest.py`):

```python
import pytest
from fastapi.testclient import TestClient
from src.main import app

@pytest.fixture
def client() -> Generator[TestClient]:
    """Provide a TestClient with app lifespan handled."""
    with TestClient(app) as client:
        yield client
```

Use fixtures in tests:

```python
def test_health_check(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
```

### 5. Mocking External Services

Never call real external APIs in unit tests. Always mock.

#### Mocking HTTP Client

Create a minimal dummy client:

```python
class DummyClient:
    """Mock HTTP client for testing geocoding."""

    def __init__(self, response_data: Any = None, exc: Exception | None = None):
        self._response_data = response_data
        self._exc = exc
        self.called_with: dict | None = None

    async def get(self, url: str, params: dict | None = None, headers: dict | None = None):
        self.called_with = {"url": url, "params": params, "headers": headers}
        if self._exc:
            raise self._exc
        # Return mock response with .json() and .raise_for_status()
        return DummyResponse(self._response_data)

class DummyResponse:
    def __init__(self, json_data: Any, status_code: int = 200):
        self._json = json_data
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("HTTP error")

    def json(self) -> Any:
        return self._json
```

Use in test:

```python
client = DummyClient(response_data=[{"lat": "45.0", "lon": "9.0"}])
result = await geocode_city("Rome", settings, client)
assert result == {"latitude": 45.0, "longitude": 9.0}
```

#### Monkeypatching Module Functions

For integration tests using TestClient, you can monkeypatch internal functions:

```python
def test_timeout_behavior(client: TestClient) -> None:
    async def slow_fetch(params, settings, http_client):
        await asyncio.sleep(10)
        return []

    import src.services.fuel_api as fuel_api
    original = fuel_api.fetch_gas_stations
    fuel_api.fetch_gas_stations = slow_fetch

    try:
        response = client.post("/search", json={...})
        assert response.status_code == 200
        assert "timed out" in response.json()["warning"]
    finally:
        fuel_api.fetch_gas_stations = original
```

### 6. Testing Configuration Changes

Override `Settings` for specific test scenarios:

```python
from src.main import get_settings
from src.models import Settings

class FastTimeoutSettings(Settings):
    search_timeout_seconds: int = 1

app.dependency_overrides[get_settings] = lambda: FastTimeoutSettings()
```

Remember to clear overrides after test if needed.

### 7. Isolating Global State

Some modules have global state (e.g., `geocoding_cache`, `_LOCAL_CITY_COORDS`). Clear or reset these in tests:

```python
def test_something():
    from src.services.geocoding import geocoding_cache, _LOCAL_CITY_COORDS
    geocoding_cache.clear()
    _LOCAL_CITY_COORDS = None
    # ... rest of test
```

Use `pytest` fixtures for automatic cleanup:

```python
@pytest.fixture(autouse=True)
def reset_geocoding_state():
    """Reset geocoding globals before each test."""
    from src.services.geocoding import geocoding_cache, _LOCAL_CITY_COORDS
    geocoding_cache.clear()
    _LOCAL_CITY_COORDS = None
    yield
    # No teardown needed
```

### 8. Temporary Files

Use `tmp_path` fixture for file operations:

```python
async def test_geocode_fallback_to_local_coords(tmp_path):
    settings = Settings()
    settings.prezzi_cache_path = str(tmp_path / "prezzi_cache.json")
    (tmp_path / "cities.json").write_text(json.dumps({"roma": {...}}))
    ...
```

---

## Common Test Patterns

### Testing Success Response

```python
def test_health_check(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok"}
```

### Testing Validation Errors

```python
def test_search_missing_city(client: TestClient) -> None:
    payload = {"radius": 5, "fuel": "benzina"}
    response = client.post("/search", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
```

### Testing Business Logic Warnings

```python
def test_search_returns_warning(client: TestClient) -> None:
    payload = {"city": "Nowhere", "radius": 5, "fuel": "benzina"}
    response = client.post("/search", json=payload)
    data = response.json()
    assert data["stations"] == []
    assert "warning" in data
    assert isinstance(data["warning"], str)
```

### Testing Async Timeouts

```python
@pytest.mark.asyncio
async def test_geocode_timeout():
    async def slow_api_call():
        await asyncio.sleep(5)
        raise httpx.TimeoutException("timeout")

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(slow_api_call(), timeout=1)
```

---

## Test Organization

### Unit Tests

Test individual functions/classes in isolation with mocks. Place in files named after the module: `test_geocoding.py` → tests for `geocoding.py`.

### Integration Tests

Test full request/response cycle through FastAPI's `TestClient`. These can be in `test_main.py` or a separate `test_integration.py`.

**Guideline**: Use mocks for external HTTP calls even in integration tests to keep tests fast and reliable.

---

## Coverage

### Current Coverage Goal

Aim for **80%+** line coverage on critical services (geocoding, fuel_api, prezzi_csv).

### Check Coverage

```bash
uv run pytest --cov=src --cov-report=term-missing
```

This shows which lines are missing coverage.

### Generate HTML Report

```bash
uv run pytest --cov=src --cov-report=html
# Open coverage/html/index.html in browser
```

### Excluding Files from Coverage

Configure in `pyproject.toml`:

```toml
[tool.coverage.run]
omit = ["*/migrations/*", "tests/*"]
```

---

## CI/CD Integration

Example GitHub Actions workflow snippet:

```yaml
- name: Run tests
  run: |
  uv run pytest -n auto --cov=src --cov-report=xml

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage.xml
```

---

## Troubleshooting

### Tests Hang Forever

Likely an async test not marked with `@pytest.mark.asyncio`. Add the decorator.

### `RuntimeError: Task attached to a different loop`

Caused by mixing `asyncio.run()` with pytest-asyncio. Replace `asyncio.run()` with `await`.

### Event loop errors in Windows

Ensure `pytest-asyncio` is installed and set mode in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

### Import errors

Ensure `src` directory is in Python path. Use `PYTHONPATH=.` if needed or run via `uv` which handles project paths.

---

## Best Practices

1. **Isolation**: Each test should be independent, not rely on other tests' state.
2. **Fast**: Mock I/O; tests should complete quickly (<100ms each ideally).
3. **Clear names**: Test names should describe what is being tested and expected outcome.
4. **One assertion per test** (usually): Test one behavior per function.
5. **Arrange-Act-Assert**: Structure tests with clear setup, action, and assertion phases.
6. **Use factories**: For complex test data, use factory methods or fixtures.
7. **Avoid sleeps**: Never use `time.sleep()`; use async-compatible mocking.
8. **Clean up**: Reset global state, temporary files, and dependency overrides.

---

## Example: Complete Test File

```python
"""Unit tests for the geocoding service."""

import pytest
from typing import Any

from src.models import Settings
from src.services.geocoding import geocode_city


class DummyResponse:
    """Mock HTTP response."""

    def __init__(self, json_data: Any, status_code: int = 200):
        self._json = json_data
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("HTTP error")

    def json(self) -> Any:
        return self._json


class DummyClient:
    """Mock HTTP client."""

    def __init__(self, response_data: Any = None, exc: Exception | None = None):
        self._response_data = response_data
        self._exc = exc
        self.called_with: dict | None = None

    async def get(self, url: str, params: dict | None = None, headers: dict | None = None):
        self.called_with = {"url": url, "params": params, "headers": headers}
        if self._exc:
            raise self._exc
        return DummyResponse(self._response_data)


@pytest.fixture(autouse=True)
def reset_geocoding_cache():
    """Ensure geocoding cache is clean for each test."""
    from src.services.geocoding import geocoding_cache, _LOCAL_CITY_COORDS
    geocoding_cache.clear()
    _LOCAL_CITY_COORDS = None
    yield


@pytest.mark.asyncio
async def test_geocode_basic_success():
    """Test successful geocoding returns coordinates."""
    client = DummyClient(response_data=[{"lat": "43.7696", "lon": "11.2558"}])
    settings = Settings()
    result = await geocode_city("Firenze", settings, client)

    assert result == {"latitude": 43.7696, "longitude": 11.2558}
    assert client.called_with is not None
    assert client.called_with["params"]["q"] == "firenze"
    assert client.called_with["params"]["countrycodes"] == "it"


@pytest.mark.asyncio
async def test_geocode_alias_normalization():
    """Test that city aliases are applied (Florence → firenze)."""
    client = DummyClient(response_data=[{"lat": "43.7696", "lon": "11.2558"}])
    settings = Settings()
    result = await geocode_city("Florence", settings, client)

    assert client.called_with["params"]["q"] == "firenze"
```

---

**End of Testing Guide**
