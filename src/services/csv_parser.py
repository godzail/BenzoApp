"""CSV parsing and data transformation for Prezzi Carburante.

This module handles the parsing of anagrafica and prezzi CSV files,
including delimiter detection, date parsing, and distance calculations.
"""

from __future__ import annotations

import csv
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from dateutil.parser import parse as dateutil_parse

from src.services.distance_utils import calculate_distance
from src.services.fuel_type_utils import normalize_fuel_type

if TYPE_CHECKING:
    from src.models import StationSearchParams

# CSV column indices (based on official format)
PREZZI_MIN_COLS = 5
PRICE_IDX = 2
SELF_IDX = 3
DATE_IDX = 4
LAT_IDX = 8
LON_IDX = 9
GESTORE_IDX = 2
ADDR_IDX_START = 5
ADDR_IDX_END = 8

# Recency and distance constants
DAYS_RECENCY = 7
MIN_CSV_COLUMNS = 2


def _parse_date(date_string: str | None) -> datetime | None:
    """Parse a date string into a datetime object.

    Parameters:
    - date_string: The date string to parse. Can be None or empty.

    Returns:
    - A timezone-aware datetime object, or None if parsing fails.
    """
    if not date_string:
        return None
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(date_string, fmt)  # noqa: DTZ007
            return dt.replace(tzinfo=UTC)
        except ValueError:
            continue

    dt = dateutil_parse(date_string)
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def _is_recent(dt: datetime | None, days: int = DAYS_RECENCY) -> bool:
    """Check if a datetime is recent (within the specified number of days).

    Parameters:
    - dt: The datetime to check. Can be None.
    - days: The number of days to consider recent. Defaults to DAYS_RECENCY.

    Returns:
    - True if the datetime is within the specified days, False otherwise.
    """
    if not dt:
        return False
    now = datetime.now(tz=UTC)
    return dt >= (now - timedelta(days=days))


def _detect_delimiter(csv_text: str, default: str = "|") -> str:
    """Detect the delimiter used in a CSV text.

    Parameters:
    - csv_text: The CSV text to analyze.
    - default: The default delimiter to return if detection fails. Defaults to "|".

    Returns:
    - The detected delimiter character.

    Notes:
    - As of February 10, 2026, MIMIT changed the CSV delimiter from semicolon (;) to pipe (|).
    - The default is now pipe, but we auto-detect for backwards compatibility.
    - It tries simple header-splitting with common delimiters and picks the one that
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
        return best
    try:
        sample = "\n".join(lines[:5])
        dialect = csv.Sniffer().sniff(sample, delimiters="|;,\t")
    except csv.Error:
        return default
    else:
        return dialect.delimiter


def _parse_anagrafica(csv_text: str, force_delimiter: str | None = None) -> dict[str, dict[str, Any]]:
    """Parse the anagrafica CSV and extract station information.

    Parameters:
    - csv_text: The raw CSV text content.
    - force_delimiter: Optional delimiter to force use of. If None, auto-detects.

    Returns:
    - A dictionary mapping station IDs to their details (gestore, indirizzo, latitudine, longitudine, prezzi).
    """
    if csv_text.startswith("\ufeff"):
        csv_text = csv_text[1:]
    elif csv_text.startswith("ï»¿"):
        csv_text = csv_text[3:]

    delimiter = force_delimiter or _detect_delimiter(csv_text)
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
        except ValueError:
            continue
        indirizzo = " ".join([row[i] for i in range(ADDR_IDX_START, ADDR_IDX_END) if i < len(row) and row[i]]).strip()
        data[id_impianto] = {
            "gestore": row[GESTORE_IDX] if len(row) > GESTORE_IDX else "",
            "indirizzo": indirizzo,
            "latitudine": lat,
            "longitudine": lon,
            "prezzi": {},
        }
    return data


def _parse_prezzi(csv_text: str, data: dict[str, dict[str, Any]], force_delimiter: str | None = None) -> None:
    """Parse the prezzi CSV and populate station price data.

    Parameters:
    - csv_text: The raw CSV text content.
    - data: The dictionary to populate with price data (modified in place).
    - force_delimiter: Optional delimiter to force use of. If None, auto-detects.
    """
    if csv_text.startswith("\ufeff"):
        csv_text = csv_text[1:]
    elif csv_text.startswith("ï»¿"):
        csv_text = csv_text[3:]

    delimiter = force_delimiter or _detect_delimiter(csv_text)
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


def _parse_and_combine_sync(
    anag_text: str,
    prezzi_text: str,
    force_delimiter: str | None = None,
) -> dict[str, Any]:
    """Parse anagrafica and prezzi CSVs synchronously and return merged data.

    Parameters:
    - anag_text: The raw anagrafica CSV text.
    - prezzi_text: The raw prezzi CSV text.
    - force_delimiter: Optional delimiter to force use of. If None, auto-detects.

    Returns:
    - A dictionary mapping station IDs to their combined data including prices.
    """
    data = _parse_anagrafica(anag_text, force_delimiter)
    _parse_prezzi(prezzi_text, data, force_delimiter)
    return data


def _filter_and_transform_combined(
    combined: dict[str, Any],
    params: StationSearchParams | None,
) -> list[dict[str, Any]]:
    """Filter and transform combined station data based on search parameters.

    Parameters:
    - combined: The combined station data from anagrafica and prezzi CSVs.
    - params: Optional search parameters for filtering (latitude, longitude, distance, fuel, results).

    Returns:
    - A list of station dictionaries filtered and sorted by price, limited to the requested number of results.
    """
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
            dist = calculate_distance(search_lat, search_lon, lat, lon)
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
    return stations[: max(1, min(max_items, len(stations)))]
