"""Generate cities.json from anagrafica_impianti_attivi.csv.

Extracts unique city names from the station registry CSV and saves them
to a JSON file for frontend autocomplete.

Usage:
    uv run scripts/generate_cities_json.py
"""

import csv
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "src" / "static" / "data"
OUTPUT_PATH = DATA_DIR / "cities.json"

ADDR_IDX_START = 5
ADDR_IDX_END = 8
MIN_CITY_LENGTH = 2

MAJOR_ITALIAN_CITIES = [
    "Agrigento",
    "Alessandria",
    "Ancona",
    "Aosta",
    "Arezzo",
    "Ascoli Piceno",
    "Asti",
    "Avellino",
    "Bari",
    "Barletta",
    "Bergamo",
    "Biella",
    "Bologna",
    "Bolzano",
    "Brescia",
    "Brindisi",
    "Cagliari",
    "Caltanissetta",
    "Campobasso",
    "Carbonia",
    "Caserta",
    "Catania",
    "Catanzaro",
    "Cesena",
    "Chieti",
    "Como",
    "Cosenza",
    "Cremona",
    "Crotone",
    "Cuneo",
    "Ferrara",
    "Firenze",
    "Foggia",
    "Forli",
    "Frosinone",
    "Genova",
    "Gorizia",
    "Grosseto",
    "Imperia",
    "L'Aquila",
    "La Spezia",
    "Latina",
    "Lecce",
    "Lecco",
    "Livorno",
    "Lodi",
    "Lucca",
    "Macerata",
    "Mantova",
    "Massa",
    "Matera",
    "Messina",
    "Milano",
    "Modena",
    "Monza",
    "Napoli",
    "Novara",
    "Nuoro",
    "Olbia",
    "Oristano",
    "Padova",
    "Palermo",
    "Parma",
    "Pavia",
    "Perugia",
    "Pesaro",
    "Pescara",
    "Piacenza",
    "Pisa",
    "Pistoia",
    "Potenza",
    "Prato",
    "Ragusa",
    "Ravenna",
    "Reggio Calabria",
    "Reggio Emilia",
    "Rieti",
    "Rimini",
    "Roma",
    "Rovigo",
    "Salerno",
    "Sassari",
    "Savona",
    "Siena",
    "Siracusa",
    "Sondrio",
    "Sud Sardegna",
    "Taranto",
    "Tempio Pausania",
    "Teramo",
    "Terni",
    "Torino",
    "Trapani",
    "Trento",
    "Treviso",
    "Trieste",
    "Udine",
    "Varese",
    "Venezia",
    "Verbania",
    "Vercelli",
    "Verona",
    "Viareggio",
    "Vicenza",
    "Viterbo",
]


def detect_delimiter(csv_text: str) -> str:
    lines = [ln for ln in csv_text.splitlines() if ln.strip()]
    if not lines:
        return "|"
    header = lines[0]
    for d in ["|", ";", ",", "\t"]:
        if d in header:
            return d
    return "|"


def extract_cities(csv_path: Path) -> list[str]:
    text = csv_path.read_text(encoding="iso-8859-1")
    if text.startswith("\ufeff"):
        text = text[1:]
    elif text.startswith("ï»¿"):
        text = text[3:]

    delimiter = detect_delimiter(text)
    reader = csv.reader(text.splitlines(), delimiter=delimiter)
    rows = list(reader)

    cities: set[str] = set()
    for row in rows[1:]:
        if len(row) <= ADDR_IDX_END:
            continue
        address_parts = [row[i].strip() for i in range(ADDR_IDX_START, ADDR_IDX_END) if i < len(row) and row[i].strip()]
        if len(address_parts) >= 2:
            city_candidate = address_parts[-1]
            if len(city_candidate) >= MIN_CITY_LENGTH and not city_candidate.isdigit():
                cities.add(city_candidate)

    return sorted(cities)


def main() -> int:
    csv_files = list(DATA_DIR.glob("anagrafica_impianti_attivi*.csv"))

    cities: set[str] = set(MAJOR_ITALIAN_CITIES)

    if csv_files:
        latest = sorted(csv_files)[-1]
        print(f"Processing: {latest}")
        csv_cities = extract_cities(latest)
        cities.update(csv_cities)
        print(f"Extracted {len(csv_cities)} cities from CSV")
    else:
        print(f"No anagrafica CSV found in {DATA_DIR}, using default cities")

    sorted_cities = sorted(cities)
    print(f"Total cities: {len(sorted_cities)}")

    OUTPUT_PATH.write_text(json.dumps(sorted_cities, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written to: {OUTPUT_PATH}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
