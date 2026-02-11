"""Fuel station API service."""

import httpx
from fastapi import HTTPException
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from src.models import (
    MAX_RESULTS_COUNT,
    FuelPrice,
    Settings,
    Station,
    StationSearchParams,
)
from src.services.prezzi_csv import fetch_and_combine_csv_data


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
        # Use internal CSV-based fetcher as primary data source
        logger.info(
            "Fetching gas station data from CSV sources: anagrafica={} prezzi={} params={}",
            settings.prezzi_csv_anagrafica_url,
            settings.prezzi_csv_prezzi_url,
            params.model_dump(),
        )
        payload = await fetch_and_combine_csv_data(settings, http_client, params=params)
        logger.info(
            "CSV gas station payload size: {}",
            len(payload) if payload else 0,
        )
        return payload
    except Exception as err:
        logger.error("CSV fetch or parse error: {} - {}", type(err).__name__, err)
        logger.exception("Full traceback for CSV fetch error:")
        raise HTTPException(
            status_code=503,
            detail="Fuel station service is temporarily unavailable. Please try again later.",
        ) from err


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
        logger.warning("Unexpected stations payload type: {}", type(stations_payload))
        return [], 0

    stations: list[Station] = []
    skipped_count = 0
    for idx, data in payload_iter:
        if not isinstance(data, dict):
            logger.warning("Skipping non-dict station entry at index {}", idx)
            skipped_count += 1
            continue
        try:
            prezzo_raw = data.get("prezzo", 0.0)
            price: float = float(prezzo_raw) if prezzo_raw is not None else 0.0
            lat = float(data.get("latitudine") or 0.0)
            lon = float(data.get("longitudine") or 0.0)
            # Filter out invalid coordinates at (0.0, 0.0)
            if lat == 0.0 and lon == 0.0:
                logger.warning("Skipping station {} because of invalid coordinates: lat=0.0, lon=0.0", idx)
                skipped_count += 1
                continue
            station = Station(
                id=str(idx),
                address=data.get("indirizzo", "") or "",
                latitude=lat,
                longitude=lon,
                fuel_prices=[FuelPrice(type=fuel_type, price=price)],
            )
            stations.append(station)
        except (ValueError, TypeError) as err:
            logger.warning("Skipping station {} due to parse error: {}", idx, err)
            skipped_count += 1
            continue

    stations.sort(key=lambda s: s.fuel_prices[0].price if s.fuel_prices else float("inf"))
    limit = max(1, min(results_limit, MAX_RESULTS_COUNT))

    return stations[:limit], skipped_count
