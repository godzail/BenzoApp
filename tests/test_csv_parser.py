"""Direct unit tests for the low-level CSV parsing helpers in csv_parser.py.

These complement the integration-level coverage in test_prezzi_csv.py (which
exercises parsing through the full fetch_and_combine_csv_data pipeline) by
calling _parse_price, _parse_prezzi, and _filter_and_transform_combined
directly with hand-built inputs.
"""

from datetime import UTC, datetime, timedelta

import pytest

from src.models import StationSearchParams
from src.services.csv_parser import (
    CSVSchemaError,
    _filter_and_transform_combined,
    _parse_prezzi,
    _parse_price,
)

LAT = 43.7696
LON = 11.2558

# --- _parse_price -------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1,50", 1.5),  # EU decimal comma
        ("1.50", 1.5),  # US decimal dot
        ("1.234,56", 1234.56),  # EU thousands + decimal
        ("1,234.56", 1234.56),  # US thousands + decimal
        ("(1,50)", -1.5),  # parenthesized negative
        ("-1,50", -1.5),  # signed negative
        ("1234", 1234.0),  # plain integer
    ],
)
def test_parse_price_valid_formats(value, expected):  # noqa: D103
    result = _parse_price(value)
    assert result is not None
    assert abs(result - expected) < 1e-9


def test_parse_price_thousands_vs_decimal_three_frac():
    """A dot followed by 3 digits is thousands grouping unless prefer_decimal_three_frac=True."""
    assert _parse_price("1.234") == 1234.0
    assert _parse_price("1.234", prefer_decimal_three_frac=True) == 1.234


@pytest.mark.parametrize("value", ["", None, "   ", "abc", "-", "+", "()"])
def test_parse_price_garbage_and_empty(value):  # noqa: D103
    assert _parse_price(value) is None


# --- _parse_prezzi --------------------------------------------------------


def _base_data(station_id: str) -> dict:
    return {
        station_id: {
            "gestore": "GestoreX",
            "indirizzo": "Via Test",
            "latitudine": LAT,
            "longitudine": LON,
            "prezzi": {},
        },
    }


def test_parse_prezzi_well_formed_row_updates_price():
    """A well-formed legacy-index row should populate the station's prezzi dict."""
    data = _base_data("1")
    csv_text = "col0|col1|col2|col3|col4\n1|benzina|1,50|1|01/01/2026\n"

    _parse_prezzi(csv_text, data)

    assert data["1"]["prezzi"]["benzina"] == {"prezzo": 1.5, "self": True, "data": "01/01/2026"}


def test_parse_prezzi_missing_columns_skips_row():
    """Rows shorter than required indices should be skipped without raising."""
    data = _base_data("1")
    csv_text = "col0|col1|col2|col3|col4\n1|benzina\n"

    _parse_prezzi(csv_text, data)

    assert data["1"]["prezzi"] == {}


def test_parse_prezzi_unknown_station_id_ignored():
    """Rows referencing a station id absent from `data` should be ignored."""
    data = _base_data("1")
    csv_text = "col0|col1|col2|col3|col4\n999|benzina|1,50|1|01/01/2026\n"

    _parse_prezzi(csv_text, data)

    assert data["1"]["prezzi"] == {}


def test_parse_prezzi_bad_date_stores_raw_value_without_raising():
    """Date validation happens elsewhere; a garbage date string is stored as-is."""
    data = _base_data("1")
    csv_text = "col0|col1|col2|col3|col4\n1|benzina|1,50|1|not-a-date\n"

    _parse_prezzi(csv_text, data)

    assert data["1"]["prezzi"]["benzina"]["data"] == "not-a-date"


@pytest.mark.parametrize(
    ("self_raw", "expected"),
    [
        ("1", True),
        ("0", False),
        ("", False),
        ("no", False),
    ],
)
def test_parse_prezzi_self_flag_variants(self_raw, expected):  # noqa: D103
    data = _base_data("1")
    csv_text = f"col0|col1|col2|col3|col4\n1|benzina|1,50|{self_raw}|01/01/2026\n"

    _parse_prezzi(csv_text, data)

    assert data["1"]["prezzi"]["benzina"]["self"] is expected


