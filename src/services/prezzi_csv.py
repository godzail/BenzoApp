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
from typing import TYPE_CHECKING, Any

from loguru import logger

from src.services.csv_cache import (
    _is_cache_fresh,
    _load_cached_combined,
    _read_json_file,
    _write_json_file,
    check_preferred_local_dir_writable,
    get_latest_csv_timestamp,
    preload_local_csv_cache,
)

if TYPE_CHECKING:
    import httpx

    from src.models import Settings, StationSearchParams
from src.services.csv_fetcher import (
    LOCAL_DATA_DIR,
    MIN_CONTENT_LENGTH,
    PROJECT_ROOT,
    _candidate_local_csv_dirs,
    _cleanup_old_csvs,
    _fetch_csvs,
    _load_local_csvs,
    _save_csv_files,
)
from src.services.csv_parser import (
    ADDR_IDX_END,
    ADDR_IDX_START,
    DATE_IDX,
    DAYS_RECENCY,
    GESTORE_IDX,
    LAT_IDX,
    LON_IDX,
    MIN_CSV_COLUMNS,
    PREZZI_MIN_COLS,
    PRICE_IDX,
    SELF_IDX,
    _filter_and_transform_combined,
    _is_recent,
    _parse_and_combine_sync,
    _parse_date,
)

# Re-export for backward compatibility
__all__ = [
    "ADDR_IDX_END",
    "ADDR_IDX_START",
    "DATE_IDX",
    "DAYS_RECENCY",
    "GESTORE_IDX",
    "LAT_IDX",
    "LOCAL_DATA_DIR",
    "LON_IDX",
    "MIN_CONTENT_LENGTH",
    "MIN_CSV_COLUMNS",
    "PREZZI_MIN_COLS",
    "PRICE_IDX",
    "PROJECT_ROOT",
    "SELF_IDX",
    "_candidate_local_csv_dirs",
    "_cleanup_old_csvs",
    "_fetch_csvs",
    "_filter_and_transform_combined",
    "_is_cache_fresh",
    "_is_recent",
    "_load_cached_combined",
    "_load_local_csvs",
    "_parse_and_combine_sync",
    "_parse_date",
    "_read_json_file",
    "_save_csv_files",
    "_write_json_file",
    "check_preferred_local_dir_writable",
    "fetch_and_combine_csv_data",
    "get_latest_csv_timestamp",
    "preload_local_csv_cache",
]


async def fetch_and_combine_csv_data(
    settings: Settings,
    http_client: httpx.AsyncClient,
    params: StationSearchParams | None = None,
) -> list[dict[str, Any]]:
    """Fetch CSVs, merge them and return a list of stations filtered by params.

    Parameters:
    - settings: Application settings containing cache and CSV configuration.
    - http_client: The HTTP client to use for fetching remote CSVs.
    - params: Optional search parameters for filtering results.

    Returns:
    - A list of station dictionaries filtered and sorted by price.
    """
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
