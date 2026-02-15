"use strict";
/**
 * Main application composition.
 * Composes the UI, storage, and map mixins into the main app object.
 */
function createApp() {
    // Get current theme from document or localStorage/system preference
    const getInitialTheme = () => {
        const stored = document.documentElement.getAttribute("data-theme");
        if (stored)
            return stored;
        // If user previously chose a theme in localStorage, apply it and return.
        try {
            const ls = localStorage.getItem(window.CONFIG.THEME_STORAGE_KEY);
            if (ls) {
                document.documentElement.setAttribute("data-theme", ls);
                return ls;
            }
        }
        catch { }
        // Start deterministically with the configured DEFAULT_THEME so tests
        // and headless environments behave predictably. System preference
        // changes are handled later by the ThemeManager listener when
        // there's no stored preference.
        document.documentElement.setAttribute("data-theme", window.CONFIG.DEFAULT_THEME);
        return window.CONFIG.DEFAULT_THEME;
    };
    const app = {
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
        currentTheme: getInitialTheme(),
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
        csvRemoteReloadInProgress: false,
        csvStatusLoading: false,
        csvStatusInterval: null,
        init: async () => {
            // Will be replaced by mixin init
        },
    };
    const uiMixin = window.appUiMixin;
    const storageMixin = window.appStorageMixin;
    const mapMixin = window.appMapMixin;
    return Object.assign(app, uiMixin, storageMixin, mapMixin);
}
async function initApp() {
    const appInstance = createApp();
    window.gasStationApp =
        appInstance;
    await appInstance.init();
}
window.initApp = initApp;
//# sourceMappingURL=app.js.map