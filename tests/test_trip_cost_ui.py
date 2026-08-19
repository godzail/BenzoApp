"""Tests for the total-cost ranking UX (trip-cost model, preference bar, persistence).

Mirrors the static-inspection harness of ``test_ui_buttons.py``: the frontend is a
static bundle, so behavior is verified against the TS sources that compile into it.
"""

import json
from pathlib import Path

TS_DIR = Path("src/static/ts")
INTERACTIONS = TS_DIR / "app.ui.interactions.ts"
TRIP_COST = TS_DIR / "trip-cost.ts"
RESULTS_HTML = Path("src/static/templates/results.html")
LOCALES_DIR = Path("src/static/locales")


def test_miglior_scelta_badge_is_ranked_by_total_cost() -> None:
    """The "Miglior scelta" badge must sit on the lowest-TOTAL-cost station, not the cheapest €/L."""
    trip_cost = TRIP_COST.read_text(encoding="utf-8")
    interactions = INTERACTIONS.read_text(encoding="utf-8")

    # The pure model exists and prices the round-trip detour.
    assert "export function totalCost" in trip_cost
    assert "export function detourLiters" in trip_cost
    assert "distanceKm * 2" in trip_cost or "* 2 *" in trip_cost

    # Ranking sorts by totalCost by default and the badge is driven by that ranking.
    assert "totalCost(a, this.tripPrefs) - totalCost(b, this.tripPrefs)" in interactions
    assert "isBestChoiceStation" in interactions
    assert "totalCost(this.results[index], this.tripPrefs) === min" in interactions

    # The badge itself is rendered on the best-choice card, distinct from the raw-price badge.
    assert 'this.translate("best_choice", "Miglior scelta")' in interactions
    assert 'this.translate("lowest_price", "Prezzo più basso")' in interactions

    # Raw-price minimum and nearest station get their own badges when they differ.
    assert "isCheapestStation(index)" in interactions
    assert "isNearestStation(index)" in interactions


def test_liters_change_rerenders_savings_header_without_refetch() -> None:
    """Changing liters must re-rank and refresh the savings header client-side (no new fetch)."""
    interactions = INTERACTIONS.read_text(encoding="utf-8")
    results_html = RESULTS_HTML.read_text(encoding="utf-8")

    # The liters input exists and is wired to a listener.
    assert 'id="trip-liters"' in results_html
    assert 'document.getElementById("trip-liters")' in interactions
    assert "applyNumbers" in interactions

    # The listener re-ranks client-side: no fetch() call inside refreshRanking.
    assert "this.refreshRanking();" in interactions
    refresh_start = interactions.index("refreshRanking(): void {")
    refresh_end = interactions.index("},", refresh_start)
    refresh_body = interactions[refresh_start:refresh_end]
    assert "fetch(" not in refresh_body, "refreshRanking must not refetch from the API"

    # refreshRanking re-renders the list and recomputes the savings header.
    assert "this.updateResultsUI?.();" in refresh_body
    assert "this.updateSummaryHeader?.();" in refresh_body

    # The savings header element exists and is fed by savingsRange.
    assert 'id="summary-header"' in results_html
    assert "savingsRange(usable, this.tripPrefs)" in interactions


def test_preferences_survive_reload_via_localstorage() -> None:
    """Liters, consumption, sort and fuel type must round-trip through localStorage."""
    interactions = INTERACTIONS.read_text(encoding="utf-8")

    # Written on every preference change.
    assert 'this.safeSetItem("benzoapp.liters"' in interactions
    assert 'this.safeSetItem("benzoapp.consumption"' in interactions
    assert 'this.safeSetItem("benzoapp.sort"' in interactions
    assert 'this.safeSetItem("benzoapp.fuelType"' in interactions

    # Restored on init, before the first render.
    assert 'this.safeGetItem("benzoapp.liters")' in interactions
    assert 'this.safeGetItem("benzoapp.consumption")' in interactions
    assert 'this.safeGetItem("benzoapp.sort")' in interactions
    assert 'this.safeGetItem("benzoapp.fuelType")' in interactions
    assert "this.initTripPrefs?.();" in interactions


def test_station_card_shows_detour_freshness_and_all_fuels() -> None:
    """Each card exposes detour cost, price freshness and the all-fuels detail section."""
    interactions = INTERACTIONS.read_text(encoding="utf-8")

    assert 'this.translate("detour_cost", "+€{amount} di deviazione"' in interactions
    assert "station.updated_at" in interactions
    assert 'this.translate("all_fuel_prices", "Tutti i prezzi")' in interactions
    assert "<details" in interactions
    assert 'this.translate("savings_vs_mean", "Risparmi €{amount} vs media"' in interactions


def test_trip_cost_labels_exist_in_both_locales() -> None:
    """Dynamic trip-cost labels must not fall back to raw placeholders."""
    required = {
        "sort_by",
        "sort_total",
        "sort_price",
        "sort_distance",
        "trip_liters",
        "trip_consumption",
        "trip_fuel_price",
        "best_choice",
        "lowest_price",
        "closest_station",
        "detour_cost",
        "savings_vs_mean",
        "summary_savings",
        "total_cost_title",
        "all_fuel_prices",
        "updated_at_label",
        "price_freshness_unknown",
        "price_freshness_fresh",
        "price_freshness_warn",
        "price_freshness_old",
    }
    for locale in ("it", "en"):
        translations = json.loads(
            (LOCALES_DIR / f"{locale}.json").read_text(encoding="utf-8"),
        )
        assert required <= translations.keys()
        assert "{{amount}}" in translations["detour_cost"]
        assert "{{amount}}" in translations["savings_vs_mean"]
        assert "{{amount}}" in translations["summary_savings"]
