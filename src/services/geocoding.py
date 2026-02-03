"""Geocoding service using OpenStreetMap Nominatim."""

import httpx
from fastapi import HTTPException
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import Settings


@retry(stop=stop_after_attempt(3), wait=wait_exponential(), reraise=True)
async def geocode_city(
    city: str,
    settings: Settings,
    http_client: httpx.AsyncClient,
) -> dict[str, float]:
    """Geocode a city name to latitude and longitude using OpenStreetMap Nominatim.

    Args:
        city: The city name to geocode.
        settings: Application settings containing API URL and user agent.
        http_client: Shared HTTP client for making requests.

    Returns:
        A dictionary with 'latitude' and 'longitude' keys.

    Raises:
        HTTPException: If the city is not found or the API returns an error.
        RetryError: If all retry attempts fail.
    """
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
        return {"latitude": float(location["lat"]), "longitude": float(location["lon"])}
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
        # Log with structured format, don't expose internal details to user
        logger.warning("Geocoding request error: %s", err)
        raise
