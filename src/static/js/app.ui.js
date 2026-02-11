"use strict";
/**
 * UI helper methods and initialization logic for the gas station application.
 */
window.appUiMixin = {
    async fetchCsvStatus() {
            this.csvStatusLoading = true;
            try {
                const response = await fetch(window.CONFIG.CSV_STATUS_ENDPOINT);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return (await response.json());
            }
            catch {
                this.debug("Failed to fetch CSV status:", window.appUiMixin.error);
                return { last_updated: null, source: "unknown", is_stale: false };
            }
            finally {
                this.csvStatusLoading = false;
            }
        },
    async reloadCsv() {
        if (this.csvReloading) {
            return {
                status: "already_reloading",
                message: "CSV reload already in progress",
            };
        }
        this.csvReloading = true;
        this.debug("CSV reload triggered");
        try {
            const response = await fetch(window.CONFIG.CSV_RELOAD_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = (await response.json());
            this.debug("CSV reload response:", result);
            if (result.last_updated) {
                this.csvLastUpdated = result.last_updated;
            }
            setTimeout(() => {
                this.fetchCsvStatus().then((status) => {
                    this.csvLastUpdated = status.last_updated;
                });
            }, 2000);
            return result;
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            this.debug("CSV reload failed:", errorMessage);
            return { status: "error", message: errorMessage };
        }
        finally {
            this.csvReloading = false;
        }
    },
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
    formatCurrency(value) {
        return new Intl.NumberFormat(window.CONFIG.CURRENCY_LOCALE, {
            style: "currency",
            currency: window.CONFIG.CURRENCY_CODE,
            minimumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
            maximumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
        }).format(value);
    },
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
    safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch {
            // ignore storage errors
        }
    },
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
    },
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
    toggleTheme() {
        this.currentTheme = window.themeManager.toggle();
        this.debug("Theme toggled to:", this.currentTheme);
    },
    setFuelType(fuel) {
        this.formData.fuel = fuel;
        this.$nextTick?.(() => {
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
    onCityInput() {
        const value = (this.formData.city || "").trim().toLowerCase();
        if (value.length === 0) {
            this.filteredCities = [];
            this.showCitySuggestions = false;
            return;
        }
        this.filteredCities = this.cityList.filter((c) => c.toLowerCase().startsWith(value));
        this.showCitySuggestions = this.filteredCities.length > 0;
    },
    selectCity(city) {
        this.formData.city = city;
        this.filteredCities = [];
        this.showCitySuggestions = false;
    },
    hideCitySuggestions() {
        setTimeout(() => {
            this.showCitySuggestions = false;
        }, window.CONFIG.CITY_SUGGESTION_HIDE_DELAY);
    },
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
    initTranslateFuelHelper() {
        window.translateFuel = (type) => {
            try {
                const normalized = (type || "").toString();
                const map = {
                    gasolio: "diesel",
                    diesel: "diesel",
                    benzina: "benzina",
                    gpl: "GPL",
                    GPL: "GPL",
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
    setLanguage(lang) {
        this.safeSetItem("lang", lang);
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
    async loadComponent(url, elementId) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load component: ${url}`);
            }
            const data = await response.text();
            const element = document.getElementById(elementId);
            if (element) {
                element.innerHTML = data;
            }
        }
        catch (error) {
            console.error(`Error loading component into ${elementId}:`, error);
        }
    },
    async init() {
        try {
            await Promise.all([
                this.loadComponent("/static/templates/header.html", "header-container"),
                this.loadComponent("/static/templates/search.html", "search-container"),
                this.loadComponent("/static/templates/results.html", "results-container"),
                this.loadComponent("/static/templates/map.html", "map-container"),
                this.loadCities(),
            ]);
            this.currentLang =
                this.safeGetItem("lang") || window.i18next?.language || "it";
            if (window.i18next?.language &&
                window.i18next.language !== this.currentLang) {
                if (window.i18next.changeLanguage) {
                    window.i18next.changeLanguage(this.currentLang);
                }
            }
            window.addEventListener("languageChanged", (e) => {
                const ev = e;
                const { lang } = ev.detail;
                this.currentLang = lang;
                this.reinitializeComponents?.();
                this.refreshMapMarkersOnLanguageChange?.();
                if (window.updateI18nTexts) {
                    window.updateI18nTexts();
                }
                this.$nextTick?.(() => {
                    this.formData = { ...this.formData };
                    this.results = (this.results || []).map((r) => ({ ...r }));
                    this.recentSearches = [...this.recentSearches];
                    this.updateMap();
                });
            });
            this.loadRecentSearches();
            if (this.recentSearches.length > 0 && this.recentSearches[0].city) {
                this.formData.city = this.recentSearches[0].city;
            }
            this.initTranslateFuelHelper();
            this.$nextTick?.(() => {
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
    async submitForm() {
        this.loading = true;
        this.setLoadingBar(true);
        this.error = "";
        this.searched = true;
        this.saveRecentSearch({ ...this.formData });
        const fuelToSend = this.formData.fuel === "diesel" ? "gasolio" : this.formData.fuel;
        try {
            // AbortController-based timeout to avoid UI hang if server never responds
            const controller = new AbortController();
            const timeoutMs = window.CONFIG.SEARCH_TIMEOUT_MS || 12000;
            const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
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
            clearTimeout(timeoutHandle);
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
            this.$nextTick?.(() => {
                this.updateMap();
                if (window.updateI18nTexts) {
                    window.updateI18nTexts();
                }
            });
        }
        catch (err) {
            if (err && err.name === "AbortError") {
                this.error = "Request timed out. Please try again.";
            }
            else {
                this.error = err instanceof Error ? err.message : "Unknown error";
            }
            this.results = [];
            this.debug("Search failed:", this.error);
        }
        finally {
            this.loading = false;
            this.setLoadingBar(false);
        }
    },
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