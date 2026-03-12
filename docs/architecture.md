# BenzoApp Architecture

**Version 1.1** | Last Updated: February 2026

---

## Overview

BenzoApp is a web application for searching and analyzing gas stations in Italy. It consists of a FastAPI backend that provides a REST API, geocoding services, and CSV data management, paired with a modern JavaScript frontend.

### Key Characteristics

- **Backend**: FastAPI (async-capable, high-performance Python framework)
- **Frontend**: Vanilla JavaScript with Alpine.js, Leaflet maps, and i18next
- **Data Sources**: OpenStreetMap Nominatim (geocoding), MIMIT official CSV feeds
- **Caching**: Memory-based (TTLCache) + local JSON/CSV files
- **Architecture**: Monolithic backend with clear service separation

---

## System Architecture

```
┌───────────────────────────────────────────────────────────┐
│                         Frontend (Browser)                │
│  • Alpine.js + Vanilla JS                                 │
│  • Leaflet Maps                                           │
│  • i18next (IT/EN)                                        │
│  • Theme management (dark/light)                          │
└─────────────────────────────┬─────────────────────────────┘
                              │ HTTPS/REST API
                              ▼
┌───────────────────────────────────────────────────────────┐
│                    FastAPI Backend                        │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  API Layer (main.py)                                 │ │
│  │  • /search - main search endpoint                    │ │
│  │  • /health - health check                            │ │
│  │  • /api/reload-csv - manual data refresh             │ │
│  │  • /api/csv-status - cache status                    │ │
│  │  • Static file serving                               │ │
│  └─────────────────────────┬─────────────────────────── ┘ │
│                            │                              │
│  ┌─────────────────────────▼───────────────────────────┐  │
│  │  Service Layer                                      │  │
│  │  • geocoding.py - city → coordinates via Nominatim  │  │
│  │  • fuel_api.py - fetch gas stations from CSV data   │  │
│  │  • prezzi_csv.py - CSV download, parse, cache       │  │
│  │  • csv_cache.py - JSON cache read/write/freshness   │  │
│  │  • csv_fetcher.py - CSV download management         │  │
│  │  • csv_parser.py - CSV parsing and merging          │  │
│  │  • csv_utils.py - CSV utility functions             │  │
│  │  • distance_utils.py - Haversine calculation        │  │
│  │  • fuel_type_utils.py - fuel normalization          │  │
│  └─────────────────────────┬───────────────────────────┘  │
│                            │                              │
│  ┌─────────────────────────▼───────────────────────────┐  │
│  │  Data Layer                                         │  │
│  │  • Local caching (JSON files)                       │  │
│  │  • In-memory TTLCache for geocoding                 │  │
│  │  • CSV file management                              │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
┌─────────────────────────────┐ ┌───────────────────────────┐
│ External APIs               │ │ Local Filesystem          │
│ • Nominatim (geocoding)     │ │ • prezzi_cache.json       │
│ • Photon (fallback)         │ │ • cities.json (fallback)  │
│ • MIMIT CSVs (fuel data)    │ │ • CSV file versions       │
└─────────────────────────────┘ └───────────────────────────┘
```

---

## Component Deep Dive

### 1. API Layer (`src/main.py`)

The main FastAPI application handles:

- **Request routing**: Maps HTTP endpoints to business logic
- **Lifespan management**: Creates and manages shared HTTP client, starts async tasks
- **Middleware**: Rate limiting (slowapi), CORS, static file serving
- **Dependency injection**: Provides `Settings` to endpoints and services
- **Error handling**: Converts service exceptions to user-friendly responses
- **Documentation**: Auto-generated OpenAPI schema (Swagger UI)

Key endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Serves main HTML page |
| `/search` | POST | Primary search for gas stations |
| `/health` | GET | Health check for monitoring |
| `/api/csv-status` | GET | Returns CSV data freshness |
| `/api/reload-csv` | POST | Triggers manual CSV refresh |
| `/help/{page}` | GET | Renders documentation pages |

### 2. Geocoding Service (`src/services/geocoding.py`)

