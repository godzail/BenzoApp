import pytest  # noqa: D100
from pydantic import ValidationError

from src.models import (
    DEFAULT_RESULTS_COUNT,
    MAX_RESULTS_COUNT,
    MAX_SEARCH_RADIUS_KM,
    MIN_SEARCH_RADIUS_KM,
    FuelPrice,
    SearchRequest,
    SearchResponse,
    Settings,
    Station,
    StationSearchParams,
)


def test_stationsearchparams_lat_lon_bounds():  # noqa: D103
    with pytest.raises(ValidationError):
        StationSearchParams(latitude=91.0, longitude=0.0, distance=10, fuel="gasolio")
    with pytest.raises(ValidationError):
        StationSearchParams(latitude=-91.0, longitude=0.0, distance=10, fuel="gasolio")
    with pytest.raises(ValidationError):
        StationSearchParams(latitude=0.0, longitude=181.0, distance=10, fuel="gasolio")
    with pytest.raises(ValidationError):
        StationSearchParams(latitude=0.0, longitude=-181.0, distance=10, fuel="gasolio")


def test_stationsearchparams_distance_and_results_bounds_and_defaults():  # noqa: D103
    with pytest.raises(ValidationError):
        StationSearchParams(latitude=0.0, longitude=0.0, distance=MIN_SEARCH_RADIUS_KM - 1, fuel="gasolio")
    with pytest.raises(ValidationError):
        StationSearchParams(latitude=0.0, longitude=0.0, distance=MAX_SEARCH_RADIUS_KM + 1, fuel="gasolio")

    p = StationSearchParams(latitude=0.0, longitude=0.0, distance=10, fuel="gasolio")
    assert p.results == DEFAULT_RESULTS_COUNT

    with pytest.raises(ValidationError):
        StationSearchParams(latitude=0.0, longitude=0.0, distance=10, fuel="gasolio", results=0)
    with pytest.raises(ValidationError):
        StationSearchParams(latitude=0.0, longitude=0.0, distance=10, fuel="gasolio", results=MAX_RESULTS_COUNT + 1)


def test_defaults_for_stationsearchparams_and_searchrequest_and_models():  # noqa: D103
    # StationSearchParams.distance defaults to MIN_SEARCH_RADIUS_KM when omitted
    p = StationSearchParams(latitude=0.0, longitude=0.0, fuel="gasolio")
    assert p.distance == MIN_SEARCH_RADIUS_KM

    # SearchRequest.radius defaults to MIN_SEARCH_RADIUS_KM
    sr = SearchRequest(city="Venezia", fuel="gasolio")
    assert sr.radius == MIN_SEARCH_RADIUS_KM
    assert sr.results == DEFAULT_RESULTS_COUNT

    # Station.fuel_prices defaults to an empty list (safe default)
    s = Station(id="1", address="Addr", latitude=0.0, longitude=0.0)
    assert s.fuel_prices == []

    # SearchResponse.stations defaults to an empty list
    resp = SearchResponse()
    assert resp.stations == []


def test_fuelprice_non_negative():  # noqa: D103
    with pytest.raises(ValidationError):
        FuelPrice(type="gasolio", price=-0.1)
    f = FuelPrice(type="gasolio", price=1.23)
    assert f.price == 1.23  # noqa: PLR2004


def test_station_coords_and_distance_validation():  # noqa: D103
    fp = FuelPrice(type="gasolio", price=1.0)
    with pytest.raises(ValidationError):
        Station(id="1", address="x", latitude=100.0, longitude=0.0, fuel_prices=[fp])
    with pytest.raises(ValidationError):
        Station(id="1", address="x", latitude=0.0, longitude=200.0, fuel_prices=[fp])
    with pytest.raises(ValidationError):
        Station(id="1", address="x", latitude=0.0, longitude=0.0, fuel_prices=[fp], distance=-1.0)


def test_settings_cors_allowed_origins_trim(monkeypatch):  # noqa: D103
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", " http://a , , http://b ")
    s = Settings()
    assert s.cors_allowed_origins == ["http://a", "http://b"]
