/**
 * Application configuration and theme management.
 * @namespace CONFIG
 * @property {number[]} DEFAULT_MAP_CENTER - Default map center [lat, lng].
 * @property {number} DEFAULT_ZOOM - Default zoom level.
 * @property {number[]} MAP_PADDING - Padding for map bounds [top, right, bottom, left]? Actually it's used as [50, 50] - maybe [x, y].
 * @property {number} MAX_ZOOM - Maximum allowed zoom level.
 * @property {string} SEARCH_API_ENDPOINT - API endpoint for search.
 * @property {string} CITIES_JSON_PATH - Path to cities JSON data.
 * @property {string} DEFAULT_FUEL - Default fuel type.
 * @property {string} DEFAULT_RADIUS - Default search radius.
 * @property {string} DEFAULT_RESULTS - Default number of results.
 * @property {number} RECENT_SEARCHES_LIMIT - Max recent searches to store.
 * @property {string} CURRENCY_LOCALE - Locale for currency formatting.
 * @property {string} CURRENCY_CODE - Currency code (EUR).
 * @property {number} CURRENCY_FRACTION_DIGITS - Decimal places for currency.
 * @property {number} PARSE_INT_RADIX - Radix for parseInt (10).
 * @property {number} MAP_RESIZE_DELAY - Debounce delay for map resize (ms).
 * @property {number} CITY_SUGGESTION_HIDE_DELAY - Delay before hiding city suggestions (ms).
 * @property {string[]} FALLBACK_CITIES - Fallback city names if geocoding fails.
 * @property {string} THEME_STORAGE_KEY - localStorage key for theme.
 * @property {string} DEFAULT_THEME - Default theme ('dark' or 'light').
 * @property {number} DEBOUNCE_DELAY_MS - Debounce delay for form submissions (ms).
 */
window.CONFIG = {
  DEFAULT_MAP_CENTER: [41.9028, 12.4964],
  DEFAULT_ZOOM: 6,
  MAP_PADDING: [50, 50],
  MAX_ZOOM: 14,
  SEARCH_API_ENDPOINT: "/search",
  CITIES_JSON_PATH: "/static/data/cities.json",
  DEFAULT_FUEL: "benzina",
  DEFAULT_RADIUS: "5",
  DEFAULT_RESULTS: "5",
  RECENT_SEARCHES_LIMIT: 5,
  CURRENCY_LOCALE: "it-IT",
  CURRENCY_CODE: "EUR",
  CURRENCY_FRACTION_DIGITS: 3,
  PARSE_INT_RADIX: 10,
  MAP_RESIZE_DELAY: 100,
  CITY_SUGGESTION_HIDE_DELAY: 150,
  FALLBACK_CITIES: ["Rome", "Milan", "Naples"],
  THEME_STORAGE_KEY: "app-theme",
  DEFAULT_THEME: "dark",
  DEBOUNCE_DELAY_MS: 100, // Debounce delay for fuel type change form submission
};

/**
 * Extracts the gestore (operator) from a station object.
 * @param {Object} station - The station object.
 * @param {string} station.gestore - The operator name.
 * @returns {string} The extracted gestore or empty string if missing.
 */
window.extractGestore = function (station) {
  return station.gestore || "";
};

/**
 * Theme management utility.
 * @namespace themeManager
 */
window.themeManager = {
  /**
   * Gets the user's system color scheme preference.
   * @returns {'light'|'dark'} The preferred theme based on system settings.
   */
  getSystemPreference() {
    if (window.matchMedia?.("(prefers-color-scheme: light)")?.matches) {
      return "light";
    }
    return "dark";
  },

  /**
   * Gets the stored theme from localStorage.
   * @returns {string|null} The stored theme or null if not set.
   */
  getStoredTheme() {
    try {
      return localStorage.getItem(window.CONFIG.THEME_STORAGE_KEY);
    } catch (_e) {
      return null;
    }
  },

  /**
   * Stores the theme preference in localStorage.
   * @param {'light'|'dark'} theme - The theme to store.
   */
  setStoredTheme(theme) {
    try {
      localStorage.setItem(window.CONFIG.THEME_STORAGE_KEY, theme);
    } catch (_e) {
      console.warn("Failed to store theme preference");
    }
  },

  /**
   * Applies the theme to the document by setting data-theme attribute.
   * @param {'light'|'dark'} theme - The theme to apply.
   */
  applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  },

  /**
   * Initializes the theme manager: loads stored or system preference and applies it.
   * Also sets up a listener for system theme changes if no stored preference exists.
   */
  init() {
    const storedTheme = this.getStoredTheme();
    const theme = storedTheme || this.getSystemPreference();
    this.applyTheme(theme);
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
      mediaQuery.addEventListener("change", (e) => {
        if (!this.getStoredTheme()) {
          this.applyTheme(e.matches ? "light" : "dark");
        }
      });
    }
  },

  /**
   * Toggles between light and dark themes.
   * @returns {'light'|'dark'} The new theme after toggling.
   */
  toggle() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    this.applyTheme(newTheme);
    this.setStoredTheme(newTheme);
    return newTheme;
  },
};
