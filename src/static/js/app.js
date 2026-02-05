// Main app composition (trimmed): composes previously split mixins
function gasStationApp() {
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

    // mixins
    ...window.appUiMixin,
    ...window.appStorageMixin,
    ...window.appMapMixin,
  };
}

window.gasStationApp = gasStationApp;
