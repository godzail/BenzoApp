// Constants for configuration
/** biome-ignore-all lint/style/noMagicNumbers: True */
/** biome-ignore-all lint/style/useNamingConvention: True */
const CONFIG = {
  DEFAULT_MAP_CENTER: [41.9028, 12.4964], // Default: Italy (Rome)
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
};

/**
 * Extracts the 'gestore' (manager/operator) from a station object.
 * @param {Object} station - The station object.
 * @returns {string} The gestore name or empty string if not found.
 */
function extractGestore(station) {
  return station.gestore || "";
}

/**
 * Theme management utilities
 */
const themeManager = {
  getSystemPreference() {
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark";
  },

  getStoredTheme() {
    try {
      return localStorage.getItem(CONFIG.THEME_STORAGE_KEY);
    } catch (_e) {
      return null;
    }
  },

  setStoredTheme(theme) {
    try {
      localStorage.setItem(CONFIG.THEME_STORAGE_KEY, theme);
    } catch (_e) {
      console.warn("Failed to store theme preference");
    }
  },

  applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  },

  init() {
    const storedTheme = this.getStoredTheme();
    const theme = storedTheme || this.getSystemPreference();
    this.applyTheme(theme);

    // Listen for system theme changes
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
      mediaQuery.addEventListener("change", (e) => {
        if (!this.getStoredTheme()) {
          this.applyTheme(e.matches ? "light" : "dark");
        }
      });
    }
  },

  toggle() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    this.applyTheme(newTheme);
    this.setStoredTheme(newTheme);
    return newTheme;
  },
};

