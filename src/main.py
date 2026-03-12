"""Gas Station Finder API.

This module implements a FastAPI-based backend service for searching gas stations near a specified city.
It provides endpoints for geocoding city names, fetching gas station data, and serving static frontend assets.

Features:
- Geocodes city names to latitude/longitude using OpenStreetMap Nominatim.
- Fetches gas station data from Prezzi Carburante API with retry logic.
- Serves static files and frontend HTML.
- Provides health check and favicon endpoints.

Intended for use as the backend of a web application to help users find nearby gas stations and compare fuel prices.
"""

import asyncio
import html as _html
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from textwrap import dedent
from typing import Annotated, Any

import httpx
from dateutil.parser import parse as dateutil_parse
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from markdown import markdown as py_markdown
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from tenacity import RetryError

from src.models import (
    DEFAULT_RESULTS_COUNT,
    MAX_RESULTS_COUNT,
    MAX_SEARCH_RADIUS_KM,
    SearchRequest,
    SearchResponse,
    Settings,
    StationSearchParams,
)
from src.services import fuel_api
from src.services.csv_fetcher import _candidate_local_csv_dirs, _cleanup_old_csvs
from src.services.fuel_type_utils import normalize_fuel_type
from src.services.geocoding import geocode_city
from src.services.prezzi_csv import (
    _fetch_csvs,
    _is_cache_fresh,
    _load_cached_combined,
    _parse_and_combine_sync,
    _save_csv_files,
    _write_json_file,
    check_preferred_local_dir_writable,
    fetch_and_combine_csv_data,
    get_latest_csv_timestamp,
    preload_local_csv_cache,
)

_cached_settings: Settings | None = None


def get_settings() -> Settings:
    """Get application settings instance.

    This function is used as a FastAPI dependency to provide configuration
    settings loaded from environment variables.

    Returns:
    - The application settings object.
    """
    global _cached_settings  # noqa: PLW0603
    if _cached_settings is None:
        _cached_settings = Settings()
    return _cached_settings


# --- Lifespan Management ---
@asynccontextmanager
async def lifespan(_app: FastAPI):  # noqa: PLR0915
    """Lifespan context manager to handle startup and shutdown events."""
    settings = get_settings()
    # Create a shared HTTP client for connection pooling with timeout
    timeout = httpx.Timeout(60.0, connect=15.0)
    headers = {
        "User-Agent": settings.user_agent,
        "Accept": "text/csv",
    }
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        # Store the client in app state for use in endpoints
        _app.state.http_client = client

        # Startup check: warn if the preferred service-level CSV directory is not writable
        if settings.prezzi_local_data_dir is None:
            try:
                # Run the preferred-dir writability check in a thread to avoid blocking the event loop
                _ = await asyncio.to_thread(check_preferred_local_dir_writable, settings)
            except Exception as err:
                logger.warning("Preferred CSV directory check failed: {}", err)
                logger.exception(err)

        # Optionally preload local CSV data into cache (non-blocking)
        if settings.prezzi_preload_on_startup:
            try:
                task = asyncio.create_task(preload_local_csv_cache(settings))
                _app.state._preload_task = task  # noqa: SLF001
                task.add_done_callback(lambda _: logger.debug("Prezzi preload task finished"))
            except Exception as err:
                logger.warning("Failed to start prezzi preload task: {}", err)
                logger.exception(err)

        # Optionally trigger a full remote CSV reload on startup.
        # If the on-disk cache is missing or stale we perform a blocking reload
        # so the first-run experience has data available immediately. Otherwise
        # we schedule a non-blocking background refresh (preserve previous behavior).
        if getattr(settings, "prezzi_reload_on_startup", False):
            try:
                cache_fresh = False
                try:
                    cache_fresh = await _is_cache_fresh(settings.prezzi_cache_path, settings.prezzi_cache_hours)
                except Exception as _err:
                    # If cache check fails treat it as missing/stale so we attempt a reload
                    cache_fresh = False

                if not cache_fresh:
                    # Blocking reload on first run (cache missing/stale)
                    logger.info("Prezzi cache missing or stale — running blocking CSV reload on startup")
                    try:
                        await fetch_and_combine_csv_data(settings, client)
                        logger.info("Blocking startup CSV reload completed successfully")
                    except Exception as e:
                        logger.warning("Blocking startup CSV reload failed: {}", e)
                        logger.exception(e)
                else:
                    # Previous non-blocking behavior: schedule background refresh
                    async def _startup_reload():
                        logger.info("Starting prezzi CSV reload on startup (background)")
                        try:
                            # Reuse existing service function to fetch/parse/save and refresh cache
                            await fetch_and_combine_csv_data(settings, client)
                            logger.info("Startup CSV reload completed successfully")
                        except Exception as e:
                            logger.warning("Startup CSV reload failed: {}", e)
                            logger.exception(e)

                    task = asyncio.create_task(_startup_reload())
                    _app.state._startup_reload_task = task  # noqa: SLF001
            except Exception as err:
                logger.warning("Failed to schedule startup CSV reload: {}", err)
                logger.exception(err)
        try:
            yield
        except (asyncio.CancelledError, KeyboardInterrupt):
            logger.info("Shutdown: CancelledError or KeyboardInterrupt caught, exiting cleanly.")
        except Exception as err:
            logger.exception("Unexpected error in lifespan: {}", err)


