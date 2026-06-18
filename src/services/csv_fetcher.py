"""CSV fetching, local file loading, and file I/O for Prezzi Carburante.

This module handles retrieving CSV files from remote sources or local fallbacks,
saving fetched data, and managing the local data directory structure.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC
from datetime import datetime as _datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx2 as httpx
from loguru import logger

from src.services import csv_admin

if TYPE_CHECKING:
    from src.models import Settings

datetime: Any = _datetime

# Project root and data directories
PROJECT_ROOT = csv_admin.PROJECT_ROOT
LOCAL_DATA_DIR = csv_admin.LOCAL_DATA_DIR

# Validation constants
MIN_CONTENT_LENGTH = 50
MIN_CSV_BYTES = 10_000  # file stub/test sotto questa soglia vengono scartati


async def _load_http_meta(path: str) -> dict[str, str]:
    """Carica i metadati HTTP (ETag/Last-Modified) salvati per richieste condizionali.

    Parameters:
    - path: Path del file JSON dei metadati.

    Returns:
    - Dizionario con chiavi anag_etag, anag_last_modified, prezzi_etag, prezzi_last_modified.
      Ritorna dict vuoto se il file non esiste o non è leggibile.
    """
    p = Path(path)
    exists = await asyncio.to_thread(p.exists)
    if not exists:
        return {}
    try:
        text = await asyncio.to_thread(p.read_text, "utf-8")
        return json.loads(text)
    except Exception:
        logger.debug("Failed to load CSV HTTP meta from {}", path)
        return {}


async def _save_http_meta(path: str, meta: dict[str, str]) -> None:
    """Salva i metadati HTTP (ETag/Last-Modified) per future richieste condizionali.

    Parameters:
    - path: Path del file JSON dei metadati.
    - meta: Dizionario con i valori ETag/Last-Modified da persistere.
    """
    p = Path(path)
    try:
        await asyncio.to_thread(p.parent.mkdir, parents=True, exist_ok=True)
        text = json.dumps(meta, indent=2, ensure_ascii=False)
        await asyncio.to_thread(p.write_text, text, "utf-8")
        logger.debug("Saved CSV HTTP meta to {}", path)
    except Exception as err:
        logger.warning("Failed to save CSV HTTP meta to {}: {}", path, err)


async def _load_single_csv(settings: Settings, glob_pattern: str) -> str:
    """Legge il primo CSV locale corrispondente al pattern dai candidate dirs.

    Parameters:
    - settings: Configurazione applicazione.
    - glob_pattern: Pattern glob del filename (es. "anagrafica_impianti_attivi*.csv").

    Returns:
    - Testo CSV decodificato come ISO-8859-1.

    Raises:
    - FileNotFoundError: Se nessun file corrisponde in nessuna candidate dir.
    """
    for d in _candidate_local_csv_dirs(settings):
        files = sorted(d.glob(glob_pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        if files:
            return await asyncio.to_thread(files[0].read_text, "iso-8859-1")
    msg = f"No local CSV matching '{glob_pattern}' in candidate dirs"
    raise FileNotFoundError(msg)


async def _fetch_csvs(
    http_client: httpx.AsyncClient,
    settings: Settings,
) -> tuple[str, str]:
    """Fetch CSVs from remote URLs using conditional HTTP to skip unchanged files.

    Parameters:
    - http_client: The HTTP client to use for fetching.
    - settings: Application settings containing CSV URLs.

    Returns:
    - A tuple of (anagrafica_csv_text, prezzi_csv_text).

    Raises:
    - httpx.HTTPStatusError: If the remote API returns an HTTP error.
    - httpx.RequestError: If there's a network error.
    """
    meta = await _load_http_meta(settings.prezzi_csv_http_meta_path)

    anag_req_headers: dict[str, str] = {}
    prezzi_req_headers: dict[str, str] = {}
    if etag := meta.get("anag_etag"):
        anag_req_headers["If-None-Match"] = etag
    if lm := meta.get("anag_last_modified"):
        anag_req_headers["If-Modified-Since"] = lm
    if etag := meta.get("prezzi_etag"):
        prezzi_req_headers["If-None-Match"] = etag
    if lm := meta.get("prezzi_last_modified"):
        prezzi_req_headers["If-Modified-Since"] = lm

    try:
        resp_anag, resp_prezzi = await asyncio.gather(
            http_client.get(settings.prezzi_csv_anagrafica_url, headers=anag_req_headers),
            http_client.get(settings.prezzi_csv_prezzi_url, headers=prezzi_req_headers),
        )
        # 304 Not Modified è atteso — raise_for_status solo per errori 4xx/5xx
        if resp_anag.status_code != 304:
            resp_anag.raise_for_status()
        if resp_prezzi.status_code != 304:
            resp_prezzi.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error("HTTP error fetching CSV: status={} url={}", e.response.status_code, e.response.url)
        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
        original_exc = e
        try:
            return await _load_local_csvs(settings)
        except Exception:
            logger.error("Local fallback failed, re-raising original HTTP error")
            logger.exception(original_exc)
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
            logger.exception(original_exc)
            raise original_exc from e
    except Exception as e:
        logger.error("Unexpected error fetching CSV: {} - {}", type(e).__name__, e)
        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
        original_exc = e
        try:
            return await _load_local_csvs(settings)
        except Exception:
            logger.error("Local fallback failed, re-raising original unexpected exception")
            logger.exception(original_exc)
            raise original_exc from e

    # 304 Not Modified per entrambi — usa file locali
    if resp_anag.status_code == 304 and resp_prezzi.status_code == 304:
        logger.info("Both CSVs not modified (304), loading from local cache")
        try:
            return await _load_local_csvs(settings)
        except FileNotFoundError:
            logger.warning("304 ma cache locale assente/invalida — forzo download senza header condizionali")
            await _save_http_meta(settings.prezzi_csv_http_meta_path, {})
            resp_anag, resp_prezzi = await asyncio.gather(
                http_client.get(settings.prezzi_csv_anagrafica_url),
                http_client.get(settings.prezzi_csv_prezzi_url),
            )
            resp_anag.raise_for_status()
            resp_prezzi.raise_for_status()
            # continua sotto con le risposte 200

    # 304 parziale — carica il file locale per quello non modificato
    if resp_anag.status_code == 304:
        logger.info("anagrafica CSV not modified (304), loading local copy")
        try:
            anag_text = await _load_single_csv(settings, "anagrafica_impianti_attivi*.csv")
        except FileNotFoundError:
            logger.warning("304 anag ma cache locale assente — scarico fresh")
            resp_anag = await http_client.get(settings.prezzi_csv_anagrafica_url)
            resp_anag.raise_for_status()
            anag_text = resp_anag.content.decode("iso-8859-1")
    else:
        anag_text = resp_anag.content.decode("iso-8859-1")

    if resp_prezzi.status_code == 304:
        logger.info("prezzi CSV not modified (304), loading local copy")
        try:
            prezzi_text = await _load_single_csv(settings, "prezzo_alle_8*.csv")
        except FileNotFoundError:
            logger.warning("304 prezzi ma cache locale assente — scarico fresh")
            resp_prezzi = await http_client.get(settings.prezzi_csv_prezzi_url)
            resp_prezzi.raise_for_status()
            prezzi_text = resp_prezzi.content.decode("iso-8859-1")
    else:
        prezzi_text = resp_prezzi.content.decode("iso-8859-1")

    # Persisti ETag/Last-Modified dalle risposte 200 per richieste future
    new_meta = dict(meta)
    updated = False
    if resp_anag.status_code != 304:
        for key, hdr in (("anag_etag", "etag"), ("anag_last_modified", "last-modified")):
            if val := resp_anag.headers.get(hdr):
                new_meta[key] = val
                updated = True
    if resp_prezzi.status_code != 304:
        for key, hdr in (("prezzi_etag", "etag"), ("prezzi_last_modified", "last-modified")):
            if val := resp_prezzi.headers.get(hdr):
                new_meta[key] = val
                updated = True
    if updated:
        await _save_http_meta(settings.prezzi_csv_http_meta_path, new_meta)

    for name, text in (("anagrafica", anag_text), ("prezzi", prezzi_text)):
        if len(text) < MIN_CONTENT_LENGTH:
            logger.warning("{} CSV content suspiciously short ({} chars): {!r}", name, len(text), text[:100])
        else:
            logger.debug("{} CSV sample (first 100 chars): {!r}", name, text[:100])

    return anag_text, prezzi_text


async def _load_local_csvs(settings: Settings) -> tuple[str, str]:
    """Load CSV data from candidate local directories.

    Parameters:
    - settings: Application settings containing local data directory configuration.

    Returns:
    - A tuple of (anagrafica_csv_text, prezzi_csv_text).

    Raises:
    - FileNotFoundError: If no CSV files are found in any candidate directory.

    Notes:
    - If CSVs are found in a fallback directory (e.g., project-level `data/` or service `static/data`),
      migrate them to the preferred project `src/static/data` directory (best-effort) so future loads
      prefer the project-level static data location.
    """
    candidates = _candidate_local_csv_dirs(settings)
    missing = []

    local_dir = getattr(settings, "prezzi_local_data_dir", None)
    preferred_dir = Path(local_dir) if local_dir else PROJECT_ROOT / "src" / "static" / "data"

    for d in candidates:
        anag_files = sorted(d.glob("anagrafica_impianti_attivi*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
        prezzi_files = sorted(d.glob("prezzo_alle_8*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
        if anag_files and prezzi_files:
            anag_path = anag_files[0]
            prezzi_path = prezzi_files[0]
            try:
                anag_text = await asyncio.to_thread(anag_path.read_text, "iso-8859-1")
                prezzi_text = await asyncio.to_thread(prezzi_path.read_text, "iso-8859-1")
            except Exception as err:
                logger.error("Failed to read local CSV files in {}: {}", d, err)
                raise
            min_bytes = getattr(settings, "prezzi_min_csv_bytes", MIN_CSV_BYTES)
            if len(anag_text) < min_bytes or len(prezzi_text) < min_bytes:
                logger.error(
                    "CSV stub/test file rilevato e scartato — anag='{}' ({} bytes), prezzi='{}' ({} bytes). "
                    "Minimo atteso: {} bytes. Eliminare i file stub dalla directory dati.",
                    anag_path, len(anag_text), prezzi_path, len(prezzi_text), min_bytes,
                )
                missing.append(str(d))
                continue
            else:
                logger.info(
                    "Loaded CSV data from local files in {}: anag='{}' ({} bytes), prezzi='{}' ({} bytes)",
                    d, anag_path, len(anag_text), prezzi_path, len(prezzi_text),
                )

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

    Parameters:
    - settings: Application settings containing local data directory configuration.

    Returns:
    - A list of Path objects representing candidate directories in preference order.

    Notes:
    - Preference order when `prezzi_local_data_dir` is None:
        1. `src/static/data` (project-level)
        2. `src/services/static/data` (service-local)
        3. project `data/` (fallback)
    """
    return csv_admin.candidate_local_csv_dirs(settings)


async def _save_csv_files(
    anag_text: str,
    prezzi_text: str,
    settings: Settings,
) -> Path | None:
    """Save fetched CSV texts into local data directory with timestamped names.

    Parameters:
    - anag_text: The anagrafica CSV text content.
    - prezzi_text: The prezzi CSV text content.
    - settings: Application settings containing save configuration.

    Returns:
    - The directory where files were saved, or None on failure.
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
    """Remove older timestamped CSVs keeping only the most recent files.

    Parameters:
    - directory: The directory containing CSV files to clean up.
    - prefix: The filename prefix to match (e.g., "anagrafica_impianti_attivi_").
    - keep: The number of most recent files to keep. Defaults to 1.
    """
    csv_admin.cleanup_old_csvs(directory, prefix, keep)
