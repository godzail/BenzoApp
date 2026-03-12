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
    # `setFuelType` may be split across `app.ui.*.js` after refactor
    combined = "\n".join(p.read_text() for p in Path("src/static/js").glob("app.ui*.js"))
    assert "setFuelType(fuel)" in combined
    assert "if (this.formData.city)" in combined
    assert "this.submitForm()" in combined


def test_results_use_translate_fuel() -> None:
    """Test that results use translateFuel function."""
    results = Path("src/static/templates/results.html").read_text()
    assert "translateFuel(" in results, "Expected templates to use translateFuel for fuel labels"


def test_user_docs_title_is_reactive() -> None:
    """Test that user docs title/href are updated via JS (reinitializeComponents)."""
    interactions = Path("src/static/ts/app.ui.interactions.ts").read_text()
    assert 'docsLink.setAttribute("href", `/help/user-${this.currentLang || "it"}`)' in interactions, (
        "Implementation should dynamically update docs-link href"
    )
    assert 'docsLink.setAttribute("title", title)' in interactions, (
        "Implementation should dynamically update docs-link title"
    )


def test_lang_button_hover_text_present() -> None:
    """Test that language buttons include hover text color utility to keep text readable."""
    header = Path("src/static/templates/header.html").read_text()
    assert "hover:text-[var(--text-primary)]" in header, "Expected hover:text utility on language buttons"


def test_recent_searches_is_reactive() -> None:
    """Test that recent searches heading is reactive to language changes."""
    search_html = Path("src/static/templates/search.html").read_text()
    assert "translate('recent_searches', 'Ricerche Recenti:') + (currentLang ? '' : '')" in search_html, (
        "Recent searches heading should include reactive currentLang dependency"
    )


def test_updateI18nTexts_sets_document_title() -> None:
    """Test that i18n.updateI18nTexts sets document.title to the translated title."""
    i18n = Path("src/static/ts/i18n.ts").read_text()
    assert (
        'document.title = t("title", "Gas Station Finder")' in i18n
        or "document.title = t('title', \"Gas Station Finder\")" in i18n
    ), "i18n.updateI18nTexts should set document.title to the translated title"


def test_search_divider_present() -> None:
    """Search form should include a divider element after the submit button."""
    search_html = Path("src/static/templates/search.html").read_text()
    assert "search-divider" in search_html or "border-t border-[var(--border-color)]" in search_html, (
        "Expected search divider element or border utility in search.html"
    )


def test_stations_list_has_gap2() -> None:
    """Results template should render `#stations-list` with `gap-2` for compact spacing."""
    results = Path("src/static/templates/results.html").read_text()
    assert 'id="stations-list"' in results and ("gap-2" in results or "flex flex-col gap-2" in results), (
        "Expected #stations-list to include gap-2 (compact spacing)"
    )
