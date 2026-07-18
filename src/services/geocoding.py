"""Geocoding service using OpenStreetMap Nominatim."""

import asyncio
import json
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

import httpx2 as httpx
from cachetools import TTLCache
from fastapi import HTTPException
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import Settings

# Global cache for geocoding results: city name -> location dict
# Initialized lazily from Settings on first use
geocoding_cache: TTLCache[str, dict[str, float]] = TTLCache(maxsize=1000, ttl=86400)
_cache_lock = threading.Lock()

# Rate limiter: semaphore to ensure max 1 request per second to Nominatim
_rate_limiter = asyncio.Semaphore(1)

# Maximum seconds we will respect from a Retry-After header (safety clamp)
MAX_RETRY_AFTER_SECONDS = 60


class AsyncGeocodingClient(Protocol):
    """Minimal async HTTP client interface used by geocoding."""

    async def get(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        """Send a GET request and return a response-like object."""


def _parse_retry_after_header(value: str | None) -> float | None:
    """Parse a Retry-After header value into seconds.

    Supports:
    - integer seconds ("120")
    - float seconds ("1.5")
    - HTTP-date (RFC 1123/2822) strings ("Wed, 21 Oct 2015 07:28:00 GMT")

    Returns the number of seconds to wait (>=0) or None if the header is
    unparseable.
    """
    if not value:
        return None
    s = value.strip()
    # Plain integer/float seconds
    try:
        return float(s)
    except Exception:
        logger.debug("Failed to parse Retry-After as float: {}", s)

    # Try parsing as an HTTP-date
    try:
        from email.utils import parsedate_to_datetime  # noqa: PLC0415

        dt = parsedate_to_datetime(s)
        # parsedate_to_datetime may return naive datetime — treat as UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)

        now = datetime.now(tz=UTC)
        delta = (dt - now).total_seconds()
        return max(0.0, delta)
    except Exception:
        return None


# In-memory local city coordinates loaded from a static JSON (if available)
_LOCAL_CITY_COORDS: dict[str, dict[str, float]] | None = None
_local_coords_lock = threading.Lock()


def get_from_cache(key: str) -> dict[str, float] | None:
    """Thread-safe get from geocoding cache."""
    with _cache_lock:
        return geocoding_cache.get(key)


def set_in_cache(key: str, value: dict[str, float]) -> None:
    """Thread-safe set in geocoding cache."""
    with _cache_lock:
        geocoding_cache[key] = value


def _reconfigure_cache(settings: Settings) -> None:
    """Reconfigure the global geocoding cache from application settings (idempotent)."""
    global geocoding_cache  # noqa: PLW0603
    with _cache_lock:
        desired_max = settings.geocoding_cache_maxsize
        desired_ttl = settings.geocoding_cache_ttl_seconds
        if geocoding_cache.maxsize == desired_max and geocoding_cache.ttl == desired_ttl:
            return
        geocoding_cache = TTLCache(maxsize=desired_max, ttl=desired_ttl)


# Small alias mapping for common English/Italian city name pairs
ALIASES: dict[str, str] = {"florence": "firenze", "firenze": "firenze"}

# Built-in fallback: major Italian cities with coordinates
# Lives in a JSON data file to keep the module compact.


def _parse_cities_json(data: dict | list) -> dict[str, dict[str, float]]:
    """Parse cities JSON data (dict or list format) into a normalized mapping."""
    mapping: dict[str, dict[str, float]] = {}

    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, dict):
                lat = v.get("latitude") or v.get("lat")
                lon = v.get("longitude") or v.get("lon")
                if lat is not None and lon is not None:
                    mapping[k.strip().lower()] = {
                        "latitude": float(lat),
                        "longitude": float(lon),
                    }
    elif isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            city = (item.get("city") or item.get("name") or item.get("nome") or "").strip().lower()
            lat = item.get("lat") or item.get("latitude")
            lon = item.get("lon") or item.get("longitude")
            if city and lat is not None and lon is not None:
                mapping[city] = {"latitude": float(lat), "longitude": float(lon)}

    return mapping


