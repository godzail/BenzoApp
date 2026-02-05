"""Fuel station API service."""

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import (
    MAX_RESULTS_COUNT,
    FuelPrice,
    Settings,
    Station,
    StationSearchParams,
)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(), reraise=True)
async def fetch_gas_stations(
    params: StationSearchParams,
    settings: Settings,
    http_client: httpx.AsyncClient,
) -> dict:
    """Fetch gas stations from Prezzi Carburante API.

    Parameters:
    - params: Station search parameters including latitude, longitude, distance, fuel, and results.
    - settings: Application settings containing API URL.
    - http_client: Shared HTTP client for making requests.

    Returns:
    - The JSON response from the Prezzi Carburante API.

    Raises:
    - HTTPException: If the API returns an HTTP error.
    - RetryError: If all retry attempts fail.
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


def parse_and_normalize_stations(
    stations_payload: dict | list,
    fuel_type: str,
    results_limit: int,
) -> tuple[list[Station], int]:
    """Normalize payload to an iterable of station data dicts.

    Parameters:
    - stations_payload: The raw JSON payload from the fuel API.
    - fuel_type: The normalized fuel type to use for Price objects.
    - results_limit: The maximum number of stations to return.

    Returns:
    - A tuple containing:
      - A list of normalized Station objects.
      - The number of stations skipped due to incomplete data.
    """
    if isinstance(stations_payload, list):
        payload_iter = enumerate(stations_payload)
    elif isinstance(stations_payload, dict):
        payload_iter = enumerate(stations_payload.values())
    else:
        logger.warning("Unexpected stations payload type: %s", type(stations_payload))
        return [], 0

    stations: list[Station] = []
    skipped_count = 0
    for idx, data in payload_iter:
        if not isinstance(data, dict):
            logger.warning("Skipping non-dict station entry at index %s", idx)
            skipped_count += 1
            continue
        try:
            prezzo_raw = data.get("prezzo", 0.0)
            price: float = float(prezzo_raw) if prezzo_raw is not None else 0.0
            station = Station(
                id=str(idx),
                address=data.get("indirizzo", "") or "",
                latitude=float(data.get("latitudine") or 0.0),
                longitude=float(data.get("longitudine") or 0.0),
                fuel_prices=[FuelPrice(type=fuel_type, price=price)],
            )
            stations.append(station)
        except (ValueError, TypeError) as err:
            logger.warning("Skipping station %s due to parse error: %s", idx, err)
            skipped_count += 1
            continue

    stations.sort(key=lambda s: (s.fuel_prices[0].price if s.fuel_prices else float("inf")))
    limit = max(1, min(results_limit, MAX_RESULTS_COUNT))

    return stations[:limit], skipped_count
