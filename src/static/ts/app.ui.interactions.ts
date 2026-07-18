/**
 * Interaction / form / results logic previously in `app.ui.ts`.
 */
// @ts-nocheck

import { escapeHtml } from "./app.ui.helpers.js";

function getFuelIcon(type: string, size = 14): string {
  const attrs = `aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"`;
  const key = type.toLowerCase();
  if (key.includes("gasolio") || key.includes("diesel")) {
    return `<svg ${attrs}><path d="M4 16h16"></path><path d="M6 16l2-8h8l2 8"></path><path d="M8 20h8"></path><path d="M10 4h4"></path></svg>`;
  }
  if (key.includes("gpl") || key.includes("lpg")) {
    return `<svg ${attrs}><rect x="5" y="6" width="14" height="12" rx="4"></rect><path d="M9 6V4h6v2"></path><path d="M9 18v2h6v-2"></path></svg>`;
  }
  if (key.includes("metano") || key.includes("methane")) {
    return `<svg ${attrs}><path d="M12 3c3 3 5 6 5 10a5 5 0 0 1-10 0c0-4 2-7 5-10z"></path><path d="M9 14a3 3 0 0 0 6 0"></path></svg>`;
  }
  return `<svg ${attrs}><path d="M3 22h12"></path><path d="M5 22V5a2 2 0 0 1 2-2h6v19"></path><path d="M9 7h2"></path><path d="M15 9h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2"></path></svg>`;
}

