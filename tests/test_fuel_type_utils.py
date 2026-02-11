"""Unit tests for fuel type normalization."""

from src.services.fuel_type_utils import normalize_fuel_type


def test_normalize_common_synonyms():
    """Test normalization of common fuel type synonyms to canonical forms."""
    assert normalize_fuel_type("benzina") == "benzina"
    assert normalize_fuel_type("Benzina") == "benzina"
    assert normalize_fuel_type("gasoline") == "benzina"
    assert normalize_fuel_type("Petrol") == "benzina"
    assert normalize_fuel_type("diesel") == "gasolio"
    assert normalize_fuel_type("gasolio") == "gasolio"
    assert normalize_fuel_type("gpl") == "GPL"
    assert normalize_fuel_type("metano") == "metano"


def test_normalize_empty_or_unknown() -> None:
    """Test normalization of empty or unknown fuel types."""
    assert normalize_fuel_type("") == ""
    # Unknown returns lowercased input
    assert normalize_fuel_type("unknownfuel") == "unknownfuel"
