"""CSV directory and retention helpers for Prezzi Carburante data."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from src.models import Settings

PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()
LOCAL_DATA_DIR = PROJECT_ROOT / "src" / "static" / "data"
SERVICE_DATA_DIR = Path(__file__).parent / "static" / "data"
PROJECT_DATA_DIR = PROJECT_ROOT / "data"

TIMESTAMPED_CSV_PATTERNS = ("anagrafica_impianti_attivi_*.csv", "prezzo_alle_8_*.csv")
BASE_CSV_NAMES = ("anagrafica_impianti_attivi.csv", "prezzo_alle_8.csv")


def preferred_local_csv_dir(settings: Settings) -> Path:
    """Return the preferred local CSV directory for settings."""
    local_dir = getattr(settings, "prezzi_local_data_dir", None)
    return Path(local_dir) if local_dir else LOCAL_DATA_DIR


def candidate_local_csv_dirs(settings: Settings) -> list[Path]:
    """Return local CSV directories in lookup preference order."""
    candidates: list[Path] = []
    local_dir = getattr(settings, "prezzi_local_data_dir", None)
    if local_dir:
        candidates.append(Path(local_dir))
    candidates.extend((LOCAL_DATA_DIR, SERVICE_DATA_DIR, PROJECT_DATA_DIR))
    return candidates


def cleanup_old_csvs(directory: Path, prefix: str, keep: int = 1) -> None:
    """Remove older timestamped CSV files while keeping the newest files."""
    try:
        files = sorted(directory.glob(f"{prefix}*.csv"), key=lambda p: p.name, reverse=True)
        for path in files[keep:]:
            try:
                path.unlink()
                logger.debug("Removed old CSV file {}", path)
            except OSError as err:
                logger.warning("Failed to remove old CSV file {}: {}", path, err)
    except OSError as err:
        logger.warning("cleanup_old_csvs failed for {}: {}", directory, err)


def cleanup_candidate_csvs(settings: Settings) -> None:
    """Clean old timestamped CSV versions across all candidate directories."""
    keep = getattr(settings, "prezzi_keep_versions", 1)
    for directory in candidate_local_csv_dirs(settings):
        if directory.exists():
            cleanup_old_csvs(directory, "anagrafica_impianti_attivi_", keep)
            cleanup_old_csvs(directory, "prezzo_alle_8_", keep)


def find_timestamped_csvs(candidates: list[Path]) -> datetime | None:
    """Find the latest timestamp encoded in timestamped CSV filenames."""
    latest_ts: datetime | None = None
    ts_format_length = 15

    for directory in candidates:
        if not directory.exists():
            continue
        for pattern in TIMESTAMPED_CSV_PATTERNS:
            for csv_file in directory.glob(pattern):
                ts = _timestamp_from_csv_name(csv_file.name, ts_format_length)
                if ts is not None and (latest_ts is None or ts > latest_ts):
                    latest_ts = ts
    return latest_ts


def find_latest_base_csv_mtime(candidates: list[Path]) -> datetime | None:
    """Find the latest mtime among non-timestamped base CSV files."""
    latest_ts: datetime | None = None
    for directory in candidates:
        if not directory.exists():
            continue
        for base_name in BASE_CSV_NAMES:
            csv_file = directory / base_name
            if not csv_file.exists():
                continue
            try:
                mtime_ts = datetime.fromtimestamp(csv_file.stat().st_mtime, tz=UTC)
            except OSError as err:
                logger.debug("Failed to stat CSV file {}: {}", csv_file, err)
                continue
            if latest_ts is None or mtime_ts > latest_ts:
                latest_ts = mtime_ts
    return latest_ts


def _timestamp_from_csv_name(filename: str, ts_format_length: int) -> datetime | None:
    """Parse a timestamp from a known timestamped CSV filename."""
    ts_str = filename.replace("anagrafica_impianti_attivi_", "").replace("prezzo_alle_8_", "")
    ts_str = ts_str.replace(".csv", "")
    if len(ts_str) < ts_format_length:
        return None
    try:
        return datetime.strptime(ts_str[:ts_format_length], "%Y%m%d_%H%M%S").replace(tzinfo=UTC)
    except ValueError:
        return None