# --- FastAPI App Initialization ---
app = FastAPI(title="Gas Station Finder API", lifespan=lifespan)

# Configure rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler,  # ty:ignore
)

# Configure Loguru logger
logger.remove()
logger.add(
    sys.stdout,
    level="INFO",
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>",
    colorize=True,
)

# Add CORS middleware using settings
app.add_middleware(
    CORSMiddleware,  # ty:ignore[invalid-argument-type]
    allow_origins=get_settings().cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Serve docs assets (images, included files) under a static route
docs_dir = Path(__file__).parent.parent / "docs"
app.mount("/docs-static", StaticFiles(directory=docs_dir), name="docs_static")


# --- API Endpoints ---
@app.get("/favicon.png", include_in_schema=False)
async def favicon() -> FileResponse:
    """Serve the favicon PNG."""
    return FileResponse(
        static_dir / "favicon.png",
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@app.get("/favicon.ico", include_in_schema=False)
async def favicon_ico() -> FileResponse:
    """Serve a favicon.ico by returning the PNG (browsers will accept it)."""
    return FileResponse(
        static_dir / "favicon.png",
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@limiter.limit("10/minute")
@app.post("/search", response_class=JSONResponse)
async def search_gas_stations(  # noqa: PLR0912
    request: SearchRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    _request: Request,  # for rate limiting
) -> SearchResponse:
    """Search for gas stations near a city within a given radius.

    Parameters:
    - request: SearchRequest containing city, radius, fuel, and results.
    - settings: Application settings (injected).

    Returns:
    - SearchResponse: List of stations and an optional warning message.
    """
    logger.info(
        "Received search request: city={}, radius={}km, fuel={}, results={}",
        request.city,
        request.radius,
        request.fuel,
        request.results,
    )

    # Normalize inputs without mutating the incoming request object
    city: str = (request.city or "").strip()
    if not city:
        raise HTTPException(status_code=400, detail="City name is required")

    results: int = request.results if request.results and request.results > 0 else DEFAULT_RESULTS_COUNT
    radius: int = min(max(request.radius or 1, 1), MAX_SEARCH_RADIUS_KM)

    # Geocode city (with timeout)
    location: dict[str, float] | None = None
    geo_error: str | None = None
    try:
        location = await asyncio.wait_for(
            geocode_city(city, settings, app.state.http_client),
            timeout=settings.search_timeout_seconds,
        )
    except TimeoutError:
        logger.warning("Search timed out during geocoding for city: {}", city)
        geo_error = "Search timed out. Please try again later."
    except RetryError:
        geo_error = "City geocoding service is temporarily unavailable. Please try again later."
    except HTTPException:
        geo_error = "City not found. Please check the city name and try again."

    if geo_error:
        return SearchResponse(stations=[], warning=geo_error, error=True)

    if location is None:
        return SearchResponse(stations=[], warning="Unexpected error during geocoding.", error=True)

    # Fetch stations (with timeout)
    normalized_fuel = normalize_fuel_type(request.fuel)
    params = StationSearchParams(
        latitude=location["latitude"],
        longitude=location["longitude"],
        distance=radius,
        fuel=normalized_fuel,
        results=min(results, MAX_RESULTS_COUNT),
    )
    stations_payload: dict | list | None = None
    fetch_error: str | None = None
    try:
        stations_payload = await asyncio.wait_for(
            fuel_api.fetch_gas_stations(params, settings, app.state.http_client),
            timeout=settings.search_timeout_seconds,
        )
    except TimeoutError:
        logger.warning("Search timed out while fetching stations for city: {}", city)
        fetch_error = "Search timed out while fetching station data. Please try again later."
    except RetryError:
        fetch_error = "Gas station data is temporarily unavailable. Please try again later."
    except HTTPException as he:
        # If upstream service returned a 422 for schema problems, surface its message
        if getattr(he, "status_code", None) == 422:  # noqa: PLR2004
            fetch_error = str(he.detail)
        else:
            fetch_error = "Failed to fetch gas station data. Please try again later."

    if fetch_error:
        return SearchResponse(stations=[], warning=fetch_error, error=True)

    if stations_payload is None:
        return SearchResponse(stations=[], warning="Unexpected error fetching station data.", error=True)

    # Parse and normalize stations
    stations, skipped_count = fuel_api.parse_and_normalize_stations(
        stations_payload,
        normalized_fuel,
        results,
        search_lat=location["latitude"],
        search_lon=location["longitude"],
    )

    return SearchResponse(
        stations=stations,
        warning=f"{skipped_count} stations were excluded due to incomplete data." if skipped_count else None,
    )


@app.get("/", response_class=HTMLResponse)
async def read_root() -> FileResponse:
    """Serve the main HTML page."""
    index_path = static_dir / "index.html"
    return FileResponse(
        index_path,
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@app.get("/help/{page}", response_class=HTMLResponse)
async def render_docs(page: str) -> HTMLResponse:
    """Render Markdown docs pages from the `docs` directory (safe filename)."""
    # Basic filename validation to prevent path traversal
    if ".." in page or "/" in page or "\\" in page:
        raise HTTPException(status_code=400, detail="Invalid page")

    docs_dir = Path(__file__).parent.parent / "docs"
    md_path = docs_dir / f"{page}.md"

    # If the exact page filename is missing, try language-specific fallbacks
    if not md_path.exists():
        for alt in (f"{page}-en.md", f"{page}-it.md"):
            alt_path = docs_dir / alt
            if alt_path.exists():
                md_path = alt_path
                break

    if not md_path.exists():
        raise HTTPException(status_code=404, detail="Not found")

    md_text = md_path.read_text(encoding="utf-8")

    # Preferred renderers: MarkdownIt
    rendered = None

    try:
        rendered = py_markdown(md_text, extensions=["tables", "fenced_code", "attr_list"])
    except Exception:
        logger.exception("Python-Markdown fallback failed; rendering raw markdown as escaped text")
        rendered = f"<pre>{_html.escape(md_text)}</pre>"

    # Read docs CSS for inlining
    docs_css_path = static_dir / "css" / "docs.css"
    docs_css = docs_css_path.read_text(encoding="utf-8")

    html_page = dedent(f"""<!doctype html>
        <html>
        <head>
            <meta charset='utf-8'>
            <meta name='viewport' content='width=device-width,initial-scale=1'>
            <link rel='stylesheet' href='/static/css/styles.split.css'>
            <style>{docs_css}</style>
            <link rel='icon' href='/favicon.ico'>
            <base href='/docs-static/'>
            <title>Documentation</title>
            <script src='https://cdn.tailwindcss.com'></script>
            <script>
            tailwind.config = {{
              darkMode: 'class',
              theme: {{
                extend: {{
                  colors: {{ primary: {{ DEFAULT: '#00c853' }} }},
                  fontFamily: {{ sans: ['Inter', 'system-ui'] }},
                }},
              }},
            }};
            </script>
        </head>
        <body class='bg-[var(--bg-primary)] text-[var(--text-primary)]
        min-h-screen font-sans transition-colors duration-250'>
            <div class='max-w-3xl mx-auto px-6 py-12 relative'>
                <div class='docs-content mt-4'>{rendered}</div>
                <button
                onclick="(history.length > 1) ? history.back() : (window.location.href='/')"
                aria-label='Back to main page'
                class='absolute top-6 left-6 p-1.5 rounded-lg border border-[var(--border-color)]
                bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors
                cursor-pointer text-[var(--text-primary)] shadow-sm'>
                    <svg class='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 19l-7-7 7-7'/>
                    </svg>
                </button>
                <button id='docs-theme-toggle' aria-label='Toggle theme'
                class='absolute top-6 right-6 p-1.5 rounded-lg border border-[var(--border-color)]
                bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors
                cursor-pointer text-[var(--text-primary)] shadow-sm'>
                    <svg id='theme-icon-sun' class='w-4 h-4' fill='none' stroke='currentColor'
                    viewBox='0 0 24 24'>
                        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2'
                        d='M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707
                        M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707
                        M16 12a4 4 0 11-8 0 4 4 0 018 0z'/>
                    </svg>
                    <svg id='theme-icon-moon' class='w-4 h-4 hidden' fill='none' stroke='currentColor'
                    viewBox='0 0 24 24'>
                        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2'
                        d='M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21
                        a9.003 9.003 0 008.354-5.646z'/>
                    </svg>
                </button>
            </div>
            <script src='/static/js/theme-utils.js' defer></script>
            <script src='/static/js/docs-theme.js' defer></script>
        </body>
        </html>""")

    return HTMLResponse(content=html_page, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/api/csv-status")
async def get_csv_status(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    """Get the current status of CSV data.

    Returns:
    - dict with:
      - last_updated: ISO timestamp string or null
      - source: "local" | "remote" | "cache" | "unknown"
      - is_stale: boolean indicating if cache is older than cache_hours
    """
    last_updated = get_latest_csv_timestamp(settings)

    is_stale = False
    if last_updated:
        try:
            dt = dateutil_parse(last_updated)
            now = datetime.now(tz=dt.tzinfo)
            hours_old = (now - dt).total_seconds() / 3600.0
            is_stale = hours_old > settings.prezzi_cache_hours
        except Exception:
            is_stale = False

    source = "unknown"
    if last_updated:
        source = "local"

    try:
        cache_fresh = await _is_cache_fresh(settings.prezzi_cache_path, settings.prezzi_cache_hours)
        if cache_fresh:
            cached = await _load_cached_combined(settings.prezzi_cache_path)
            if cached and len(cached) > 0:
                source = "cache"
    except Exception as err:
        logger.debug("Failed to check cache status: {}", err)

    # Indicate whether a reload (manual or startup) is currently in progress
    reload_in_progress = False
    for task_name in ("_reload_task", "_startup_reload_task"):
        task = getattr(app.state, task_name, None)
        if task is not None and hasattr(task, "done") and not task.done():
            reload_in_progress = True
            break

    return {
        "last_updated": last_updated,
        "source": source,
        "is_stale": is_stale,
        "reload_in_progress": reload_in_progress,
    }


@app.post("/api/reload-csv")
async def reload_csv(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """Force reload of CSV data by clearing cache and triggering async fetch.

    Returns:
    - dict with status message and new CSV status.
    """
    logger.info("Manual CSV reload requested via API")
    logger.debug("reload_csv endpoint called")

    try:
        cache_path = Path(settings.prezzi_cache_path)
        cache_exists = await asyncio.to_thread(cache_path.exists)
        logger.debug("Cache exists: {}", cache_exists)
        if cache_exists:
            try:
                await asyncio.to_thread(cache_path.unlink)
                logger.info("Cleared cache file: {}", settings.prezzi_cache_path)
            except Exception as e:
                logger.warning(
                    "Could not remove cache file (it may be in use); continuing reload: {} - {}",
                    settings.prezzi_cache_path,
                    e,
                )

        async def trigger_fetch():
            try:
                logger.debug("Starting CSV fetch...")
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0, connect=15.0),
                    headers={"User-Agent": settings.user_agent, "Accept": "text/csv"},
                    follow_redirects=True,
                ) as client:
                    anag_text, prezzi_text = await _fetch_csvs(client, settings)
                    force_delimiter = None if settings.prezzi_csv_delimiter == "auto" else settings.prezzi_csv_delimiter
                    combined = await asyncio.to_thread(
                        lambda: _parse_and_combine_sync(anag_text, prezzi_text, force_delimiter),
                    )
                    await _write_json_file(settings.prezzi_cache_path, combined)
                    saved_dir = await _save_csv_files(anag_text, prezzi_text, settings)
                    if saved_dir:
                        logger.info("CSV reload completed successfully, saved to: {}", saved_dir)
                    else:
                        logger.warning("CSV reload completed but failed to save local copies")

                    # Clean up old CSVs across ALL candidate directories (keep only the newest)
                    def _cleanup_all_candidates():
                        candidates = _candidate_local_csv_dirs(settings)
                        keep = getattr(settings, "prezzi_keep_versions", 1)
                        for d in candidates:
                            if d.exists():
                                _cleanup_old_csvs(d, "anagrafica_impianti_attivi_", keep)
                                _cleanup_old_csvs(d, "prezzo_alle_8_", keep)

                    await asyncio.to_thread(_cleanup_all_candidates)
                    logger.info("Cleaned up old CSV files across all candidate directories")
            except Exception as err:
                logger.error("Async CSV reload failed: {}", err)
                logger.exception(err)

        task = asyncio.create_task(trigger_fetch())
        app.state._reload_task = task  # noqa: SLF001

        await task
        # Await the task completion so client sees real-time logs
    except Exception as err:
        logger.error("Failed to trigger CSV reload: {}", err)
        logger.exception(err)
        return {
            "status": "error",
            "message": "Failed to trigger CSV reload",
        }
    else:
        last_updated = get_latest_csv_timestamp(settings)
        return {
            "status": "success",
            "message": "CSV reload completed successfully",
            "last_updated": last_updated,
        }
