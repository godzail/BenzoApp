from src.services.fuel_api import parse_and_normalize_stations


def test_parse_and_normalize_stations_filters_zero_coords():
    payload = [
        {"prezzo": "1.5", "latitudine": "0.0", "longitudine": "0.0"},
        {"prezzo": "1.6", "latitudine": "43.7696", "longitudine": "11.2558"},
    ]

    stations, skipped = parse_and_normalize_stations(payload, "benzina", 5)

    assert len(stations) == 1
    assert skipped == 1


def test_parse_and_normalize_stations_malformed_price_skips():
    payload = [{"prezzo": "n/a", "latitudine": "43.7", "longitudine": "11.2"}]

    stations, skipped = parse_and_normalize_stations(payload, "benzina", 5)

    assert len(stations) == 0
    assert skipped == 1
