"""Fuel type normalization utilities."""

FUEL_TYPE_MAPPING = {
    # Accept common English synonyms and normalize to canonical CSV key names
    "diesel": "gasolio",
    "gasolio": "gasolio",
    "benzina": "benzina",
    "gasoline": "benzina",
    "petrol": "benzina",
    "gpl": "GPL",
    "metano": "metano",
}


def normalize_fuel_type(fuel_type: str) -> str:
    """Normalize user-facing fuel type to API expected format.

    Parameters:
    - fuel_type: The fuel type provided by the user.

    Returns:
    - The normalized fuel type string expected by the Prezzi Carburante API.
    """
    if not fuel_type:
        return ""
    return FUEL_TYPE_MAPPING.get(fuel_type.lower(), fuel_type.lower())
