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
  csvStatusLoading: boolean;
  csvStatusInterval: ReturnType<typeof setInterval> | null;
  init: () => Promise<void>;
}

function createApp(): GasStationApp {
  // Get current theme from document or localStorage/system preference
  const getInitialTheme = (): string => {
    const stored = document.documentElement.getAttribute("data-theme");
    if (stored) return stored;
    // If user previously chose a theme in localStorage, apply it and return.
    try {
      const ls = localStorage.getItem(window.CONFIG.THEME_STORAGE_KEY);
      if (ls) {
        document.documentElement.setAttribute("data-theme", ls);
        return ls;
      }
    } catch {}

    // Start deterministically with the configured DEFAULT_THEME so tests
    // and headless environments behave predictably. System preference
    // changes are handled later by the ThemeManager listener when
    // there's no stored preference.
    document.documentElement.setAttribute(
      "data-theme",
      window.CONFIG.DEFAULT_THEME,
    );
    return window.CONFIG.DEFAULT_THEME;
  };

  const app = {
    formData: {
      city: "",
      radius: window.CONFIG.DEFAULT_RADIUS,
      fuel: window.CONFIG.DEFAULT_FUEL,
      results: window.CONFIG.DEFAULT_RESULTS,
    },
    recentSearches: [] as Array<{
      city: string;
      radius: string;
      fuel: string;
      results?: string;
      timestamp?: number;
    }>,
    loading: false,
    results: [] as Array<{
      id?: string | number;
      gestore?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      fuel_prices?: Array<{ price?: number }>;
      distance?: string | number;
    }>,
    error: "",
    searched: false,
    currentTheme: getInitialTheme(),
    currentLang: null as string | null,
    map: null,
    mapInitialized: false,
    mapMarkers: {} as Record<string, unknown>,
    showCitySuggestions: false,
    cityList: [] as string[],
    filteredCities: [] as string[],
    debugMode: false,
    csvLastUpdated: null as string | null,
    csvReloading: false,
    csvRemoteReloadInProgress: false,
    csvStatusLoading: false,
    csvStatusInterval: null as ReturnType<typeof setInterval> | null,
    init: async (): Promise<void> => {
      // Will be replaced by mixin init
    },
  };

  const uiMixin = window.appUiMixin as Record<string, unknown>;
  const storageMixin = window.appStorageMixin as Record<string, unknown>;
  const mapMixin = window.appMapMixin as Record<string, unknown>;

  return Object.assign(app, uiMixin, storageMixin, mapMixin) as GasStationApp;
}

async function initApp(): Promise<void> {
  const appInstance = createApp();
  (window as unknown as { gasStationApp: GasStationApp }).gasStationApp =
    appInstance;
  await appInstance.init();
}

window.initApp = initApp;