def _load_local_city_coords(settings: Settings) -> dict[str, dict[str, float]]:
    """Attempt to load a local cities.json file and normalize it to a mapping.

    Searches several candidate locations and caches the result in memory.
    Falls back to built-in Italian cities if no local file found.
    """
    global _LOCAL_CITY_COORDS  # noqa: PLW0603

    with _local_coords_lock:
        if _LOCAL_CITY_COORDS is not None:
            return _LOCAL_CITY_COORDS

        candidates = []
        try:
            cache_parent = Path(settings.prezzi_cache_path).parent
            candidates.append(cache_parent / "cities.json")
        except Exception as e:  # Don't silently ignore
            logger.debug("Could not determine cache parent from prezzi_cache_path: {}", e)
        candidates.extend([Path("src/static/data/cities.json"), Path("data/cities.json")])

        for p in candidates:
            if p.exists():
                try:
                    with p.open("r", encoding="utf-8") as fh:
                        data = json.load(fh)
                    mapping = _parse_cities_json(data)
                    _LOCAL_CITY_COORDS = mapping
                    logger.debug("Loaded local city coords from {} (entries={})", p, len(mapping))
                except Exception as exc:  # pragma: no cover - defensive file handling
                    logger.debug("Failed to parse local cities file {}: {}", p, exc)
                else:
                    return _LOCAL_CITY_COORDS

        builtin_path = Path(__file__).parent / "data" / "italian_cities.json"
        try:
            with builtin_path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
            mapping = _parse_cities_json(data)
            _LOCAL_CITY_COORDS = mapping
            logger.debug("Loaded built-in Italian cities fallback from {} (entries={})", builtin_path, len(mapping))
        except Exception as exc:
            logger.debug("Failed to load built-in Italian cities fallback: {}", exc)
            _LOCAL_CITY_COORDS = {}
        return _LOCAL_CITY_COORDS


def _get_local_city_coords(settings: Settings, normalized_city: str) -> dict[str, float] | None:
    """Return local fallback coordinates for a normalized city, if available."""
    local_coords = _load_local_city_coords(settings)
    return local_coords.get(normalized_city)


async def _sleep_for_retry_after(retry_after: str | None) -> None:
    """Sleep for a bounded Retry-After duration when the header is parseable."""
    if not retry_after:
        return

    wait_secs = _parse_retry_after_header(retry_after)
    if wait_secs is None:
        logger.debug("Could not parse Retry-After header: {}", retry_after)
        return

    wait_secs = min(wait_secs, MAX_RETRY_AFTER_SECONDS)
    logger.debug("Sleeping for {} seconds per Retry-After header (clamped)", wait_secs)
    await asyncio.sleep(wait_secs)


async def _geocode_with_photon(
    normalized_city: str,
    settings: Settings,
    http_client: AsyncGeocodingClient,
) -> dict[str, float] | None:
    """Try Photon as a fallback geocoding provider."""
    try:
        photon_response = await http_client.get(
            settings.photon_api_url,
            params={"q": normalized_city, "limit": 1},
            headers={"User-Agent": settings.user_agent},
        )
        photon_response.raise_for_status()
        photon_data = photon_response.json()
        if photon_data.get("features"):
            location = photon_data["features"][0]["geometry"]["coordinates"]
            result = {"longitude": float(location[0]), "latitude": float(location[1])}
            logger.info("Successfully geocoded '{}' via Photon", normalized_city)
            return result
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as photon_err:
        logger.warning("Photon fallback also failed: {}", photon_err)
        logger.exception(photon_err)
    return None


def normalize_city_input(city: str) -> str:
    """Normalize city input for cache keys and geocoding queries.

    Parameters:
    - city: The city name to normalize.

    Returns:
    - The normalized city name (lowercase, trimmed, with aliases resolved).
    """
    c = city.strip().lower()
    return ALIASES.get(c, c)


