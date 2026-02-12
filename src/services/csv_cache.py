"""JSON cache management for combined station data.

This module handles reading/writing cached station data, cache freshness checks,
and preloading/refreshing operations.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from loguru import logger

if TYPE_CHECKING:
    from src.models import Settings


async def _read_json_file(path: str) -> dict[str, Any] | None:
    p = Path(path)
    exists = await asyncio.to_thread(p.exists)
    if not exists:
        return None

    try:
        content = await asyncio.to_thread(p.read_text, "utf-8")
        return json.loads(content)
    except Exception as err:
        logger.warning("Failed to read cache file {}: {}", path, err)
        logger.exception(err)
        return None


async def _write_json_file(path: str, payload: dict[str, Any]) -> None:
    try:
        p = Path(path)
        if parent := p.parent:
            parent_exists = await asyncio.to_thread(parent.exists)
            if not parent_exists:
                await asyncio.to_thread(parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(p.write_text, json.dumps(payload, ensure_ascii=False), "utf-8")
    except Exception as err:
        logger.warning("Failed to write cache file {}: {}", path, err)
        logger.exception(err)


async def _is_cache_fresh(cache_path: str, cache_hours: float) -> bool:
    p = Path(cache_path)
    exists = await asyncio.to_thread(p.exists)
    if not exists:
        return False
    try:
        st = await asyncio.to_thread(p.stat)
        mtime = st.st_mtime
        now_ts = datetime.now(tz=UTC).timestamp()
        hours_old = (now_ts - mtime) / 3600.0
    except Exception:
        logger.exception("Failed to stat cache file {}", cache_path)
        return False
    else:
        return hours_old < cache_hours


async def _load_cached_combined(cache_path: str) -> dict[str, Any] | None:
    return await _read_json_file(cache_path)


async def preload_local_csv_cache(settings: Settings) -> None:
    """Attempt to load latest local CSVs and refresh combined cache (non-blocking)."""
    try:
        from src.services.csv_parser import _parse_and_combine_sync
        from src.services.csv_fetcher import _load_local_csvs

        anag_text, prezzi_text = await _load_local_csvs(settings)
        combined = await asyncio.to_thread(lambda: _parse_and_combine_sync(anag_text, prezzi_text, None))
        await _write_json_file(settings.prezzi_cache_path, combined)
        logger.info("Preloaded prezzi cache from local CSVs")
    except FileNotFoundError:
        logger.info("No local CSVs found for preload; skipping.")
    except Exception as err:
        logger.warning("Preload local CSV cache failed: {}", err)
        logger.exception(err)


def check_preferred_local_dir_writable(settings: Settings) -> bool:
    """Check whether the preferred service-level CSV directory is writable.

    If `settings.prezzi_local_data_dir` is set, this check is skipped (returns True).
    Returns True if writable, False otherwise (and logs a warning).
    """
    from src.services.csv_fetcher import PROJECT_ROOT

    if getattr(settings, "prezzi_local_data_dir", None):
        return True

    preferred = PROJECT_ROOT / "src" / "static" / "data"
    try:
        preferred.mkdir(parents=True, exist_ok=True)
        test_file = preferred / ".write_test"
        test_file.write_text("test")
        test_file.unlink()
    except Exception as err:
        logger.warning(
            "Preferred CSV dir {} is not writable; set PREZZI_LOCAL_DATA_DIR to a writable path. Error: {}",
            preferred,
            err,
        )
        return False
    else:
        return True


def get_latest_csv_timestamp(settings: Settings) -> str | None:
    """Extract timestamp from the most recent CSV filename.

    Looks for timestamped CSV files in candidate directories and extracts
    the datetime from filenames matching the pattern:
    - anagrafica_impianti_attivi_YYYYMMDD_HHMMSS.csv
    - prezzo_alle_8_YYYYMMDD_HHMMSS.csv

    If no timestamped files are found, falls back to modification time of
    non-timestamped CSV files (anagrafica_impianti_attivi.csv, prezzo_alle_8.csv).

    Returns:
        ISO timestamp string (YYYY-MM-DDTHH:MM:SS) or None if no files found.
    """
    from src.services.csv_fetcher import _candidate_local_csv_dirs

    try:
        candidates = _candidate_local_csv_dirs(settings)
        latest_ts: datetime | None = None
        ts_format_length = 14

        # First, try to find timestamped files
        for d in candidates:
            if not d.exists():
                continue

            patterns = ["anagrafica_impianti_attivi_*.csv", "prezzo_alle_8_*.csv"]
            for pattern in patterns:
                for csv_file in d.glob(pattern):
                    filename = csv_file.name
                    if len(filename) < len("YYYYMMDD_HHMMSS.csv"):
                        continue
                    ts_str = filename.replace("anagrafica_impianti_attivi_", "").replace("prezzo_alle_8_", "")
                    ts_str = ts_str.replace(".csv", "")
                    if len(ts_str) >= ts_format_length:
                        try:
                            ts = datetime.strptime(ts_str[:ts_format_length], "%Y%m%d_%H%M%S").replace(tzinfo=UTC)
                            if latest_ts is None or ts > latest_ts:
                                latest_ts = ts
                        except ValueError:
                            logger.debug("Could not parse timestamp from CSV filename: {}", filename)
                            continue

        # If no timestamped files, fall back to mtime of base CSV files (non-timestamped)
        if latest_ts is None:
            base_files = ["anagrafica_impianti_attivi.csv", "prezzo_alle_8.csv"]
            for d in candidates:
                if not d.exists():
                    continue
                for base_name in base_files:
                    csv_file = d / base_name
                    if csv_file.exists():
                        try:
                            st = csv_file.stat()
                            mtime_ts = datetime.fromtimestamp(st.st_mtime, tz=UTC)
                            if latest_ts is None or mtime_ts > latest_ts:
                                latest_ts = mtime_ts
                        except Exception as e:
                            logger.debug("Failed to read mtime for {}: {}", csv_file, e)

        return latest_ts.isoformat() if latest_ts else None
    except Exception as err:
        logger.warning("Failed to get latest CSV timestamp: {}", err)
        return None
