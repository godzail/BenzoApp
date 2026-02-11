"""Unit tests for fuel API service."""

from src.services.fuel_api import parse_and_normalize_stations


def test_parse_and_normalize_stations_filters_zero_coords():
    """Test that stations with zero coordinates are filtered out."""
    payload = [
        {"prezzo": "1.5", "latitudine": "0.0", "longitudine": "0.0"},
        {"prezzo": "1.6", "latitudine": "43.7696", "longitudine": "11.2558"},
    ]

    stations, skipped = parse_and_normalize_stations(payload, "benzina", 5)

    assert len(stations) == 1
    assert skipped == 1


def test_parse_and_normalize_stations_malformed_price_skips():
    """Test that stations with malformed prices are skipped."""
    payload = [{"prezzo": "n/a", "latitudine": "43.7", "longitudine": "11.2"}]

    stations, skipped = parse_and_normalize_stations(payload, "benzina", 5)

    assert len(stations) == 0
    assert skipped == 1