def _build_nominatim_params(normalized_city: str) -> dict[str, Any]:
    """Build the Nominatim query params for a city search.

    Parameters:
    - normalized_city: The normalized city name to search for.

    Returns:
    - A dictionary of query parameters for the Nominatim `/search` endpoint.
    """
    return {
        "q": normalized_city,
        "format": "json",
        "limit": 1,
        "countrycodes": "it",
        "accept-language": "it",
    }


async def _fetch_from_nominatim(
    city: str,
    normalized_city: str,
    settings: Settings,
    http_client: AsyncGeocodingClient,
) -> dict[str, float]:
    """Query Nominatim for a city and extract its coordinates.

    Parameters:
    - city: The original (non-normalized) city name, used in error messages.
    - normalized_city: The normalized city name to search for.
    - settings: Application settings containing API URL and user agent.
    - http_client: Shared HTTP client for making requests.

    Returns:
    - A dictionary with 'latitude' and 'longitude' keys. When Nominatim
      returns no results, local fallback coordinates are returned instead
      (already cached) if available.

    Raises:
    - HTTPException: If the city is not found and no local fallback exists.
    - httpx.HTTPStatusError: If Nominatim returns an HTTP error status.
    - httpx.RequestError: If the request fails at the network level.
    """
    response = await http_client.get(
        settings.nominatim_api_url,
        params=_build_nominatim_params(normalized_city),
        headers={"User-Agent": settings.user_agent},
    )
    response.raise_for_status()
    data = response.json()
    if not data:
        coords = _get_local_city_coords(settings, normalized_city)
        if coords is not None:
            logger.warning(
                "Using local fallback coordinates for '{}' because provider returned no results",
                normalized_city,
            )
            set_in_cache(normalized_city, coords)
            return coords
        raise HTTPException(status_code=404, detail=f"City '{city}' not found")

    location = data[0]
    return {"latitude": float(location["lat"]), "longitude": float(location["lon"])}


async def _handle_rate_limited_status(
    err: httpx.HTTPStatusError,
    status: int | None,
    normalized_city: str,
    settings: Settings,
) -> dict[str, float]:
    """Handle a 429/509 rate-limit response: wait, then fall back to local coordinates.

    Parameters:
    - err: The original HTTP status error, used as the raised exception's cause.
    - status: The HTTP status code that triggered this handler.
    - normalized_city: The normalized city name being geocoded.
    - settings: Application settings used to look up local fallback coordinates.

    Returns:
    - Local fallback coordinates, if available.

    Raises:
    - HTTPException: 503 if no local fallback coordinates are available.
    """
    retry_after = err.response.headers.get("Retry-After") if err.response is not None else None
    reason = getattr(err.response, "reason_phrase", "") if err.response is not None else ""

    logger.warning(
        "Geocoding provider rate-limited: status={} reason={} retry_after={}",
        status,
        reason,
        retry_after,
    )

    await _sleep_for_retry_after(retry_after)

    coords = _get_local_city_coords(settings, normalized_city)
    if coords is not None:
        logger.warning(
            "Using local fallback coordinates for '{}' due to provider rate limit",
            normalized_city,
        )
        set_in_cache(normalized_city, coords)
        return coords

    # Surface a 503 to the client (tenacity retries will still apply to outer attempts)
    raise HTTPException(
        status_code=503,
        detail=(
            "Geocoding service is currently rate-limited (bandwidth exceeded). "
            "Please try again later or try a nearby city."
        ),
    ) from err


async def _handle_forbidden_status(
    status: int | None,
    normalized_city: str,
    settings: Settings,
    http_client: AsyncGeocodingClient,
) -> dict[str, float] | None:
    """Try Photon as a fallback provider for 403/502/503 Nominatim responses.

    Parameters:
    - status: The HTTP status code that triggered this fallback attempt.
    - normalized_city: The normalized city name being geocoded.
    - settings: Application settings containing the Photon API URL.
    - http_client: Shared HTTP client for making requests.

    Returns:
    - Coordinates from Photon (already cached), or None if Photon also failed.
    """
    logger.warning("Nominatim returned {} - trying Photon fallback", status)
    photon_result = await _geocode_with_photon(normalized_city, settings, http_client)
    if photon_result is not None:
        set_in_cache(normalized_city, photon_result)
    return photon_result


