/**
 * Interaction / form / results logic previously in `app.ui.ts`.
 */
// @ts-nocheck

Object.assign(window.appUiMixin, {
  setFuelType(fuel: string): void {
    this.formData.fuel = fuel;
    Promise.resolve().then(() => {
      this.debug?.("Fuel type updated to:", this.formData.fuel);
      if (this.formData.city) {
        if (this._fuelChangeTimeout) clearTimeout(this._fuelChangeTimeout);
        this._fuelChangeTimeout = setTimeout(() => this.submitForm(), window.CONFIG.DEBOUNCE_DELAY_MS);
      }
    });
  },

  isFuelSelected(fuel: string): boolean {
    return this.formData.fuel === fuel;
  },

  onCityInput(): void {
    const value = (this.formData.city || "").trim().toLowerCase();
    if (value.length === 0) {
      this.filteredCities = [];
      this.showCitySuggestions = false;
      this.updateCitySuggestionsUI();
      return;
    }
    this.filteredCities = this.cityList.filter((c) => c.toLowerCase().startsWith(value));
    this.showCitySuggestions = this.filteredCities.length > 0;
    this.updateCitySuggestionsUI();
  },

  updateCitySuggestionsUI(): void {
    const suggestions = document.getElementById("city-suggestions");
    if (!suggestions) return;
    if (!this.showCitySuggestions || this.filteredCities.length === 0) {
      suggestions.classList.add("hidden");
      suggestions.innerHTML = "";
      return;
    }
    suggestions.innerHTML = "";
    for (const city of this.filteredCities.slice(0, 15)) {
      const item = document.createElement("li");
      item.className = "autocomplete-item px-3 py-2 cursor-pointer text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]";
      item.setAttribute("role", "option");
      item.textContent = city;
      item.addEventListener("mousedown", (e) => { e.preventDefault(); this.selectCity(city); });
      suggestions.appendChild(item);
    }
    suggestions.classList.remove("hidden");
  },

  selectCity(city: string): void {
    this.formData.city = city;
    this.filteredCities = [];
    this.showCitySuggestions = false;
    this.updateSearchFormUI?.();
    this.updateSearchButtonUI?.();
  },

  hideCitySuggestions(): void {
    setTimeout(() => { this.showCitySuggestions = false; this.updateCitySuggestionsUI(); }, window.CONFIG.CITY_SUGGESTION_HIDE_DELAY);
  },

  handleCityKeydown(e: KeyboardEvent): void {
    const suggestions = document.getElementById("city-suggestions");
    const suggestionsHidden = !suggestions || suggestions.classList.contains("hidden");
    if (suggestionsHidden) {
      if (e.key === "Enter") { e.preventDefault(); if (this.formData.city) this.submitForm(); }
      return;
    }

    const items = suggestions.querySelectorAll(".autocomplete-item");
    let highlightedIndex = -1;
    items.forEach((item, idx) => { if (item.classList.contains("bg-[var(--bg-elevated)]")) highlightedIndex = idx; });

    if (e.key === "Escape") {
      this.showCitySuggestions = false;
      this.updateCitySuggestionsUI();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.filteredCities.length > 0) {
        highlightedIndex = Math.min(highlightedIndex + 1, this.filteredCities.length - 1);
        this.updateHighlightedCity(highlightedIndex);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.filteredCities.length > 0) {
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        this.updateHighlightedCity(highlightedIndex);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && this.filteredCities[highlightedIndex]) {
        this.selectCity(this.filteredCities[highlightedIndex]);
      } else if (this.formData.city) {
        this.submitForm();
      }
    }
  },

  updateHighlightedCity(index: number): void {
    const suggestions = document.getElementById("city-suggestions");
    if (!suggestions) return;
    const items = suggestions.querySelectorAll(".autocomplete-item");
    items.forEach((item, idx) => { item.classList.toggle("bg-[var(--bg-elevated)]", idx === index); });
  },

  updateRecentSearchesUI(): void {
    const container = document.getElementById("recent-searches-container");
    const list = document.getElementById("recent-searches-list");
    if (!(container && list)) return;

    if (this.recentSearches.length > 0) {
      container.classList.remove("hidden");
      list.innerHTML = "";
      this.recentSearches.forEach((search, idx) => {
        const btn = document.createElement("button");
        btn.className = "recent-search-btn flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-full px-3 py-2 text-sm text-[var(--text-secondary)] cursor-pointer transition-all duration-150 min-h-10 hover:bg-[var(--bg-surface)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";
        btn.type = "button";
        btn.innerHTML = `\n          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <circle cx="12" cy="12" r="10"></circle>\n            <polyline points="12 6 12 16 16 14"></polyline>\n </svg>\n          <span>${search.city}, ${search.radius}km, ${window.translateFuel ? window.translateFuel(search.fuel) : search.fuel}</span>\n        `;
        btn.addEventListener("click", () => this.selectRecentSearch(search));
        list.appendChild(btn);
      });
    } else {
      container.classList.add("hidden");
    }
  },

  updateFuelTypeUI(): void {
    const fuels = ["benzina", "gasolio", "GPL", "metano"];
    fuels.forEach((fuel) => {
      const btn = document.getElementById(`fuel-${fuel}`);
      if (btn) {
        const isSelected = this.formData.fuel === fuel;
        btn.classList.toggle("active", isSelected);
        btn.classList.toggle("text-white", isSelected);
        if (isSelected) btn.classList.add("border-[var(--color-primary)]"); else btn.classList.remove("border-[var(--color-primary)]");

        const textEl = document.getElementById(`fuel-${fuel}-text`);
        if (textEl) {
          const label = typeof window.translateFuel === "function" ? window.translateFuel(fuel) : typeof i18next !== "undefined" && i18next.t ? i18next.t(fuel) : fuel;
          if (this.debugMode) console.debug("updateFuelTypeUI ->", fuel, "=>", label);
          textEl.textContent = label;
        }
      }
    });
  },

  updateSearchFormUI(): void {
    const radiusInput = document.getElementById("radius-input") as HTMLInputElement | null;
    const fuelInput = document.getElementById("fuel-input") as HTMLInputElement | null;
    const radiusSlider = document.getElementById("radius-slider") as HTMLInputElement | null;
    const resultsSlider = document.getElementById("results-slider") as HTMLInputElement | null;
    const radiusValue = document.getElementById("radius-value");
    const resultsValue = document.getElementById("results-value");
    const submitBtn = document.getElementById("search-submit") as HTMLButtonElement | null;

    if (radiusInput) radiusInput.value = this.formData.radius;
    if (fuelInput) fuelInput.value = this.formData.fuel;
    if (radiusSlider) radiusSlider.value = this.formData.radius;
    if (resultsSlider) resultsSlider.value = this.formData.results;
    if (radiusValue) radiusValue.textContent = this.formData.radius + "km";
    if (resultsValue) resultsValue.textContent = this.formData.results;
    if (submitBtn) submitBtn.disabled = this.loading || !this.formData.city;
  },

  updateSearchButtonUI(): void {
    const submitBtn = document.getElementById("search-submit") as HTMLButtonElement | null;
    const btnText = document.getElementById("search-btn-text");
    const loadingSpinner = document.getElementById("loading-spinner");
    const loadingText = document.getElementById("loading-text");

    if (submitBtn) submitBtn.disabled = this.loading || !this.formData.city;

    if (this.loading) {
      btnText?.classList.add("hidden");
      loadingSpinner?.classList.remove("hidden");
      if (loadingText) loadingText.textContent = window.t ? window.t("loading", "Caricamento...") : "Caricamento...";
    } else {
      btnText?.classList.remove("hidden");
      loadingSpinner?.classList.add("hidden");
      if (btnText) btnText.textContent = window.t ? window.t("search", "Cerca") : "Cerca";
    }
  },

  updateResultsUI(): void {
    const skeletonLoader = document.getElementById("skeleton-loader");
    const emptyState = document.getElementById("empty-state");
    const resultsSection = document.getElementById("results-section");
    const errorMessage = document.getElementById("error-message");
    const errorText = document.getElementById("error-text");

    if (this.loading && this.results.length === 0) {
      skeletonLoader?.classList.remove("hidden");
      emptyState?.classList.add("hidden");
      resultsSection?.classList.add("hidden");
      errorMessage?.classList.add("hidden");
    } else {
      skeletonLoader?.classList.add("hidden");
    }

    if (!this.loading && this.results.length === 0 && this.searched && !this.error) {
      emptyState?.classList.remove("hidden");
      resultsSection?.classList.add("hidden");
      errorMessage?.classList.add("hidden");
    } else if (this.results.length > 0) {
      emptyState?.classList.add("hidden");
      resultsSection?.classList.remove("hidden");
      errorMessage?.classList.add("hidden");
      this.renderResults();
    }

    if (this.error) {
      errorMessage?.classList.remove("hidden");
      if (errorText) errorText.textContent = this.error;
      skeletonLoader?.classList.add("hidden");
      emptyState?.classList.add("hidden");
      resultsSection?.classList.add("hidden");
    }
  },

  /**
   * Render the list of station cards into the results container.
   */
  renderResults(): void {
    const list = document.getElementById("stations-list");
    if (!list) return;

    list.innerHTML = "";
    this.results.forEach((station, index) => {
      const article = document.createElement("article");
      const fuelType = station.fuel_prices?.[0]?.type || "";
      const price = station.fuel_prices?.[0]?.price || 0;
      const isCheapest = this.isCheapestStation(index);
      const fuelColorClass = this.getFuelColorClass(fuelType);

      article.className = "station-card bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-md transition-all duration-150 cursor-pointer relative min-h-[180px] hover:translate-y-[-2px] hover:shadow-xl hover:border-[var(--color-primary)]";
      article.setAttribute("tabindex", "0");
      article.setAttribute("aria-label", `${station.gestore || this.translate("station", "Gas Station")}, ${this.formatCurrency(price)}`);

      article.innerHTML = `\n        <div class="station-card-header mb-4 min-w-0">\n          <div class="flex items-center justify-between gap-4 mb-2">\n            <div class="station-brand flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)] min-w-0 flex-1">\n              <div class="station-icon w-8 h-8 bg-[var(--color-primary-light)] rounded-lg flex items-center justify-center text-[var(--color-primary-dark)]">\n                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>\n                  <path d="M2 17l10 5 10-5"></path>\n                  <path d="M2 12l10 5 10-5"></path>\n                </svg>\n              </div>\n              <span class="truncate overflow-hidden text-ellipsis whitespace-nowrap">${station.gestore || this.translate("station", "Gas Station")}</span>\n            </div>\n            <div class="station-price flex flex-row items-center gap-2 flex-nowrap">\n              ${station.fuel_prices && station.fuel_prices.length > 0 ? `\n                <span class="uppercase tracking-wide text-sm ${fuelColorClass}">${window.translateFuel ? window.translateFuel(fuelType) : fuelType}</span>\n                <span class="text-2xl font-bold text-[var(--color-primary)]">${this.formatCurrency(price)}</span>\n              ` : ""}\n            </div>\n          </div>\n          <div class="flex items-center justify-end gap-3 pl-[calc(8px+2rem)]">\n            ${isCheapest ? `<span class="inline-block bg-[var(--color-primary)] text-[#002c18] px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide animate-pulse-badge whitespace-nowrap">${this.translate("best_price", "Miglior Prezzo!")}</span>` : ""}\n            ${station.fuel_prices && station.fuel_prices.length > 0 && !isCheapest ? `<span class="text-sm text-red-500 font-medium">${this.getPriceDifference(index)}</span>` : ""}\n            ${station.distance ? `<span class="flex items-center gap-1 text-sm text-[var(--text-muted)]">\n              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                <circle cx="12" cy="12" r="10"></circle>\n                <polyline points="12 6 12 12 16 14"></polyline>\n              </svg>\n              ${this.formatDistance(station.distance)}\n            </span>` : ""}\n          </div>\n        </div>\n        <div class="station-card-body flex flex-col gap-2">\n          <div class="station-address-row flex items-start gap-2 text-sm text-[var(--text-secondary)] break-word overflow-wrap-break-word">\n            <svg class="address-icon w-4 h-4 text-[var(--text-muted)] mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>\n              <circle cx="12" cy="10" r="3"></circle>\n            </svg>\n            <span class="break-word overflow-wrap-break-word leading-relaxed max-w-full">${station.address || ""}</span>\n          </div>\n          <div class="station-actions-row flex gap-2 mt-4 pt-4 border-t border-[var(--border-color)]">\n            <button class="btn btn-primary flex-1 min-w-0 whitespace-nowrap bg-[var(--color-primary)] text-white border-none rounded-lg py-2 px-3 text-sm font-semibold cursor-pointer transition-all duration-150 inline-flex items-center justify-center hover:bg-[var(--color-primary-hover)] hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:transform-none ${!(station.latitude && station.longitude) ? "disabled" : ""}" data-action="directions" data-id="${station.id}">\n              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                <path d="M9 18l6-6-6-6"></path>\n              </svg>\n              <span>${this.translate("navigate", "Navigate")}</span>\n            </button>\n            <button class="btn btn-secondary flex-1 min-w-0 whitespace-nowrap bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg py-2 px-3 text-sm font-semibold cursor-pointer transition-all duration-150 inline-flex items-center justify-center hover:bg-[var(--bg-surface)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed ${!(station.latitude && station.longitude) ? "disabled" : ""}" data-action="show-map" data-id="${station.id}">\n              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>\n                <circle cx="12" cy="10" r="3"></circle>\n              </svg>\n              <span>${this.translate("show_on_map", "Show on Map")}</span>\n            </button>\n          </div>\n        </div>\n      `;

      article.addEventListener("click", () => this.selectStationForMap(station.id));
      article.addEventListener("keyup", (e) => { if (e.key === "Enter") this.selectStationForMap(station.id); });

      list.appendChild(article);
    });

    const actionButtons = list.querySelectorAll("button[data-action]");
    for (const btnEl of Array.from(actionButtons) as HTMLButtonElement[]) {
      btnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btnEl.getAttribute("data-action");
        const id = btnEl.getAttribute("data-id");
        if (action === "directions") {
          const station = this.results.find((s) => String(s.id) === id);
          if (station) this.getDirections(station);
        } else if (action === "show-map") {
          this.selectStationForMap(id);
        }
      });
    }
  },

  isCheapestStation(index: number): boolean {
    if (!this.results || this.results.length === 0) return false;
    const prices = this.results.map((s) => Number(s.fuel_prices?.[0]?.price)).filter((p): p is number => Number.isFinite(p));
    if (prices.length === 0) return false;
    const minPrice = Math.min(...prices);
    const stationPrice = Number(this.results[index]?.fuel_prices?.[0]?.price);
    return Number.isFinite(stationPrice) && stationPrice === minPrice;
  },

  /**
   * Return the price difference of the station at `index` compared to the lowest price.
   * Accepts `index` as number or numeric string.
   */
  getPriceDifference(index: number | string): string {
    const idx = typeof index === "number" ? index : Number.parseInt(String(index), 10);
    if (!this.results || this.results.length === 0) return "";
    const prices = this.results.map((s) => Number(s.fuel_prices?.[0]?.price)).filter((p): p is number => Number.isFinite(p));
    if (prices.length === 0) return "";
    const minPrice = Math.min(...prices);
    const stationPrice = Number(this.results[idx]?.fuel_prices?.[0]?.price);
    if (!Number.isFinite(stationPrice)) return "";
    const diff = stationPrice - minPrice;
    if (diff === 0) return this.translate("best_price_short", "Best");
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(3)} €`;
  },

  /**
   * Initialize UI components, load templates and attach event listeners.
   * This is the primary entry point called on page load.
   */
  async init(): Promise<void> {
    try {
      this.placeMapAccordingToViewport?.();

      await Promise.all([
        this.loadComponent("/static/templates/header.html", "header-container"),
        this.loadComponent("/static/templates/search.html", "search-container"),
        this.loadComponent("/static/templates/results.html", "results-container"),
        this.loadComponent("/static/templates/map.html", "map-container"),
        this.loadCities(),
      ]);

      this.placeMapAccordingToViewport?.();

      this.currentLang = this.safeGetItem("lang") || window.i18next?.language || "it";
      if (window.i18next?.language && window.i18next.language !== this.currentLang) {
        if (window.i18next.changeLanguage) window.i18next.changeLanguage(this.currentLang);
      }

      this.updateThemeUI?.();
      this.updateLanguageUI?.();
      this.updateReloadButtonUI?.();
      this.updateCsvStatusUI?.();
      this.updateFuelTypeUI?.();
      this.updateSearchFormUI?.();
      this.updateSearchButtonUI?.();
      this.updateRecentSearchesUI?.();

      window.addEventListener("languageChanged", (e) => {
        const ev = e as CustomEvent<{ lang: string }>;
        const { lang } = ev.detail;
        this.currentLang = lang;
        this.reinitializeComponents?.();
        this.refreshMapMarkersOnLanguageChange?.();
        if (window.updateI18nTexts) window.updateI18nTexts();
        this.updateThemeUI?.();
        this.updateLanguageUI?.();
        this.updateFuelTypeUI?.();
        setTimeout(() => this.updateFuelTypeUI?.(), 50);
        this.updateSearchFormUI?.();
        this.updateRecentSearchesUI?.();
        this.updateResultsUI?.();
        this.updateMap?.();
      });

      this.loadRecentSearches?.();
      this.updateRecentSearchesUI?.();
      if (this.recentSearches.length > 0 && this.recentSearches[0].city) {
        this.formData.city = this.recentSearches[0].city;
        this.updateSearchFormUI?.();
        this.updateSearchButtonUI?.();
      }

      this.initTranslateFuelHelper?.();

      Promise.resolve().then(() => {
        this.initializeComponents?.();
        if (window.updateI18nTexts) window.updateI18nTexts();
      });

      this.fetchCsvStatus()?.then((status) => { this.csvLastUpdated = status.last_updated; });

      if (this.csvStatusInterval) clearInterval(this.csvStatusInterval);
      this.csvStatusInterval = setInterval(() => { this.fetchCsvStatus()?.then((status) => { this.csvLastUpdated = status.last_updated; }); }, window.CONFIG.CSV_AUTO_REFRESH_INTERVAL_MS);
    } catch (error) {
      console.error("Error during initialization:", error);
      this.error = "Failed to initialize application";
    }
  },

  /**
   * Submit search form to backend API and update UI with results.
   */
  async submitForm(): Promise<void> {
    this.loading = true;
    this.setLoadingBar?.(true);
    this.error = "";
    this.searched = true;
    this.saveRecentSearch?.({ ...this.formData });
    const fuelToSend = this.formData.fuel === "diesel" ? "gasolio" : this.formData.fuel;

    const controller = new AbortController();
    const timeoutMs = window.CONFIG.SEARCH_TIMEOUT_MS || 12000;
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(window.CONFIG.SEARCH_API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          city: this.formData.city,
          radius: Number.parseInt(this.formData.radius, window.CONFIG.PARSE_INT_RADIX),
          fuel: fuelToSend,
          results: Number.parseInt(this.formData.results, window.CONFIG.PARSE_INT_RADIX),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.warning) {
        this.error = data.warning;
        this.results = [];
      } else {
        this.results = (data.stations as Station[] | undefined)?.map((station: Station) => ({ ...station, gestore: window.extractGestore(station), distance: station.distance || "" })) || [];
        this.error = "";
      }

      this.updateResultsUI?.();
      Promise.resolve().then(() => { this.updateMap?.(); if (window.updateI18nTexts) window.updateI18nTexts(); });
    } catch (err) {
      if ((err as Error & { name?: string }).name === "AbortError") this.error = "Request timed out. Please try again."; else this.error = err instanceof Error ? err.message : "Unknown error";
      this.results = [];
      this.debug?.("Search failed:", this.error);
      this.updateResultsUI?.();
    } finally {
      clearTimeout(timeoutHandle);
      this.loading = false;
      this.setLoadingBar?.(false);
      this.updateSearchButtonUI?.();
      this.updateResultsUI?.();
    }
  },

  placeMapAccordingToViewport(): void {
    try {
      const mapContainer = document.getElementById("map-container");
      const mapColumn = document.getElementById("map-column");
      const searchColumn = document.getElementById("search-column");
      const resultsContainer = document.getElementById("results-container");
      const isMobile = window.matchMedia("(max-width: 1023px)").matches;
      if (!(mapContainer && searchColumn)) return;
      if (isMobile) {
        if (mapContainer.parentElement !== searchColumn) {
          if (resultsContainer && resultsContainer.parentElement === searchColumn) searchColumn.insertBefore(mapContainer, resultsContainer); else searchColumn.appendChild(mapContainer);
          mapContainer.classList.remove("hidden");
          mapContainer.style.display = "";
        }
      } else {
        if (mapColumn && mapContainer.parentElement !== mapColumn) {
          mapColumn.appendChild(mapContainer);
          mapContainer.classList.remove("hidden");
          mapContainer.style.display = "";
        }
      }

      setTimeout(() => { (this.map as { invalidateSize?: () => void })?.invalidateSize?.(); this.initMap?.(); }, 100);
    } catch (err) {
      console.debug("placeMapAccordingToViewport failed:", err);
    }
  },

  updateMap(): void {
    if (this.mapInitialized) {
      const mapContainer = document.getElementById("map");
      if (!mapContainer) {
        this.mapInitialized = false;
        this.map = null;
        this.initMap?.();
      }
    } else {
      this.initMap?.();
    }
    if (!this.map) return;
    this.clearMapMarkers?.();
    if (this.results?.length > 0) this.addMapMarkers?.();
  },
} as Partial<AppUiMixin>);