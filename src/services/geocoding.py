"""Geocoding service using OpenStreetMap Nominatim."""

import asyncio
import json
from pathlib import Path

import httpx
from cachetools import TTLCache
from fastapi import HTTPException
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import Settings

# Global cache for geocoding results: city name -> location dict
# maxsize=1000 items, ttl=3600 seconds (1 hour)
geocoding_cache: TTLCache[str, dict[str, float]] = TTLCache(maxsize=1000, ttl=3600)

# In-memory local city coordinates loaded from a static JSON (if available)
_LOCAL_CITY_COORDS: dict[str, dict[str, float]] | None = None

# Small alias mapping for common English/Italian city name pairs
ALIASES: dict[str, str] = {"florence": "firenze", "firenze": "firenze"}


def _load_local_city_coords(settings: Settings) -> dict[str, dict[str, float]]:
    """Attempt to load a local cities.json file and normalize it to a mapping.

    Searches several candidate locations and caches the result in memory.
    """
    global _LOCAL_CITY_COORDS
    if _LOCAL_CITY_COORDS is not None:
        return _LOCAL_CITY_COORDS

    candidates = []
    try:
        cache_parent = Path(settings.prezzi_cache_path).parent
        candidates.append(cache_parent / "cities.json")
    except Exception:
        pass
    candidates.extend([Path("src/static/data/cities.json"), Path("data/cities.json")])

    for p in candidates:
        if p.exists():
            try:
                with p.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
                mapping: dict[str, dict[str, float]] = {}
                if isinstance(data, dict):
                    # Accept either {city: {latitude, longitude}} or list-like dict
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
                _LOCAL_CITY_COORDS = mapping
                logger.debug("Loaded local city coords from %s (entries=%d)", p, len(mapping))
                return _LOCAL_CITY_COORDS
            except Exception as exc:  # pragma: no cover - defensive file handling
                logger.debug("Failed to parse local cities file %s: %s", p, exc)
                continue

    _LOCAL_CITY_COORDS = {}
    return _LOCAL_CITY_COORDS


def normalize_city_input(city: str) -> str:
    """Normalize city input for cache keys and geocoding queries."""
    c = city.strip().lower()
    return ALIASES.get(c, c)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(), reraise=True)
async def geocode_city(
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
    if normalized_city in geocoding_cache:
        logger.info("Found city '{}' in geocoding cache", normalized_city)
        return geocoding_cache[normalized_city]

    try:
        response = await http_client.get(
            settings.nominatim_api_url,
            params={"q": normalized_city, "format": "json", "limit": 1, "countrycodes": "it", "accept-language": "it"},
            headers={"User-Agent": settings.user_agent},
        )
        response.raise_for_status()
        data = response.json()
        if not data:
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
                try:
                    ra = int(retry_after)
                    logger.debug("Sleeping for %s seconds per Retry-After header", ra)
                    await asyncio.sleep(ra)
                except Exception:  # pragma: no cover - defensive parsing
                    logger.debug("Could not parse Retry-After header: %s", retry_after)

            # Try to find local city coordinates as a fallback
            local_coords = _load_local_city_coords(settings)
            if normalized_city in local_coords:
                coords = local_coords[normalized_city]
                logger.warning(
                    "Using local fallback coordinates for '%s' due to provider rate limit",
                    normalized_city,
                )
                geocoding_cache[normalized_city] = coords
                return coords

            # Surface a 503 to the client (tenacity retries will still apply to outer attempts)
            raise HTTPException(
                status_code=503,
                detail=(
                    "Geocoding service is currently rate-limited (bandwidth exceeded). "
                    "Please try again later or try a nearby city."
                ),
            ) from err

        # Other HTTP errors — surface upstream
        logger.error(
            "Geocoding API returned error: %s - %s",
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
            geocoding_cache[normalized_city] = coords
            return coords

        raise HTTPException(
            status_code=503,
            detail="Geocoding service is temporarily unavailable. Please try again later.",
        ) from err
    else:
        # Update cache only if request succeeded
        geocoding_cache[normalized_city] = result
        return result