async def _handle_nominatim_status_error(
    err: httpx.HTTPStatusError,
    normalized_city: str,
    settings: Settings,
    http_client: AsyncGeocodingClient,
) -> dict[str, float]:
    """Translate a Nominatim HTTPStatusError into fallback coordinates or an HTTPException.

    Parameters:
    - err: The HTTP status error raised by the Nominatim request.
    - normalized_city: The normalized city name being geocoded.
    - settings: Application settings used by fallback providers.
    - http_client: Shared HTTP client for making fallback requests.

    Returns:
    - Fallback coordinates from a local dataset or the Photon provider.

    Raises:
    - HTTPException: If no fallback succeeds.
    """
    status = err.response.status_code if err.response is not None else None
    reason = getattr(err.response, "reason_phrase", "") if err.response is not None else ""

    if status in (429, 509):
        return await _handle_rate_limited_status(err, status, normalized_city, settings)

    if status in (403, 502, 503):
        photon_result = await _handle_forbidden_status(status, normalized_city, settings, http_client)
        if photon_result is not None:
            return photon_result

    logger.error("Geocoding API returned error: {} - {}", status, reason)
    raise HTTPException(
        status_code=status or 502,
        detail=f"Geocoding service error: {reason}",
    ) from err


def _handle_nominatim_request_error(
    err: httpx.RequestError,
    normalized_city: str,
    settings: Settings,
) -> dict[str, float]:
    """Fall back to local coordinates or raise 503 for network-level Nominatim failures.

    Parameters:
    - err: The request error raised while contacting Nominatim.
    - normalized_city: The normalized city name being geocoded.
    - settings: Application settings used to look up local fallback coordinates.

    Returns:
    - Local fallback coordinates, if available.

    Raises:
    - HTTPException: 503 if no local fallback coordinates are available.
    """
    logger.warning("Geocoding request error: {}", err)
    coords = _get_local_city_coords(settings, normalized_city)
    if coords is not None:
        logger.warning(
            "Using local fallback coordinates for '{}' due to request error",
            normalized_city,
        )
        set_in_cache(normalized_city, coords)
        return coords

    raise HTTPException(
        status_code=503,
        detail="Geocoding service is temporarily unavailable. Please try again later.",
    ) from err


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), reraise=True)
async def geocode_city(
    city: str,
    settings: Settings,
    http_client: AsyncGeocodingClient,
) -> dict[str, float]:
    """Geocode a city name to latitude and longitude using OpenStreetMap Nominatim.

    Parameters:
    - city: The city name to geocode.
    - settings: Application settings containing API URL and user agent.
    - http_client: Shared HTTP client for making requests.

    Returns:
    - A dictionary with 'latitude' and 'longitude' keys.

    Raises:
    - HTTPException: If the city is not found or the API returns an error.
    - RetryError: If all retry attempts fail.
    """
    # Normalize city input and check cache first
    _reconfigure_cache(settings)
    normalized_city = normalize_city_input(city)
    cached_result = get_from_cache(normalized_city)
    if cached_result is not None:
        logger.info("Found city '{}' in geocoding cache", normalized_city)
        return cached_result

    # Rate limiting: acquire semaphore to ensure max 1 request per second
    async with _rate_limiter:
        try:
            result = await _fetch_from_nominatim(city, normalized_city, settings, http_client)
        except httpx.HTTPStatusError as err:
            return await _handle_nominatim_status_error(err, normalized_city, settings, http_client)
        except httpx.RequestError as err:
            return _handle_nominatim_request_error(err, normalized_city, settings)

        # Update cache only if request succeeded
        set_in_cache(normalized_city, result)
        # Soft rate limit: Nominatim allows max 1 request per second
        await asyncio.sleep(1.0)
        return result
