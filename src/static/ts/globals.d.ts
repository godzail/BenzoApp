/// <reference types="vite/client" />

interface Window {
  APP_USER_LANG: string;
  setLang: (lang: "it" | "en") => void;
  t: (key: string, fallback?: string) => string;
  updateI18nTexts: () => void;
  gasStationApp: () => { debugMode?: boolean };
  translateFuel: (type: string) => string;
  CONFIG: {
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
  };
  extractGestore: (station: { gestore?: string }) => string;
  themeManager: {
    init: () => void;
    toggle: () => "light" | "dark";
  };
  appUiMixin: Record<string, unknown>;
  appStorageMixin: Record<string, unknown>;
  appMapMixin: Record<string, unknown>;
  i18next: {
    t: (key: string) => string;
    changeLanguage?: (lang: string, callback?: () => void) => void;
    language?: string;
    reloadResources?: (lang: string, ns: string, callback?: () => void) => void;
    addResourceBundle: (
      lng: string,
      ns: string,
      resources: Record<string, unknown>,
      deep?: boolean,
      overwrite?: boolean,
    ) => void;
    use: (module: { init: (options: unknown) => unknown }) => {
      init: (options: unknown) => void;
    };
    init: (
      options: {
        lng: string;
        fallbackLng: string;
        debug: boolean;
        resources?: Record<string, unknown>;
      },
      callback?: (err: unknown) => void,
    ) => void;
  };
}

declare const i18next: {
  t: (key: string) => string;
  changeLanguage?: (lang: string, callback?: () => void) => void;
  language?: string;
  reloadResources?: (lang: string, ns: string, callback?: () => void) => void;
  addResourceBundle: (
    lng: string,
    ns: string,
    resources: Record<string, unknown>,
    deep?: boolean,
    overwrite?: boolean,
  ) => void;
  use: (module: { init: (options: unknown) => unknown }) => {
    init: (options: unknown) => void;
  };
  init: (
    options: {
      lng: string;
      fallbackLng: string;
      debug: boolean;
      resources?: Record<string, unknown>;
    },
    callback?: (err: unknown) => void,
  ) => void;
};


