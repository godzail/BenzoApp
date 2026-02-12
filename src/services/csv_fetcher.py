"""CSV fetching, local file loading, and file I/O for Prezzi Carburante.

This module handles retrieving CSV files from remote sources or local fallbacks,
saving fetched data, and managing the local data directory structure.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

import httpx
from loguru import logger

if TYPE_CHECKING:
    from src.models import Settings

# Project root and data directories
PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()
LOCAL_DATA_DIR = Path(__file__).parent / "static" / "data"

# Validation constants
MIN_CONTENT_LENGTH = 50


async def _fetch_csvs(
    http_client: httpx.AsyncClient,
    settings: Settings,
) -> tuple[str, str]:
    """Fetch CSVs from remote URLs.

    If network fetch fails, attempt to load from local data directory (LOCAL_DATA_DIR) as fallback.
    """
    try:
        resp_anag, resp_prezzi = await asyncio.gather(
            http_client.get(settings.prezzi_csv_anagrafica_url),
            http_client.get(settings.prezzi_csv_prezzi_url),
        )
        resp_anag.raise_for_status()
        resp_prezzi.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error("HTTP error fetching CSV: status={} url={}", e.response.status_code, e.response.url)
        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
        original_exc = e
        try:
            return await _load_local_csvs(settings)
        except Exception:
            logger.error("Local fallback failed, re-raising original HTTP error")
            raise original_exc from e
    except httpx.RequestError as e:
        url = str(e.request.url) if e.request else "unknown"
        logger.error("Network error fetching CSV: {} - url={}", type(e).__name__, url)
        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
        original_exc = e
        try:
            return await _load_local_csvs(settings)
        except Exception:
            logger.error("Local fallback failed, re-raising original network error")
            raise original_exc from e
    except Exception as e:
        logger.error("Unexpected error fetching CSV: {} - {}", type(e).__name__, e)
        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
        original_exc = e
        try:
            return await _load_local_csvs(settings)
        except Exception:
            logger.error("Local fallback failed, re-raising original unexpected exception")
            raise original_exc from e

    anag_text = resp_anag.content.decode("iso-8859-1")
    prezzi_text = resp_prezzi.content.decode("iso-8859-1")

    for name, text in (("anagrafica", anag_text), ("prezzi", prezzi_text)):
        if len(text) < MIN_CONTENT_LENGTH:
            logger.warning("{} CSV content suspiciously short ({} chars): {!r}", name, len(text), text[:100])
        else:
            logger.debug("{} CSV sample (first 100 chars): {!r}", name, text[:100])

    return anag_text, prezzi_text


async def _load_local_csvs(settings: Settings) -> tuple[str, str]:
    """Load CSV data from candidate local directories (configurable via settings).

    If CSVs are found in a fallback directory (e.g., project-level `data/` or service `static/data`),
    migrate them to the preferred project `src/static/data` directory (best-effort) so future loads
    prefer the project-level static data location.
    """
    candidates = _candidate_local_csv_dirs(settings)
    missing = []

    local_dir = getattr(settings, "prezzi_local_data_dir", None)
    preferred_dir = Path(local_dir) if local_dir else PROJECT_ROOT / "src" / "static" / "data"

    for d in candidates:
        anag_files = list(d.glob("anagrafica_impianti_attivi*.csv"))
        prezzi_files = list(d.glob("prezzo_alle_8*.csv"))
        if anag_files and prezzi_files:
            anag_path = anag_files[0]
            prezzi_path = prezzi_files[0]
            try:
                anag_text = await asyncio.to_thread(anag_path.read_text, "iso-8859-1")
                prezzi_text = await asyncio.to_thread(prezzi_path.read_text, "iso-8859-1")
            except Exception as err:
                logger.error("Failed to read local CSV files in {}: {}", d, err)
                raise
            else:
                logger.info("Loaded CSV data from local files in {}: anag='{}', prezzi='{}'", d, anag_path, prezzi_path)

                try:
                    preferred = Path(preferred_dir)
                    is_different = await asyncio.to_thread(lambda a, b: a.resolve() != b.resolve(), preferred, d)
                    if is_different:
                        await asyncio.to_thread(preferred.mkdir, parents=True, exist_ok=True)
                        target_anag = preferred / "anagrafica_impianti_attivi.csv"
                        target_prezzi = preferred / "prezzo_alle_8.csv"
                        target_anag_exists = await asyncio.to_thread(Path.exists, target_anag)
                        target_prezzi_exists = await asyncio.to_thread(Path.exists, target_prezzi)
                        if not (target_anag_exists and target_prezzi_exists):
                            await asyncio.to_thread(target_anag.write_text, anag_text, "iso-8859-1")
                            await asyncio.to_thread(target_prezzi.write_text, prezzi_text, "iso-8859-1")
                            logger.info(
                                "Migrated local CSVs from {} to {}: anag='{}', prezzi='{}'",
                                d,
                                preferred,
                                target_anag,
                                target_prezzi,
                            )
                except Exception as err:
                    logger.warning("Failed to migrate CSVs from {} to preferred dir {}: {}", d, preferred_dir, err)

                return anag_text, prezzi_text
        else:
            missing.append(str(d))
    msg = f"Local CSV files not found in candidate dirs: {', '.join(missing)}"
    logger.error(msg)
    raise FileNotFoundError(msg)


def _candidate_local_csv_dirs(settings: Settings) -> list[Path]:
    """Return ordered list of directories to look for local CSV files.

    Preference order when `prezzi_local_data_dir` is None:
      1. `src/static/data` (project-level)
      2. `src/services/static/data` (service-local)
      3. project `data/` (fallback)
    """
    candidates: list[Path] = []
    local_dir = getattr(settings, "prezzi_local_data_dir", None)
    if local_dir:
        candidates.append(Path(local_dir))
    candidates.extend(
        (
            PROJECT_ROOT / "src" / "static" / "data",
            Path(__file__).parent / "static" / "data",
            PROJECT_ROOT / "data",
        ),
    )
    return candidates


async def _save_csv_files(
    anag_text: str,
    prezzi_text: str,
    settings: Settings,
) -> Path | None:
    """Save fetched CSV texts into local data directory with timestamped names.

    Returns the directory where files were saved or None on failure.
    """
    try:
        candidates = _candidate_local_csv_dirs(settings)
        target_dir = None
        for d in candidates:
            try:
                d_exists = await asyncio.to_thread(d.exists)
                if d_exists:
                    target_dir = d
                    break
                await asyncio.to_thread(d.mkdir, parents=True, exist_ok=True)
                target_dir = d
                break
            except Exception:
                logger.debug("Skipping candidate directory {} due to error", d)
                continue
        if target_dir is None:
            logger.warning("No writable local csv directory found among candidates: {}", candidates)
            return None
        ts = datetime.now(tz=UTC).strftime("%Y%m%d_%H%M%S")
        anag_name = f"anagrafica_impianti_attivi_{ts}.csv"
        prezzi_name = f"prezzo_alle_8_{ts}.csv"
        anag_part = target_dir / f"{anag_name}.part"
        prezzi_part = target_dir / f"{prezzi_name}.part"
        anag_final = target_dir / anag_name
        prezzi_final = target_dir / prezzi_name

        await asyncio.to_thread(anag_part.write_text, anag_text, "iso-8859-1")
        await asyncio.to_thread(prezzi_part.write_text, prezzi_text, "iso-8859-1")
        await asyncio.to_thread(anag_part.replace, anag_final)
        await asyncio.to_thread(prezzi_part.replace, prezzi_final)
        logger.info(
            "Saved fetched CSVs to {}: anag='{}', prezzi='{}'",
            target_dir,
            anag_final,
            prezzi_final,
        )

        _cleanup_old_csvs(target_dir, "anagrafica_impianti_attivi_", getattr(settings, "prezzi_keep_versions", 1))
        _cleanup_old_csvs(target_dir, "prezzo_alle_8_", getattr(settings, "prezzi_keep_versions", 1))
    except Exception as err:
        logger.warning("Failed to save fetched CSVs: {}", err)
        logger.exception(err)
        return None
    else:
        return target_dir


def _cleanup_old_csvs(directory: Path, prefix: str, keep: int = 1) -> None:
    """Remove older timestamped CSVs keeping only the `keep` most recent."""
    try:
        files = sorted(directory.glob(f"{prefix}*.csv"), key=lambda p: p.name, reverse=True)
        to_remove = files[keep:]
        for p in to_remove:
            try:
                p.unlink()
                logger.debug("Removed old CSV file {}", p)
            except Exception as err:
                logger.exception("Failed to remove old CSV file {}: {}", p, err)
    except Exception as err:
        logger.warning("cleanup_old_csvs failed for {}: {}", directory, err)
