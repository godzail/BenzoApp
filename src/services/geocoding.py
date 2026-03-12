"""Geocoding service using OpenStreetMap Nominatim."""

import asyncio
import json
import threading
from datetime import UTC, datetime
from pathlib import Path

import httpx
from cachetools import TTLCache
from fastapi import HTTPException
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import Settings

# Global cache for geocoding results: city name -> location dict
# maxsize=1000 items, ttl=86400 seconds (24 hours)
geocoding_cache: TTLCache[str, dict[str, float]] = TTLCache(maxsize=1000, ttl=86400)
_cache_lock = threading.Lock()

# Rate limiter: semaphore to ensure max 1 request per second to Nominatim
_rate_limiter = asyncio.Semaphore(1)

# Maximum seconds we will respect from a Retry-After header (safety clamp)
MAX_RETRY_AFTER_SECONDS = 60


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


# Small alias mapping for common English/Italian city name pairs
ALIASES: dict[str, str] = {"florence": "firenze", "firenze": "firenze"}

# Built-in fallback: major Italian cities with coordinates
# This eliminates API calls for the most common searches
BUILTIN_ITALIAN_CITIES: dict[str, dict[str, float]] = {
    "roma": {"latitude": 41.9028, "longitude": 12.4964},
    "milano": {"latitude": 45.4642, "longitude": 9.19},
    "napoli": {"latitude": 40.8518, "longitude": 14.2681},
    "torino": {"latitude": 45.0703, "longitude": 7.6869},
    "palermo": {"latitude": 38.1157, "longitude": 13.3615},
    "genova": {"latitude": 44.4056, "longitude": 8.9463},
    "bologna": {"latitude": 44.4949, "longitude": 11.3426},
    "firenze": {"latitude": 43.7696, "longitude": 11.2558},
    "bari": {"latitude": 41.1171, "longitude": 16.8543},
    "catania": {"latitude": 37.5079, "longitude": 15.0833},
    "venezia": {"latitude": 45.4408, "longitude": 12.3155},
    "verona": {"latitude": 45.4421, "longitude": 10.9988},
    "messina": {"latitude": 38.1938, "longitude": 15.5540},
    "padova": {"latitude": 45.4069, "longitude": 11.8768},
    "trieste": {"latitude": 45.6495, "longitude": 13.7768},
    "brescia": {"latitude": 45.5402, "longitude": 10.2225},
    "taranto": {"latitude": 40.4643, "longitude": 17.2471},
    "prato": {"latitude": 43.8777, "longitude": 11.1022},
    "reggio calabria": {"latitude": 38.1034, "longitude": 15.6475},
    "modena": {"latitude": 44.6471, "longitude": 10.9254},
    "parma": {"latitude": 44.8015, "longitude": 10.3279},
    "reggio emilia": {"latitude": 44.6989, "longitude": 10.6314},
    "perugia": {"latitude": 43.1107, "longitude": 12.3908},
    "ravenna": {"latitude": 44.4186, "longitude": 12.2025},
    "livorno": {"latitude": 43.5485, "longitude": 10.3105},
    "cagliari": {"latitude": 39.2238, "longitude": 9.1217},
    "foggia": {"latitude": 41.4634, "longitude": 15.5519},
    "rimini": {"latitude": 44.0593, "longitude": 12.5684},
    "salerno": {"latitude": 40.6825, "longitude": 14.7696},
    "ferrara": {"latitude": 44.8374, "longitude": 11.6188},
    "sassari": {"latitude": 40.7279, "longitude": 8.5569},
    "latina": {"latitude": 41.5316, "longitude": 12.8986},
    "giugliano in campania": {"latitude": 40.9313, "longitude": 14.2345},
    "monza": {"latitude": 45.5845, "longitude": 9.2725},
    "siracusa": {"latitude": 37.0596, "longitude": 15.2933},
    "bergamo": {"latitude": 45.6983, "longitude": 9.6772},
    "pescara": {"latitude": 42.4618, "longitude": 14.2140},
    "trento": {"latitude": 46.0740, "longitude": 11.1210},
    "vicenza": {"latitude": 45.5407, "longitude": 11.5416},
    "terni": {"latitude": 42.5617, "longitude": 12.6428},
    "novara": {"latitude": 45.4469, "longitude": 8.6231},
    "ancona": {"latitude": 43.6168, "longitude": 13.5187},
    "piacenza": {"latitude": 45.0512, "longitude": 9.6936},
    "lecce": {"latitude": 40.3510, "longitude": 18.1751},
    "bolzano": {"latitude": 46.4983, "longitude": 11.3547},
    "catanzaro": {"latitude": 38.9060, "longitude": 16.5944},
    "udine": {"latitude": 46.0631, "longitude": 13.2359},
    "cesena": {"latitude": 44.1391, "longitude": 12.2431},
    "barletta": {"latitude": 41.3171, "longitude": 16.2833},
    "viterbo": {"latitude": 42.4191, "longitude": 12.1050},
    "cremona": {"latitude": 45.1331, "longitude": 9.9815},
    "sondrio": {"latitude": 46.1699, "longitude": 9.8714},
    "l'aquila": {"latitude": 42.3505, "longitude": 13.3995},
    "pisa": {"latitude": 43.7167, "longitude": 10.3967},
    "lucca": {"latitude": 43.8378, "longitude": 10.5032},
    "siena": {"latitude": 43.3188, "longitude": 11.3308},
    "pesaro": {"latitude": 43.9101, "longitude": 12.9039},
    "urbino": {"latitude": 43.7262, "longitude": 12.6365},
    "san marino": {"latitude": 43.9424, "longitude": 12.4578},
    "civitavecchia": {"latitude": 42.0929, "longitude": 11.7921},
    "massa": {"latitude": 44.0370, "longitude": 10.1413},
    "grosseto": {"latitude": 42.7637, "longitude": 11.1128},
    "asti": {"latitude": 44.8008, "longitude": 8.2065},
    "alessandria": {"latitude": 44.9111, "longitude": 8.6162},
    "cosenza": {"latitude": 39.2983, "longitude": 16.2526},
    "crotone": {"latitude": 39.0807, "longitude": 17.1274},
    "vibo valentia": {"latitude": 38.5534, "longitude": 16.2024},
    "potenza": {"latitude": 40.6333, "longitude": 15.8083},
    "campobasso": {"latitude": 41.5601, "longitude": 14.6562},
    "avellino": {"latitude": 40.9581, "longitude": 14.7933},
    "benevento": {"latitude": 41.1337, "longitude": 14.7815},
    "caserta": {"latitude": 41.0746, "longitude": 14.3283},
    "agrigento": {"latitude": 37.3115, "longitude": 13.5765},
    "caltanissetta": {"latitude": 37.4898, "longitude": 14.0634},
    "enna": {"latitude": 37.5958, "longitude": 14.2786},
    "ragusa": {"latitude": 36.9251, "longitude": 14.7255},
}


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
                    return _LOCAL_CITY_COORDS  # noqa: TRY300
                except Exception as exc:  # pragma: no cover - defensive file handling
                    logger.debug("Failed to parse local cities file {}: {}", p, exc)

        _LOCAL_CITY_COORDS = BUILTIN_ITALIAN_CITIES.copy()
        logger.debug("Using built-in Italian cities fallback (entries={})", len(_LOCAL_CITY_COORDS))
        return _LOCAL_CITY_COORDS