Object.assign(window.appUiMixin, {
  setFuelType(fuel: string): void {
    this.formData.fuel = fuel;
    Promise.resolve().then(() => {
      this.debug?.("Fuel type updated to:", this.formData.fuel);
      if (this.formData.city) {
        if (this._fuelChangeTimeout) clearTimeout(this._fuelChangeTimeout);
        this._fuelChangeTimeout = setTimeout(
          () => this.submitForm(),
          window.CONFIG.DEBOUNCE_DELAY_MS,
        );
      }
    });
  },

  isFuelSelected(fuel: string): boolean {
    return this.formData.fuel === fuel;
  },

  onCityInput(): void {
    // Manual typing invalidates one-shot locate-me state; otherwise stale
    // coordinates silently override the city because the backend prefers them.
    this.formData.latitude = null;
    this.formData.longitude = null;
    this.userLocation = null;
    const value = (this.formData.city || "").trim().toLowerCase();
    if (value.length === 0) {
      this.filteredCities = [];
      this.showCitySuggestions = false;
      this.updateCitySuggestionsUI();
      return;
    }
    this.filteredCities = this.cityList.filter((c) =>
      c.toLowerCase().startsWith(value),
    );
    this.showCitySuggestions = this.filteredCities.length > 0;
    this.updateCitySuggestionsUI();
  },

  updateCitySuggestionsUI(): void {
    const suggestions = document.getElementById("city-suggestions");
    const cityInput = document.getElementById(
      "city",
    ) as HTMLInputElement | null;
    if (!suggestions) return;
    if (!this.showCitySuggestions || this.filteredCities.length === 0) {
      suggestions.classList.add("hidden");
      suggestions.innerHTML = "";
      suggestions.setAttribute("aria-hidden", "true");
      cityInput?.setAttribute("aria-expanded", "false");
      cityInput?.removeAttribute("aria-activedescendant");
      return;
    }
    suggestions.innerHTML = "";
    for (const [index, city] of this.filteredCities.slice(0, 15).entries()) {
      const item = document.createElement("div");
      item.className =
        "autocomplete-item px-3 py-2 cursor-pointer text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]";
      item.id = `city-suggestion-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.textContent = city;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.selectCity(city);
      });
      suggestions.appendChild(item);
    }
    suggestions.classList.remove("hidden");
    suggestions.setAttribute("aria-hidden", "false");
    cityInput?.setAttribute("aria-expanded", "true");
  },

  selectCity(city: string): void {
    this.formData.city = city;
    // Clear coords when an explicit city is chosen (locate-me was a one-shot).
    this.formData.latitude = null;
    this.formData.longitude = null;
    this.userLocation = null;
    this.filteredCities = [];
    this.showCitySuggestions = false;
    this.updateCitySuggestionsUI();
    this.updateSearchFormUI?.();
    this.updateSearchButtonUI?.();
  },

  hideCitySuggestions(): void {
    setTimeout(() => {
      this.showCitySuggestions = false;
      this.updateCitySuggestionsUI();
    }, window.CONFIG.CITY_SUGGESTION_HIDE_DELAY);
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: key handling is a compact state machine.
  handleCityKeydown(e: KeyboardEvent): void {
    const suggestions = document.getElementById("city-suggestions");
    const suggestionsHidden =
      !suggestions || suggestions.classList.contains("hidden");
    if (suggestionsHidden) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (this.formData.city) this.submitForm();
      }
      return;
    }

    const items = suggestions.querySelectorAll(".autocomplete-item");
    const renderedCount = items.length;
    let highlightedIndex = -1;
    for (const [idx, item] of Array.from(items).entries()) {
      if (item.classList.contains("bg-[var(--bg-elevated)]"))
        highlightedIndex = idx;
    }

    if (e.key === "Escape") {
      this.showCitySuggestions = false;
      this.updateCitySuggestionsUI();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (renderedCount > 0) {
        const start = highlightedIndex < 0 ? 0 : highlightedIndex + 1;
        const next = start >= renderedCount ? 0 : start;
        this.updateHighlightedCity(next);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (renderedCount > 0) {
        const prev =
          highlightedIndex <= 0 ? renderedCount - 1 : highlightedIndex - 1;
        this.updateHighlightedCity(prev);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && items[highlightedIndex]) {
        const selectedEl = items[highlightedIndex] as HTMLElement;
        const city = selectedEl.textContent || "";
        if (city) this.selectCity(city);
      } else if (this.formData.city) {
        this.submitForm();
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      if (renderedCount > 0) this.updateHighlightedCity(0);
    } else if (e.key === "End") {
      e.preventDefault();
      if (renderedCount > 0) this.updateHighlightedCity(renderedCount - 1);
    }
  },

  updateHighlightedCity(index: number): void {
    const suggestions = document.getElementById("city-suggestions");
    if (!suggestions) return;
    const items = suggestions.querySelectorAll(".autocomplete-item");
    for (const [idx, item] of Array.from(items).entries()) {
      const selected = idx === index;
      item.classList.toggle("bg-[var(--bg-elevated)]", selected);
      item.setAttribute("aria-selected", selected ? "true" : "false");
    }
    const cityInput = document.getElementById("city");
    const selected = items[index];
    if (selected?.id)
      cityInput?.setAttribute("aria-activedescendant", selected.id);
  },

  updateRecentSearchesUI(): void {
    const container = document.getElementById("recent-searches-container");
    const list = document.getElementById("recent-searches-list");
    if (!(container && list)) return;

    if (this.recentSearches.length > 0) {
      container.classList.remove("hidden");
      list.innerHTML = "";
      this.recentSearches.forEach((search, _idx) => {
        const btn = document.createElement("button");
        btn.className =
          "recent-search-btn flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-full px-3 py-2 text-sm text-[var(--text-secondary)] cursor-pointer transition-all duration-150 min-h-10 hover:bg-[var(--bg-surface)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";
        btn.type = "button";
        // Static SVG markup is safe; user-supplied city/fuel go through textContent.
        btn.innerHTML = `\n          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <circle cx="12" cy="12" r="10"></circle>\n            <polyline points="12 6 12 16 16 14"></polyline>\n </svg>`;
        const fuelLabel = window.translateFuel
          ? window.translateFuel(search.fuel)
          : search.fuel;
        const label = document.createElement("span");
        label.textContent = `${search.city}, ${search.radius}km, ${fuelLabel}`;
        btn.appendChild(label);
        btn.addEventListener("click", () => this.selectRecentSearch(search));
        list.appendChild(btn);
      });
    } else {
      container.classList.add("hidden");
    }
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: direct chip state update is shorter than helper churn.
  updateFuelTypeUI(): void {
    const fuels = ["benzina", "gasolio", "GPL", "metano"];
    for (const fuel of fuels) {
      const btn = document.getElementById(`fuel-${fuel}`);
      if (btn) {
        const isSelected = this.formData.fuel === fuel;
        btn.classList.toggle("active", isSelected);
        btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        if (isSelected) btn.classList.add("border-[var(--color-primary)]");
        else btn.classList.remove("border-[var(--color-primary)]");

        const textEl = document.getElementById(`fuel-${fuel}-text`);
        if (textEl) {
          const label =
            typeof window.translateFuel === "function"
              ? window.translateFuel(fuel)
              : typeof i18next !== "undefined" && i18next.t
                ? i18next.t(fuel)
                : fuel;
          if (this.debugMode)
            console.debug("updateFuelTypeUI ->", fuel, "=>", label);
          textEl.textContent = label;
        }
      }
    }
  },

  /**
   * Update the language selector buttons' visual and ARIA state.
   */
  updateLanguageUI(): void {
    try {
      const en = document.getElementById("lang-en");
      const it = document.getElementById("lang-it");
      if (!(en && it)) return;
      const enSelected = String(this.currentLang || "").startsWith("en");
      en.classList.toggle("active", enSelected);
      it.classList.toggle("active", !enSelected);
      en.setAttribute("aria-pressed", enSelected ? "true" : "false");
      it.setAttribute("aria-pressed", !enSelected ? "true" : "false");
    } catch (err) {
      this.debug?.("updateLanguageUI failed:", err);
    }
  },

  updateSearchFormUI(): void {
    const cityInput = document.getElementById(
      "city",
    ) as HTMLInputElement | null;
    const radiusInput = document.getElementById(
      "radius-input",
    ) as HTMLInputElement | null;
    const fuelInput = document.getElementById(
      "fuel-input",
    ) as HTMLInputElement | null;
    const radiusSlider = document.getElementById(
      "radius-slider",
    ) as HTMLInputElement | null;
    const resultsSlider = document.getElementById(
      "results-slider",
    ) as HTMLInputElement | null;
    const radiusValue = document.getElementById("radius-value");
    const resultsValue = document.getElementById("results-value");
    const radiusLabel = document.getElementById("radius-label");
    const resultsLabel = document.getElementById("results-label");
    const submitBtn = document.getElementById(
      "search-submit",
    ) as HTMLButtonElement | null;

    if (cityInput) cityInput.value = this.formData.city;
    if (radiusInput) radiusInput.value = this.formData.radius;
    if (fuelInput) fuelInput.value = this.formData.fuel;
    if (radiusSlider) radiusSlider.value = this.formData.radius;
    if (resultsSlider) resultsSlider.value = this.formData.results;
    if (radiusValue) radiusValue.textContent = `${this.formData.radius}km`;
    if (resultsValue) resultsValue.textContent = this.formData.results;
    radiusSlider?.setAttribute("aria-valuetext", `${this.formData.radius} km`);
    resultsSlider?.setAttribute(
      "aria-valuetext",
      `${this.formData.results} ${this.translate("results_heading", "Results")}`,
    );
    if (radiusLabel)
      radiusLabel.textContent = this.translate(
        "search_radius",
        "Raggio di Ricerca",
      );
    if (resultsLabel)
      resultsLabel.textContent = this.translate(
        "max_results",
        "Limite Risultati",
      );
    if (submitBtn) submitBtn.disabled = this.loading || !this.formData.city;
  },

  updateSearchButtonUI(): void {
    const submitBtn = document.getElementById(
      "search-submit",
    ) as HTMLButtonElement | null;
    const btnText = document.getElementById("search-btn-text");
    const loadingSpinner = document.getElementById("loading-spinner");
    const loadingText = document.getElementById("loading-text");

    if (submitBtn) submitBtn.disabled = this.loading || !this.formData.city;

    if (this.loading) {
      btnText?.classList.add("hidden");
      loadingSpinner?.classList.remove("hidden");
      if (loadingText)
        loadingText.textContent = window.t
          ? window.t("loading", "Caricamento...")
          : "Caricamento...";
    } else {
      btnText?.classList.remove("hidden");
      loadingSpinner?.classList.add("hidden");
      if (btnText)
        btnText.textContent = window.t ? window.t("search", "Cerca") : "Cerca";
    }
  },

  updateResultsUI(): void {
    const skeletonLoader = document.getElementById("skeleton-loader");
    const emptyState = document.getElementById("empty-state");
    const resultsSection = document.getElementById("results-section");
    const errorMessage = document.getElementById("error-message");
    const errorText = document.getElementById("error-text");
    const resultsPanel = document.getElementById("results");

    if (this.loading && this.results.length === 0) {
      skeletonLoader?.classList.remove("hidden");
      emptyState?.classList.add("hidden");
      resultsSection?.classList.add("hidden");
      errorMessage?.classList.add("hidden");
    } else {
      skeletonLoader?.classList.add("hidden");
    }

    // While a refresh is in flight and we already have results, dim the panel
    // so the user can see something is updating (skeleton alone would feel like
    // results disappeared).
    if (resultsPanel) {
      resultsPanel.classList.toggle(
        "is-refreshing",
        this.loading && this.results.length > 0,
      );
    }

    if (
      !this.loading &&
      this.results.length === 0 &&
      this.searched &&
      !this.error
    ) {
      emptyState?.classList.remove("hidden");
      resultsSection?.classList.add("hidden");
      errorMessage?.classList.add("hidden");
      this.renderEmptyActions();
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
   * Populate the empty-state quick-action chips (e.g. "Increase radius", "Switch fuel").
   */
  renderEmptyActions(): void {
    const container = document.getElementById("empty-actions");
    if (!container) return;
    container.innerHTML = "";
    const currentRadius = Number.parseInt(
      this.formData.radius,
      window.CONFIG.PARSE_INT_RADIX,
    );
    const actions: Array<{ label: string; onClick: () => void }> = [];

    if (Number.isFinite(currentRadius) && currentRadius > 0) {
      const doubled = Math.min(currentRadius * 2, 50);
      if (doubled !== currentRadius) {
        actions.push({
          label: this.translate(
            "empty_increase_radius",
            `Search within ${doubled} km`,
            { km: doubled },
          ),
          onClick: () => {
            this.formData.radius = String(doubled);
            this.updateSearchFormUI?.();
            this.submitForm();
          },
        });
      }
    }

    const allFuels = ["benzina", "gasolio", "GPL", "metano"] as const;
    for (const f of allFuels) {
      if (f.toLowerCase() !== (this.formData.fuel || "").toLowerCase()) {
        const label = window.translateFuel ? window.translateFuel(f) : f;
        actions.push({
          label: label,
          onClick: () => this.setFuelType(f),
        });
        break;
      }
    }

    for (const action of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";
      btn.textContent = action.label;
      btn.addEventListener("click", action.onClick);
      container.appendChild(btn);
    }
  },

  /**
   * Render the list of station cards into the results container.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: result-card rendering is one contained template.
  renderResults(): void {
    const list = document.getElementById("stations-list");
    if (!list) return;

    list.innerHTML = "";
    for (const [index, station] of this.results.entries()) {
      const article = document.createElement("article");
      const fuelType = station.fuel_prices?.[0]?.type || "";
      const price = station.fuel_prices?.[0]?.price;
      const hasPrice = typeof price === "number" && Number.isFinite(price);
      const isCheapest = this.isCheapestStation(index);
      const fuelColorClass = this.getFuelColorClass(fuelType);
      const stationName =
        station.gestore || this.translate("station", "Gas Station");
      const hasCoordinates =
        station.latitude != null && station.longitude != null;
      const stationFuelIcon = getFuelIcon(fuelType || this.formData.fuel, 18);
      const naLabel = this.translate("price_unavailable", "n/a");

      article.className =
        "station-card bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 shadow-md transition-all duration-200 cursor-pointer relative min-h-[160px] hover:translate-y-[-2px] hover:shadow-xl hover:scale-[1.01] hover:border-[var(--color-primary-light)]";
      article.setAttribute("data-station-id", String(station.id ?? ""));
      // Card acts as one focusable control; inner action buttons keep their own focus.
      const stationTypeLabel = this.translate("station", "Gas Station");
      article.setAttribute(
        "aria-label",
        station.gestore ? `${stationTypeLabel} ${stationName}` : stationName,
      );
      article.tabIndex = 0;
      article.setAttribute("role", "button");

      article.innerHTML = `\n        <div class="station-card-header mb-4 min-w-0">\n          <div class="flex items-center justify-between gap-4 mb-2">\n            <div class="station-brand flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)] min-w-0 flex-1">\n              <div class="station-icon w-10 h-10 bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-primary)] rounded-xl flex items-center justify-center text-white shadow-sm">\n                ${stationFuelIcon}\n              </div>\n              <span class="truncate overflow-hidden text-ellipsis whitespace-nowrap">${escapeHtml(stationName)}</span>\n            </div>\n            <div class="station-price flex flex-row items-center gap-2 flex-nowrap">\n              ${station.fuel_prices && station.fuel_prices.length > 0 ? `\n                <span class="uppercase tracking-wide text-sm ${fuelColorClass}">${escapeHtml(window.translateFuel ? window.translateFuel(fuelType) : fuelType)}</span>\n                <span class="text-2xl font-bold text-[var(--color-primary-text)]">${hasPrice ? this.formatCurrency(price) : escapeHtml(naLabel)}</span>\n              ` : ""}\n            </div>\n          </div>\n          <div class="flex items-center justify-end gap-3 pl-[calc(8px+2rem)]">\n            ${isCheapest ? `<span class="inline-block bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary-darker)] text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-md whitespace-nowrap">${this.translate("best_price", "Miglior Prezzo!")}</span>` : ""}\n            ${station.fuel_prices && station.fuel_prices.length > 0 && !isCheapest ? `<span class="text-sm text-[var(--color-error)] font-medium">${this.getPriceDifference(index)}</span>` : ""}\n            ${station.distance ? `<span class="flex items-center gap-1 text-sm text-[var(--text-muted)]">\n              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                <circle cx="12" cy="12" r="10"></circle>\n                <polyline points="12 6 12 12 16 14"></polyline>\n              </svg>\n              ${this.formatDistance(station.distance)}\n            </span>` : ""}\n          </div>\n        </div>\n        <div class="station-card-body flex flex-col gap-2">\n          <div class="station-address-row flex items-start gap-2 text-sm text-[var(--text-secondary)] break-words">\n            <svg aria-hidden="true" class="address-icon w-4 h-4 text-[var(--text-muted)] mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>\n              <circle cx="12" cy="10" r="3"></circle>\n            </svg>\n            <span class="break-words leading-relaxed max-w-full">${escapeHtml(station.address || "")}</span>\n          </div>\n          <div class="station-actions-row flex gap-2 mt-4 pt-4 border-t border-[var(--border-color)]">\n            <button class="btn btn-primary flex-1 min-w-0 whitespace-nowrap bg-[var(--color-primary-dark)] text-white border-none rounded-lg py-2 px-3 text-sm font-semibold cursor-pointer transition-all duration-150 inline-flex items-center justify-center hover:bg-[var(--color-primary-darker)] hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:transform-none" data-action="directions" data-id="${escapeHtml(station.id)}" aria-label="${escapeHtml(`${this.translate("navigate", "Navigate")}: ${stationName}`)}" ${hasCoordinates ? "" : "disabled"}>\n              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                <path d="M9 18l6-6-6-6"></path>\n              </svg>\n              <span>${this.translate("navigate", "Navigate")}</span>\n            </button>\n            <button class="btn btn-secondary flex-1 min-w-0 whitespace-nowrap bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg py-2 px-3 text-sm font-semibold cursor-pointer transition-all duration-150 inline-flex items-center justify-center hover:bg-[var(--bg-surface)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed" data-action="show-map" data-id="${escapeHtml(station.id)}" aria-label="${escapeHtml(`${this.translate("show_on_map", "Show on Map")}: ${stationName}`)}" ${hasCoordinates ? "" : "disabled"}>\n              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>\n                <circle cx="12" cy="10" r="3"></circle>\n              </svg>\n              <span>${this.translate("show_on_map", "Show on Map")}</span>\n            </button>\n          </div>\n        </div>\n      `;

      article.addEventListener("click", (e) => {
        // Ignore clicks on inner buttons (they handle their own action).
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        this.selectStationForMap(station.id);
      });

      article.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        this.selectStationForMap(station.id);
      });

      list.appendChild(article);
    }

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
    const prices = this.results
      .map((s) => Number(s.fuel_prices?.[0]?.price))
      .filter((p): p is number => Number.isFinite(p));
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
    const idx =
      typeof index === "number" ? index : Number.parseInt(String(index), 10);
    if (!this.results || this.results.length === 0) return "";
    const prices = this.results
      .map((s) => Number(s.fuel_prices?.[0]?.price))
      .filter((p): p is number => Number.isFinite(p));
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
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: startup flow is linear and already localized.
  async init(): Promise<void> {
    try {
      this.placeMapAccordingToViewport?.();

      await Promise.all([
        this.loadComponent("/static/templates/header.html", "header-container"),
        this.loadComponent("/static/templates/search.html", "search-container"),
        this.loadComponent(
          "/static/templates/results.html",
          "results-container",
        ),
        this.loadComponent("/static/templates/map.html", "map-container"),
        this.loadCities(),
      ]);

      this.placeMapAccordingToViewport?.();

      this.currentLang =
        this.safeGetItem("lang") || window.i18next?.language || "it";
      if (
        window.i18next?.language &&
        window.i18next.language !== this.currentLang
      ) {
        if (window.i18next.changeLanguage)
          window.i18next.changeLanguage(this.currentLang);
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
        this.updateSearchButtonUI?.();
        this.updateRecentSearchesUI?.();
        this.updateResultsUI?.();
        this.updateMap?.();
        this._updatePopupTexts?.();
      });

      this.loadRecentSearches?.();
      this.updateRecentSearchesUI?.();
      if (this.recentSearches.length > 0 && this.recentSearches[0].city) {
        this.formData.city = this.recentSearches[0].city;
        this.updateSearchFormUI?.();
        this.updateSearchButtonUI?.();
      }

      this.initTranslateFuelHelper?.();

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          this.initializeComponents?.();
          if (window.updateI18nTexts) window.updateI18nTexts();
          resolve();
        }, 0);
      });

      this.fetchCsvStatus()?.then((status) => {
        this.csvLastUpdated = status.last_updated;
        this.updateCsvStatusUI?.(status);

        try {
          if (status.reload_in_progress) {
            // background worker in corso → poll ogni 5s, poi mostra popup se freshly_downloaded
            this._startCsvReloadPolling?.();
          } else if (status.freshly_downloaded) {
            // worker già terminato con nuovi dati (avvio veloce)
            this.showCsvUpdatePopup?.();
          }
          // 304 / dati invariati → nessun popup
        } catch (err) {
          this.debug("CSV popup check failed:", err as Error);
        }
      });

      if (this.csvStatusInterval) clearInterval(this.csvStatusInterval);
      this.csvStatusInterval = setInterval(() => {
        this.fetchCsvStatus()?.then((status) => {
          this.csvLastUpdated = status.last_updated;
        });
      }, window.CONFIG.CSV_AUTO_REFRESH_INTERVAL_MS);
    } catch (error) {
      console.error("Error during initialization:", error);
      this.error = "Failed to initialize application";
    }
  },

  /**
   * Submit search form to backend API and update UI with results.
   */
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: submit flow keeps request, success, and failure together.
  async submitForm(): Promise<void> {
    this.loading = true;
    this.setLoadingBar?.(true);
    this.updateSearchButtonUI?.();
    this.error = "";
    this.searched = true;
    const fuelToSend =
      this.formData.fuel === "diesel" ? "gasolio" : this.formData.fuel;

    const hasCoords =
      typeof this.formData.latitude === "number" &&
      typeof this.formData.longitude === "number";

    // Abort any in-flight search so a slow response cannot overwrite a newer one.
    const previousController = (
      this as { _activeController?: AbortController | null }
    )._activeController;
    const controller = new AbortController();
    (this as { _activeController?: AbortController | null })._activeController =
      controller;
    const seqHolder = this as { _requestSeq?: number };
    const requestSeq = (seqHolder._requestSeq ?? 0) + 1;
    seqHolder._requestSeq = requestSeq;
    previousController?.abort();

    const timeoutMs = window.CONFIG.SEARCH_TIMEOUT_MS || 12000;
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(window.CONFIG.SEARCH_API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
          ...(hasCoords
            ? {
                latitude: this.formData.latitude,
                longitude: this.formData.longitude,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = Array.isArray(errorData?.detail)
          ? errorData.detail
              .map((d: { msg?: string; loc?: unknown[] }) => d?.msg || "")
              .filter(Boolean)
              .join("; ")
          : errorData?.detail;
        throw new Error(detail || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Drop stale responses from a search that has been superseded.
      if (requestSeq !== (this as { _requestSeq?: number })._requestSeq) {
        return;
      }
      this.results =
        (data.stations as Station[] | undefined)?.map((station: Station) => ({
          ...station,
          gestore: window.extractGestore(station),
          distance: station.distance || "",
        })) || [];
      // A warning accompanying stations is non-fatal: keep results and announce it.
      if (data.warning) {
        this.error = this.results.length === 0 ? data.warning : "";
        if (this.results.length > 0) {
          const statusEl = document.getElementById("status-messages");
          if (statusEl) statusEl.textContent = data.warning;
        }
      } else {
        this.error = "";
      }
      // Coordinate-based locate-me searches are one-shot and must not pollute recents.
      if (!(hasCoords && this.userLocation)) {
        this.saveRecentSearch?.({ ...this.formData });
        this.updateRecentSearchesUI?.();
      }

      // After geocoded search, drop coords so future city edits use the geocoder.
      if (hasCoords && !this.userLocation) {
        this.formData.latitude = null;
        this.formData.longitude = null;
      }

      this.updateResultsUI?.();
      this.announceResultsCount?.();
      Promise.resolve().then(() => {
        this.updateMap?.();
        if (window.updateI18nTexts) window.updateI18nTexts();
      });
    } catch (err) {
      if (requestSeq !== (this as { _requestSeq?: number })._requestSeq) {
        return;
      }
      if ((err as Error & { name?: string }).name === "AbortError")
        this.error = this.translate(
          "search_timeout",
          "Request timed out. Please try again.",
        );
      else
        this.error =
          err instanceof Error && err.message
            ? err.message
            : this.translate(
                "search_failed",
                "Search failed. Please try again.",
              );
      this.results = [];
      this.debug?.("Search failed:", this.error);
      this.updateResultsUI?.();
    } finally {
      if (requestSeq === (this as { _requestSeq?: number })._requestSeq) {
        clearTimeout(timeoutHandle);
        this.loading = false;
        this.setLoadingBar?.(false);
        this.updateSearchButtonUI?.();
        this.updateResultsUI?.();
      }
    }
  },

  /**
   * Announce the number of results to assistive technology via the polite live region.
   */
  announceResultsCount(): void {
    const statusEl = document.getElementById("status-messages");
    if (!statusEl || typeof window.t !== "function") return;
    const n = this.results.length;
    let msg: string;
    if (n === 0) {
      msg = window.t("results_count", "No results found");
    } else if (n === 1) {
      msg = window.t("results_count_one", "1 station found");
    } else {
      msg = window.t("results_count_other", `${n} stations found`, {
        count: n,
      });
    }
    statusEl.textContent = msg;
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
          if (
            resultsContainer &&
            resultsContainer.parentElement === searchColumn
          )
            searchColumn.insertBefore(mapContainer, resultsContainer);
          else searchColumn.appendChild(mapContainer);
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

      setTimeout(() => {
        (this.map as { invalidateSize?: () => void })?.invalidateSize?.();
        this.initMap?.();
      }, 100);
    } catch (err) {
      console.debug("placeMapAccordingToViewport failed:", err);
    }
  },

  updateMap(): void {
    if (this.mapInitialized) {
      const mapContainer = document.getElementById("map");
      if (!mapContainer) {
        // Destroy the Leaflet instance (removes map and listeners) before dropping the ref.
        (this.map as { remove?: () => void } | null)?.remove?.();
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

  reinitializeComponents(): void {
    const docsLink = document.getElementById("docs-link");
    if (docsLink) {
      docsLink.setAttribute("href", `/help/user-${this.currentLang || "it"}`);
      const title = this.translate("user_docs", "User Documentation");
      docsLink.setAttribute("title", title);
      docsLink.setAttribute("aria-label", title);
    }
  },
} as Partial<AppUiMixin>);
