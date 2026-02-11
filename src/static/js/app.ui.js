/**
 * UI helper methods and initialization logic for the gas station application.
 * @namespace appUiMixin
 */
window.appUiMixin = {
  /**
   * Formats a numeric value as currency using the application's locale.
   * @param {number} value - The numeric value to format.
   * @returns {string} The formatted currency string (e.g., "€ 1.850").
   */
  formatCurrency(value) {
    return new Intl.NumberFormat(window.CONFIG.CURRENCY_LOCALE, {
      style: "currency",
      currency: window.CONFIG.CURRENCY_CODE,
      minimumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
      maximumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
    }).format(value);
  },

  /**
   * Debug logging helper - logs only if debugMode is enabled.
   * @param {string} message - Debug message.
   * @param {*} [data] - Optional data to log.
   */
  debug(message, data = null) {
    if (this.debugMode) console.log("[DEBUG]", message, data || "");
  },

  /**
   * Safely retrieves an item from localStorage.
   * @param {string} key - The storage key.
   * @returns {string|null} The stored value or null if not available.
   */
  safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  },

  /**
   * Safely stores an item in localStorage.
   * @param {string} key - The storage key.
   * @param {string} value - The value to store.
   */
  safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_e) {
      // ignore storage errors
    }
  },

  /**
   * Sets the loading bar state (active/inactive).
   * @param {boolean} active - Whether the loading bar should be active.
   */
  setLoadingBar(active) {
    if (!this.loadingBar) return;
    const statusEl = document.getElementById("status-messages");
    if (active) {
      this.loadingBar.classList.add("active");
      this.loadingBar.setAttribute("aria-hidden", "false");
      this.loadingBar.setAttribute("aria-valuenow", "50");
      if (statusEl)
        statusEl.textContent = this.translate(
          "translation.loading",
          "Loading...",
        );
    } else {
      this.loadingBar.classList.remove("active");
      this.loadingBar.setAttribute("aria-hidden", "true");
      this.loadingBar.setAttribute("aria-valuenow", "0");
      if (statusEl)
        setTimeout(() => {
          statusEl.textContent = "";
        }, 500);
    }
  },

  /**
   * Initializes UI components: theme, loading bar, and resizer.
   */
  initializeComponents() {
    window.themeManager.init();
    this.currentTheme =
      document.documentElement.getAttribute("data-theme") ||
      window.CONFIG.DEFAULT_THEME;
    const progressEl = document.getElementById("loading-bar");
    if (progressEl) this.loadingBar = progressEl;
    this.initializeResizer();
  },

  /**
   * Sets up the column resizer for the main layout.
   * Handles mouse events to adjust grid column sizes.
   */
  initializeResizer() {
    const resizer = document.getElementById("layout-resizer");
    const searchColumn = document.getElementById("search-column");
    const mainLayout = document.querySelector(".main-layout");
    if (!(resizer && searchColumn && mainLayout)) return;

    let isResizing = false;
    resizer.addEventListener("mousedown", () => {
      isResizing = true;
      document.body.style.cursor = "col-resize";
      document.body.classList.add("is-resizing");
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const containerRect = mainLayout.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const totalWidth = containerRect.width;
      let percentage = (relativeX / totalWidth) * 100;
      percentage = Math.max(10, Math.min(90, percentage));
      mainLayout.style.gridTemplateColumns = `${percentage}% 4px 1fr`;
      resizer.setAttribute("aria-valuenow", Math.round(percentage));
      if (this.map) this.map.invalidateSize();
    });

    document.addEventListener("mouseup", () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = "";
      document.body.classList.remove("is-resizing");
      if (this.map)
        setTimeout(
          () => this.map.invalidateSize(),
          window.CONFIG.MAP_RESIZE_DELAY,
        );
    });
  },

  /**
   * Toggles the application theme between light and dark.
   */
  toggleTheme() {
    this.currentTheme = window.themeManager.toggle();
    this.debug("Theme toggled to:", this.currentTheme);
  },

  /**
   * Sets the selected fuel type and optionally auto-submits if a city is entered.
   * Uses debouncing to avoid rapid repeated submissions.
   * @param {string} fuel - The fuel type to set.
   */
  setFuelType(fuel) {
    this.formData.fuel = fuel;
    this.$nextTick?.(() => {
      this.debug("Fuel type updated to:", this.formData.fuel);
      // Auto-submit when a city is present (debounced to avoid rapid repeated requests)
      if (this.formData.city) {
        if (this._fuelChangeTimeout) {
          clearTimeout(this._fuelChangeTimeout);
        }
        this._fuelChangeTimeout = setTimeout(() => {
          this.submitForm();
        }, window.CONFIG.DEBOUNCE_DELAY_MS);
      }
    });
  },

  /**
   * Checks if a given fuel type is currently selected.
   * @param {string} fuel - The fuel type to check.
   * @returns {boolean} True if the fuel type matches the current selection.
   */
  isFuelSelected(fuel) {
    return this.formData.fuel === fuel;
  },

  /**
   * Handles city input: filters the city list and shows/hides suggestions.
   */
  onCityInput() {
    const value = (this.formData.city || "").trim().toLowerCase();
    if (value.length === 0) {
      this.filteredCities = [];
      this.showCitySuggestions = false;
      return;
    }
    this.filteredCities = this.cityList.filter((c) =>
      c.toLowerCase().startsWith(value),
    );
    this.showCitySuggestions = this.filteredCities.length > 0;
  },

  /**
   * Selects a city from suggestions and populates the form.
   * @param {string} city - The city name to select.
   */
  selectCity(city) {
    this.formData.city = city;
    this.filteredCities = [];
    this.showCitySuggestions = false;
  },

  /**
   * Hides city suggestions after a short delay.
   */
  hideCitySuggestions() {
    setTimeout(() => {
      this.showCitySuggestions = false;
    }, window.CONFIG.CITY_SUGGESTION_HIDE_DELAY);
  },

  /**
   * Determines if the station at the given index is the cheapest among results.
   * @param {number} index - Index of the station in the results array.
   * @returns {boolean} True if this station has the lowest price.
   */
  isCheapestStation(index) {
    if (!this.results || this.results.length === 0) {
      return false;
    }
    const prices = this.results
      .map((s) => Number(s.fuel_prices?.[0]?.price))
      .filter((p) => Number.isFinite(p));
    if (prices.length === 0) {
      return false;
    }
    const minPrice = Math.min(...prices);
    const stationPrice = Number(this.results[index]?.fuel_prices?.[0]?.price);
    return Number.isFinite(stationPrice) && stationPrice === minPrice;
  },

  /**
   * Calculates the price difference from the cheapest station.
   * @param {number} index - Index of the station in the results array.
   * @returns {string} Formatted price difference (e.g., "+0.002 €" or "Best").
   */
  getPriceDifference(index) {
    if (!this.results || this.results.length === 0) return '';

    const prices = this.results
      .map(s => Number(s.fuel_prices?.[0]?.price))
      .filter(p => Number.isFinite(p));

    if (prices.length === 0) return '';

    const minPrice = Math.min(...prices);
    const stationPrice = Number(this.results[index]?.fuel_prices?.[0]?.price);

    if (!Number.isFinite(stationPrice)) return '';

    const diff = stationPrice - minPrice;

    if (diff === 0) {
      return this.translate('best_price_short', 'Best');
    }

    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(3)} €`;
  },

  /**
   * Formats distance value with unit.
   * @param {number|string} distance - The distance value.
   * @returns {string} Formatted distance (e.g., "2.5 km").
   */
  formatDistance(distance) {
    const num = parseFloat(distance);
    if (isNaN(num)) return distance;
    return `${num.toFixed(1)} km`;
  },

  /**
   * Builds the HTML content for a map marker popup.
   * @param {Object} station - The station object.
   * @param {string} [station.gestore] - The station operator name.
   * @param {string} station.address - The station address.
   * @returns {string} HTML string for the popup.
   */
  buildPopupContent(station) {
    const title =
      station.gestore || this.translate("translation.station", "Gas Station");
    const addressLabel = this.translate("translation.address", "Address");
    return `\n        <div class="map-popup">\n          <strong>${title}</strong><br>\n          <span class="map-popup-address">${addressLabel}: ${station.address}</span>\n        </div>\n      `;
  },

  /**
   * Translation helper with fallback.
   * @param {string} key - Translation key.
   * @param {string} [fallback=""] - Fallback text if translation not found.
   * @returns {string} Translated text or fallback.
   */
  translate(key, fallback = "") {
    if (typeof window.t === "function") {
      return window.t(key, fallback);
    }
    if (typeof i18next !== "undefined" && i18next.t) {
      const translated = i18next.t(key);
      if (translated === key) {
        return fallback || key;
      }
      return translated;
    }
    return fallback || key;
  },

  /**
   * Initializes the global translateFuel helper for template usage.
   * Normalizes fuel type codes to translation keys.
   */
  initTranslateFuelHelper() {
    window.translateFuel = (type) => {
      try {
        const normalized = (type || "").toString();
        const map = {
          gasolio: "diesel",
          diesel: "diesel",
          benzina: "benzina",
          gpl: "GPL",
          GPL: "GPL",
          metano: "metano",
        };
        const key = map[normalized] || normalized;
        if (typeof window.t === "function") {
          return window.t(key, key);
        }
        if (typeof i18next !== "undefined" && i18next.t) {
          const tResult = i18next.t(key);
          if (tResult && tResult !== key) {
            return tResult;
          }
        }
        return key;
      } catch (_e) {
        return type || "";
      }
    };
  },

  /**
   * Sets the application language and persists the choice.
   * @param {string} lang - Language code ('en' or 'it').
   */
  setLanguage(lang) {
    this.safeSetItem("lang", lang);
    // Don't set this.currentLang immediately to avoid partial translations
    if (window.setLang) {
      window.setLang(lang);
    } else if (window.i18next?.changeLanguage) {
      window.i18next.changeLanguage(lang, () => {
        if (window.updateI18nTexts) window.updateI18nTexts();
        window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
      });
    }
  },

  /**
   * Loads an HTML component from a URL and injects it into a container element.
   * Note: This uses innerHTML; ensure templates are trusted.
   * @param {string} url - The URL to fetch the HTML from.
   * @param {string} elementId - The ID of the element to inject into.
   */
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

  /**
   * Initializes the application: loads components, sets up language,
   * event listeners, and prepares the UI.
   */
  async init() {
    try {
      await Promise.all([
        this.loadComponent("/static/templates/header.html", "header-container"),
        this.loadComponent("/static/templates/search.html", "search-container"),
        this.loadComponent("/static/templates/results.html", "results-container"),
        this.loadComponent("/static/templates/map.html", "map-container"),
        this.loadCities(),
      ]);

      this.currentLang =
        this.safeGetItem("lang") || window.i18next?.language || "it";
      if (
        window.i18next?.language &&
        window.i18next.language !== this.currentLang
      ) {
        window.i18next.changeLanguage(this.currentLang);
      }

      window.addEventListener("languageChanged", (event) => {
        const { lang } = event.detail;
        this.currentLang = lang;
        this.reinitializeComponents?.();
        this.refreshMapMarkersOnLanguageChange?.();
        if (window.updateI18nTexts) {
          window.updateI18nTexts();
        }
        // Force a small reactive refresh so dynamic x-text translations are re-evaluated
        this.$nextTick?.(() => {
          this.formData = { ...this.formData };
          this.results = (this.results || []).map((r) => ({ ...r }));
          this.recentSearches = [...this.recentSearches];
          this.updateMap();
        });
      });

      this.loadRecentSearches();
      if (this.recentSearches.length > 0 && this.recentSearches[0].city) {
        this.formData.city = this.recentSearches[0].city;
      }

      this.initTranslateFuelHelper();

      this.$nextTick?.(() => {
        this.initializeComponents();
        if (window.updateI18nTexts) {
          window.updateI18nTexts();
        }
      });
    } catch (error) {
      console.error("Error during initialization:", error);
      this.error = "Failed to initialize application";
    }
  },

  /**
   * Submits the search form to the backend API and updates results.
   * Handles loading states, errors, and map updates.
   */
  async submitForm() {
    this.loading = true;
    this.setLoadingBar(true);
    this.error = "";
    this.searched = true;
    this.saveRecentSearch({ ...this.formData });
    const fuelToSend =
      this.formData.fuel === "diesel" ? "gasolio" : this.formData.fuel;
    try {
      const response = await fetch(window.CONFIG.SEARCH_API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: this.formData.city,
          radius: Number.parseInt(
            this.formData.radius,
            window.CONFIG.PARSE_INT_RADIX,
          ),
          fuel: fuelToSend,
          results: Number.parseInt(
            this.formData.results,
            window.CONFIG.PARSE_INT_RADIX,
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
        this.results =
          data.stations?.map((station) => ({
            ...station,
            gestore: window.extractGestore(station),
            distance: station.distance || "",
          })) || [];
        this.error = "";
      }
      this.$nextTick?.(() => {
        this.updateMap();
        if (window.updateI18nTexts) {
          window.updateI18nTexts();
        }
      });
    } catch (err) {
      this.error = err.message;
      this.results = [];
      this.debug("Search failed:", err.message);
    } finally {
      this.loading = false;
      this.setLoadingBar(false);
    }
  },

  /**
   * Updates the map with current markers and bounds.
   * Initializes map if needed.
   */
  updateMap() {
    if (!this.mapInitialized) {
      this.initMap?.();
    }
    if (!this.map) {
      return;
    }
    this.clearMapMarkers?.();
    if (this.results?.length > 0) {
      this.addMapMarkers?.();
    }
  },
};
