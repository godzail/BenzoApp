from pathlib import Path


def test_header_button_styles_present():
    css = Path("src/static/css/components.css").read_text()
    header = Path("src/static/templates/header.html").read_text()

    assert ".theme-toggle" in css, "Expected .theme-toggle rule in components.css"
    assert ".lang-btn" in css, "Expected .lang-btn rule in components.css"
    assert 'class="theme-toggle"' in header or 'class="theme-toggle docs-link"' in header, (
        "header should include a theme-toggle button"
    )


def test_recent_search_button_touch_size():
    ui_css = Path("src/static/css/ui-components.css").read_text()
    assert "min-height: 48px" in ui_css or "padding: 8px 12px" in ui_css, (
        "Recent search button should have increased padding or min-height"
    )


def test_submit_button_loading_binding():
    search = Path("src/static/templates/search.html").read_text()
    assert 'class="btn btn-primary btn-block"' in search
    assert (
        ":class=\"{ 'is-loading': loading }\"" in search
        or ':class="{ "is-loading": loading }"' in search
        or ":class=\"{ 'is-loading': loading }\"" in search
    )


def test_setFuelType_triggers_submit_when_city_present():
    app_ui = Path("src/static/js/app.ui.js").read_text()
    assert "setFuelType(fuel)" in app_ui
    # check presence of guard and call to submitForm
    assert "if (this.formData.city)" in app_ui and "this.submitForm()" in app_ui


def test_results_use_translateFuel():
    results = Path("src/static/templates/results.html").read_text()
    assert "translateFuel(" in results, "Expected templates to use translateFuel for fuel labels"


def test_user_docs_title_is_reactive():
    header = Path("src/static/templates/header.html").read_text()
    assert ":title=\"translate('user_docs','User Documentation') + (currentLang ? '' : '')\"" in header, (
        "Header docs link should include reactive currentLang dependency for translations"
    )
