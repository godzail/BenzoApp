// UI helpers, init and search flow (split from app.js)
window.appUiMixin = {
  formatCurrency(value) {
    return new Intl.NumberFormat(window.CONFIG.CURRENCY_LOCALE, {
      style: "currency",
      currency: window.CONFIG.CURRENCY_CODE,
      minimumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
      maximumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
    }).format(value);
  },

  debug(message, data = null) {
    if (this.debugMode) console.log("[DEBUG]", message, data || "");
  },

  safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  },

  safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_e) {
      // ignore storage errors
    }
  },

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

  initializeComponents() {
    window.themeManager.init();
    this.currentTheme =
      document.documentElement.getAttribute("data-theme") ||
      window.CONFIG.DEFAULT_THEME;
    const progressEl = document.getElementById("loading-bar");
    if (progressEl) this.loadingBar = progressEl;
    this.initializeResizer();
  },

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

  toggleTheme() {
    this.currentTheme = window.themeManager.toggle();
    this.debug("Theme toggled to:", this.currentTheme);
  },

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
        }, 100);
      }
    });
  },

  isFuelSelected(fuel) {
    return this.formData.fuel === fuel;
  },

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

  selectCity(city) {
    this.formData.city = city;
    this.filteredCities = [];
    this.showCitySuggestions = false;
  },

  hideCitySuggestions() {
    setTimeout(() => {
      this.showCitySuggestions = false;
    }, window.CONFIG.CITY_SUGGESTION_HIDE_DELAY);
  },

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

  buildPopupContent(station) {
    const title =
      station.gestore || this.translate("translation.station", "Gas Station");
    const addressLabel = this.translate("translation.address", "Address");
    return `\n        <div class="map-popup">\n          <strong>${title}</strong><br>\n          <span class="map-popup-address">${addressLabel}: ${station.address}</span>\n        </div>\n      `;
  },

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

  // Global helper to normalize internal fuel codes and return translated label
  // Exposed on window as `translateFuel` for templates to use.
  // Maps internal codes like 'gasolio' to canonical translation keys such as 'diesel'.
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

  async init() {
    try {
      await Promise.all([
        this.loadComponent("/static/templates/header.html", "header-container"),
        this.loadComponent("/static/templates/search.html", "search-container"),
        this.loadComponent(
          "/static/templates/results.html",
          "results-container",
        ),
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
