"use strict";
/**
 * UI helper methods and initialization logic for the gas station application.
 */
// @ts-nocheck
window.appUiMixin = {
    /**
     * Fetch CSV status from the configured endpoint.
     *
     * @returns A promise that resolves to `CsvStatus` containing last update and stale flag.
     */
    async fetchCsvStatus() {
        this.csvStatusLoading = true;
        const prev = !!this.csvRemoteReloadInProgress;
        try {
            const response = await fetch(window.CONFIG.CSV_STATUS_ENDPOINT);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const status = (await response.json());
            // reflect remote reload state (startup or manual) reported by the server
            this.csvRemoteReloadInProgress = !!status.reload_in_progress;
            // If a reload just completed (was true, now false), show a short banner
            if (prev && !this.csvRemoteReloadInProgress) {
                this.csvLastUpdated = status.last_updated;
                try {
                    this.showReloadCompletedBanner();
                }
                catch (e) {
                    this.debug("Failed to show reload-complete banner:", e);
                }
            }
            return status;
        }
        catch {
            this.debug("Failed to fetch CSV status:", window.appUiMixin.error);
            this.csvRemoteReloadInProgress = false;
            return { last_updated: null, source: "unknown", is_stale: false };
        }
        finally {
            this.csvStatusLoading = false;
        }
    },
    /**
     * Trigger a CSV reload request to the server and update last-updated state.
     *
     * @returns Server response object or an error-like status object.
     */
    async reloadCsv() {
        if (this.csvReloading) {
            return {
                status: "already_reloading",
                message: "CSV reload already in progress",
            };
        }
        this.csvReloading = true;
        this.updateReloadButtonUI();
        this.updateCsvStatusUI();
        try {
            const response = await fetch(window.CONFIG.CSV_RELOAD_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = (await response.json());
            if (result.last_updated) {
                this.csvLastUpdated = result.last_updated;
            }
            this.updateCsvStatusUI();
            setTimeout(() => {
                this.fetchCsvStatus().then((status) => {
                    this.csvLastUpdated = status.last_updated;
                    this.updateCsvStatusUI();
                });
            }, 2000);
            return result;
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            return { status: "error", message: errorMessage };
        }
        finally {
            this.csvReloading = false;
            this.updateReloadButtonUI();
        }
    },
    /**
     * Update the reload button UI based on reloading state
     */
    updateReloadButtonUI() {
        const reloadBtn = document.getElementById("reload-btn");
        const reloadIcon = document.getElementById("reload-icon");
        const reloadSpinner = document.getElementById("reload-spinner");
        if (!reloadBtn)
            return;
        const inProgress = this.csvReloading || !!this.csvRemoteReloadInProgress;
        reloadBtn.disabled = inProgress;
        if (reloadIcon)
            reloadIcon.classList.toggle("hidden", inProgress);
        if (reloadSpinner)
            reloadSpinner.classList.toggle("hidden", !inProgress);
        const label = inProgress
            ? window.t
                ? window.t("reloading", "Reloading...")
                : "Reloading..."
            : window.t
                ? window.t("reload_data", "Reload data")
                : "Reload data";
        reloadBtn.title = label;
        reloadBtn.setAttribute("aria-label", label);
    },
    /**
     * Update the CSV status display UI
     */
    // Show a brief visible banner next to CSV status and a floating toast when reload completes
    showReloadCompletedBanner() {
        try {
            const msg = window.t
                ? window.t("data_reloaded_success", "Data reloaded")
                : "Data reloaded";
            const doneEl = document.getElementById("csv-reload-done");
            if (doneEl) {
                doneEl.textContent = msg;
                doneEl.classList.remove("hidden");
                setTimeout(() => doneEl.classList.add("hidden"), 4000);
            }
            const toastWrap = document.getElementById("csv-toast");
            const toastMsg = document.getElementById("csv-toast-msg");
            if (toastWrap && toastMsg) {
                toastMsg.textContent = msg;
                toastWrap.classList.remove("hidden");
                toastWrap.setAttribute("aria-hidden", "false");
                setTimeout(() => {
                    toastWrap.classList.add("hidden");
                    toastWrap.setAttribute("aria-hidden", "true");
                }, 4000);
            }
        }
        catch (err) {
            this.debug("Failed to display reload-complete banner:", err);
        }
    },
    /**
     * Format an ISO timestamp into a localized human-readable string.
     *
     * @param isoTimestamp - ISO-formatted date-time string.
     * @returns Localized formatted date/time or the original string on error.
     */
    formatTimestamp(isoTimestamp) {
        if (!isoTimestamp) {
            return "";
        }
        try {
            const date = new Date(isoTimestamp);
            const locale = this.currentLang === "it" ? "it-IT" : "en-US";
            return date.toLocaleDateString(locale, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        }
        catch (err) {
            this.debug("Failed to format timestamp:", err instanceof Error ? err.message : "Unknown error");
            return isoTimestamp;
        }
    },
    /**
     * Format a numeric value using configured currency settings.
     *
     * @param value - Numeric amount to format.
     * @returns Formatted currency string.
     */
    formatCurrency(value) {
        return new Intl.NumberFormat(window.CONFIG.CURRENCY_LOCALE, {
            style: "currency",
            currency: window.CONFIG.CURRENCY_CODE,
            minimumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
            maximumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
        }).format(value);
    },
    /**
     * Log debug information when `debugMode` is enabled.
     *
     * @param message - Debug message or label.
     * @param data - Optional additional data to log.
     */
    debug(message, data = null) {
        if (this.debugMode) {
            console.log("[DEBUG]", message, data ?? "");
        }
    },
    safeGetItem(key) {
        try {
            return localStorage.getItem(key);
        }
        catch {
            return null;
        }
    },
    /**
     * Safely write a value to localStorage, ignoring storage errors.
     *
     * @param key - Storage key.
     * @param value - Value to store.
     */
    safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch {
            // ignore storage errors
        }
    },
    /**
     * Toggle the loading bar UI and optional status message for accessibility.
     *
     * @param active - Whether the loading bar should be active.
     */
    setLoadingBar(active) {
        if (!this.loadingBar) {
            return;
        }
        const statusEl = document.getElementById("status-messages");
        if (active) {
            this.loadingBar.classList.add("active");
            this.loadingBar.setAttribute("aria-hidden", "false");
            this.loadingBar.setAttribute("aria-valuenow", "50");
            if (statusEl && typeof window.t === "function") {
                statusEl.textContent = window.t("translation.loading", "Loading...");
            }
        }
        else {
            this.loadingBar.classList.remove("active");
            this.loadingBar.setAttribute("aria-hidden", "true");
            this.loadingBar.setAttribute("aria-valuenow", "0");
            if (statusEl) {
                setTimeout(() => {
                    statusEl.textContent = "";
                }, 500);
            }
        }
    },
    /**
     * Initialize UI components such as theme, loading bar and layout resizer.
     */
    initializeComponents() {
        window.themeManager.init();
        this.currentTheme =
            document.documentElement.getAttribute("data-theme") ||
                window.CONFIG.DEFAULT_THEME;
        const progressEl = document.getElementById("loading-bar");
        if (progressEl) {
            this.loadingBar = progressEl;
        }
        this.initializeResizer();
        // Attach a single debounced resize/orientation listener *once* so the
        // `#map-container` is re-positioned and Leaflet is resized when the
        // viewport changes (desktop <-> mobile). This fixes the map disappearing
        // when templates are re-rendered or the window is resized.
        if (!window.__benzo_map_relayout_attached) {
            let _resizeTimer = null;
            const relayout = () => {
                if (_resizeTimer)
                    window.clearTimeout(_resizeTimer);
                _resizeTimer = window.setTimeout(() => {
                    this.placeMapAccordingToViewport?.();
                    if (this.map &&
                        typeof this.map.invalidateSize === "function") {
                        this.map.invalidateSize();
                    }
                    _resizeTimer = null;
                }, 150);
            };
            window.addEventListener("resize", relayout);
            window.addEventListener("orientationchange", relayout);
            window.__benzo_map_relayout_attached = true;
        }
    },
    /**
     * Set up layout resizer handlers for drag-to-resize behaviour.
     * Uses guard clauses to be a no-op when required elements are not present.
     */
    initializeResizer() {
        const resizer = document.getElementById("layout-resizer");
        const searchColumn = document.getElementById("search-column");
        const mainLayout = document.querySelector(".main-layout");
        if (!(resizer && searchColumn && mainLayout)) {
            return;
        }
        const layoutEl = mainLayout;
        let isResizing = false;
        resizer.addEventListener("mousedown", () => {
            isResizing = true;
            document.body.style.cursor = "col-resize";
            document.body.classList.add("is-resizing");
        });
        document.addEventListener("mousemove", (e) => {
            if (!isResizing) {
                return;
            }
            const containerRect = layoutEl.getBoundingClientRect();
            const relativeX = e.clientX - containerRect.left;
            const totalWidth = containerRect.width;
            let percentage = (relativeX / totalWidth) * 100;
            percentage = Math.max(10, Math.min(90, percentage));
            layoutEl.style.gridTemplateColumns = `${percentage}% 4px 1fr`;
            resizer.setAttribute("aria-valuenow", String(Math.round(percentage)));
            if (this.map &&
                typeof this.map.invalidateSize ===
                    "function") {
                this.map.invalidateSize();
            }
        });
        document.addEventListener("mouseup", () => {
            if (!isResizing) {
                return;
            }
            isResizing = false;
            document.body.style.cursor = "";
            document.body.classList.remove("is-resizing");
            if (this.map) {
                setTimeout(() => {
                    if (typeof this.map
                        .invalidateSize === "function") {
                        this.map.invalidateSize();
                    }
                }, window.CONFIG.MAP_RESIZE_DELAY);
            }
        });
    },
    /**
     * Toggle between light and dark theme using the theme manager.
     */
    toggleTheme() {
        this.currentTheme = window.themeManager.toggle();
        this.updateThemeUI();
        this.debug("Theme toggled to:", this.currentTheme);
    },
    /**
     * Update theme toggle icons based on current theme
     */
    updateThemeUI() {
        const sunIcon = document.getElementById("sun-icon");
        const moonIcon = document.getElementById("moon-icon");
        const themeToggle = document.getElementById("theme-toggle");
        if (!themeToggle)
            return;
        const isDark = this.currentTheme === "dark";
        if (sunIcon)
            sunIcon.classList.toggle("hidden", isDark);
        if (moonIcon)
            moonIcon.classList.toggle("hidden", !isDark);
        themeToggle.setAttribute("aria-label", isDark
            ? window.t
                ? window.t("switch_to_light", "Switch to light mode")
                : "Switch to light mode"
            : window.t
                ? window.t("switch_to_dark", "Switch to dark mode")
                : "Switch to dark mode");
    },
    /**
     * Update selected fuel type and debounced-submit form when required.
     *
     * @param fuel - Fuel identifier to set (e.g., 'diesel', 'benzina').
     */
    setFuelType(fuel) {
        this.formData.fuel = fuel;
        Promise.resolve().then(() => {
            this.debug("Fuel type updated to:", this.formData.fuel);
            if (this.formData.city) {
                if (this._fuelChangeTimeout) {
                    clearTimeout(this._fuelChangeTimeout);
                }
                this._fuelChangeTimeout = setTimeout(() => {
                    this.submitForm();
                }, window.CONFIG.DEBOUNCE_DELAY_MS);
            }
        });
    },
    isFuelSelected(fuel) {
        return this.formData.fuel === fuel;
    },
    /**
     * Handle city input changes and update suggestions list.
     * Shows or hides the suggestion dropdown based on matches.
     */
    onCityInput() {
        const value = (this.formData.city || "").trim().toLowerCase();
        if (value.length === 0) {
            this.filteredCities = [];
            this.showCitySuggestions = false;
            this.updateCitySuggestionsUI();
            return;
        }
        this.filteredCities = this.cityList.filter((c) => c.toLowerCase().startsWith(value));
        this.showCitySuggestions = this.filteredCities.length > 0;
        this.updateCitySuggestionsUI();
    },
    /**
     * Render and toggle the city autocomplete dropdown UI.
     */
    updateCitySuggestionsUI() {
        const suggestions = document.getElementById("city-suggestions");
        if (!suggestions) {
            return;
        }
        if (!this.showCitySuggestions || this.filteredCities.length === 0) {
            suggestions.classList.add("hidden");
            suggestions.innerHTML = "";
            return;
        }
        suggestions.innerHTML = "";
        for (const city of this.filteredCities.slice(0, 15)) {
            const item = document.createElement("li");
            item.className =
                "autocomplete-item px-3 py-2 cursor-pointer text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]";
            item.setAttribute("role", "option");
            item.textContent = city;
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                this.selectCity(city);
            });
            suggestions.appendChild(item);
        }
        suggestions.classList.remove("hidden");
    },
    /**
     * Select a city from suggestions, set it on the form and hide suggestions.
     *
     * @param city - City name selected by the user.
     */
    selectCity(city) {
        this.formData.city = city;
        this.filteredCities = [];
        this.showCitySuggestions = false;
        this.updateSearchFormUI();
        this.updateSearchButtonUI();
    },
    /**
     * Hide the city suggestion dropdown after a short delay (used for blur events).
     */
    hideCitySuggestions() {
        setTimeout(() => {
            this.showCitySuggestions = false;
            this.updateCitySuggestionsUI();
        }, window.CONFIG.CITY_SUGGESTION_HIDE_DELAY);
    },
    /**
     * Return true if the station at `index` has the cheapest price among results.
     *
     * @param index - Index of the station within `results`.
     */
    isCheapestStation(index) {
        if (!this.results || this.results.length === 0) {
            return false;
        }
        const prices = this.results
            .map((s) => Number(s.fuel_prices?.[0]?.price))
            .filter((p) => Number.isFinite(p));
        if (prices.length === 0) {
            return false;
        }
        const minPrice = Math.min(...prices);
        const stationPrice = Number(this.results[index]?.fuel_prices?.[0]?.price);
        return Number.isFinite(stationPrice) && stationPrice === minPrice;
    },
    /**
     * Compute a formatted price difference between the station at `index` and the cheapest price.
     *
     * @param index - String index of the station in `results`.
     * @returns A formatted difference string or an empty string on error.
     */
    getPriceDifference(index) {
        const idx = Number.parseInt(index, 10);
        if (!this.results || this.results.length === 0) {
            return "";
        }
        const prices = this.results
            .map((s) => Number(s.fuel_prices?.[0]?.price))
            .filter((p) => Number.isFinite(p));
        if (prices.length === 0) {
            return "";
        }
        const minPrice = Math.min(...prices);
        const stationPrice = Number(this.results[idx]?.fuel_prices?.[0]?.price);
        if (!Number.isFinite(stationPrice)) {
            return "";
        }
        const diff = stationPrice - minPrice;
        if (diff === 0) {
            return this.translate("best_price_short", "Best");
        }
        const sign = diff > 0 ? "+" : "";
        return `${sign}${diff.toFixed(3)} €`;
    },
    formatDistance(distance) {
        const num = Number.parseFloat(distance);
        if (Number.isNaN(num)) {
            return distance;
        }
        return `${num.toFixed(1)} km`;
    },
    /**
     * Build the HTML content for a marker popup using station data and translations.
     *
     * @param station - Station object used to populate popup.
     * @returns HTML string for popup content.
     */
    buildPopupContent(station) {
        const title = station.gestore || this.translate("translation.station", "Gas Station");
        const addressLabel = this.translate("translation.address", "Address");
        return `
        <div class="map-popup">
          <strong>${title}</strong><br>
          <span class="map-popup-address">${addressLabel}: ${station.address}</span>
        </div>
      `;
    },
    /**
     * Translate a key using the available translation helpers (window.t or i18next).
     *
     * @param key - Translation key.
     * @param fallback - Fallback text if translation is missing.
     * @returns The translated string or the provided fallback.
     */
    translate(key, fallback = "") {
        if (typeof window.t === "function") {
            return window.t(key, fallback);
        }
        if (typeof i18next !== "undefined" && i18next.t) {
            const translated = i18next.t(key);
            if (translated === key) {
                return fallback || key;
            }
            return translated;
        }
        return fallback || key;
    },
    /**
     * Initialize `window.translateFuel` helper which maps internal fuel identifiers
     * to translation keys and returns the translated label.
     */
    initTranslateFuelHelper() {
        window.translateFuel = (type) => {
            try {
                const normalized = (type || "").toString();
                const map = {
                    gasolio: "diesel",
                    diesel: "diesel",
                    benzina: "benzina",
                    // use lowercase i18n key for GPL so i18next finds the translation
                    gpl: "gpl",
                    GPL: "gpl",
                    metano: "metano",
                };
                const key = map[normalized] || normalized;
                if (typeof window.t === "function") {
                    return window.t(key, key);
                }
                if (typeof i18next !== "undefined" && i18next.t) {
                    const tResult = i18next.t(key);
                    if (tResult && tResult !== key) {
                        return tResult;
                    }
                }
                return key;
            }
            catch {
                return type || "";
            }
        };
    },
    /**
     * Set the application's language preference, persist it and trigger UI updates.
     *
     * @param lang - Language code ('it' or 'en').
     */
    setLanguage(lang) {
        this.safeSetItem("lang", lang);
        this.currentLang = lang;
        this.updateLanguageUI();
        if (window.setLang) {
            window.setLang(lang);
        }
        else if (window.i18next?.changeLanguage) {
            window.i18next.changeLanguage(lang, () => {
                if (window.updateI18nTexts) {
                    window.updateI18nTexts();
                }
                window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
            });
        }
    },
    /**
     * Update language button styling based on current language
     */
    updateLanguageUI() {
        const langEn = document.getElementById("lang-en");
        const langIt = document.getElementById("lang-it");
        const isEn = this.currentLang === "en";
        const isIt = this.currentLang === "it";
        if (langEn) {
            langEn.classList.toggle("bg-[var(--color-primary)]", isEn);
            langEn.classList.toggle("text-white", isEn);
            langEn.classList.toggle("border-[var(--color-primary)]", isEn);
            langEn.classList.toggle("font-bold", isEn);
        }
        if (langIt) {
            langIt.classList.toggle("bg-[var(--color-primary)]", isIt);
            langIt.classList.toggle("text-white", isIt);
            langIt.classList.toggle("border-[var(--color-primary)]", isIt);
            langIt.classList.toggle("font-bold", isIt);
        }
        // Update docs link
        const docsLink = document.getElementById("docs-link");
        if (docsLink) {
            docsLink.setAttribute("href", `/help/user-${this.currentLang || "it"}`);
            const title = this.translate("user_docs", "User Documentation");
            docsLink.setAttribute("title", title);
        }
    },
    /**
     * Load an HTML fragment from `url` and inject it into the element with `elementId`.
     *
     * @param url - URL of the fragment to fetch.
     * @param elementId - DOM element id to inject the HTML into.
     */
    async loadComponent(url, elementId) {
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Failed to load component: ${url}`);
            }
            const data = await response.text();
            const element = document.getElementById(elementId);
            if (element) {
                element.innerHTML = data;
                this.attachEventListeners(element);
                // If we just loaded the `search` template, ensure the map is
                // placed *after* the visible `.search-divider` so on mobile the
                // map appears directly under the search button separator.
                if (elementId === "search-container") {
                    // defer to next tick so any sibling nodes are settled
                    setTimeout(() => this.placeMapAccordingToViewport?.(), 0);
                }
            }
        }
        catch (error) {
            console.error(`Error loading component into ${elementId}:`, error);
        }
    },
    /**
     * Attach event listeners for all interactive elements
     */
    attachEventListeners(container) {
        // CSV reload button
        const reloadBtn = container.querySelector("#reload-btn");
        if (reloadBtn && !reloadBtn.hasAttribute("data-listener-attached")) {
            reloadBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.reloadCsv();
            });
            reloadBtn.setAttribute("data-listener-attached", "true");
        }
        // Theme toggle
        const themeToggle = container.querySelector("#theme-toggle");
        if (themeToggle && !themeToggle.hasAttribute("data-listener-attached")) {
            themeToggle.addEventListener("click", () => {
                this.toggleTheme();
            });
            themeToggle.setAttribute("data-listener-attached", "true");
        }
        // Language buttons
        const langEn = container.querySelector("#lang-en");
        if (langEn && !langEn.hasAttribute("data-listener-attached")) {
            langEn.addEventListener("click", () => {
                this.setLanguage("en");
            });
            langEn.setAttribute("data-listener-attached", "true");
        }
        const langIt = container.querySelector("#lang-it");
        if (langIt && !langIt.hasAttribute("data-listener-attached")) {
            langIt.addEventListener("click", () => {
                this.setLanguage("it");
            });
            langIt.setAttribute("data-listener-attached", "true");
        }
        // Location button
        const locationBtn = container.querySelector("#location-btn");
        if (locationBtn && !locationBtn.hasAttribute("data-listener-attached")) {
            locationBtn.addEventListener("click", () => {
                this.locateUser();
            });
            locationBtn.setAttribute("data-listener-attached", "true");
        }
        // Search input
        const cityInput = container.querySelector("#city");
        if (cityInput && !cityInput.hasAttribute("data-listener-attached")) {
            cityInput.addEventListener("input", () => {
                this.formData.city = cityInput.value;
                this.onCityInput();
                this.updateSearchFormUI();
                this.updateSearchButtonUI();
            });
            cityInput.addEventListener("focus", () => {
                this.showCitySuggestions = true;
                this.onCityInput();
            });
            cityInput.addEventListener("blur", () => {
                setTimeout(() => {
                    this.showCitySuggestions = false;
                    this.updateCitySuggestionsUI();
                }, 200);
            });
            cityInput.addEventListener("keydown", (e) => {
                this.handleCityKeydown(e);
            });
            cityInput.setAttribute("data-listener-attached", "true");
        }
        // Docs link - set href based on current language
        const docsLink = container.querySelector("#docs-link");
        if (docsLink) {
            docsLink.setAttribute("href", `/help/user-${this.currentLang || "it"}`);
            const title = this.translate("user_docs", "User Documentation");
            docsLink.setAttribute("title", title);
        }
        // Search form submit
        const searchForm = container.querySelector("#search-form");
        if (searchForm && !searchForm.hasAttribute("data-listener-attached")) {
            searchForm.addEventListener("submit", (e) => {
                e.preventDefault();
                this.submitForm();
            });
            searchForm.setAttribute("data-listener-attached", "true");
        }
        // Radius slider
        const radiusSlider = container.querySelector("#radius-slider");
        if (radiusSlider && !radiusSlider.hasAttribute("data-listener-attached")) {
            radiusSlider.addEventListener("input", () => {
                this.formData.radius = radiusSlider.value;
                this.updateSearchFormUI();
            });
            radiusSlider.setAttribute("data-listener-attached", "true");
        }
        // Results slider
        const resultsSlider = container.querySelector("#results-slider");
        if (resultsSlider &&
            !resultsSlider.hasAttribute("data-listener-attached")) {
            resultsSlider.addEventListener("input", () => {
                this.formData.results = resultsSlider.value;
                this.updateSearchFormUI();
            });
            resultsSlider.setAttribute("data-listener-attached", "true");
        }
        // Fuel type buttons
        const fuelButtons = ["benzina", "gasolio", "GPL", "metano"];
        fuelButtons.forEach((fuel) => {
            const btn = container.querySelector(`#fuel-${fuel}`);
            if (btn && !btn.hasAttribute("data-listener-attached")) {
                btn.addEventListener("click", () => {
                    this.setFuelType(fuel);
                });
                btn.setAttribute("data-listener-attached", "true");
            }
        });
    },
    /**
     * Handle keyboard navigation in city autocomplete
     */
    handleCityKeydown(e) {
        const suggestions = document.getElementById("city-suggestions");
        const suggestionsHidden = !suggestions || suggestions.classList.contains("hidden");
        // If suggestions are hidden, only handle Enter (submit); otherwise proceed
        if (suggestionsHidden) {
            if (e.key === "Enter") {
                e.preventDefault();
                if (this.formData.city)
                    this.submitForm();
            }
            return;
        }
        const items = suggestions.querySelectorAll(".autocomplete-item");
        let highlightedIndex = -1;
        items.forEach((item, idx) => {
            if (item.classList.contains("bg-[var(--bg-elevated)]")) {
                highlightedIndex = idx;
            }
        });
        if (e.key === "Escape") {
            this.showCitySuggestions = false;
            this.updateCitySuggestionsUI();
        }
        else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (this.filteredCities.length > 0) {
                highlightedIndex = Math.min(highlightedIndex + 1, this.filteredCities.length - 1);
                this.updateHighlightedCity(highlightedIndex);
            }
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (this.filteredCities.length > 0) {
                highlightedIndex = Math.max(highlightedIndex - 1, 0);
                this.updateHighlightedCity(highlightedIndex);
            }
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightedIndex >= 0 && this.filteredCities[highlightedIndex]) {
                this.selectCity(this.filteredCities[highlightedIndex]);
            }
            else if (this.formData.city) {
                this.submitForm();
            }
        }
    },
    /**
     * Update highlighted city in autocomplete
     */
    updateHighlightedCity(index) {
        const suggestions = document.getElementById("city-suggestions");
        if (!suggestions)
            return;
        const items = suggestions.querySelectorAll(".autocomplete-item");
        items.forEach((item, idx) => {
            item.classList.toggle("bg-[var(--bg-elevated)]", idx === index);
        });
    },
    /**
     * Update recent searches UI
     */
    updateRecentSearchesUI() {
        const container = document.getElementById("recent-searches-container");
        const list = document.getElementById("recent-searches-list");
        if (!(container && list))
            return;
        if (this.recentSearches.length > 0) {
            container.classList.remove("hidden");
            list.innerHTML = "";
            this.recentSearches.forEach((search, idx) => {
                const btn = document.createElement("button");
                btn.className =
                    "recent-search-btn flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-full px-3 py-2 text-sm text-[var(--text-secondary)] cursor-pointer transition-all duration-150 min-h-10 hover:bg-[var(--bg-surface)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";
                btn.type = "button";
                btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 16 16 14"></polyline>
 </svg>
          <span>${search.city}, ${search.radius}km, ${window.translateFuel ? window.translateFuel(search.fuel) : search.fuel}</span>
        `;
                btn.addEventListener("click", () => this.selectRecentSearch(search));
                list.appendChild(btn);
            });
        }
        else {
            container.classList.add("hidden");
        }
    },
    /**
     * Update fuel type buttons UI
     */
    updateFuelTypeUI() {
        const fuels = ["benzina", "gasolio", "GPL", "metano"];
        fuels.forEach((fuel) => {
            const btn = document.getElementById(`fuel-${fuel}`);
            if (btn) {
                const isSelected = this.formData.fuel === fuel;
                btn.classList.toggle("active", isSelected);
                btn.classList.toggle("text-white", isSelected);
                if (isSelected) {
                    btn.classList.add("border-[var(--color-primary)]");
                }
                else {
                    btn.classList.remove("border-[var(--color-primary)]");
                }
                // Ensure the visible label text is translated when the language changes
                const textEl = document.getElementById(`fuel-${fuel}-text`);
                if (textEl) {
                    // Use the central translateFuel helper (consistent and prefers i18n when available)
                    const label = typeof window.translateFuel === "function"
                        ? window.translateFuel(fuel)
                        : typeof i18next !== "undefined" && i18next.t
                            ? i18next.t(fuel)
                            : fuel;
                    if (this.debugMode)
                        console.debug("updateFuelTypeUI ->", fuel, "=>", label);
                    textEl.textContent = label;
                }
            }
        });
    },
    /**
     * Update search form UI
     */
    updateSearchFormUI() {
        const radiusInput = document.getElementById("radius-input");
        const fuelInput = document.getElementById("fuel-input");
        const radiusSlider = document.getElementById("radius-slider");
        const resultsSlider = document.getElementById("results-slider");
        const radiusValue = document.getElementById("radius-value");
        const resultsValue = document.getElementById("results-value");
        const submitBtn = document.getElementById("search-submit");
        if (radiusInput)
            radiusInput.value = this.formData.radius;
        if (fuelInput)
            fuelInput.value = this.formData.fuel;
        if (radiusSlider)
            radiusSlider.value = this.formData.radius;
        if (resultsSlider)
            resultsSlider.value = this.formData.results;
        if (radiusValue)
            radiusValue.textContent = this.formData.radius + "km";
        if (resultsValue)
            resultsValue.textContent = this.formData.results;
        if (submitBtn) {
            submitBtn.disabled = this.loading || !this.formData.city;
        }
    },
    /**
     * Update search button state (loading/text)
     */
    updateSearchButtonUI() {
        const submitBtn = document.getElementById("search-submit");
        const btnText = document.getElementById("search-btn-text");
        const loadingSpinner = document.getElementById("loading-spinner");
        const loadingText = document.getElementById("loading-text");
        if (submitBtn) {
            submitBtn.disabled = this.loading || !this.formData.city;
        }
        if (this.loading) {
            btnText?.classList.add("hidden");
            loadingSpinner?.classList.remove("hidden");
            if (loadingText)
                loadingText.textContent = window.t
                    ? window.t("loading", "Caricamento...")
                    : "Caricamento...";
        }
        else {
            btnText?.classList.remove("hidden");
            loadingSpinner?.classList.add("hidden");
            if (btnText)
                btnText.textContent = window.t ? window.t("search", "Cerca") : "Cerca";
        }
    },
    /**
     * Update results UI based on state
     */
    updateResultsUI() {
        const skeletonLoader = document.getElementById("skeleton-loader");
        const emptyState = document.getElementById("empty-state");
        const resultsSection = document.getElementById("results-section");
        const errorMessage = document.getElementById("error-message");
        const errorText = document.getElementById("error-text");
        // Handle loading state
        if (this.loading && this.results.length === 0) {
            skeletonLoader?.classList.remove("hidden");
            emptyState?.classList.add("hidden");
            resultsSection?.classList.add("hidden");
            errorMessage?.classList.add("hidden");
        }
        else {
            skeletonLoader?.classList.add("hidden");
        }
        // Handle empty state
        if (!this.loading &&
            this.results.length === 0 &&
            this.searched &&
            !this.error) {
            emptyState?.classList.remove("hidden");
            resultsSection?.classList.add("hidden");
            errorMessage?.classList.add("hidden");
        }
        else if (this.results.length > 0) {
            emptyState?.classList.add("hidden");
            resultsSection?.classList.remove("hidden");
            errorMessage?.classList.add("hidden");
            this.renderResults();
        }
        // Handle error state
        if (this.error) {
            errorMessage?.classList.remove("hidden");
            if (errorText)
                errorText.textContent = this.error;
            skeletonLoader?.classList.add("hidden");
            emptyState?.classList.add("hidden");
            resultsSection?.classList.add("hidden");
        }
    },
    /**
     * Update CSV status UI elements
     */
    updateCsvStatusUI(status) {
        const csvLoading = document.getElementById("csv-loading");
        const csvUpdated = document.getElementById("csv-updated");
        const csvNoData = document.getElementById("csv-no-data");
        const reloadIcon = document.getElementById("reload-icon");
        const reloadSpinner = document.getElementById("reload-spinner");
        const reloadBtn = document.getElementById("reload-btn");
        if (this.csvStatusLoading) {
            csvLoading?.classList.remove("hidden");
            csvUpdated?.classList.add("hidden");
            csvNoData?.classList.add("hidden");
            reloadIcon?.classList.add("hidden");
            reloadSpinner?.classList.remove("hidden");
            if (reloadBtn)
                reloadBtn.disabled = true;
        }
        else {
            csvLoading?.classList.add("hidden");
            reloadIcon?.classList.remove("hidden");
            reloadSpinner?.classList.add("hidden");
            if (reloadBtn)
                reloadBtn.disabled = false;
            if (status) {
                if (status.last_updated) {
                    csvUpdated?.classList.remove("hidden");
                    if (csvUpdated) {
                        const date = new Date(status.last_updated);
                        csvUpdated.textContent = date.toLocaleString();
                    }
                    csvNoData?.classList.add("hidden");
                }
                else {
                    csvUpdated?.classList.add("hidden");
                    csvNoData?.classList.remove("hidden");
                }
            }
        }
    },
    /**
     * Render results to DOM
     */
    renderResults() {
        const list = document.getElementById("stations-list");
        if (!list)
            return;
        list.innerHTML = "";
        this.results.forEach((station, index) => {
            const article = document.createElement("article");
            const fuelType = station.fuel_prices?.[0]?.type || "";
            const price = station.fuel_prices?.[0]?.price || 0;
            const isCheapest = this.isCheapestStation(index);
            const fuelColorClass = this.getFuelColorClass(fuelType);
            article.className =
                "station-card bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-md transition-all duration-150 cursor-pointer relative min-h-[180px] hover:translate-y-[-2px] hover:shadow-xl hover:border-[var(--color-primary)]";
            article.setAttribute("tabindex", "0");
            article.setAttribute("aria-label", `${station.gestore || this.translate("station", "Gas Station")}, ${this.formatCurrency(price)}`);
            article.innerHTML = `
        <div class="station-card-header mb-4 min-w-0">
          <div class="flex items-center justify-between gap-4 mb-2">
            <div class="station-brand flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)] min-w-0 flex-1">
              <div class="station-icon w-8 h-8 bg-[var(--color-primary-light)] rounded-lg flex items-center justify-center text-[var(--color-primary-dark)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
              </div>
              <span class="truncate overflow-hidden text-ellipsis whitespace-nowrap">${station.gestore || this.translate("station", "Gas Station")}</span>
            </div>
            <div class="station-price flex flex-row items-center gap-2 flex-nowrap">
              ${station.fuel_prices && station.fuel_prices.length > 0
                ? `
                <span class="uppercase tracking-wide text-sm ${fuelColorClass}">${window.translateFuel ? window.translateFuel(fuelType) : fuelType}</span>
                <span class="text-2xl font-bold text-[var(--color-primary)]">${this.formatCurrency(price)}</span>
              `
                : ""}
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 pl-[calc(8px+2rem)]">
            ${isCheapest ? `<span class="inline-block bg-[var(--color-primary)] text-[#002c18] px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide animate-pulse-badge whitespace-nowrap">${this.translate("best_price", "Miglior Prezzo!")}</span>` : ""}
            ${station.fuel_prices && station.fuel_prices.length > 0 && !isCheapest ? `<span class="text-sm text-red-500 font-medium">${this.getPriceDifference(index)}</span>` : ""}
            ${station.distance
                ? `<span class="flex items-center gap-1 text-sm text-[var(--text-muted)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${this.formatDistance(station.distance)}
            </span>`
                : ""}
          </div>
        </div>
        <div class="station-card-body flex flex-col gap-2">
          <div class="station-address-row flex items-start gap-2 text-sm text-[var(--text-secondary)] break-word overflow-wrap-break-word">
            <svg class="address-icon w-4 h-4 text-[var(--text-muted)] mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span class="break-word overflow-wrap-break-word leading-relaxed max-w-full">${station.address || ""}</span>
          </div>
          <div class="station-actions-row flex gap-2 mt-4 pt-4 border-t border-[var(--border-color)]">
            <button class="btn btn-primary flex-1 min-w-0 whitespace-nowrap bg-[var(--color-primary)] text-white border-none rounded-lg py-2 px-3 text-sm font-semibold cursor-pointer transition-all duration-150 inline-flex items-center justify-center hover:bg-[var(--color-primary-hover)] hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:transform-none ${!(station.latitude && station.longitude) ? "disabled" : ""}"
              data-action="directions"
              data-id="${station.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"></path>
              </svg>
              <span>${this.translate("navigate", "Navigate")}</span>
            </button>
            <button class="btn btn-secondary flex-1 min-w-0 whitespace-nowrap bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg py-2 px-3 text-sm font-semibold cursor-pointer transition-all duration-150 inline-flex items-center justify-center hover:bg-[var(--bg-surface)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed ${!(station.latitude && station.longitude) ? "disabled" : ""}"
              data-action="show-map"
              data-id="${station.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${this.translate("show_on_map", "Show on Map")}</span>
            </button>
          </div>
        </div>
      `;
            article.addEventListener("click", () => this.selectStationForMap(station.id));
            article.addEventListener("keyup", (e) => {
                if (e.key === "Enter")
                    this.selectStationForMap(station.id);
            });
            list.appendChild(article);
        });
        // Add event listeners for action buttons
        list.querySelectorAll("button[data-action]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const action = btn.getAttribute("data-action");
                const id = btn.getAttribute("data-id");
                if (action === "directions") {
                    const station = this.results.find((s) => s.id == id);
                    if (station)
                        this.getDirections(station);
                }
                else if (action === "show-map") {
                    this.selectStationForMap(id);
                }
            });
        });
    },
    /**
     * Get fuel color class
     */
    getFuelColorClass(fuelType) {
        const colors = {
            benzina: "text-[var(--fuel-benzina-color)]",
            gasolio: "text-[var(--fuel-gasolio-color)]",
            GPL: "text-[var(--fuel-gpl-color)]",
            metano: "text-[var(--fuel-metano-color)]",
        };
        return colors[fuelType] || "";
    },
    /**
     * Initialize the application: load templates, cities, translations and set up event listeners.
     */
    async init() {
        try {
            // Pre-place map container for the current viewport so the template
            // is loaded directly into its intended parent (prevents hidden map on mobile).
            this.placeMapAccordingToViewport?.();
            await Promise.all([
                this.loadComponent("/static/templates/header.html", "header-container"),
                this.loadComponent("/static/templates/search.html", "search-container"),
                this.loadComponent("/static/templates/results.html", "results-container"),
                this.loadComponent("/static/templates/map.html", "map-container"),
                this.loadCities(),
            ]);
            // After templates are loaded ensure the map container is placed
            // under the `.search-divider` on mobile (fixes 'map disappears').
            this.placeMapAccordingToViewport?.();
            // Set current language first
            this.currentLang =
                this.safeGetItem("lang") || window.i18next?.language || "it";
            if (window.i18next?.language &&
                window.i18next.language !== this.currentLang) {
                if (window.i18next.changeLanguage) {
                    window.i18next.changeLanguage(this.currentLang);
                }
            }
            // Update UI after components are loaded
            this.updateThemeUI();
            this.updateLanguageUI();
            this.updateReloadButtonUI();
            this.updateCsvStatusUI();
            this.updateFuelTypeUI();
            this.updateSearchFormUI();
            this.updateSearchButtonUI();
            this.updateRecentSearchesUI();
            window.addEventListener("languageChanged", (e) => {
                const ev = e;
                const { lang } = ev.detail;
                this.currentLang = lang;
                this.reinitializeComponents?.();
                this.refreshMapMarkersOnLanguageChange?.();
                if (window.updateI18nTexts) {
                    window.updateI18nTexts();
                }
                this.updateThemeUI();
                this.updateLanguageUI();
                this.updateFuelTypeUI();
                // re-apply after a short delay to avoid race with other DOM updates
                setTimeout(() => this.updateFuelTypeUI(), 50);
                this.updateSearchFormUI();
                this.updateRecentSearchesUI();
                // re-render results so station cards reflect new language
                this.updateResultsUI();
                this.updateMap();
            });
            this.loadRecentSearches();
            this.updateRecentSearchesUI();
            if (this.recentSearches.length > 0 && this.recentSearches[0].city) {
                this.formData.city = this.recentSearches[0].city;
                this.updateSearchFormUI();
                this.updateSearchButtonUI();
            }
            this.initTranslateFuelHelper();
            Promise.resolve().then(() => {
                this.initializeComponents();
                if (window.updateI18nTexts) {
                    window.updateI18nTexts();
                }
            });
            this.fetchCsvStatus().then((status) => {
                this.csvLastUpdated = status.last_updated;
            });
            if (this.csvStatusInterval) {
                clearInterval(this.csvStatusInterval);
            }
            this.csvStatusInterval = setInterval(() => {
                this.fetchCsvStatus().then((status) => {
                    this.csvLastUpdated = status.last_updated;
                });
            }, window.CONFIG.CSV_AUTO_REFRESH_INTERVAL_MS);
        }
        catch (error) {
            console.error("Error during initialization:", error);
            this.error = "Failed to initialize application";
        }
    },
    /**
     * Submit the search form to the configured search API, update results and handle errors/timeouts.
     */
    async submitForm() {
        this.loading = true;
        this.setLoadingBar(true);
        this.error = "";
        this.searched = true;
        this.saveRecentSearch({ ...this.formData });
        const fuelToSend = this.formData.fuel === "diesel" ? "gasolio" : this.formData.fuel;
        // Use AbortController to enforce client-side timeout so the UI doesn't hang indefinitely
        const controller = new AbortController();
        const timeoutMs = window.CONFIG.SEARCH_TIMEOUT_MS || 12000;
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(window.CONFIG.SEARCH_API_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    city: this.formData.city,
                    radius: Number.parseInt(this.formData.radius, window.CONFIG.PARSE_INT_RADIX),
                    fuel: fuelToSend,
                    results: Number.parseInt(this.formData.results, window.CONFIG.PARSE_INT_RADIX),
                }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.warning) {
                this.error = data.warning;
                this.results = [];
            }
            else {
                this.results =
                    data.stations?.map((station) => ({
                        ...station,
                        gestore: window.extractGestore(station),
                        distance: station.distance || "",
                    })) || [];
                this.error = "";
            }
            // Update results UI immediately so the DOM reflects new data/map together.
            this.updateResultsUI();
            // Ensure the map is updated after DOM changes.
            Promise.resolve().then(() => {
                this.updateMap();
                if (window.updateI18nTexts) {
                    window.updateI18nTexts();
                }
            });
        }
        catch (err) {
            if (err.name === "AbortError") {
                this.error = "Request timed out. Please try again.";
            }
            else {
                this.error = err instanceof Error ? err.message : "Unknown error";
            }
            this.results = [];
            this.debug("Search failed:", this.error);
            // Ensure results/error UI updates on failure
            this.updateResultsUI();
        }
        finally {
            clearTimeout(timeoutHandle);
            this.loading = false;
            this.setLoadingBar(false);
            // Keep buttons and results in sync after request finishes
            this.updateSearchButtonUI();
            this.updateResultsUI();
        }
    },
    /**
     * Move the `#map-container` DOM node between the right-hand column (desktop)
     * and inline position under search controls (mobile). This keeps a single
     * map instance in the DOM and preserves desktop layout.
     */
    placeMapAccordingToViewport() {
        try {
            const mapContainer = document.getElementById("map-container");
            const mapColumn = document.getElementById("map-column");
            const searchColumn = document.getElementById("search-column");
            const resultsContainer = document.getElementById("results-container");
            const isMobile = window.matchMedia("(max-width: 1023px)").matches;
            if (!(mapContainer && searchColumn))
                return;
            if (isMobile) {
                if (mapContainer.parentElement !== searchColumn) {
                    if (resultsContainer &&
                        resultsContainer.parentElement === searchColumn) {
                        searchColumn.insertBefore(mapContainer, resultsContainer);
                    }
                    else {
                        searchColumn.appendChild(mapContainer);
                    }
                    mapContainer.classList.remove("hidden");
                    mapContainer.style.display = "";
                }
            }
            else {
                if (mapColumn && mapContainer.parentElement !== mapColumn) {
                    mapColumn.appendChild(mapContainer);
                    mapContainer.classList.remove("hidden");
                    mapContainer.style.display = "";
                }
            }
            // Force map resize shortly after the DOM move so Leaflet can adjust and
            // re-initialize view if needed.
            setTimeout(() => {
                this.map?.invalidateSize?.();
                // ensure map exists/initialised after relocation
                this.initMap?.();
            }, 100);
        }
        catch (err) {
            console.debug("placeMapAccordingToViewport failed:", err);
        }
    },
    /**
     * Update map state: initialize if necessary, clear markers and add markers for current results.
     */
    updateMap() {
        if (this.mapInitialized) {
            const mapContainer = document.getElementById("map");
            if (!mapContainer) {
                this.mapInitialized = false;
                this.map = null;
                this.initMap?.();
            }
        }
        else {
            this.initMap?.();
        }
        if (!this.map) {
            return;
        }
        this.clearMapMarkers?.();
        if (this.results?.length > 0) {
            this.addMapMarkers?.();
        }
    },
};
//# sourceMappingURL=app.ui.js.map