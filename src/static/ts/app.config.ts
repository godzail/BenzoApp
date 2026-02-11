/**
 * Application configuration and theme management.
 */

interface ThemeManager {
  getSystemPreference(): "light" | "dark";
  getStoredTheme(): string | null;
  setStoredTheme(theme: "light" | "dark"): void;
  applyTheme(theme: "light" | "dark"): void;
  init(): void;
  toggle(): "light" | "dark";
}

interface Config {
  DEFAULT_MAP_CENTER: [number, number];
  DEFAULT_ZOOM: number;
  MAP_PADDING: [number, number];
  MAX_ZOOM: number;
  SEARCH_API_ENDPOINT: string;
  CITIES_JSON_PATH: string;
  DEFAULT_FUEL: string;
  DEFAULT_RADIUS: string;
  DEFAULT_RESULTS: string;
  RECENT_SEARCHES_LIMIT: number;
  CURRENCY_LOCALE: string;
  CURRENCY_CODE: string;
  CURRENCY_FRACTION_DIGITS: number;
  PARSE_INT_RADIX: number;
  MAP_RESIZE_DELAY: number;
  CITY_SUGGESTION_HIDE_DELAY: number;
  FALLBACK_CITIES: string[];
  THEME_STORAGE_KEY: string;
  DEFAULT_THEME: string;
  DEBOUNCE_DELAY_MS: number;
  CSV_STATUS_ENDPOINT: string;
  CSV_RELOAD_ENDPOINT: string;
  CSV_AUTO_REFRESH_INTERVAL_MS: number;
  SEARCH_TIMEOUT_MS: number;
}

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
  DEBOUNCE_DELAY_MS: 100,
  CSV_STATUS_ENDPOINT: "/api/csv-status",
  CSV_RELOAD_ENDPOINT: "/api/reload-csv",
  CSV_AUTO_REFRESH_INTERVAL_MS: 24 * 60 * 60 * 1000,
  SEARCH_TIMEOUT_MS: 12000,
} as const;

/**
 * Extract the `gestore` (station owner) value from a station object.
 *
 * @param station - Station object that may contain a `gestore` field.
 * @returns The `gestore` string or an empty string when missing.
 */
window.extractGestore = (station: { gestore?: string }): string =>
  station.gestore || "";

window.themeManager = {
  /**
   * Return the system color scheme preference ('light' or 'dark').
   */
  getSystemPreference(): "light" | "dark" {
    if (window.matchMedia?.("(prefers-color-scheme: light)")?.matches) {
      return "light";
    }
    return "dark";
  },

  /**
   * Read the stored theme preference from localStorage if available.
   *
   * @returns The stored theme string or `null` if none is set.
   */
  getStoredTheme(): string | null {
    try {
      return localStorage.getItem(window.CONFIG.THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  },

  /**
   * Persist the selected theme value to localStorage.
   *
   * @param theme - Theme to persist ('light' or 'dark').
   */
  setStoredTheme(theme: "light" | "dark"): void {
    try {
      localStorage.setItem(window.CONFIG.THEME_STORAGE_KEY, theme);
    } catch {
      console.warn("Failed to store theme preference");
    }
  },

  /**
   * Apply the selected theme by setting the `data-theme` attribute on the document element.
   *
   * @param theme - Theme to apply ('light' or 'dark').
   */
  applyTheme(theme: "light" | "dark"): void {
    document.documentElement.setAttribute("data-theme", theme);
  },

  /**
   * Initialize the theme manager - apply stored theme or system preference and listen for changes.
   */
  init(): void {
    const storedTheme = this.getStoredTheme();
    const theme: "light" | "dark" = (storedTheme ||
      this.getSystemPreference()) as "light" | "dark";
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
   * Toggle the current theme between 'light' and 'dark', persist and return the new theme.
   *
   * @returns The newly applied theme.
   */
  toggle(): "light" | "dark" {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme: "light" | "dark" =
      currentTheme === "light" ? "dark" : "light";
    this.applyTheme(newTheme);
    this.setStoredTheme(newTheme);
    return newTheme;
  },
} as ThemeManager;