def normalize_city_input(city: str) -> str:
    """Normalize city input for cache keys and geocoding queries.

    Parameters:
    - city: The city name to normalize.

    Returns:
    - The normalized city name (lowercase, trimmed, with aliases resolved).
    """
    c = city.strip().lower()
    return ALIASES.get(c, c)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), reraise=True)
async def geocode_city(  # noqa: C901, PLR0912, PLR0915
    city: str,
    settings: Settings,
    http_client: httpx.AsyncClient,
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
    normalized_city = normalize_city_input(city)
    cached_result = get_from_cache(normalized_city)
    if cached_result is not None:
        logger.info("Found city '{}' in geocoding cache", normalized_city)
        return cached_result

    # Rate limiting: acquire semaphore to ensure max 1 request per second
    async with _rate_limiter:
        # Try Nominatim first
        try:
            response = await http_client.get(
                settings.nominatim_api_url,
                params={
                    "q": normalized_city,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "it",
                    "accept-language": "it",
                },
                headers={"User-Agent": settings.user_agent},
            )
            response.raise_for_status()
            data = response.json()
            if not data:
                local_coords = _load_local_city_coords(settings)
                if normalized_city in local_coords:
                    coords = local_coords[normalized_city]
                    logger.warning(
                        "Using local fallback coordinates for '{}' because provider returned no results",
                        normalized_city,
                    )
                    set_in_cache(normalized_city, coords)
                    return coords
                raise HTTPException(status_code=404, detail=f"City '{city}' not found")

            location = data[0]
            result = {"latitude": float(location["lat"]), "longitude": float(location["lon"])}
        except httpx.HTTPStatusError as err:
            status = err.response.status_code if err.response is not None else None
            reason = getattr(err.response, "reason_phrase", "") if err.response is not None else ""

            # Handle rate-limit / bandwidth-exceeded cases with retry-after and local fallback
            if status in (429, 509):
                retry_after = None
                if err.response is not None:
                    retry_after = err.response.headers.get("Retry-After")

                logger.warning(
                    "Geocoding provider rate-limited: status={} reason={} retry_after={}",
                    status,
                    reason,
                    retry_after,
                )

                if retry_after:
                    # Parse Retry-After with support for integer seconds or HTTP-date strings
                    wait_secs = _parse_retry_after_header(retry_after)
                    if wait_secs is None:
                        logger.debug("Could not parse Retry-After header: {}", retry_after)
                    else:
                        # Clamp to prevent very long sleeps (safety)
                        wait_secs = min(wait_secs, MAX_RETRY_AFTER_SECONDS)
                        logger.debug("Sleeping for %s seconds per Retry-After header (clamped)", wait_secs)
                        await asyncio.sleep(wait_secs)

                # Try to find local city coordinates as a fallback
                local_coords = _load_local_city_coords(settings)
                if normalized_city in local_coords:
                    coords = local_coords[normalized_city]
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

            # For 403 (Forbidden) or other errors, try Photon fallback
            if status in (403, 502, 503):
                logger.warning("Nominatim returned {} - trying Photon fallback", status)
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
                        set_in_cache(normalized_city, result)
                        return result
                except Exception as photon_err:
                    logger.warning("Photon fallback also failed: {}", photon_err)
                    logger.exception(photon_err)

            # Other HTTP errors — surface upstream
            logger.error(
                "Geocoding API returned error: {} - {}",
                status,
                reason,
            )
            raise HTTPException(
                status_code=status or 502,
                detail=f"Geocoding service error: {reason}",
            ) from err
        except httpx.RequestError as err:
            logger.warning("Geocoding request error: {}", err)
            # Try local fallback coordinates before failing
            local_coords = _load_local_city_coords(settings)
            if normalized_city in local_coords:
                coords = local_coords[normalized_city]
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
        else:
            # Update cache only if request succeeded
            set_in_cache(normalized_city, result)
            return result
