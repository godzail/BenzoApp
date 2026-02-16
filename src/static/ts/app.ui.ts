/**
 * Split entry for UI helper methods.  This file keeps the public
 * `AppUiMixin` type and ensures `window.appUiMixin` exists.  The
 * heavy implementations were moved into smaller files so each file
 * stays under ~500 lines.
 */
// @ts-nocheck

interface CsvStatus {
  last_updated: string | null;
  source: string;
  is_stale: boolean;
  reload_in_progress?: boolean;
}

interface ReloadResponse {
  status: string;
  message?: string;
  last_updated?: string;
}

/**
 * Represents a petrol station returned by the search API.
 */
interface Station {
  id?: string | number;
  gestore?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  fuel_prices?: Array<{ price?: number; type?: string }>;
  distance?: string | number;
}

interface FormDataType {
  city: string;
  radius: string;
  fuel: string;
  results: string;
}

/**
 * Global UI mixin attached to `window.appUiMixin`.
 * Holds shared UI state and helper methods used across the client-side app.
 */
interface AppUiMixin {
  debugMode: boolean;
  currentLang: string;
  loadingBar: HTMLElement | null;
  map: unknown;
  formData: FormDataType;
  results: Station[];
  filteredCities: string[];
  showCitySuggestions: boolean;
  cityList: string[];
  recentSearches: Array<FormDataType & { timestamp?: number }>;
  error: string;
  loading: boolean;
  searched: boolean;
  csvLastUpdated: string | null;
  csvReloading: boolean;
  csvRemoteReloadInProgress: boolean;
  csvStatusLoading: boolean;
  csvStatusInterval: ReturnType<typeof setInterval> | null;
  currentTheme: string;

  _fuelChangeTimeout?: ReturnType<typeof setTimeout>;
  [key: string]: unknown;

  /* methods are implemented in smaller files that augment this object */
}

// Ensure the global mixin object exists so the smaller modules can augment it.
window.appUiMixin = (window.appUiMixin || {}) as AppUiMixin;

export { };


