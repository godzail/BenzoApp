"""Fuel station API service."""

import asyncio
from typing import Any

import httpx2 as httpx
from fastapi import HTTPException
from loguru import logger
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

from src.models import (
    MAX_RESULTS_COUNT,
    FuelPrice,
    Settings,
    Station,
    StationSearchParams,
)
from src.services.csv_parser import CSVSchemaError
from src.services.distance_utils import calculate_distance
from src.services.prezzi_csv import fetch_and_combine_csv_data


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(),
    retry=retry_if_not_exception_type(HTTPException),
    reraise=True,
)
async def fetch_gas_stations(
    params: StationSearchParams,
    settings: Settings,
    http_client: httpx.AsyncClient,
    cold_path_lock: asyncio.Lock | None = None,
) -> dict | list[Any]:
    """Fetch gas stations from the MIMIT CSV sources.

    Parameters:
    - params: Station search parameters including latitude, longitude, distance, fuel, and results.
    - settings: Application settings containing API URL.
    - http_client: Shared HTTP client for making requests.
    - cold_path_lock: Optional lock to serialize cold-cache downloads.

    Returns:
    - The combined station payload from the CSV pipeline.

    Raises:
    - HTTPException: If the API returns an HTTP error.
    - RetryError: If all retry attempts fail.
    """
    try:
        logger.info(
            "Fetching gas station data from CSV sources: anagrafica={} prezzi={} params={}",
            settings.prezzi_csv_anagrafica_url,
            settings.prezzi_csv_prezzi_url,
            params.model_dump(),
        )
        payload = await fetch_and_combine_csv_data(
            settings,
            http_client,
            params=params,
            cold_path_lock=cold_path_lock,
        )
        logger.info(
            "CSV gas station payload size: {}",
            len(payload) if payload else 0,
        )
    except CSVSchemaError as err:
        # Surface schema problems as a client-visible, testable 422
        logger.error("CSV schema error: {}", err)
        raise HTTPException(status_code=422, detail=str(err)) from err
    except Exception as err:
        logger.error("CSV fetch or parse error: {} - {}", type(err).__name__, err)
        logger.exception("Full traceback for CSV fetch error:")
        raise HTTPException(
            status_code=503,
            detail="Fuel station service is temporarily unavailable. Please try again later.",
        ) from err
    else:
        return payload


def _build_fuel_prices(data: dict[str, Any], fuel_type: str, primary_price: float) -> list[FuelPrice]:
    """Build the list of fuel prices a station carries, primary fuel first.

    The requested fuel is listed first so existing ``fuel_prices[0]`` consumers
    keep working; the remaining fuels power the expandable "all fuels" detail
    view. Malformed or non-positive prices are skipped.
    """
    fuel_by_type: dict[str, float] = {fuel_type: primary_price}
    all_fuels = data.get("prezzi")
    if isinstance(all_fuels, dict):
        for ftype, finfo in all_fuels.items():
            if not isinstance(ftype, str):
                continue
            raw = finfo.get("prezzo") if isinstance(finfo, dict) else None
            if raw is None:
                continue
            try:
                fprice = float(raw)
            except (TypeError, ValueError):
                continue
            if fprice > 0:
                fuel_by_type.setdefault(ftype, fprice)
    return [FuelPrice(type=ftype, price=fprice) for ftype, fprice in fuel_by_type.items()]


def parse_and_normalize_stations(
    stations_payload: dict | list,
    fuel_type: str,
    results_limit: int,
    search_lat: float | None = None,
    search_lon: float | None = None,
) -> tuple[list[Station], int]:
    """Normalize payload to an iterable of station data dicts.

    Parameters:
    - stations_payload: The raw JSON payload from the fuel API.
    - fuel_type: The normalized fuel type to use for Price objects.
    - results_limit: The maximum number of stations to return.
    - search_lat: Latitude of search location for distance calculation.
    - search_lon: Longitude of search location for distance calculation.

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
            prezzo_raw = data.get("prezzo")
            if prezzo_raw is None:
                logger.warning("Skipping station {} because price is missing", idx)
                skipped_count += 1
                continue
            price = float(prezzo_raw)
            if price <= 0:
                logger.warning("Skipping station {} because price is not positive: {}", idx, price)
                skipped_count += 1
                continue
            lat = float(data.get("latitudine") or 0.0)
            lon = float(data.get("longitudine") or 0.0)
            # Filter out invalid coordinates at (0.0, 0.0)
            if lat == 0.0 and lon == 0.0:
                logger.warning("Skipping station {} because of invalid coordinates: lat=0.0, lon=0.0", idx)
                skipped_count += 1
                continue
            # Calculate distance from search location
            distance = None
            if search_lat is not None and search_lon is not None:
                distance = calculate_distance(search_lat, search_lon, lat, lon)
            plant_id = data.get("id_impianto") or data.get("id") or idx
            station = Station(
                id=str(plant_id),
                gestore=data.get("gestore") or None,
                address=data.get("indirizzo", "") or "",
                latitude=lat,
                longitude=lon,
                fuel_prices=_build_fuel_prices(data, fuel_type, price),
                distance=round(distance, 1) if distance is not None else None,
                updated_at=data.get("data"),
            )
            stations.append(station)
        except (ValueError, TypeError) as err:
            logger.warning("Skipping station {} due to parse error: {}", idx, err)
            skipped_count += 1
            continue

    stations.sort(key=lambda s: s.fuel_prices[0].price if s.fuel_prices else float("inf"))
    limit = max(1, min(results_limit, MAX_RESULTS_COUNT))

    return stations[:limit], skipped_count
