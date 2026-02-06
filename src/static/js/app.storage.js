/**
 * Storage-related helper methods for the gas station application.
 * @namespace appStorageMixin
 */
window.appStorageMixin = {
  /**
   * Loads the list of cities from the JSON file.
   * On failure, falls back to a hardcoded list.
   */
  async loadCities() {
    try {
      const response = await fetch(window.CONFIG.CITIES_JSON_PATH);
      if (!response.ok) throw new Error("Failed to load city list");
      this.cityList = await response.json();
    } catch (_error) {
      console.error("Error loading cities:", _error);
      this.cityList = window.CONFIG.FALLBACK_CITIES;
    }
  },

  /**
   * Loads recent searches from localStorage into this.recentSearches.
   */
  loadRecentSearches() {
    try {
      const stored = this.safeGetItem("recentSearches");
      this.recentSearches = stored ? JSON.parse(stored) : [];
    } catch (_e) {
      this.recentSearches = [];
    }
  },

  /**
   * Saves a search to recent searches, maintaining limit and avoiding duplicates.
   * @param {Object} search - The search object to save.
   * @param {string} search.city - City name.
   * @param {number} search.radius - Search radius.
   * @param {string} search.fuel - Fuel type.
   * @param {number} [search.results] - Number of results.
   */
  saveRecentSearch(search) {
    this.recentSearches = this.recentSearches.filter(
      (s) =>
        !(
          s.city === search.city &&
          s.radius === search.radius &&
          s.fuel === search.fuel
        ),
    );
    this.recentSearches = [search, ...this.recentSearches].slice(
      0,
      window.CONFIG.RECENT_SEARCHES_LIMIT,
    );
    this.safeSetItem("recentSearches", JSON.stringify(this.recentSearches));
  },

  /**
   * Populates form data from a recent search and submits the form.
   * @param {Object} search - The recent search object.
   */
  selectRecentSearch(search) {
    this.formData.city = search.city;
    this.formData.radius = search.radius;
    this.formData.fuel = search.fuel;
    this.formData.results = search.results || "5";
    this.submitForm();
  },
};
