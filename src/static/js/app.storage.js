"use strict";
/**
 * Storage-related helper methods for the gas station application.
 */
window.appStorageMixin = {
    /**
     * Load the list of cities from the configured JSON endpoint.
     * Falls back to `window.CONFIG.FALLBACK_CITIES` on error.
     */
    async loadCities() {
        try {
            const response = await fetch(window.CONFIG.CITIES_JSON_PATH);
            if (!response.ok) {
                throw new Error("Failed to load city list");
            }
            this.cityList = (await response.json());
        }
        catch (_error) {
            console.error("Error loading cities:", _error);
            this.cityList = [...window.CONFIG.FALLBACK_CITIES];
        }
    },
    /**
     * Load recent searches from localStorage into memory.
     */
    loadRecentSearches() {
        try {
            const stored = this.safeGetItem("recentSearches");
            this.recentSearches = stored ? JSON.parse(stored) : [];
        }
        catch {
            this.recentSearches = [];
        }
    },
    /**
     * Save a search to recent searches, deduplicate and trim to the configured limit.
     *
     * @param search - Search object containing `city`, `radius`, `fuel`, and optional `results`.
     */
    saveRecentSearch(search) {
        this.recentSearches = this.recentSearches.filter((s) => !(s.city === search.city &&
            s.radius === search.radius &&
            s.fuel === search.fuel));
        this.recentSearches = [search, ...this.recentSearches].slice(0, window.CONFIG.RECENT_SEARCHES_LIMIT);
        this.safeSetItem("recentSearches", JSON.stringify(this.recentSearches));
    },
    /**
     * Apply a recent search to the form and submit it.
     *
     * @param search - The recent search to select and run.
     */
    selectRecentSearch(search) {
        this.formData.city = search.city;
        this.formData.radius = search.radius;
        this.formData.fuel = search.fuel;
        this.formData.results = search.results || "5";
        this.submitForm();
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
};
//# sourceMappingURL=app.storage.js.map