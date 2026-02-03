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
    linearProgress: null,
    map: null,
    mapInitialized: false,
    mapMarkers: [],
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

    setupMDCSelects(destroyFirst = false) {
      for (const el of document.querySelectorAll(".mdc-select")) {
        if (destroyFirst && el.MDCSelect) {
          el.MDCSelect.destroy();
        }

        const select = mdc.select.MDCSelect.attachTo(el);
        el.MDCSelect = select;

        select.listen("MDCSelect:change", () => {
          // biome-ignore lint/nursery/noSecrets: True
          const hiddenInput = el.querySelector('input[type="hidden"]');
          if (hiddenInput) {
            hiddenInput.value = select.value;
            hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });

        // Set value and update text
        // biome-ignore lint/nursery/noSecrets: Tru
        const inputName = el.querySelector('input[type="hidden"]')?.name;
        if (inputName && this.formData[inputName]) {
          select.value = this.formData[inputName];
        }
        this.updateSelectText(el, select);
      }
    },

    updateSelectText(el, select) {
      const selectedLi =
        el.querySelector(`.mdc-list-item[data-value="${select.value}"]`) ||
        el.querySelector('.mdc-list-item[aria-selected="true"]');
      const selectedTextEl = el.querySelector(".mdc-select__selected-text");

      if (selectedLi && selectedTextEl) {
        const textEl = selectedLi.querySelector(".mdc-list-item__text");
        if (textEl) {
          const key = textEl.getAttribute("data-i18n");
          selectedTextEl.textContent = key
            ? i18next.t(key)
            : textEl.textContent;
        }
      }
    },

    /**
     * Clears all existing map markers efficiently.
     * Uses batch removal to improve performance.
     */
    clearMapMarkers() {
      if (this.mapMarkers && this.mapMarkers.length > 0) {
        // Batch remove markers for better performance
        for (const marker of this.mapMarkers) {
          marker.remove();
        }
        this.mapMarkers.length = 0; // Clear array efficiently
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

      // Create markers in batch
      for (const station of validStations) {
        const marker = L.marker([station.latitude, station.longitude]).addTo(
          this.map,
        );
        marker.__station = station;
        marker.bindPopup(this.buildPopupContent(station));
        this.mapMarkers.push(marker);
      }

      // Update map view
      this.map.invalidateSize();
      this.map.fitBounds(bounds, {
        padding: CONFIG.MAP_PADDING,
        maxZoom: CONFIG.MAX_ZOOM,
      });
      this.debug("Map updated with", this.mapMarkers.length, "markers");
    },

    /**
     * Fits the map bounds to include all current markers.
     * Uses configuration constants for consistency.
     */
    fitMapBounds() {
      if (this.mapMarkers && this.mapMarkers.length > 0) {
        const bounds = this.mapMarkers.map((marker) => marker.getLatLng());
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

        // Set up language change listener
        window.addEventListener("languageChanged", (event) => {
          this.debug("Language changed to:", event.detail.lang);
          this.reinitializeComponents();
          this.refreshMapMarkersOnLanguageChange();
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
            // biome-ignore lint/nursery/noSecrets: Tru
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
     * Separated for better modularity.
     */
    refreshMapMarkersOnLanguageChange() {
      if (this.mapInitialized && this.mapMarkers?.length > 0) {
        this.debug(
          "Refreshing map markers/popups after language change, current lng:",
          i18next.language,
        );
        for (const marker of this.mapMarkers) {
          if (marker.__station) {
            const html = this.buildPopupContent(marker.__station);
            marker.bindPopup(html);
          }
        }
        this.updateMap();
      }
    },

    reinitializeComponents() {
      this.debug("Reinitializing MDC components after language change");

      // First, update i18n texts for all select options (if available)
      if (window.updateI18nTexts) {
        window.updateI18nTexts();
        // biome-ignore lint/nursery/noSecrets: Tru
        this.debug("updateI18nTexts called before MDCSelect re-init");
      }

      // Use the consolidated setupMDCSelects method
      this.setupMDCSelects(true);
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
      for (const el of document.querySelectorAll(".mdc-text-field")) {
        mdc.textField.MDCTextField.attachTo(el);
      }

      // Use the consolidated setupMDCSelects method
      this.setupMDCSelects();

      for (const el of document.querySelectorAll(".mdc-button")) {
        mdc.ripple.MDCRipple.attachTo(el);
      }

      const progressEl = document.getElementById("loading-bar");
      if (progressEl) {
        this.linearProgress =
          mdc.linearProgress.MDCLinearProgress.attachTo(progressEl);
        this.linearProgress.close();
      }
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
          // biome-ignore lint/nursery/noSecrets: Tru
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

    // biome-ignore lint/complexity/noExcessiveLinesPerFunction: True
    async submitForm() {
      this.loading = true;
      this.debug("Loading started");
      if (this.linearProgress) {
        this.linearProgress.open();
      }
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
          // biome-ignore lint/nursery/noSecrets: Tru
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
        if (this.linearProgress) {
          this.linearProgress.close();
        }
      }
    },

    buildPopupContent(station) {
      // Build popup HTML using current i18n language (should be IT when selected)
      const title = station.gestore || i18next.t("translation.station");
      this.debug(
        // biome-ignore lint/nursery/noSecrets: Tru
        "buildPopupContent using lang:",
        i18next.language,
        "title:",
        title,
      );
      return `<b>${title}</b><br>${station.address}`;
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
  };
}

// Expose the gasStationApp function to the window object
window.gasStationApp = gasStationApp;
