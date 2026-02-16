/**
 * DOM and component initialization helpers (resizer, theme, component loader, event attachment).
 */
// @ts-nocheck

Object.assign(window.appUiMixin, {
  initializeComponents(): void {
    window.themeManager.init();
    this.currentTheme = document.documentElement.getAttribute("data-theme") || window.CONFIG.DEFAULT_THEME;
    const progressEl = document.getElementById("loading-bar");
    if (progressEl) this.loadingBar = progressEl;
    this.initializeResizer();

    if (!(window as any).__benzo_map_relayout_attached) {
      let _resizeTimer: number | null = null;
      const relayout = () => {
        if (_resizeTimer) window.clearTimeout(_resizeTimer);
        _resizeTimer = window.setTimeout(() => {
          this.placeMapAccordingToViewport?.();
          if (this.map && typeof (this.map as any).invalidateSize === "function") {
            (this.map as any).invalidateSize();
          }
          _resizeTimer = null;
        }, 150);
      };
      window.addEventListener("resize", relayout);
      window.addEventListener("orientationchange", relayout);
      (window as any).__benzo_map_relayout_attached = true;
    }
  },

  initializeResizer(): void {
    const resizer = document.getElementById("layout-resizer");
    const searchColumn = document.getElementById("search-column");
    const mainLayout = document.querySelector(".main-layout") as HTMLElement | null;
    if (!(resizer && searchColumn && mainLayout)) return;
    const layoutEl = mainLayout as HTMLElement;

    let isResizing = false;
    resizer.addEventListener("mousedown", () => {
      isResizing = true;
      document.body.style.cursor = "col-resize";
      document.body.classList.add("is-resizing");
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const containerRect = layoutEl.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const totalWidth = containerRect.width;
      let percentage = (relativeX / totalWidth) * 100;
      percentage = Math.max(10, Math.min(90, percentage));
      layoutEl.style.gridTemplateColumns = `${percentage}% 4px 1fr`;
      resizer.setAttribute("aria-valuenow", String(Math.round(percentage)));
      if (this.map && typeof (this.map as { invalidateSize?: () => void }).invalidateSize === "function") {
        (this.map as { invalidateSize: () => void }).invalidateSize();
      }
    });

    document.addEventListener("mouseup", () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = "";
      document.body.classList.remove("is-resizing");
      if (this.map) {
        setTimeout(() => {
          if (typeof (this.map as { invalidateSize?: () => void }).invalidateSize === "function") {
            (this.map as { invalidateSize: () => void }).invalidateSize();
          }
        }, window.CONFIG.MAP_RESIZE_DELAY);
      }
    });
  },

  toggleTheme(): void {
    this.currentTheme = window.themeManager.toggle();
    this.updateThemeUI();
    this.debug("Theme toggled to:", this.currentTheme);
  },

  updateThemeUI(): void {
    const sunIcon = document.getElementById("sun-icon");
    const moonIcon = document.getElementById("moon-icon");
    const themeToggle = document.getElementById("theme-toggle");
    if (!themeToggle) return;

    const isDark = this.currentTheme === "dark";
    if (sunIcon) sunIcon.classList.toggle("hidden", isDark);
    if (moonIcon) moonIcon.classList.toggle("hidden", !isDark);
    themeToggle.setAttribute(
      "aria-label",
      isDark ? (window.t ? window.t("switch_to_light", "Switch to light mode") : "Switch to light mode") : (window.t ? window.t("switch_to_dark", "Switch to dark mode") : "Switch to dark mode"),
    );
  },

  /**
   * Change the UI language.
   * Delegates to `window.setLang` when available and updates UI state.
   */
  setLanguage(lang: string): void {
    try {
      const desired = lang === "en" ? "en" : "it";
      this.currentLang = desired;

      if (typeof (window as any).setLang === "function") {
        (window as any).setLang(desired);
      } else {
        try {
          localStorage.setItem("lang", desired);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: desired } }));
        if (typeof window.updateI18nTexts === "function") window.updateI18nTexts();
      }

      this.updateLanguageUI?.();
      this.updateFuelTypeUI?.();
      this.updateSearchFormUI?.();
      this.updateRecentSearchesUI?.();
      this.updateResultsUI?.();
    } catch (err) {
      this.debug?.("setLanguage failed:", err instanceof Error ? err.message : err);
    }
  },

  async loadComponent(url: string, elementId: string): Promise<void> {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load component: ${url}`);
      const data = await response.text();
      const element = document.getElementById(elementId) as HTMLElement | null;
      if (element) {
        element.innerHTML = data;
        this.attachEventListeners(element);
        if (elementId === "search-container") setTimeout(() => this.placeMapAccordingToViewport?.(), 0);
      }
    } catch (error) {
      console.error(`Error loading component into ${elementId}:`, error);
    }
  },

  attachEventListeners(container: HTMLElement): void {
    const reloadBtn = container.querySelector("#reload-btn");
    if (reloadBtn && !reloadBtn.hasAttribute("data-listener-attached")) {
      reloadBtn.addEventListener("click", async (e) => { e.preventDefault(); e.stopPropagation(); await this.reloadCsv(); });
      reloadBtn.setAttribute("data-listener-attached", "true");
    }

    const themeToggle = container.querySelector("#theme-toggle");
    if (themeToggle && !themeToggle.hasAttribute("data-listener-attached")) {
      themeToggle.addEventListener("click", () => { this.toggleTheme(); });
      themeToggle.setAttribute("data-listener-attached", "true");
    }

    const langEn = container.querySelector("#lang-en");
    if (langEn && !langEn.hasAttribute("data-listener-attached")) { langEn.addEventListener("click", () => { this.setLanguage("en"); }); langEn.setAttribute("data-listener-attached", "true"); }

    const langIt = container.querySelector("#lang-it");
    if (langIt && !langIt.hasAttribute("data-listener-attached")) { langIt.addEventListener("click", () => { this.setLanguage("it"); }); langIt.setAttribute("data-listener-attached", "true"); }

    const locationBtn = container.querySelector("#location-btn");
    if (locationBtn && !locationBtn.hasAttribute("data-listener-attached")) { locationBtn.addEventListener("click", () => { this.locateUser(); }); locationBtn.setAttribute("data-listener-attached", "true"); }

    const cityInput = container.querySelector("#city") as HTMLInputElement | null;
    if (cityInput && !cityInput.hasAttribute("data-listener-attached")) {
      cityInput.addEventListener("input", () => { this.formData.city = cityInput.value; this.onCityInput(); this.updateSearchFormUI(); this.updateSearchButtonUI(); });
      cityInput.addEventListener("focus", () => { this.showCitySuggestions = true; this.onCityInput(); });
      cityInput.addEventListener("blur", () => { setTimeout(() => { this.showCitySuggestions = false; this.updateCitySuggestionsUI(); }, 200); });
      cityInput.addEventListener("keydown", (e) => { this.handleCityKeydown(e); });
      cityInput.setAttribute("data-listener-attached", "true");
    }

    const docsLink = container.querySelector("#docs-link");
    if (docsLink) { docsLink.setAttribute("href", `/help/user-${this.currentLang || "it"}`); const title = this.translate("user_docs", "User Documentation"); docsLink.setAttribute("title", title); }

    const searchForm = container.querySelector("#search-form");
    if (searchForm && !searchForm.hasAttribute("data-listener-attached")) { searchForm.addEventListener("submit", (e) => { e.preventDefault(); this.submitForm(); }); searchForm.setAttribute("data-listener-attached", "true"); }

    const radiusSlider = container.querySelector("#radius-slider") as HTMLInputElement | null;
    if (radiusSlider && !radiusSlider.hasAttribute("data-listener-attached")) { radiusSlider.addEventListener("input", () => { this.formData.radius = radiusSlider.value; this.updateSearchFormUI(); }); radiusSlider.setAttribute("data-listener-attached", "true"); }

    const resultsSlider = container.querySelector("#results-slider") as HTMLInputElement | null;
    if (resultsSlider && !resultsSlider.hasAttribute("data-listener-attached")) { resultsSlider.addEventListener("input", () => { this.formData.results = resultsSlider.value; this.updateSearchFormUI(); }); resultsSlider.setAttribute("data-listener-attached", "true"); }

    const fuelButtons = ["benzina", "gasolio", "GPL", "metano"];
    fuelButtons.forEach((fuel) => { const btn = container.querySelector(`#fuel-${fuel}`); if (btn && !btn.hasAttribute("data-listener-attached")) { btn.addEventListener("click", () => { this.setFuelType(fuel); }); btn.setAttribute("data-listener-attached", "true"); } });
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
          if (resultsContainer && resultsContainer.parentElement === searchColumn) {
            searchColumn.insertBefore(mapContainer, resultsContainer);
          } else {
            searchColumn.appendChild(mapContainer);
          }
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
} as Partial<AppUiMixin>);