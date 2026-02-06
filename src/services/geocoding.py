"""Geocoding service using OpenStreetMap Nominatim."""

import httpx
from cachetools import TTLCache
from fastapi import HTTPException
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import Settings

# Global cache for geocoding results: city name -> location dict
# maxsize=1000 items, ttl=3600 seconds (1 hour)
geocoding_cache: TTLCache[str, dict[str, float]] = TTLCache(maxsize=1000, ttl=3600)


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
    # Check cache first
    if city in geocoding_cache:
        logger.info("Found city '%s' in geocoding cache", city)
        return geocoding_cache[city]

    try:
        response = await http_client.get(
            settings.nominatim_api_url,
            params={"q": city, "format": "json", "limit": 1},
            headers={"User-Agent": settings.user_agent},
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            raise HTTPException(status_code=404, detail=f"City '{city}' not found")

        location = data[0]
        result = {"latitude": float(location["lat"]), "longitude": float(location["lon"])}
    except httpx.HTTPStatusError as err:
        logger.error(
            "Geocoding API returned error: %s - %s",
            err.response.status_code,
            err.response.reason_phrase,
        )
        raise HTTPException(
            status_code=err.response.status_code,
            detail=f"Geocoding service error: {err.response.reason_phrase}",
        ) from err
    except httpx.RequestError as err:
        logger.warning("Geocoding request error: %s", err)
        raise HTTPException(
            status_code=503,
            detail="Geocoding service is temporarily unavailable. Please try again later.",
        ) from err
    else:
        # Update cache only if request succeeded
        geocoding_cache[city] = result
        return result
