/**
 * Main application composition.
 * Composes the UI, storage, and map mixins into the main app object.
 */

interface GasStationApp {
  formData: {
    city: string;
    radius: string;
    fuel: string;
    results: string;
  };
  recentSearches: Array<{
    city: string;
    radius: string;
    fuel: string;
    results?: string;
    timestamp?: number;
  }>;
  loading: boolean;
  results: Array<{
    id?: string | number;
    gestore?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    fuel_prices?: Array<{ price?: number }>;
    distance?: string | number;
  }>;
  error: string;
  searched: boolean;
  currentTheme: string;
  currentLang: string | null;
  map: unknown;
  mapInitialized: boolean;
  mapMarkers: Record<string, unknown>;
  showCitySuggestions: boolean;
  cityList: string[];
  filteredCities: string[];
  debugMode: boolean;
  csvLastUpdated: string | null;
  csvReloading: boolean;
  csvStatusInterval: ReturnType<typeof setInterval> | null;
}

((): void => {
  function gasStationApp(): GasStationApp {
    return {
      formData: {
        city: "",
        radius: window.CONFIG.DEFAULT_RADIUS,
        fuel: window.CONFIG.DEFAULT_FUEL,
        results: window.CONFIG.DEFAULT_RESULTS,
      },
      recentSearches: [],
      loading: false,
      results: [],
      error: "",
      searched: false,
      currentTheme: window.CONFIG.DEFAULT_THEME,
      currentLang: null,
      map: null,
      mapInitialized: false,
      mapMarkers: {},
      showCitySuggestions: false,
      cityList: [],
      filteredCities: [],
      debugMode: false,
      csvLastUpdated: null,
      csvReloading: false,
      csvStatusInterval: null,
      ...window.appUiMixin,
      ...window.appStorageMixin,
      ...window.appMapMixin,
    };
  }

  window.gasStationApp = gasStationApp;
})();
