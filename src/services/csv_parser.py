"""CSV parsing and data transformation for Prezzi Carburante.

This module handles the parsing of anagrafica and prezzi CSV files,
including delimiter detection, date parsing, and distance calculations.
"""

from __future__ import annotations

import csv
import re
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from dateutil.parser import parse as dateutil_parse
from loguru import logger

from src.services.csv_utils import strip_bom
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


# --- Header mapping helpers -------------------------------------------------
class CSVSchemaError(ValueError):
    """Raised when an input CSV's header/schema doesn't match expected columns.

    Subclass of ValueError for backward compatibility with existing callers/tests.
    """


def _is_named_header(header_tokens: list[str]) -> bool:
    """Return True if header tokens look like named columns (not "col0,col1...").

    Requires more than one token to avoid false-positives when the delimiter
    is incorrect and the header is read as a single string containing separators.
    """
    if len(header_tokens) <= 1:
        return False
    for t in header_tokens:
        tl = t.strip().lower()
        if not tl:
            continue
        if re.match(r"^col\d+$", tl):
            continue
        if any(c.isalpha() for c in tl):
            return True
    return False


def _map_header_indices(header_tokens: list[str]) -> dict[str, int]:
    """Map canonical field keys to column indices based on header token substrings.

    The function looks for common Italian/English column name variants (e.g.
    'lat', 'latitudine', 'prezzo', 'price', 'carburante', 'fuel', 'data', 'date').
    Returns a dict mapping keys like 'id', 'lat', 'lon', 'price', 'self', 'date',
    'fuel', 'gestore', 'address' to their detected indices.
    """
    mapping: dict[str, int] = {}
    token_lowers = [t.strip().lower() for t in header_tokens]

    lenses = list(enumerate(token_lowers))

    for idx, tok in lenses:
        if any(k in tok for k in ("id", "codice", "impianto")) and "id" not in mapping:
            mapping["id"] = idx
        if any(k in tok for k in ("lat", "latitudine")) and "lat" not in mapping:
            mapping["lat"] = idx
        if any(k in tok for k in ("lon", "longitud", "longitudine")) and "lon" not in mapping:
            mapping["lon"] = idx
        if any(k in tok for k in ("prezzo", "price")) and "price" not in mapping:
            mapping["price"] = idx
        if any(k in tok for k in ("data", "date", "timestamp")) and "date" not in mapping:
            mapping["date"] = idx
        if any(k in tok for k in ("self", "self-service", "servito")) and "self" not in mapping:
            mapping["self"] = idx
        if any(k in tok for k in ("carburante", "fuel", "tipo")) and "fuel" not in mapping:
            mapping["fuel"] = idx
        if any(k in tok for k in ("gestore", "operator", "owner")) and "gestore" not in mapping:
            mapping["gestore"] = idx
        if any(k in tok for k in ("indirizzo", "address")) and "address" not in mapping:
            mapping["address"] = idx

    return mapping


# ---------------------------------------------------------------------------


def _parse_price(value: str | None, *, prefer_decimal_three_frac: bool = False) -> float | None:
    """Parse a price string tolerant of common locale/grouping formats.

    Args:
        value: raw string (may contain currency symbols, thousands separators)
        prefer_decimal_three_frac: when True, interpret a single separator followed by
            exactly 3 digits as a fractional decimal (e.g. "1.589" -> 1.589) — used
            for parsing fuel *prices* where three fractional digits are common.
            Default False preserves historical behaviour (separator+3 digits treated
            as thousands grouping).

    Returns:
        float value or None on parse failure.
    """
    if not value:
        return None
    s = str(value).strip()
    # normalize NBSP to space
    s = s.replace("\u00a0", " ").strip()
    # keep only digits, separators, sign and parentheses (drop currency glyphs)
    s = re.sub(r"[^0-9,\.\-\+ ()]", "", s)

    # detect negative in parentheses e.g. (1,50)
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1].strip()

    if not s:
        return None

    last_dot = s.rfind(".")
    last_comma = s.rfind(",")

    if last_dot != -1 and last_comma != -1:
        # both present — rightmost is decimal separator, other is grouping
        if last_dot > last_comma:
            decimal_sep = "."
            grouping_sep = ","
        else:
            decimal_sep = ","
            grouping_sep = "."
        s = s.replace(grouping_sep, "")
        s = s.replace(decimal_sep, ".")
    elif last_comma != -1:
        # only comma present — decide by digits after separator
        after = len(s) - last_comma - 1
        # treat comma as decimal if 1-2 digits after, or 3 when preferred
        s = s.replace(",", ".") if after in (1, 2) or (after == 3 and prefer_decimal_three_frac) else s.replace(",", "")  # noqa: PLR2004
    elif last_dot != -1:
        after = len(s) - last_dot - 1
        # treat dot as decimal when 1-2 digits follow, and when parsing prezzo
        # fields (`prefer_decimal_three_frac=True`) also accept 3 fractional
        # digits as a decimal separator (e.g. "1.519" -> 1.519).
        if after in (1, 2) or (after == 3 and prefer_decimal_three_frac):  # noqa: PLR2004
            # keep dot as decimal point
            pass
        else:
            s = s.replace(".", "")

    # remove spaces used as grouping
    s = s.replace(" ", "")
    if not s or s in ("-", "+"):
        return None
    try:
        v = float(s)
    except Exception:
        return None
    return -v if negative else v


