"use strict";
/**
 * Main application composition.
 * Composes the UI, storage, and map mixins into the main app object.
 */
/**
 * Create the main application instance by composing UI, storage and map mixins.
 *
 * @returns A new `GasStationApp` object containing state and public methods used by the UI.
 */
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
        csvLastUpdated: null,
        csvReloading: false,
        csvStatusLoading: false,
        csvStatusInterval: null,
        ...window.appUiMixin,
        ...window.appStorageMixin,
        ...window.appMapMixin,
    };
}
window.gasStationApp = gasStationApp;
//# sourceMappingURL=app.js.map