"""Fuel station API service."""

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import Settings, StationSearchParams


@retry(stop=stop_after_attempt(3), wait=wait_exponential(), reraise=True)
async def fetch_gas_stations(
    params: StationSearchParams,
    settings: Settings,
    http_client: httpx.AsyncClient,
) -> dict:
    """Fetch gas stations from Prezzi Carburante API.

    Args:
        params: Station search parameters including latitude, longitude, distance, fuel, and results.
        settings: Application settings containing API URL.
        http_client: Shared HTTP client for making requests.

    Returns:
        The JSON response from the Prezzi Carburante API.

    Raises:
        HTTPException: If the API returns an HTTP error.
        RetryError: If all retry attempts fail.
    """
    try:
        logger.info(
            "Making request to gas station API: URL=%s, params=%s",
            settings.prezzi_carburante_api_url,
            params.model_dump(),
        )
        response = await http_client.get(
            settings.prezzi_carburante_api_url,
            params=params.model_dump(),
        )
        logger.info(
            "Gas station API response: status_code=%s, response_size=%s bytes",
            response.status_code,
            len(response.text) if response.text else 0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as err:
        logger.error(
            "Gas station API HTTP error: %s - %s",
            err.response.status_code,
            err.response.reason_phrase,
        )
        raise
    except httpx.RequestError as err:
        logger.error("Gas station API request error: %s", err)
        raise