def _parse_anagrafica(csv_text: str, force_delimiter: str | None = None) -> dict[str, dict[str, Any]]:
    """Parse the anagrafica CSV and extract station information.

    Supports header-name mapping when a named header row is present; falls back
    to legacy fixed-index parsing for the classic MIMIT "col0|col1|..." style.
    """
    csv_text = strip_bom(csv_text)

    delimiter = force_delimiter or _detect_delimiter(csv_text)
    reader = csv.reader(csv_text.splitlines(), delimiter=delimiter)
    rows = list(reader)
    data: dict[str, dict[str, Any]] = {}
    if not rows:
        return data

    header_tokens = rows[0]
    named = _is_named_header(header_tokens)
    header_map = _map_header_indices(header_tokens) if named else {}

    # If a named header is present, assert required columns exist so schema drift
    # is detected early (fail-fast with a clear error for CI).
    if named:
        missing = [k for k in ("id", "lat", "lon") if k not in header_map]
        if missing:
            msg = f"CSV schema error (anagrafica): missing required column(s): {', '.join(missing)}"
            raise CSVSchemaError(msg)

    # resolve indices (fall back to legacy constants)
    id_idx = header_map.get("id", 0)
    lat_idx = header_map.get("lat", LAT_IDX)
    lon_idx = header_map.get("lon", LON_IDX)
    gestore_idx = header_map.get("gestore", GESTORE_IDX)
    address_idx = header_map.get("address")

    for row in rows[1:]:
        # ensure we can reach lat/lon columns
        if not row or len(row) <= max(lat_idx, lon_idx):
            continue
        id_impianto = row[id_idx].strip() if id_idx < len(row) else ""
        if not id_impianto or not id_impianto.isdigit():
            continue
        try:
            lat = float(row[lat_idx].replace(",", "."))
            lon = float(row[lon_idx].replace(",", "."))
        except Exception:
            logger.debug("Skipping row with invalid coordinates: id={}", id_impianto)
            continue

        if address_idx is not None and address_idx < len(row):
            indirizzo = row[address_idx].strip()
        else:
            indirizzo = " ".join(
                [row[i] for i in range(ADDR_IDX_START, ADDR_IDX_END) if i < len(row) and row[i]],
            ).strip()

        data[id_impianto] = {
            "gestore": row[gestore_idx] if gestore_idx < len(row) else "",
            "indirizzo": indirizzo,
            "latitudine": lat,
            "longitudine": lon,
            "prezzi": {},
        }
    return data


def _parse_prezzi(csv_text: str, data: dict[str, dict[str, Any]], force_delimiter: str | None = None) -> None:
    """Parse the prezzi CSV and populate station price data.

    Supports header-name mapping when headers are present; falls back to legacy
    index-based parsing when headers look like generic `col0, col1, ...`.

    If a named header row is present but required columns (e.g. 'prezzo') are
    missing, a ValueError is raised to fail fast and surface upstream schema
    changes.
    """
    csv_text = strip_bom(csv_text)

    delimiter = force_delimiter or _detect_delimiter(csv_text)
    reader = csv.reader(csv_text.splitlines(), delimiter=delimiter)
    rows = list(reader)
    if not rows:
        return

    header_tokens = rows[0]
    named = _is_named_header(header_tokens)
    header_map = _map_header_indices(header_tokens) if named else {}

    # If headers are named, ensure required fields exist
    if named:
        missing = []
        if "price" not in header_map:
            missing.append("prezzo")
        if "id" not in header_map:
            missing.append("id")
        if missing:
            msg = f"CSV schema error (prezzi): missing required column(s): {', '.join(missing)}"
            raise CSVSchemaError(msg)

    price_idx = header_map.get("price", PRICE_IDX)
    self_idx = header_map.get("self", SELF_IDX)
    date_idx = header_map.get("date", DATE_IDX)
    fuel_idx = header_map.get("fuel", 1)
    id_idx = header_map.get("id", 0)

    updates_applied = 0
    for row in rows[1:]:
        # basic length guard
        if not row or len(row) <= max(id_idx, price_idx, fuel_idx):
            continue
        id_impianto = row[id_idx].strip() if id_idx < len(row) else ""
        if id_impianto not in data:
            continue
        fuel_raw = (row[fuel_idx] if fuel_idx < len(row) else "").strip().lower()
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
        price_raw = row[price_idx] if price_idx < len(row) else ""
        # Prezzi CSV uses three fractional digits for fuel prices (e.g. "1,569").
        # Prefer decimal interpretation when parsing prezzo fields.
        price = _parse_price(price_raw, prefer_decimal_three_frac=True)
        existing = data[id_impianto]["prezzi"].get(canonical)
        if price is not None and (existing is None or price < existing.get("prezzo", float("inf"))):
            data[id_impianto]["prezzi"][canonical] = {
                "prezzo": price,
                "self": (row[self_idx] == "1") if self_idx < len(row) else False,
                "data": row[date_idx] if date_idx < len(row) else "",
            }
            updates_applied += 1

    logger.debug("Updates applied to prezzi: {}", updates_applied)


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
    logger.debug(
        "Station filtering stats: no_price={}, stale={}, invalid_coords={}, out_of_distance={}",
        excluded_no_price,
        excluded_stale,
        excluded_invalid_coords,
        excluded_out_of_distance,
    )
    return stations[: max(1, min(max_items, len(stations)))]
