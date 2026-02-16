"use strict";
/**
 * Small helper utilities split out of `app.ui.ts`.
 */
// @ts-nocheck
Object.assign(window.appUiMixin, {
    /** Format an ISO timestamp into localized string */
    formatTimestamp(isoTimestamp) {
        if (!isoTimestamp)
            return "";
        try {
            const date = new Date(isoTimestamp);
            const locale = this.currentLang === "it" ? "it-IT" : "en-US";
            return date.toLocaleDateString(locale, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        }
        catch (err) {
            this.debug?.("Failed to format timestamp:", err instanceof Error ? err.message : err);
            return isoTimestamp;
        }
    },
    /** Format a numeric value using configured currency settings. */
    formatCurrency(value) {
        return new Intl.NumberFormat(window.CONFIG.CURRENCY_LOCALE, {
            style: "currency",
            currency: window.CONFIG.CURRENCY_CODE,
            minimumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
            maximumFractionDigits: window.CONFIG.CURRENCY_FRACTION_DIGITS,
        }).format(value);
    },
    /** Debug logger (no-op when debugMode is false) */
    debug(message, data = null) {
        if (this.debugMode)
            console.log("[DEBUG]", message, data ?? "");
    },
    safeGetItem(key) {
        try {
            return localStorage.getItem(key);
        }
        catch {
            return null;
        }
    },
    safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch {
            // ignore storage errors
        }
    },
    setLoadingBar(active) {
        if (!this.loadingBar)
            return;
        const statusEl = document.getElementById("status-messages");
        if (active) {
            this.loadingBar.classList.add("active");
            this.loadingBar.setAttribute("aria-hidden", "false");
            this.loadingBar.setAttribute("aria-valuenow", "50");
            if (statusEl && typeof window.t === "function") {
                statusEl.textContent = window.t("translation.loading", "Loading...");
            }
        }
        else {
            this.loadingBar.classList.remove("active");
            this.loadingBar.setAttribute("aria-hidden", "true");
            this.loadingBar.setAttribute("aria-valuenow", "0");
            if (statusEl)
                setTimeout(() => (statusEl.textContent = ""), 500);
        }
    },
    formatDistance(distance) {
        const num = Number.parseFloat(distance);
        if (Number.isNaN(num))
            return distance;
        return `${num.toFixed(1)} km`;
    },
    translate(key, fallback = "") {
        if (typeof window.t === "function")
            return window.t(key, fallback);
        if (typeof i18next !== "undefined" && i18next.t) {
            const translated = i18next.t(key);
            if (translated === key)
                return fallback || key;
            return translated;
        }
        return fallback || key;
    },
    initTranslateFuelHelper() {
        window.translateFuel = (type) => {
            try {
                const normalized = (type || "").toString();
                const map = {
                    gasolio: "diesel",
                    diesel: "diesel",
                    benzina: "benzina",
                    gpl: "gpl",
                    GPL: "gpl",
                    metano: "metano",
                };
                const key = map[normalized] || normalized;
                if (typeof window.t === "function")
                    return window.t(key, key);
                if (typeof i18next !== "undefined" && i18next.t) {
                    const tResult = i18next.t(key);
                    if (tResult && tResult !== key)
                        return tResult;
                }
                return key;
            }
            catch {
                return type || "";
            }
        };
    },
    getFuelColorClass(fuelType) {
        const colors = {
            benzina: "text-[var(--fuel-benzina-color)]",
            gasolio: "text-[var(--fuel-gasolio-color)]",
            GPL: "text-[var(--fuel-gpl-color)]",
            metano: "text-[var(--fuel-metano-color)]",
        };
        return colors[fuelType] || "";
    },
    buildPopupContent(station) {
        const title = station.gestore || this.translate("translation.station", "Gas Station");
        const addressLabel = this.translate("translation.address", "Address");
        return `
      <div class="map-popup">
        <strong>${title}</strong><br>
        <span class="map-popup-address">${addressLabel}: ${station.address}</span>
      </div>`;
    },
});
//# sourceMappingURL=app.ui.helpers.js.map