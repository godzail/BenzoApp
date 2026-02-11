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
import csv
import json
import math
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx
from dateutil.parser import parse as dateutil_parse
from loguru import logger

from src.services.fuel_type_utils import normalize_fuel_type

if TYPE_CHECKING:
    from src.models import Settings, StationSearchParams

PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()
LOCAL_DATA_DIR = PROJECT_ROOT / "data"

PREZZI_MIN_COLS = 5
PRICE_IDX = 2
SELF_IDX = 3
DATE_IDX = 4
LAT_IDX = 8
LON_IDX = 9
GESTORE_IDX = 2
ADDR_IDX_START = 5
ADDR_IDX_END = 8
DAYS_RECENCY = 7
EARTH_R_KM = 6371.0
MIN_CSV_COLUMNS = 2
MIN_CONTENT_LENGTH = 50


def _deg2rad(deg: float) -> float:
    return deg * (math.pi / 180.0)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = EARTH_R_KM
    dlat = _deg2rad(lat2 - lat1)
    dlon = _deg2rad(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(_deg2rad(lat1)) * math.cos(_deg2rad(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def _parse_date(date_string: str | None) -> datetime | None:
    if not date_string:
        return None
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(date_string, fmt)
            return dt.replace(tzinfo=UTC)
        except ValueError:
            continue

    dt = dateutil_parse(date_string)
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def _is_recent(dt: datetime | None, days: int = DAYS_RECENCY) -> bool:
    if not dt:
        return False
    now = datetime.now(tz=UTC)
    return dt >= (now - timedelta(days=days))


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


def _detect_delimiter(csv_text: str, default: str = "|") -> str:
    """Robust delimiter detection: prefer obvious header splits, fall back to csv.Sniffer.

    As of February 10, 2026, MIMIT changed the CSV delimiter from semicolon (;) to pipe (|).
    The default is now pipe, but we auto-detect for backwards compatibility.

    It tries simple header-splitting with common delimiters and picks the one that
    yields the most columns (at least 2). If that fails, `csv.Sniffer` is used.
    """
    lines = [ln for ln in csv_text.splitlines() if ln.strip()]
    if not lines:
        return default
    header = lines[0]
    candidates = ["|", ";", ",", "\t"]
    best = default
    best_count = 0
    for d in candidates:
        count = len(header.split(d))
        if count > best_count:
            best_count = count
            best = d
    if best_count >= MIN_CSV_COLUMNS:
        logger.debug("Auto-detected CSV delimiter: '{}' (split into {} columns)", best, best_count)
        return best
    try:
        sample = "\n".join(lines[:5])
        dialect = csv.Sniffer().sniff(sample, delimiters="|;,\t")
    except Exception as err:
        logger.debug("CSV Sniffer failed, using default delimiter '{}': {}", default, err)
        return default
    else:
        logger.debug("CSV Sniffer detected delimiter: '{}'", dialect.delimiter)
        return dialect.delimiter


def _parse_anagrafica(csv_text: str, force_delimiter: str | None = None) -> dict[str, dict[str, Any]]:
    if csv_text.startswith("\ufeff"):
        csv_text = csv_text[1:]
    elif csv_text.startswith("ï»¿"):
        csv_text = csv_text[3:]

    delimiter = force_delimiter or _detect_delimiter(csv_text)
    logger.debug("Using delimiter '{}' for anagrafica", delimiter)
    reader = csv.reader(csv_text.splitlines(), delimiter=delimiter)
    rows = list(reader)
    data: dict[str, dict[str, Any]] = {}
    for row in rows[1:]:
        if not row or len(row) <= LON_IDX:
            continue
        id_impianto = row[0].strip()
        if not id_impianto or not id_impianto.isdigit():
            continue
        try:
            lat = float(row[LAT_IDX].replace(",", "."))
            lon = float(row[LON_IDX].replace(",", "."))
        except Exception as err:
            logger.debug("Skipping anagrafica row {} due to parse error: {}", row, err)
            continue
        indirizzo = " ".join([row[i] for i in range(ADDR_IDX_START, ADDR_IDX_END) if i < len(row) and row[i]]).strip()
        data[id_impianto] = {
            "gestore": row[GESTORE_IDX] if len(row) > GESTORE_IDX else "",
            "indirizzo": indirizzo,
            "latitudine": lat,
            "longitudine": lon,
            "prezzi": {},
        }
    logger.debug(
        "Parsed anagrafica: total_rows=%d, valid_entries=%d, delimiter=%s",
        len(rows) - 1,
        len(data),
        delimiter,
    )
    if not data and len(rows) > 1:
        sample_row = rows[1]
        logger.warning(
            "No valid anagrafica entries parsed. Check delimiter and column structure. delimiter=%s, sample_row=%s",
            delimiter,
            sample_row,
        )
    return data


def _parse_prezzi(csv_text: str, data: dict[str, dict[str, Any]], force_delimiter: str | None = None) -> None:
    if csv_text.startswith("\ufeff"):
        csv_text = csv_text[1:]
    elif csv_text.startswith("ï»¿"):
        csv_text = csv_text[3:]

    delimiter = force_delimiter or _detect_delimiter(csv_text)
    logger.debug("Using delimiter '{}' for prezzi", delimiter)
    reader = csv.reader(csv_text.splitlines(), delimiter=delimiter)
    rows = list(reader)
    updates_applied = 0
    for row in rows[1:]:
        if not row or len(row) <= PREZZI_MIN_COLS - 1:
            continue
        id_impianto = row[0].strip()
        if id_impianto not in data:
            continue
        fuel_raw = (row[1] or "").strip().lower()
        canonical = next(
            (
                normalize_fuel_type(candidate)
                for candidate in (
                    "benzina",
                    "gasolio",
                    "diesel",
                    "gpl",
                    "metano",
                )
                if candidate in fuel_raw
            ),
            None,
        )
        if canonical is None:
            canonical = normalize_fuel_type(fuel_raw) or fuel_raw
        price_raw = (row[PRICE_IDX] or "").replace(",", ".")
        try:
            price = float(price_raw) if price_raw else None
        except ValueError:
            price = None
        existing = data[id_impianto]["prezzi"].get(canonical)
        if price is not None and (existing is None or price < existing.get("prezzo", float("inf"))):
            data[id_impianto]["prezzi"][canonical] = {
                "prezzo": price,
                "self": row[SELF_IDX] == "1" if len(row) > SELF_IDX else False,
                "data": row[DATE_IDX] if len(row) > DATE_IDX else "",
            }
            updates_applied += 1
    sample_fuel_types = list({k for d in data.values() for k in d.get("prezzi", {})})
    logger.debug(
        "Parsed prezzi: total_price_rows=%d, updates_applied=%d, sample_fuel_types=%s, delimiter=%s",
        len(rows) - 1,
        updates_applied,
        sample_fuel_types[:10],
        delimiter,
    )
    if updates_applied == 0 and len(rows) > 1:
        sample_row = rows[1]
        logger.warning(
            "No price updates applied in prezzi. Check delimiter and column structure. delimiter=%s, sample_row=%s",
            delimiter,
            sample_row,
        )


def _parse_and_combine_sync(
    anag_text: str,
    prezzi_text: str,
    force_delimiter: str | None = None,
) -> dict[str, Any]:
    """Parse anagrafica and prezzi CSVs synchronously and return merged data.

    Parses both CSV texts, merges the prezzi data into the anagrafica records,
    and returns a dictionary keyed by station ID.

    Parameters:
    - anag_text: Raw CSV content for station registry.
    - prezzi_text: Raw CSV content for fuel prices.
    - force_delimiter: Optional delimiter to force; auto-detected if None.

    Returns:
    - Dictionary mapping station IDs to their merged data (including prices).
    """
    data = _parse_anagrafica(anag_text, force_delimiter)
    _parse_prezzi(prezzi_text, data, force_delimiter)
    return data


async def fetch_and_combine_csv_data(
    settings: Settings,
    http_client: httpx.AsyncClient,
    params: StationSearchParams | None = None,
) -> list[dict[str, Any]]:
    """Fetch CSVs, merge them and return a list of stations filtered by params.

    Returns a list of station dicts with keys:
        - 'prezzo', 'latitudine', 'longitudine',
        - 'indirizzo', 'gestore', 'self', 'data'.
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


async def _fetch_csvs(http_client: httpx.AsyncClient, settings: Settings) -> tuple[str, str]:
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

    logger.debug(
        "CSV fetch response: anagrafica url={}, status={}, CT={}, len={} bytes",
        resp_anag.url,
        resp_anag.status_code,
        resp_anag.headers.get("content-type"),
        len(resp_anag.content),
    )
    logger.debug(
        "CSV fetch response: prezzi url={}, status={}, CT={}, len={} bytes",
        resp_prezzi.url,
        resp_prezzi.status_code,
        resp_prezzi.headers.get("content-type"),
        len(resp_prezzi.content),
    )

    anag_text = resp_anag.content.decode("iso-8859-1")
    prezzi_text = resp_prezzi.content.decode("iso-8859-1")

    for name, text in (("anagrafica", anag_text), ("prezzi", prezzi_text)):
        if len(text) < MIN_CONTENT_LENGTH:
            logger.warning("{} CSV content suspiciously short ({} chars): {!r}", name, len(text), text[:100])
        else:
            logger.debug("{} CSV sample (first 100 chars): {!r}", name, text[:100])

    return anag_text, prezzi_text


async def _load_local_csvs(settings: Settings) -> tuple[str, str]:
    """Load CSV data from candidate local directories (configurable via settings)."""
    candidates = _candidate_local_csv_dirs(settings)
    missing = []
    for d in candidates:
        anag_path = d / "anagrafica_impianti_attivi.csv"
        prezzi_path = d / "prezzo_alle_8.csv"
        if anag_path.exists() and prezzi_path.exists():
            try:
                anag_text = await asyncio.to_thread(anag_path.read_text, "iso-8859-1")
                prezzi_text = await asyncio.to_thread(prezzi_path.read_text, "iso-8859-1")
            except Exception as err:
                logger.error("Failed to read local CSV files in {}: {}", d, err)
                raise
            else:
                logger.info("Loaded CSV data from local files: anag='{}', prezzi='{}'", anag_path, prezzi_path)
                return anag_text, prezzi_text
        else:
            missing.append(str(d))
    msg = f"Local CSV files not found in candidate dirs: {', '.join(missing)}"
    logger.error(msg)
    raise FileNotFoundError(msg)


def _candidate_local_csv_dirs(settings: Settings) -> list[Path]:
    """Return ordered list of directories to look for local CSV files."""
    candidates: list[Path] = []
    local_dir = getattr(settings, "prezzi_local_data_dir", None)
    if local_dir:
        candidates.append(Path(local_dir))
    candidates.extend((PROJECT_ROOT / "data", Path(__file__).parent / "static" / "data"))
    return candidates


async def _save_csv_files(anag_text: str, prezzi_text: str, settings: Settings) -> Path | None:
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
            logger.warning("No writable local csv directory found among candidates: %s", candidates)
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
        logger.info("Saved fetched CSVs to {}", target_dir)

        _cleanup_old_csvs(target_dir, "anagrafica_impianti_attivi_", settings.prezzi_keep_versions)
        _cleanup_old_csvs(target_dir, "prezzo_alle_8_", settings.prezzi_keep_versions)
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


async def preload_local_csv_cache(settings: Settings) -> None:
    """Attempt to load latest local CSVs and refresh combined cache (non-blocking)."""
    try:
        anag_text, prezzi_text = await _load_local_csvs(settings)
        combined = await asyncio.to_thread(lambda: _parse_and_combine_sync(anag_text, prezzi_text, None))
        await _write_json_file(settings.prezzi_cache_path, combined)
        logger.info("Preloaded prezzi cache from local CSVs")
    except FileNotFoundError:
        logger.info("No local CSVs found for preload; skipping.")
    except Exception as err:
        logger.warning("Preload local CSV cache failed: {}", err)
        logger.exception(err)


def _filter_and_transform_combined(
    combined: dict[str, Any],
    params: StationSearchParams | None,
) -> list[dict[str, Any]]:
    stations: list[dict[str, Any]] = []

    search_lat = params.latitude if params else None
    search_lon = params.longitude if params else None
    distance_limit = float(params.distance) if params else float("inf")
    fuel = normalize_fuel_type(params.fuel) if params and params.fuel else ""
    fuel_key = fuel
    max_items = int(params.results) if params else 5

    excluded_no_price = 0
    excluded_stale = 0
    excluded_invalid_coords = 0
    excluded_out_of_distance = 0

    for station in combined.values():
        if not fuel or fuel_key not in station.get("prezzi", {}):
            logger.debug(
                "Skip station (no price) addr='{}' available_fuels={}",
                station.get("indirizzo"),
                list(station.get("prezzi", {}).keys()),
            )
            excluded_no_price += 1
            continue
        price_info = station["prezzi"][fuel_key]
        if not _is_recent(_parse_date(price_info.get("data"))):
            excluded_stale += 1
            continue
        lat = station.get("latitudine")
        lon = station.get("longitudine")
        if lat is None or lon is None:
            excluded_invalid_coords += 1
            continue
        if search_lat is not None and search_lon is not None:
            dist = _haversine_km(search_lat, search_lon, lat, lon)
            if dist > distance_limit:
                excluded_out_of_distance += 1
                continue
        else:
            dist = None

        stations.append(
            {
                "gestore": station.get("gestore"),
                "indirizzo": station.get("indirizzo"),
                "prezzo": price_info.get("prezzo"),
                "self": price_info.get("self"),
                "data": price_info.get("data"),
                "distanza": round(dist, 2) if dist is not None else None,
                "latitudine": lat,
                "longitudine": lon,
            },
        )

    stations.sort(key=lambda s: s.get("prezzo", float("inf")))

    logger.debug(
        "Filter summary: stations_returned={}, excluded_no_price={}, excluded_stale={}, "
        "excluded_invalid_coords={}, excluded_out_of_distance={}",
        len(stations),
        excluded_no_price,
        excluded_stale,
        excluded_invalid_coords,
        excluded_out_of_distance,
    )

    return stations[: max(1, min(max_items, len(stations)))]
