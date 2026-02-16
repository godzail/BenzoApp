/**
 * CSV status / reload UI helpers (moved from `app.ui.ts`).
 */
// @ts-nocheck

Object.assign(window.appUiMixin, {
  /**
   * Retrieve CSV ingestion status from the backend API.
   * Returns the parsed CsvStatus object or a safe fallback on error.
   */
  async fetchCsvStatus(): Promise<CsvStatus> {
    this.csvStatusLoading = true;
    const prev = !!this.csvRemoteReloadInProgress;
    try {
      const response = await fetch(window.CONFIG.CSV_STATUS_ENDPOINT);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const status = (await response.json()) as CsvStatus;
      this.csvRemoteReloadInProgress = !!status.reload_in_progress;

      if (prev && !this.csvRemoteReloadInProgress) {
        this.csvLastUpdated = status.last_updated;
        try {
          this.showReloadCompletedBanner();
        } catch (e) {
          this.debug("Failed to show reload-complete banner:", e as Error);
        }
      }

      return status;
    } catch {
      this.debug("Failed to fetch CSV status:", (window.appUiMixin as AppUiMixin & { error?: string }).error);
      this.csvRemoteReloadInProgress = false;
      return { last_updated: null, source: "unknown", is_stale: false };
    } finally {
      this.csvStatusLoading = false;
    }
  },

  /**
   * Trigger a server-side CSV reload and update UI state accordingly.
   * Returns the server ReloadResponse or an error-like object.
   */
  async reloadCsv(): Promise<ReloadResponse | { status: string; message: string }> {
    if (this.csvReloading) {
      return { status: "already_reloading", message: "CSV reload already in progress" };
    }
    this.csvReloading = true;
    this.updateReloadButtonUI?.();
    this.updateCsvStatusUI?.();
    try {
      const response = await fetch(window.CONFIG.CSV_RELOAD_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = (await response.json()) as ReloadResponse;
      if (result.last_updated) this.csvLastUpdated = result.last_updated;
      this.updateCsvStatusUI?.();
      setTimeout(() => {
        this.fetchCsvStatus().then((status) => {
          this.csvLastUpdated = status.last_updated;
          this.updateCsvStatusUI?.();
        });
      }, 2000);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return { status: "error", message: errorMessage };
    } finally {
      this.csvReloading = false;
      this.updateReloadButtonUI?.();
    }
  },

  updateReloadButtonUI(): void {
    const reloadBtn = document.getElementById("reload-btn");
    const reloadIcon = document.getElementById("reload-icon");
    const reloadSpinner = document.getElementById("reload-spinner");
    if (!reloadBtn) return;

    const inProgress = this.csvReloading || !!this.csvRemoteReloadInProgress;
    reloadBtn.disabled = inProgress;
    if (reloadIcon) reloadIcon.classList.toggle("hidden", inProgress);
    if (reloadSpinner) reloadSpinner.classList.toggle("hidden", !inProgress);

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

  showReloadCompletedBanner(): void {
    try {
      const msg = window.t ? window.t("data_reloaded_success", "Data reloaded") : "Data reloaded";

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
    } catch (err) {
      this.debug("Failed to display reload-complete banner:", err as Error);
    }
  },

  updateCsvStatusUI(status?: CsvStatus): void {
    const csvLoading = document.getElementById("csv-loading");
    const csvUpdated = document.getElementById("csv-updated");
    const csvNoData = document.getElementById("csv-no-data");
    const reloadIcon = document.getElementById("reload-icon");
    const reloadSpinner = document.getElementById("reload-spinner");
    const reloadBtn = document.getElementById("reload-btn") as HTMLButtonElement | null;

    if (this.csvStatusLoading) {
      csvLoading?.classList.remove("hidden");
      csvUpdated?.classList.add("hidden");
      csvNoData?.classList.add("hidden");
      reloadIcon?.classList.add("hidden");
      reloadSpinner?.classList.remove("hidden");
      if (reloadBtn) reloadBtn.disabled = true;
    } else {
      csvLoading?.classList.add("hidden");
      reloadIcon?.classList.remove("hidden");
      reloadSpinner?.classList.add("hidden");
      if (reloadBtn) reloadBtn.disabled = false;

      if (status) {
        if (status.last_updated) {
          csvUpdated?.classList.remove("hidden");
          if (csvUpdated) {
            const date = new Date(status.last_updated);
            csvUpdated.textContent = date.toLocaleString();
          }
          csvNoData?.classList.add("hidden");
        } else {
          csvUpdated?.classList.add("hidden");
          csvNoData?.classList.remove("hidden");
        }
      }
    }
  },
} as Partial<AppUiMixin>);