/**
 * Creates and returns the main gas station application instance.
 * @returns {Object} The application instance with methods and data.
 */

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: True
function gasStationApp() {
  return {
    formData: {
      city: "",
      radius: CONFIG.DEFAULT_RADIUS,
      fuel: CONFIG.DEFAULT_FUEL,
      results: CONFIG.DEFAULT_RESULTS,
    },
    recentSearches: [],
    loading: false,
    results: [],
    error: "",
    searched: false,
    currentTheme: CONFIG.DEFAULT_THEME,
    currentLang: localStorage.getItem("lang") || "it",
    map: null,
    mapInitialized: false,
    mapMarkers: {}, // Changed from array to object keyed by station.id
    showCitySuggestions: false,
    cityList: [],
    filteredCities: [],
    debugMode: false,

    /**
     * Formats a numeric value as currency in Italian locale.
     * @param {number} value - The numeric value to format.
     * @returns {string} The formatted currency string.
     */
    formatCurrency(value) {
      return new Intl.NumberFormat(CONFIG.CURRENCY_LOCALE, {
        style: "currency",
        currency: CONFIG.CURRENCY_CODE,
        minimumFractionDigits: CONFIG.CURRENCY_FRACTION_DIGITS,
        maximumFractionDigits: CONFIG.CURRENCY_FRACTION_DIGITS,
      }).format(value);
    },

    /**
     * Logs debug messages if debug mode is enabled.
     * @param {string} message - The debug message.
     * @param {*} [data] - Optional data to log.
     */
    debug(message, data = null) {
      if (this.debugMode) {
        console.log(`[DEBUG] ${message}`, data || "");
      }
    },

    /**
     * Clears all existing map markers efficiently.
     * Uses batch removal to improve performance.
     */
    clearMapMarkers() {
      if (this.mapMarkers) {
        // Remove all markers from map
        Object.values(this.mapMarkers).forEach((marker) => {
          if (marker && typeof marker.remove === "function") {
            marker.remove();
          }
        });
        // Clear the object
        this.mapMarkers = {};
      }
    },

    /**
     * Adds markers to the map for search results.
     * Optimized to batch operations and reduce DOM interactions.
     */
    addMapMarkers() {
      if (!this.results || this.results.length === 0) {
        return;
      }

      const validStations = this.results.filter(
        (station) => station.latitude && station.longitude,
      );

      if (validStations.length === 0) {
        return;
      }

      const bounds = validStations.map((station) => [
        station.latitude,
        station.longitude,
      ]);

      // Create markers and store them by station ID
      for (const station of validStations) {
        if (!station.id) continue;

        const marker = L.marker([station.latitude, station.longitude]).addTo(
          this.map,
        );
        marker.__station = station;
        marker.bindPopup(this.buildPopupContent(station));
        this.mapMarkers[station.id] = marker;
      }

      // Update map view
      this.map.invalidateSize();
      this.map.fitBounds(bounds, {
        padding: CONFIG.MAP_PADDING,
        maxZoom: CONFIG.MAX_ZOOM,
      });
      this.debug(
        "Map updated with",
        Object.keys(this.mapMarkers).length,
        "markers",
      );
    },

    /**
     * Fits the map bounds to include all current markers.
     * Uses configuration constants for consistency.
     */
    fitMapBounds() {
      const markers = Object.values(this.mapMarkers);
      if (markers && markers.length > 0) {
        const bounds = markers.map((marker) => marker.getLatLng());
        this.map.fitBounds(bounds, {
          padding: CONFIG.MAP_PADDING,
          maxZoom: CONFIG.MAX_ZOOM,
        });
      }
    },

    /**
     * Initializes the application by loading components and setting up event listeners.
     * Handles template loading, language changes, and component initialization.
     */
    async init() {
      try {
        // Load all HTML templates and initial data in parallel for better performance
        await Promise.all([
          this.loadComponent(
            "/static/templates/header.html",
            "header-container",
          ),
          this.loadComponent(
            "/static/templates/search.html",
            "search-container",
          ),
          this.loadComponent(
            "/static/templates/results.html",
            "results-container",
          ),
          this.loadCities(),
        ]);

        // Sync currentLang with i18next after templates load
        if (window.i18next?.language) {
          this.currentLang = window.i18next.language;
          this.debug("Synced currentLang with i18next:", this.currentLang);
        }

        // Set up language change listener
        window.addEventListener("languageChanged", (event) => {
          this.debug("Language changed to:", event.detail.lang);
          this.currentLang = event.detail.lang;
          this.reinitializeComponents();
          this.refreshMapMarkersOnLanguageChange();
          // Force Alpine.js re-render by calling updateI18nTexts
          if (window.updateI18nTexts) {
            window.updateI18nTexts();
          }
        });

        // Load recent searches and restore last city
        this.loadRecentSearches();
        if (this.recentSearches.length > 0 && this.recentSearches[0].city) {
          this.formData.city = this.recentSearches[0].city;
        }

        // Ensure DOM is ready before initializing components
        this.$nextTick(() => {
          this.initializeComponents();
          if (window.updateI18nTexts) {
            window.updateI18nTexts();
            this.debug("updateI18nTexts called after templates loaded");
          }
        });
      } catch (error) {
        console.error("Error during initialization:", error);
        this.error = "Failed to initialize application";
      }
    },

    /**
     * Refreshes map markers and popups when language changes.
     * Updates all marker popups with new translations.
     */
    refreshMapMarkersOnLanguageChange() {
      this.debug("Refreshing map markers for language change");

      // Rebuild all marker popups with new language
      Object.values(this.mapMarkers).forEach((marker) => {
        if (marker && marker.__station) {
          const html = this.buildPopupContent(marker.__station);
          marker.setPopupContent(html);
        }
      });

      // Force map update
      this.$nextTick(() => {
        this.updateMap();
      });
    },

    reinitializeComponents() {
      this.debug("Reinitializing components after language change");

      // Update i18n texts for all elements
      if (window.updateI18nTexts) {
        window.updateI18nTexts();
        this.debug("updateI18nTexts called after language change");
      }
    },

    /**
     * Loads the list of cities from the server.
     * Falls back to a default list if the request fails.
     * @returns {Promise<void>}
     */
    async loadCities() {
      try {
        const response = await fetch(CONFIG.CITIES_JSON_PATH);
        if (!response.ok) {
          throw new Error("Failed to load city list");
        }
        this.cityList = await response.json();
      } catch (error) {
        console.error("Error loading cities:", error);
        // Fallback to a minimal list in case of failure
        this.cityList = CONFIG.FALLBACK_CITIES;
      }
    },

    initializeComponents() {
      // Initialize theme
      themeManager.init();
      this.currentTheme =
        document.documentElement.getAttribute("data-theme") ||
        CONFIG.DEFAULT_THEME;

      // Initialize loading bar
      const progressEl = document.getElementById("loading-bar");
      if (progressEl) {
        this.loadingBar = progressEl;
      }

      // Initialize Resizer
      this.initializeResizer();
    },

    /**
     * Initializes the column resizing logic.
     */
    initializeResizer() {
      const resizer = document.getElementById("layout-resizer");
      const searchColumn = document.getElementById("search-column");
      const mainLayout = document.querySelector(".main-layout");

      if (!(resizer && searchColumn && mainLayout)) return;

      let isResizing = false;

      resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "col-resize";
        document.body.classList.add("is-resizing");
      });

      document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;

        const containerRect = mainLayout.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;
        const totalWidth = containerRect.width;

        // Calculate percentage (clamped between 10% and 90%)
        let percentage = (relativeX / totalWidth) * 100;
        percentage = Math.max(10, Math.min(90, percentage));

        mainLayout.style.gridTemplateColumns = `${percentage}% 4px 1fr`;
        resizer.setAttribute("aria-valuenow", Math.round(percentage));

        // Invalidate map size during resize for smoothness
        if (this.map) {
          this.map.invalidateSize();
        }
      });

      document.addEventListener("mouseup", () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = "";
        document.body.classList.remove("is-resizing");

        // Final map update
        if (this.map) {
          setTimeout(() => this.map.invalidateSize(), CONFIG.MAP_RESIZE_DELAY);
        }
      });
    },

    /**
     * Toggles between light and dark themes
     */
    toggleTheme() {
      this.currentTheme = themeManager.toggle();
      this.debug("Theme toggled to:", this.currentTheme);
    },

    /**
     * Sets a specific fuel type chip as active
     * Forces Alpine.js reactivity by using $nextTick
     */
    setFuelType(fuel) {
      this.debug("Setting fuel type:", fuel);
      this.formData.fuel = fuel;

      // Force immediate reactivity update
      this.$nextTick(() => {
        this.debug("Fuel type updated to:", this.formData.fuel);
      });
    },

    /**
     * Checks if a fuel type is currently selected
     */
    isFuelSelected(fuel) {
      return this.formData.fuel === fuel;
    },

    async loadComponent(url, elementId) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load component: ${url}`);
        }
        const data = await response.text();
        const element = document.getElementById(elementId);
        if (element) {
          element.innerHTML = data;
        }
      } catch (error) {
        console.error(`Error loading component into ${elementId}:`, error);
      }
    },

    loadRecentSearches() {
      const stored = localStorage.getItem("recentSearches");
      this.recentSearches = stored ? JSON.parse(stored) : [];
    },

    /**
     * Saves a recent search to localStorage with deduplication.
     * @param {Object} search - The search object to save.
     */
    saveRecentSearch(search) {
      // Remove existing duplicate searches
      this.recentSearches = this.recentSearches.filter(
        (s) =>
          !(
            s.city === search.city &&
            s.radius === search.radius &&
            s.fuel === search.fuel
          ),
      );

      // Add new search and limit to configured number of items
      this.recentSearches = [search, ...this.recentSearches].slice(
        0,
        CONFIG.RECENT_SEARCHES_LIMIT,
      );

      // Save to localStorage
      localStorage.setItem(
        "recentSearches",
        JSON.stringify(this.recentSearches),
      );
    },

    selectRecentSearch(search) {
      this.formData.city = search.city;
      this.formData.radius = search.radius;
      this.formData.fuel = search.fuel;
      this.formData.results = search.results || "5";
      this.submitForm();
    },

    /**
     * Initializes the Leaflet map with default settings.
     * Only initializes once to avoid duplicates.
     */
    initMap() {
      this.debug("initMap called");
      if (this.mapInitialized) {
        this.debug("Map already initialized");
        return;
      }

      const mapContainer = document.getElementById("map");
      if (!mapContainer) {
        this.debug("Map container not found");
        return;
      }

      // Initialize the map with default view
      this.map = L.map("map").setView(
        CONFIG.DEFAULT_MAP_CENTER,
        CONFIG.DEFAULT_ZOOM,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          // biome-ignore lint/security/noSecrets: True
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);

      this.mapInitialized = true;
      this.debug("Map initialized");

      // Handle map resize when container becomes visible
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
          this.debug("Map size invalidated");
        }
      }, CONFIG.MAP_RESIZE_DELAY);
    },

    onCityInput() {
      const value = this.formData.city.trim().toLowerCase();
      if (value.length === 0) {
        this.filteredCities = [];
        this.showCitySuggestions = false;
        return;
      }
      this.filteredCities = this.cityList.filter((city) =>
        city.toLowerCase().startsWith(value),
      );
      this.showCitySuggestions = this.filteredCities.length > 0;
    },

    selectCity(city) {
      this.formData.city = city;
      this.filteredCities = [];
      this.showCitySuggestions = false;
    },

    hideCitySuggestions() {
      setTimeout(() => {
        this.showCitySuggestions = false;
      }, CONFIG.CITY_SUGGESTION_HIDE_DELAY);
    },

    /**
     * Submits the search form to the server and processes the results.
     * Handles loading states, error management, and map updates.
     * @returns {Promise<void>}
     */

    /**
     * Controls the loading bar visibility
     */
    setLoadingBar(active) {
      if (this.loadingBar) {
        if (active) {
          this.loadingBar.classList.add("active");
        } else {
          this.loadingBar.classList.remove("active");
        }
      }
    },

    // biome-ignore lint/complexity/noExcessiveLinesPerFunction: True
    async submitForm() {
      this.loading = true;
      this.debug("Loading started");
      this.setLoadingBar(true);
      this.error = "";
      this.searched = true;
      this.saveRecentSearch({ ...this.formData });

      const fuelToSend =
        this.formData.fuel === "diesel" ? "gasolio" : this.formData.fuel;

      try {
        const response = await fetch(CONFIG.SEARCH_API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city: this.formData.city,
            radius: Number.parseInt(
              this.formData.radius,
              CONFIG.PARSE_INT_RADIX,
            ),
            fuel: fuelToSend,
            results: Number.parseInt(
              this.formData.results,
              CONFIG.PARSE_INT_RADIX,
            ),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.detail || `HTTP error! status: ${response.status}`,
          );
        }

        const data = await response.json();
        if (data.warning) {
          this.error = data.warning;
          this.results = [];
        } else {
          // Process stations and add extracted gestore
          this.results =
            data.stations?.map((station) => ({
              ...station,
              gestore: extractGestore(station),
              distance: station.distance || "",
            })) || [];
          this.error = "";
        }

        // Update map and UI after DOM update
        this.$nextTick(() => {
          this.updateMap();
          this.debug("updateI18nTexts called after search results loaded");
          if (window.updateI18nTexts) {
            updateI18nTexts();
          }
        });
      } catch (err) {
        this.error = err.message;
        this.results = [];
        this.debug("Search failed:", err.message);
      } finally {
        this.loading = false;
        this.debug("Loading ended");
        this.setLoadingBar(false);
      }
    },

    buildPopupContent(station) {
      // Use the reactive translate method instead of direct i18next.t
      const title =
        station.gestore || this.translate("translation.station", "Gas Station");
      const addressLabel = this.translate("translation.address", "Address");

      this.debug(
        "buildPopupContent using lang:",
        this.currentLang,
        "title:",
        title,
      );

      return `
        <div class="map-popup">
          <strong>${title}</strong><br>
          <span style="color: var(--text-secondary);">${addressLabel}: ${station.address}</span>
        </div>
      `;
    },

    updateMap() {
      if (!this.mapInitialized) {
        this.initMap();
      }

      if (!this.map) {
        this.debug("Map not initialized, cannot update");
        return;
      }

      // Clear existing markers using utility method
      this.clearMapMarkers();

      // Add new markers if we have results using utility method
      if (this.results.length > 0) {
        this.addMapMarkers();
      }
    },

    /**
     * Checks if a station has the best (lowest) price
     * @param {number} index - The index of the station to check
     * @returns {boolean} True if this station has the lowest price
     */
    isCheapestStation(index) {
      if (!this.results || this.results.length === 0) {
        return false;
      }
      if (index === 0) {
        // First station is always considered "best" if we have results
        // In a real implementation, you'd compare all prices
        return true;
      }
      return false;
    },

    /**
     * Centers the map on a specific station and opens its popup
     * @param {string} stationId - The unique ID of the station
     */
    selectStationForMap(stationId) {
      if (!(this.map && this.mapMarkers && stationId)) {
        return;
      }

      const marker = this.mapMarkers[stationId];
      if (!marker) {
        this.debug("Marker not found for station ID:", stationId);
        return;
      }

      const station = marker.__station;
      if (station && station.latitude && station.longitude) {
        this.map.setView([station.latitude, station.longitude], 16);
        marker.openPopup();
      }
    },

    /**
     * Opens Google Maps directions to a station
     * @param {Object} station - The station object with latitude and longitude
     */
    getDirections(station) {
      if (!(station?.latitude && station.longitude)) {
        return;
      }

      const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;
      window.open(url, "_blank");
    },

    /**
     * Attempts to get the user's current location
     */
    locateUser() {
      if (!navigator.geolocation) {
        this.error = "Geolocation is not supported by your browser";
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.debug("User location:", position.coords);
          // In a real implementation, you'd reverse geocode to get the city name
          // For now, just set a placeholder
          this.formData.city = "Current Location";
          this.submitForm();
        },
        (error) => {
          this.debug("Geolocation error:", error);
          this.error = "Unable to retrieve your location";
        },
      );
    },

    /**
     * Translates a key using i18next - made reactive by accessing currentLang
     * @param {string} key - The translation key
     * @param {string} fallback - Fallback text if translation not found
     * @returns {string} The translated text
     */
    translate(key, fallback = "") {
      // Access currentLang to establish reactive dependency
      const currentLanguage = this.currentLang;

      this.debug("translate called with lang:", currentLanguage, "key:", key);

      if (typeof window.t === "function") {
        return window.t(key, fallback);
      }
      if (typeof i18next !== "undefined" && i18next.t) {
        const translated = i18next.t(key);
        if (translated === key || translated === `translation.${key}`) {
          return fallback || key;
        }
        return translated;
      }
      return fallback || key;
    },

    /**
     * Sets the application language with proper reactivity
     * @param {string} lang - The language code ('en' or 'it')
     */
    setLanguage(lang) {
      this.debug("Language change requested:", lang);

      // Update currentLang first to trigger reactive updates immediately
      this.currentLang = lang;

      // Store in localStorage
      localStorage.setItem("lang", lang);

      // Use the global setLang function from i18n.js if available
      if (window.setLang) {
        window.setLang(lang);
        this.debug("Language changed via setLang:", lang);
      } else if (window.i18next?.changeLanguage) {
        // Fallback to direct i18next call
        window.i18next.changeLanguage(lang, () => {
          if (window.updateI18nTexts) {
            window.updateI18nTexts();
          }
          // Dispatch event manually if setLang not available
          window.dispatchEvent(
            new CustomEvent("languageChanged", { detail: { lang } }),
          );
        });
        this.debug("Language changed via i18next:", lang);
      }

      // Force re-render of all translated elements
      this.$nextTick(() => {
        if (window.updateI18nTexts) {
          window.updateI18nTexts();
        }
      });
    },
  };
}

// Expose the gasStationApp function to the window object
window.gasStationApp = gasStationApp;
