/**
 * Storage-related helper methods for the gas station application.
 */

interface AppStorageMixin {
  cityList: string[];
  recentSearches: Array<{
    city: string;
    radius: string;
    fuel: string;
    results?: string;
    timestamp?: number;
  }>;
  formData: {
    city: string;
    radius: string;
    fuel: string;
    results: string;
  };
  error: string;
  [key: string]: unknown;

  loadCities(): Promise<void>;
  loadRecentSearches(): void;
  saveRecentSearch(search: {
    city: string;
    radius: string;
    fuel: string;
    results?: string;
  }): void;
  selectRecentSearch(search: {
    city: string;
    radius: string;
    fuel: string;
    results?: string;
  }): void;
  safeGetItem(key: string): string | null;
  safeSetItem(key: string, value: string): void;
  submitForm(): Promise<void>;
}

window.appStorageMixin = {
  /**
   * Load the list of cities from the configured JSON endpoint.
   * Falls back to `window.CONFIG.FALLBACK_CITIES` on error.
   */
  async loadCities(): Promise<void> {
    try {
      const response = await fetch(window.CONFIG.CITIES_JSON_PATH);
      if (!response.ok) {
        throw new Error("Failed to load city list");
      }
      this.cityList = (await response.json()) as string[];
    } catch (_error) {
      console.error("Error loading cities:", _error);
      this.cityList = [...window.CONFIG.FALLBACK_CITIES];
    }
  },

  /**
   * Load recent searches from localStorage into memory.
   */
  loadRecentSearches(): void {
    try {
      const stored = this.safeGetItem("recentSearches");
      const parsed = stored ? JSON.parse(stored) : [];
      // Deduplicate case-insensitively (city|radius|fuel) and preserve order (most-recent first)
      const seen = new Set<string>();
      this.recentSearches = (Array.isArray(parsed) ? parsed : []).filter(
        (s) => {
          const key = `${(s.city || "").toString().trim().toLowerCase()}|${s.radius}|${(s.fuel || "").toString().trim().toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        },
      );
    } catch {
      this.recentSearches = [];
    }
  },

  /**
   * Save a search to recent searches, deduplicate and trim to the configured limit.
   *
   * @param search - Search object containing `city`, `radius`, `fuel`, and optional `results`.
   */
  saveRecentSearch(search: {
    city: string;
    radius: string;
    fuel: string;
    results?: string;
  }): void {
    // Normalize keys for case-insensitive deduplication but keep original casing for display
    const incomingCity = (search.city || "").toString().trim();
    const incomingFuel = (search.fuel || "").toString().trim();
    this.recentSearches = this.recentSearches.filter((s) => {
      const sameCity =
        (s.city || "").toString().trim().toLowerCase() ===
        incomingCity.toLowerCase();
      const sameFuel =
        (s.fuel || "").toString().trim().toLowerCase() ===
        incomingFuel.toLowerCase();
      return !(sameCity && s.radius === search.radius && sameFuel);
    });

    const entry = { ...search, timestamp: Date.now() };
    this.recentSearches = [entry, ...this.recentSearches].slice(
      0,
      window.CONFIG.RECENT_SEARCHES_LIMIT,
    );
    this.safeSetItem("recentSearches", JSON.stringify(this.recentSearches));
  },

  /**
   * Apply a recent search to the form and submit it.
   *
   * @param search - The recent search to select and run.
   */
  selectRecentSearch(search: {
    city: string;
    radius: string;
    fuel: string;
    results?: string;
  }): void {
    this.formData.city = search.city;
    this.formData.radius = search.radius;
    this.formData.fuel = search.fuel;
    this.formData.results = search.results || "5";
    // Update the visible form inputs immediately, then submit.
    if (typeof (this as any).updateSearchFormUI === "function") {
      (this as any).updateSearchFormUI();
    }
    this.submitForm();
  },

  safeGetItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  safeSetItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage errors
    }
  },
} as AppStorageMixin;