Converts city names to latitude/longitude coordinates using OpenStreetMap Nominatim, with Photon fallback.

**Features**:

- Async HTTP calls with httpx
- Retry logic with exponential backoff (tenacity)
- Multi-level caching:
  - In-memory TTLCache (24-hour TTL, 1000 entries)
  - Local `cities.json` fallback for rate-limit scenarios
  - Built-in coordinates for 60+ major Italian cities
- Alias mapping for common city names (Florence → Firenze)
- Country bias to Italy (`countrycodes=it`)
- Italian language preference (`accept-language=it`)
- Rate limit handling (429, 509) with Retry-After support
- Photon fallback on Nominatim errors (403, 502, 503)

**Geocoding Flow**:

```
1. Receive city name → normalize (lowercase, strip, resolve aliases)
2. Check in-memory cache → hit? return immediately
3. Acquire rate-limiter semaphore (max 1 req/sec)
4. Call Nominatim API with User-Agent and settings
5. On success: cache result and return
6. On rate limit (429/509):
   - Parse and respect Retry-After header (clamped to 60s max)
   - Try local cities.json / built-in Italian cities fallback
   - If no fallback: raise 503
7. On 403/502/503: try Photon fallback API
8. On network error: try local fallback, else raise 503
```

### 3. Fuel API Service (`src/services/fuel_api.py`)

Fetches gas station data from MIMIT CSV sources.

- Accepts `StationSearchParams` (lat, lon, distance, fuel type, results limit)
- Delegates to `fetch_and_combine_csv_data` which downloads, parses, and combines CSV files
- Returns normalized station data with prices
- Implements retry with tenacity (3 attempts, exponential backoff)
- Surfaces `CSVSchemaError` as HTTP 422 with detail to client

### 4. Prezzi CSV Service (`src/services/prezzi_csv.py`)

Facade that coordinates CSV download, parsing, and caching. Delegates to specialized sub-modules:

- **csv_cache.py** — JSON cache read/write (atomic), freshness checks, preload
- **csv_fetcher.py** — CSV download from MIMIT, local file management, cleanup
- **csv_parser.py** — CSV parsing (auto-delimiter detect), anagrafica+prezzi merging, date filtering
- **csv_utils.py** — CSV utility functions

**CSV Cache Flow**:

```
Startup:
  - Check if cache exists and is fresh
  - If not fresh or missing, async fetch in background (non-blocking)
  - Optionally preload from local files if present

On Search:
  - Load cached JSON (fast)
  - If cache missing/stale, still serve from cache while async refresh happens

Manual Reload:
  - Clear cache file
  - Download fresh CSVs from MIMIT
  - Parse and combine
  - Write new cache + save local CSVs
  - Cleanup old versions
```

### 5. Models (`src/models.py`)

Pydantic models for configuration, request validation, and response serialization.

- `Settings`: Configuration loaded from environment variables `.env`
- `SearchRequest`: Validates user search input (city, radius, fuel, results)
- `SearchResponse`: API response with station list + optional warning
- `Station`: Full gas station data with coordinates, address, prices
- `FuelPrice`: Individual fuel type and price
- `StationSearchParams`: Internal grouping for service calls

**Validation Examples**:

```python
class Settings(BaseSettings):
    nominatim_api_url: str = "https://nominatim.openstreetmap.org/search"
    user_agent: str = Field(..., min_length=10)  # Validated for contact info
    search_timeout_seconds: int = Field(12, ge=1, le=30)
```

---

## Data Flow: Search Request