def test_parse_prezzi_duplicate_station_ids_keeps_lowest_price():
    """When the same station/fuel appears twice, the lower price should win regardless of row order."""
    data = _base_data("1")
    csv_text = "col0|col1|col2|col3|col4\n1|benzina|1,80|1|01/01/2026\n1|benzina|1,50|1|02/01/2026\n"

    _parse_prezzi(csv_text, data)

    assert data["1"]["prezzi"]["benzina"]["prezzo"] == 1.5

    # Reverse order should yield the same result.
    data2 = _base_data("1")
    csv_text2 = "col0|col1|col2|col3|col4\n1|benzina|1,50|1|01/01/2026\n1|benzina|1,80|1|02/01/2026\n"

    _parse_prezzi(csv_text2, data2)

    assert data2["1"]["prezzi"]["benzina"]["prezzo"] == 1.5


def test_parse_prezzi_named_header_missing_price_raises_schema_error():
    """A named header missing the required 'prezzo' column should fail fast."""
    data = _base_data("1")
    csv_text = "id|carburante|self|data\n1|benzina|1|01/01/2026\n"

    with pytest.raises(CSVSchemaError):
        _parse_prezzi(csv_text, data)


def test_parse_prezzi_empty_csv_is_noop():
    """An empty CSV text should leave the data dict untouched."""
    data = _base_data("1")
    _parse_prezzi("", data)
    assert data["1"]["prezzi"] == {}


# --- _filter_and_transform_combined ---------------------------------------


def _recent_date_str() -> str:
    return datetime.now(tz=UTC).strftime("%d/%m/%Y %H:%M:%S")


def _station(
    fuel: str,
    price: float,
    *,
    lat: float | None = LAT,
    lon: float | None = LON,
    recent: bool = True,
) -> dict:
    old_date = (datetime.now(tz=UTC) - timedelta(days=30)).strftime("%d/%m/%Y %H:%M:%S")
    date_str = _recent_date_str() if recent else old_date
    return {
        "gestore": "GestoreX",
        "indirizzo": "Via Test",
        "latitudine": lat,
        "longitudine": lon,
        "prezzi": {fuel: {"prezzo": price, "self": True, "data": date_str}},
    }


def test_filter_empty_input_returns_empty_list():
    """An empty combined dict should yield an empty result list."""
    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)
    assert _filter_and_transform_combined({}, params) == []


def test_filter_excludes_missing_coordinates():
    """Stations with missing latitude/longitude should be excluded."""
    combined = {"1": _station("benzina", 1.5, lat=None, lon=None)}
    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = _filter_and_transform_combined(combined, params)

    assert result == []


def test_filter_by_fuel_type_excludes_non_matching_stations():
    """Only stations offering the requested fuel type should be returned."""
    combined = {
        "1": _station("benzina", 1.5),
        "2": _station("gasolio", 1.6),
    }
    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = _filter_and_transform_combined(combined, params)

    assert len(result) == 1
    assert result[0]["prezzo"] == 1.5


def test_filter_radius_on_boundary_is_included(monkeypatch):
    """A station exactly at the distance limit (dist == limit) should be included, not excluded."""
    import src.services.csv_parser as csv_parser_module

    monkeypatch.setattr(csv_parser_module, "calculate_distance", lambda *_args: 10.0)

    combined = {"1": _station("benzina", 1.5)}
    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = _filter_and_transform_combined(combined, params)

    assert len(result) == 1
    assert result[0]["distanza"] == 10.0


def test_filter_radius_beyond_boundary_is_excluded(monkeypatch):
    """A station just beyond the distance limit should be excluded."""
    import src.services.csv_parser as csv_parser_module

    monkeypatch.setattr(csv_parser_module, "calculate_distance", lambda *_args: 10.01)

    combined = {"1": _station("benzina", 1.5)}
    params = StationSearchParams(latitude=LAT, longitude=LON, distance=10, fuel="benzina", results=5)

    result = _filter_and_transform_combined(combined, params)

    assert result == []
