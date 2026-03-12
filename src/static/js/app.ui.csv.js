"use strict";
/**
 * CSV status / reload UI helpers (moved from `app.ui.ts`).
 */
// @ts-nocheck
Object.assign(window.appUiMixin, {
    /**
     * Retrieve CSV ingestion status from the backend API.
     * Returns the parsed CsvStatus object or a safe fallback on error.
     */
    async fetchCsvStatus() {
        this.csvStatusLoading = true;
        const prev = !!this.csvRemoteReloadInProgress;
        try {
            const response = await fetch(window.CONFIG.CSV_STATUS_ENDPOINT);
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            const status = (await response.json());
            this.csvRemoteReloadInProgress = !!status.reload_in_progress;
            // ensure the reload button UI reflects remote reload-in-progress state
            this.updateReloadButtonUI?.();
            if (prev && !this.csvRemoteReloadInProgress) {
                this.csvLastUpdated = status.last_updated;
                try {
                    this.showReloadCompletedBanner();
                }
                catch (e) {
                    this.debug("Failed to show reload-complete banner:", e);
                }
            }
            return status;
        }
        catch {
            this.debug("Failed to fetch CSV status:", window.appUiMixin.error);
            this.csvRemoteReloadInProgress = false;
            this.updateReloadButtonUI?.();
            return { last_updated: null, source: "unknown", is_stale: false };
        }
        finally {
            this.csvStatusLoading = false;
        }
    },
    /**
     * Trigger a server-side CSV reload and update UI state accordingly.
     * Returns the server ReloadResponse or an error-like object.
     */
    async reloadCsv() {
        if (this.csvReloading) {
            return {
                status: "already_reloading",
                message: "CSV reload already in progress",
            };
        }
        this.csvReloading = true;
        let lastUpdated = null;
        this.updateReloadButtonUI?.();
        this.updateCsvStatusUI?.();
        try {
            const response = await fetch(window.CONFIG.CSV_RELOAD_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            const result = (await response.json());
            if (result.last_updated) {
                this.csvLastUpdated = result.last_updated;
                lastUpdated = result.last_updated;
                this.updateCsvStatusUI?.({
                    last_updated: result.last_updated,
                    source: result.source || "manual",
                    is_stale: false,
                });
            }
            setTimeout(() => {
                this.fetchCsvStatus().then((status) => {
                    this.csvLastUpdated = status.last_updated;
                    this.updateCsvStatusUI?.(status);
                });
            }, 2000);
            return result;
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            return { status: "error", message: errorMessage };
        }
        finally {
            this.csvReloading = false;
            this.updateReloadButtonUI?.();
            if (lastUpdated) {
                this.updateCsvStatusUI?.({
                    last_updated: lastUpdated,
                    source: "manual",
                    is_stale: false,
                });
            }
        }
    },
    updateReloadButtonUI() {
        const reloadBtn = document.getElementById("reload-btn");
        const reloadIcon = document.getElementById("reload-icon");
        const reloadSpinner = document.getElementById("reload-spinner");
        if (!reloadBtn)
            return;
        const inProgress = this.csvReloading || !!this.csvRemoteReloadInProgress;
        reloadBtn.disabled = inProgress;
        if (reloadIcon)
            reloadIcon.classList.toggle("hidden", inProgress);
        if (reloadSpinner)
            reloadSpinner.classList.toggle("hidden", !inProgress);
        const label = inProgress
            ? window.t
                ? window.t("reloading", "Reloading...")
                : "Reloading..."
            : window.t
                ? window.t("reload_data", "Reload data")
                : "Reload data";
        reloadBtn.title = label;
        reloadBtn.setAttribute("aria-label", label);
    },
    showReloadCompletedBanner() {
        try {
            const msg = window.t
                ? window.t("data_reloaded_success", "Data reloaded")
                : "Data reloaded";
            const doneEl = document.getElementById("csv-reload-done");
            if (doneEl) {
                doneEl.textContent = msg;
                doneEl.classList.remove("hidden");
                setTimeout(() => doneEl.classList.add("hidden"), 4000);
            }
            const toastWrap = document.getElementById("csv-toast");
            const toastMsg = document.getElementById("csv-toast-msg");
            if (toastWrap && toastMsg) {
                toastMsg.textContent = msg;
                toastWrap.classList.remove("hidden");
                toastWrap.setAttribute("aria-hidden", "false");
                setTimeout(() => {
                    toastWrap.classList.add("hidden");
                    toastWrap.setAttribute("aria-hidden", "true");
                }, 4000);
            }
        }
        catch (err) {
            this.debug("Failed to display reload-complete banner:", err);
        }
    },
    updateCsvStatusUI(status) {
        const csvLoading = document.getElementById("csv-loading");
        const csvUpdated = document.getElementById("csv-updated");
        const csvNoData = document.getElementById("csv-no-data");
        const reloadIcon = document.getElementById("reload-icon");
        const reloadSpinner = document.getElementById("reload-spinner");
        const reloadBtn = document.getElementById("reload-btn");
        if (this.csvStatusLoading) {
            csvLoading?.classList.remove("hidden");
            csvUpdated?.classList.add("hidden");
            csvNoData?.classList.add("hidden");
            reloadIcon?.classList.add("hidden");
            reloadSpinner?.classList.remove("hidden");
            if (reloadBtn)
                reloadBtn.disabled = true;
        }
        else {
            csvLoading?.classList.add("hidden");
            reloadIcon?.classList.remove("hidden");
            reloadSpinner?.classList.add("hidden");
            if (reloadBtn)
                reloadBtn.disabled = false;
            if (status) {
                if (status.last_updated) {
                    csvUpdated?.classList.remove("hidden");
                    if (csvUpdated) {
                        const date = new Date(status.last_updated);
                        csvUpdated.textContent = date.toLocaleString();
                    }
                    csvNoData?.classList.add("hidden");
                }
                else {
                    csvUpdated?.classList.add("hidden");
                    csvNoData?.classList.remove("hidden");
                }
            }
        }
    },
    /**
     * Show the CSV update startup popup when data is stale or missing.
     * Wires the "Update data" button on first call only.
     */
    showCsvUpdatePopup() {
        const popup = document.getElementById("csv-update-popup");
        if (!popup)
            return;
        popup.classList.remove("hidden");
        this._updatePopupTexts?.();
        const btn = document.getElementById("csv-popup-btn");
        if (btn && !btn.dataset.popupListenerAttached) {
            btn.addEventListener("click", () => this.handlePopupReload());
            btn.dataset.popupListenerAttached = "1";
        }
    },
    /**
     * Hide the startup popup with a short fade-out animation.
     */
    hideCsvUpdatePopup() {
        const popup = document.getElementById("csv-update-popup");
        if (!popup)
            return;
        popup.classList.add("fade-out");
        setTimeout(() => {
            popup.classList.add("hidden");
            popup.classList.remove("fade-out");
        }, 280);
    },
    /**
     * Handle the "Update data" button click inside the startup popup.
     * Disables the button, shows a spinner, starts reloadCsv(),
     * then closes the popup when done (success or error).
     */
    async handlePopupReload() {
        const btn = document.getElementById("csv-popup-btn");
        const statusEl = document.getElementById("csv-popup-status");
        if (btn)
            btn.disabled = true;
        const loadingMsg = window.t
            ? window.t("update_csv_popup_loading", "Updating data, please wait\u2026")
            : "Updating data, please wait\u2026";
        if (statusEl) {
            statusEl.innerHTML = `<span class="csv-popup-spinner"></span><span>${loadingMsg}</span>`;
        }
        try {
            await this.reloadCsv();
        }
        finally {
            this.hideCsvUpdatePopup();
        }
    },
    /**
     * Re-translate popup text elements when the active language changes.
     */
    _updatePopupTexts() {
        if (!window.t)
            return;
        const title = document.getElementById("csv-popup-title");
        const body = document.getElementById("csv-popup-body");
        const btn = document.getElementById("csv-popup-btn");
        if (title)
            title.textContent = window.t("update_csv_popup_title", "Data Update Required");
        if (body)
            body.textContent = window.t("update_csv_popup_body", "Fuel price data is missing or outdated. Click the button below to fetch the latest data.");
        if (btn && !btn.disabled)
            btn.textContent = window.t("update_csv_popup_btn", "Update data");
    },
});
//# sourceMappingURL=app.ui.csv.js.map