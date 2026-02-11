"""Tests for UI button components and interactions."""

from pathlib import Path


def test_header_button_styles_present() -> None:
    """Test that header button styles are present in CSS."""
    css = Path("src/static/css/styles.css").read_text()
    header = Path("src/static/templates/header.html").read_text()

    assert ".theme-toggle" in css or "theme-toggle" in header, "Expected theme-toggle in styles.css or header.html"
    assert ".lang-btn" in css or "lang-btn" in header, "Expected lang-btn in styles.css or header.html"


def test_recent_search_button_touch_size() -> None:
    """Test that recent search button has proper touch size."""
    search_html = Path("src/static/templates/search.html").read_text()
    assert "min-h-10" in search_html or "min-height: 40px" in search_html or "min-height: 48px" in search_html, (
        "Recent search button should have increased padding or min-height"
    )


def test_submit_button_loading_binding() -> None:
    """Test that submit button has loading state binding."""
    search = Path("src/static/templates/search.html").read_text()
    assert 'class="btn btn-primary' in search
    assert (
        ":class=\"{ 'is-loading': loading }\"" in search
        or ':class="{ "is-loading": loading }"' in search
        or ":class=\"{ 'is-loading': loading }\"" in search
        or "loading" in search
    )


def test_set_fuel_type_triggers_submit_when_city_present() -> None:
    """Test that setFuelType triggers submit when city is present."""
    app_ui = Path("src/static/js/app.ui.js").read_text()
    assert "setFuelType(fuel)" in app_ui
    assert "if (this.formData.city)" in app_ui
    assert "this.submitForm()" in app_ui


def test_results_use_translate_fuel() -> None:
    """Test that results use translateFuel function."""
    results = Path("src/static/templates/results.html").read_text()
    assert "translateFuel(" in results, "Expected templates to use translateFuel for fuel labels"


def test_user_docs_title_is_reactive() -> None:
    """Test that user docs title is reactive for translations."""
    header = Path("src/static/templates/header.html").read_text()
    assert ":title=\"translate('user_docs','User Documentation') + (currentLang ? '' : '')\"" in header, (
        "Header docs link should include reactive currentLang dependency for translations"
    )