```
┌─────────────┐
│ User sends  │
│ POST /search
└──────┬──────┘
       │
       ▼
┌────────────────────────────────────────────────────┐
│ 1. Validate request (Pydantic)                     │
│    - city (min 2 chars)                            │
│    - radius (1-200 km)                             │
│    - fuel (min 3 chars)                            │
│    - results (1-20)                                │
└───────────────────────────┬────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────┐
│ 2. Geocode city → coordinates                     │
│    • Check cache                                  │
│    • Call Nominatim (with retry)                  │
│    • Fallback to cities.json if rate-limited      │
└───────────────────────────┬───────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────┐
│ 3. Fetch gas stations                              │
│    • Build StationSearchParams                     │
│    • Call fuel_api.fetch_gas_stations (with retry) │
│    • Return raw station list                       │
└───────────────────────────┬────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────┐
│ 4. Parse and normalize                             │
│    • Filter by selected fuel type                  │
│    • Calculate distance from search point          │
│    • Sort by distance                              │
│    • Limit to requested count                      │
│    • Exclude incomplete records                    │
└───────────────────────────┬────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────┐
│ 5. Return JSON response                            │
│    { stations: [...], warning?: "..." }            │
└────────────────────────────────────────────────────┘
```

---

## Configuration Management

All configuration is managed through the `Settings` class using Pydantic's `BaseSettings`.

### Environment Variables

Settings are read from `.env` file (if present) or environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NOMINATIM_API_URL` | `https://nominatim.openstreetmap.org/search` | Nominatim endpoint |
| `PREZZI_CARBURANTE_API_URL` | `https://prezzi-carburante.onrender.com/api/distributori` | **(Deprecated)** Old API URL, no longer used by fuel_api.py |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Allowed CORS origins |
| `USER_AGENT` | `GasStationFinder/1.0 (contact@example.com)` | **Must include contact** per Nominatim policy |
| `PREZZI_CSV_ANAGRAFICA_URL` | MIMIT official CSV | Station registry URL |
| `PREZZI_CSV_PREZZI_URL` | MIMIT official CSV | Prices CSV URL |
| `PREZZI_CACHE_PATH` | `src/static/data/prezzi_data.json` | Cache file location |
| `PREZZI_CACHE_HOURS` | `24` | Freshness threshold (hours) |
| `PREZZI_CSV_DELIMITER` | `auto` | CSV delimiter (auto/;/|) |
| `PREZZI_LOCAL_DATA_DIR` | `null` | Optional custom CSV directory |
| `PREZZI_KEEP_VERSIONS` | `1` | Number of old CSV versions to keep |
| `PREZZI_PRELOAD_ON_STARTUP` | `true` | Preload CSVs on startup |
| `SERVER_HOST` | `127.0.0.1` | Bind address |
| `SERVER_PORT` | `8000` | Port number |
| `SERVER_RELOAD` | `true` | Auto-reload on code changes (dev) |
| `SERVER_WORKERS` | `1` | Number of worker processes |
| `SEARCH_TIMEOUT_SECONDS` | `12` | Request timeout |

> **Note**: The `USER_AGENT` is validated to ensure it includes an email address or URL, complying with Nominatim's usage policy.

---

## Caching Strategy

### Geocoding Cache (Memory)

- **Type**: `TTLCache[str, dict[str, float]]`
- **Size**: 1000 entries
- **TTL**: 86400 seconds (24 hours)
- **Key**: Normalized city name (lowercase, aliased)
- **Value**: `{latitude: float, longitude: float}`

### Prezzi CSV Cache (File-based)

- **Path**: Configured via `PREZZI_CACHE_PATH`
- **Format**: JSON (combined stations with prices)
- **Freshness**: Controlled by `PREZZI_CACHE_HOURS` (default 24)
- **Fallback**: If stale but exists, still used while async refresh runs
- **Atomic updates**: Written to temp then renamed to avoid corruption

### Local City Coordinates Fallback

- **File**: `cities.json` (searched in multiple locations)
- **Formats**: Dict `{city: {latitude, longitude}}` or list of objects
- **Use case**: When Nominatim rate-limits (509) or network fails
- **Search order**:
  1. `{cache_parent}/cities.json`
  2. `src/static/data/cities.json`
  3. `data/cities.json`

---

## Design Patterns

### Dependency Injection

Settings are injected via FastAPI's `Depends`:

```python
@router.post("/search")
async def search(
    request: SearchRequest,
    settings: Annotated[Settings, Depends(get_settings)],
):
    ...
```

### Retry with Exponential Backoff

