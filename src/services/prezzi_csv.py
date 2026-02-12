"""CSV-based Prezzi Carburante fetcher and cache.

This module downloads the official CSVs, parses them, merges records, and returns a
list-like payload compatible with existing `parse_and_normalize_stations` usage.

Behavior:
- Read on-disk cache if fresh (based on `Settings.prezzi_cache_hours`).
- Otherwise fetch both CSVs, decode as ISO-8859-1, parse semicolon- or pipe-delimited content (auto-detects delimiter),
  merge anagrafica + prezzi, filter out stale prices (>7 days) and invalid coords,
  return top N stations for the requested fuel and radius.
- Persist combined JSON to disk for later reuse.
"""

from __future__ import annotations

import asyncio
import httpx
from typing import Any

from loguru import logger

from src.models import Settings, StationSearchParams

# Import submodules and pull all needed symbols into module namespace for backward compatibility
from src.services.csv_parser import (
    _detect_delimiter,
    _parse_anagrafica,
    _parse_prezzi,
    _parse_and_combine_sync,
    _filter_and_transform_combined,
    PREZZI_MIN_COLS,
    PRICE_IDX,
    SELF_IDX,
    DATE_IDX,
    LAT_IDX,
    LON_IDX,
    GESTORE_IDX,
    ADDR_IDX_START,
    ADDR_IDX_END,
    DAYS_RECENCY,
    EARTH_R_KM,
    MIN_CSV_COLUMNS,
    _deg2rad,
    _haversine_km,
    _parse_date,
    _is_recent,
)
from src.services.csv_fetcher import (
    PROJECT_ROOT,
    LOCAL_DATA_DIR,
    MIN_CONTENT_LENGTH,
    _fetch_csvs,
    _load_local_csvs,
    _candidate_local_csv_dirs,
    _save_csv_files,
    _cleanup_old_csvs,
)
from src.services.csv_cache import (
    _read_json_file,
    _write_json_file,
    _is_cache_fresh,
    _load_cached_combined,
    preload_local_csv_cache,
    check_preferred_local_dir_writable,
    get_latest_csv_timestamp,
)


async def fetch_and_combine_csv_data(
    settings: Settings,
    http_client: httpx.AsyncClient,
    params: StationSearchParams | None = None,
) -> list[dict[str, Any]]:
    """Fetch CSVs, merge them and return a list of stations filtered by params."""
    combined: dict[str, Any] | None = None

    try:
        is_fresh = await _is_cache_fresh(settings.prezzi_cache_path, settings.prezzi_cache_hours)
        if is_fresh:
            cached = await _load_cached_combined(settings.prezzi_cache_path)
            if cached is not None and len(cached) > 0:
                logger.info("Using cached prezzi data from {} ({} stations)", settings.prezzi_cache_path, len(cached))
                combined = cached
            elif cached is not None:
                logger.warning(
                    "Cached prezzi data at {} is empty, will re-fetch from CSV sources",
                    settings.prezzi_cache_path,
                )
    except Exception as err:
        logger.warning("Cache check failed: {}", err)
        logger.exception(err)
        combined = None

    if combined is None:
        anag_text, prezzi_text = await _fetch_csvs(http_client, settings)
        force_delimiter = None if settings.prezzi_csv_delimiter == "auto" else settings.prezzi_csv_delimiter
        combined = await asyncio.to_thread(
            lambda: _parse_and_combine_sync(anag_text, prezzi_text, force_delimiter),
        )
        logger.debug("Combined CSV stations count: %d", len(combined) if combined else 0)
        await _write_json_file(settings.prezzi_cache_path, combined)
        saved_dir = await _save_csv_files(anag_text, prezzi_text, settings)
        if saved_dir:
            try:
                anag_text2, prezzi_text2 = await _load_local_csvs(settings)
                combined2 = await asyncio.to_thread(
                    lambda: _parse_and_combine_sync(anag_text2, prezzi_text2, force_delimiter),
                )
                await _write_json_file(settings.prezzi_cache_path, combined2)
            except Exception as e:
                logger.warning("Failed to refresh cache after saving CSVs: {}", e)

    return _filter_and_transform_combined(combined, params)
