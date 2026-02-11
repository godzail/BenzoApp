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
  async loadCities(): Promise<void> {
    try {
      const response = await fetch(window.CONFIG.CITIES_JSON_PATH);
      if (!response.ok) throw new Error("Failed to load city list");
      this.cityList = (await response.json()) as string[];
    } catch (_error) {
      console.error("Error loading cities:", _error);
      this.cityList = [...window.CONFIG.FALLBACK_CITIES];
    }
  },

  loadRecentSearches(): void {
    try {
      const stored = this.safeGetItem("recentSearches");
      this.recentSearches = stored ? JSON.parse(stored) : [];
    } catch {
      this.recentSearches = [];
    }
  },

  saveRecentSearch(search: {
    city: string;
    radius: string;
    fuel: string;
    results?: string;
  }): void {
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