All external API calls use `tenacity`:

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential())
async def geocode_city(...):
    ...
```

### Async Lifespan

FastAPI's `lifespan` context manager manages startup/shutdown:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(...) as client:
        app.state.http_client = client
        yield
```

### Service Layer Pattern

Business logic is separated from API handlers:

- `geocoding.py` → coordinate lookup
- `fuel_api.py` → station data fetching
- `prezzi_csv.py` → CSV management
- `fuel_type_utils.py` → normalization utilities

### Caching Abstraction

Two-level caching (memory + file) with graceful degradation:

1. Try in-memory → return if hit
2. Call external API → store in memory
3. On failure → try local fallback files
4. On persistent failure → return 503 with user message

---

## Security Considerations

- **No secrets**: Application uses only public APIs, no authentication required
- **User-Agent validation**: Enforced to comply with Nominatim policy and prevent abuse
- **Rate limiting**: slowapi limits requests by IP (10/minute on `/search`)
- **CORS**: Restricted to specified origins (configurable)
- **Input validation**: Pydantic validates all incoming request data
- **File path safety**: `cities.json` discovery uses explicit candidate list, avoiding path traversal
- **Logging**: No sensitive data logged (coordinates, prices are public)
- **No SQL**: Application uses no database, eliminates SQL injection risk

---

## Performance Optimizations

1. **Async I/O**: All external calls are async (httpx.AsyncClient)
2. **Connection pooling**: Shared HTTP client with connection reuse
3. **Response caching**: Geocoding results cached in memory (TTL 24h)
4. **CSV caching**: Combined JSON cache avoids re-parsing CSVs
5. **Background preload**: CSVs preloaded on startup without blocking
6. **Timeout configuration**: Separate connect/read timeouts to prevent hangs
7. **Lazy loading**: Stations parsed only when needed

---

## Error Handling Strategy

- **Client errors (4xx)**: Validation failures, not found, bad request → return 400/422
- **Rate limits (429/509)**: Retry with backoff, fallback to local data if available
- **Service unavailable (503)**: External API down or rate-limited without fallback
- **Timeouts**: Caught and converted to friendly warnings (search continues with partial data)
- **Unexpected errors**: Logged with stack trace, return 500 with generic message

Services return `SearchResponse` with `warning` field for non-fatal issues (e.g., "3 stations excluded due to incomplete data") rather than failing the entire request.

---

## Scalability Considerations

Current design is suitable for small-to-medium deployments:

- **Single process**: Worker count is configurable, but Gunicorn not used (uvicorn only)
- **Memory footprint**: Minimal, TTLCache bounded (1000 entries)
- **I/O bound**: External API latency dominates; async handles this well
- **Cache effectiveness**: Geocoding hits cache after first request for each city
- **CSV reloads**: Manual or background, not blocking search requests

For production scale:

- Deploy behind reverse proxy (nginx) with multiple uvicorn workers
- Use Redis for shared cache across workers
- Monitor rate limit headers from Nominatim and adjust caching
- Consider periodic scheduled CSV refresh instead of on-demand

---

## Testing Strategy

See [testing-guide.md](testing-guide.md) for detailed testing practices.

Summary:

- **Unit tests**: Services with mocked HTTP clients
- **Integration tests**: End-to-end search using TestClient
- **Async tests**: All async code tested with `pytest-asyncio`
- **Fixtures**: Shared TestClient, isolated caches
- **External mocks**: Dummy response classes, no live API calls in tests

---

## Future Improvements

Potential enhancements:

- **Persistent cache**: Redis or database for geocoding across restarts
- **Geocoding alternatives**: Multiple providers for redundancy
- **Result persistence**: Save user searches for analytics (with privacy controls)
- **Batch search**: Support multiple cities in one request
- **Webhooks**: Async processing for large radius searches
- **Admin API**: Separate endpoints for cache management, metrics
- **Metrics & Monitoring**: Prometheus endpoints for hit rates, latency
- **Dockerization**: Container deployment with health checks

---

**End of Architecture Document**
