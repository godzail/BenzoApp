# CSV Data Update Popup on Main Page Load

## Overview
Add a modal popup that appears when the main page opens. It prompts the user to update CSV data with a button. The popup stays open and shows a loading spinner until the data load completes, then auto-closes.

---

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `src/static/index.html` | Add modal HTML overlay |
| 2 | `src/static/css/custom.css` | Add modal styles |
| 3 | `src/static/locales/it.json` | Add Italian translations |
| 4 | `src/static/locales/en.json` | Add English translations |
| 5 | `src/static/ts/app.ui.interactions.ts` | Add popup logic and init call |
| 6 | `src/static/js/app.ui.interactions.js` | Rebuild from TS |

---

## Task 1: Add Modal HTML to `index.html`

**File:** `src/static/index.html`

Add before closing `</body>` tag (after the `<script>` block at line 185):

```html
<!-- CSV Update Popup Modal -->
<div id="csv-update-modal" class="hidden fixed inset-0 z-[9999] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="csv-modal-title">
  <div class="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
  <div class="modal-content relative bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4 text-center">
    <div class="modal-icon mb-4 flex justify-center">
      <svg class="w-12 h-12 text-[var(--color-primary)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    </div>
    <h2 id="csv-modal-title" class="text-xl font-semibold text-[var(--text-primary)] mb-2"></h2>
    <p id="csv-modal-message" class="text-sm text-[var(--text-secondary)] mb-6"></p>
    <button id="csv-modal-update-btn" class="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-3 px-6 rounded-xl transition-all duration-150 flex items-center justify-center gap-2">
      <span id="csv-modal-btn-text"></span>
      <svg id="csv-modal-spinner" class="hidden w-5 h-5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"></path>
      </svg>
    </button>
  </div>
</div>
```

### Diff

```diff
--- a/src/static/index.html
+++ b/src/static/index.html
@@ -183,5 +183,34 @@
     document.addEventListener("DOMContentLoaded", () => {
       window.initApp();
     });
     </script>
+    <!-- CSV Update Popup Modal -->
+    <div id="csv-update-modal" class="hidden fixed inset-0 z-[9999] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="csv-modal-title">
+      <div class="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
+      <div class="modal-content relative bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4 text-center">
+        <div class="modal-icon mb-4 flex justify-center">
+          <svg class="w-12 h-12 text-[var(--color-primary)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
+            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
+          </svg>
+        </div>
+        <h2 id="csv-modal-title" class="text-xl font-semibold text-[var(--text-primary)] mb-2"></h2>
+        <p id="csv-modal-message" class="text-sm text-[var(--text-secondary)] mb-6"></p>
+        <button id="csv-modal-update-btn" class="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-3 px-6 rounded-xl transition-all duration-150 flex items-center justify-center gap-2">
+          <span id="csv-modal-btn-text"></span>
+          <svg id="csv-modal-spinner" class="hidden w-5 h-5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
+            <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"></path>
+          </svg>
+        </button>
+      </div>
+    </div>
   </body>
 </html>
```

---

## Task 2: Add Modal CSS to `custom.css`

**File:** `src/static/css/custom.css`

Append modal styles at end of file.

### Diff

```diff
--- a/src/static/css/custom.css
+++ b/src/static/css/custom.css
@@ -1,3 +1,20 @@
 /* Custom styles */
 
+/* CSV Update Modal */
+#csv-update-modal .modal-backdrop {
+  animation: fadeIn 0.2s ease-out;
+}
+
+#csv-update-modal .modal-content {
+  animation: slideUp 0.3s ease-out;
+}
+
+@keyframes fadeIn {
+  from { opacity: 0; }
+  to { opacity: 1; }
+}
+
+@keyframes slideUp {
+  from { opacity: 0; transform: translateY(20px) scale(0.95); }
+  to { opacity: 1; transform: translateY(0) scale(1); }
+}
```

---

## Task 3: Add Italian Translations

**File:** `src/static/locales/it.json`

Add 4 new keys before the closing `}`:

### Diff

```diff
--- a/src/static/locales/it.json
+++ b/src/static/locales/it.json
@@ -40,6 +40,10 @@
   "location": "Posizione",
   "user_docs": "Documentazione Utente",
   "translation": {
     "loading": "Caricamento...",
     "best_price_short": "Miglior"
-  }
+  },
+  "csv_update_popup_title": "Aggiornamento Dati",
+  "csv_update_popup_message": "I dati dei prezzi potrebbero non essere aggiornati. Vuoi scaricare l'ultimo aggiornamento?",
+  "csv_update_popup_button": "Aggiorna Dati",
+  "csv_update_popup_loading": "Aggiornamento in corso..."
 }
```

---

## Task 4: Add English Translations

**File:** `src/static/locales/en.json`

Add 4 new keys before the closing `}`:

### Diff

```diff
--- a/src/static/locales/en.json
+++ b/src/static/locales/en.json
@@ -41,4 +41,8 @@
   "reload_data": "Reload data",
   "reloading": "Reloading...",
   "data_reloading_startup": "Reloading data (startup)",
-  "data_reloaded_success": "Data reloaded"
+  "data_reloaded_success": "Data reloaded",
+  "csv_update_popup_title": "Data Update",
+  "csv_update_popup_message": "Price data may be outdated. Would you like to download the latest update?",
+  "csv_update_popup_button": "Update Data",
+  "csv_update_popup_loading": "Updating..."
 }
```

---

## Task 5: Add Popup Logic to `app.ui.interactions.ts`

**File:** `src/static/ts/app.ui.interactions.ts`

### 5a. Add new methods inside `Object.assign(window.appUiMixin, {...})`

Add before the closing `} as Partial<AppUiMixin>);` at end of file:

```typescript
  /**
   * Show the CSV update popup modal.
   */
  showCsvUpdatePopup(): void {
    const modal = document.getElementById("csv-update-modal");
    if (!modal) return;

    const title = document.getElementById("csv-modal-title");
    const message = document.getElementById("csv-modal-message");
    const btnText = document.getElementById("csv-modal-btn-text");

    if (title) title.textContent = window.t ? window.t("csv_update_popup_title", "Data Update") : "Data Update";
    if (message) message.textContent = window.t ? window.t("csv_update_popup_message", "Price data may be outdated. Would you like to download the latest update?") : "Price data may be outdated. Would you like to download the latest update?";
    if (btnText) btnText.textContent = window.t ? window.t("csv_update_popup_button", "Update Data") : "Update Data";

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  },

  /**
   * Hide the CSV update popup modal.
   */
  hideCsvUpdatePopup(): void {
    const modal = document.getElementById("csv-update-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  },

  /**
   * Check if CSV data needs update and show popup if needed.
   */
  async checkAndShowCsvUpdatePopup(): Promise<void> {
    try {
      const status = await this.fetchCsvStatus();
      this.csvLastUpdated = status.last_updated;

      const needsUpdate = !status.last_updated || status.is_stale;
      if (needsUpdate) {
        this.showCsvUpdatePopup();
      }
    } catch (err) {
      this.debug("CSV update popup check failed:", err as Error);
    }
  },

  /**
   * Handle the popup update button click - triggers CSV reload.
   */
  async handleCsvUpdatePopupClick(): Promise<void> {
    const btn = document.getElementById("csv-modal-update-btn") as HTMLButtonElement | null;
    const btnText = document.getElementById("csv-modal-btn-text");
    const spinner = document.getElementById("csv-modal-spinner");

    if (!btn) return;

    btn.disabled = true;
    if (btnText) btnText.textContent = window.t ? window.t("csv_update_popup_loading", "Updating...") : "Updating...";
    if (spinner) spinner.classList.remove("hidden");

    try {
      await this.reloadCsv();
    } finally {
      this.hideCsvUpdatePopup();
      btn.disabled = false;
      if (spinner) spinner.classList.add("hidden");
    }
  },
```

### 5b. Add event listener in `attachEventListeners()`

Add after the existing reload-btn listener block (after line ~179):

```typescript
    const csvModalUpdateBtn = container.querySelector("#csv-modal-update-btn");
    if (csvModalUpdateBtn && !csvModalUpdateBtn.hasAttribute("data-listener-attached")) {
      csvModalUpdateBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.handleCsvUpdatePopupClick();
      });
      csvModalUpdateBtn.setAttribute("data-listener-attached", "true");
    }
```

### 5c. Replace auto-reload block in `init()`

Replace lines ~455-478 (the `fetchCsvStatus()?.then(...)` block):

```typescript
      this.fetchCsvStatus()?.then((status) => {
        this.csvLastUpdated = status.last_updated;

        // Auto-trigger a client-side reload on first page load when cache is missing or stale.
        // Guard with `reload_in_progress` and `this.csvReloading` to avoid duplicate requests,
        // and set a sessionStorage flag so we only auto-reload once per session.
        try {
          const shouldAutoReload =
            (!status.last_updated || status.is_stale) &&
            !status.reload_in_progress &&
            !this.csvReloading;
          const alreadyTriggered = sessionStorage.getItem(
            "csvAutoReloadTriggered",
          );
          if (shouldAutoReload && !alreadyTriggered) {
            sessionStorage.setItem("csvAutoReloadTriggered", "1");
            // run reload in background; UI updates are handled by existing reloadCsv handlers
            this.reloadCsv()?.catch(() => {});
          }
        } catch (err) {
          // sessionStorage may be unavailable in some environments — ignore failures
          this.debug("Auto-reload check failed:", err as Error);
        }
      });
```

With:

```typescript
      this.checkAndShowCsvUpdatePopup();
```

### Diff

```diff
--- a/src/static/ts/app.ui.interactions.ts
+++ b/src/static/ts/app.ui.interactions.ts
@@ -176,6 +176,15 @@
       reloadBtn.setAttribute("data-listener-attached", "true");
     }

+    const csvModalUpdateBtn = container.querySelector("#csv-modal-update-btn");
+    if (csvModalUpdateBtn && !csvModalUpdateBtn.hasAttribute("data-listener-attached")) {
+      csvModalUpdateBtn.addEventListener("click", async (e) => {
+        e.preventDefault();
+        await this.handleCsvUpdatePopupClick();
+      });
+      csvModalUpdateBtn.setAttribute("data-listener-attached", "true");
+    }
+
     const themeToggle = container.querySelector("#theme-toggle");
     if (themeToggle && !themeToggle.hasAttribute("data-listener-attached")) {
       themeToggle.addEventListener("click", () => {
@@ -452,25 +461,7 @@
         this.initTranslateFuelHelper?.();

-        this.fetchCsvStatus()?.then((status) => {
-          this.csvLastUpdated = status.last_updated;
-
-          // Auto-trigger a client-side reload on first page load when cache is missing or stale.
-          // Guard with `reload_in_progress` and `this.csvReloading` to avoid duplicate requests,
-          // and set a sessionStorage flag so we only auto-reload once per session.
-          try {
-            const shouldAutoReload =
-              (!status.last_updated || status.is_stale) &&
-              !status.reload_in_progress &&
-              !this.csvReloading;
-            const alreadyTriggered = sessionStorage.getItem(
-              "csvAutoReloadTriggered",
-            );
-            if (shouldAutoReload && !alreadyTriggered) {
-              sessionStorage.setItem("csvAutoReloadTriggered", "1");
-              // run reload in background; UI updates are handled by existing reloadCsv handlers
-              this.reloadCsv()?.catch(() => {});
-            }
-          } catch (err) {
-            // sessionStorage may be unavailable in some environments — ignore failures
-            this.debug("Auto-reload check failed:", err as Error);
-          }
-        });
+        this.checkAndShowCsvUpdatePopup();

         if (this.csvStatusInterval) clearInterval(this.csvStatusInterval);
         this.csvStatusInterval = setInterval(() => {
@@ -605,4 +596,78 @@
     }
   },

+  /**
+   * Show the CSV update popup modal.
+   */
+  showCsvUpdatePopup(): void {
+    const modal = document.getElementById("csv-update-modal");
+    if (!modal) return;
+
+    const title = document.getElementById("csv-modal-title");
+    const message = document.getElementById("csv-modal-message");
+    const btnText = document.getElementById("csv-modal-btn-text");
+
+    if (title) title.textContent = window.t ? window.t("csv_update_popup_title", "Data Update") : "Data Update";
+    if (message) message.textContent = window.t ? window.t("csv_update_popup_message", "Price data may be outdated. Would you like to download the latest update?") : "Price data may be outdated. Would you like to download the latest update?";
+    if (btnText) btnText.textContent = window.t ? window.t("csv_update_popup_button", "Update Data") : "Update Data";
+
+    modal.classList.remove("hidden");
+    document.body.style.overflow = "hidden";
+  },
+
+  /**
+   * Hide the CSV update popup modal.
+   */
+  hideCsvUpdatePopup(): void {
+    const modal = document.getElementById("csv-update-modal");
+    if (!modal) return;
+    modal.classList.add("hidden");
+    document.body.style.overflow = "";
+  },
+
+  /**
+   * Check if CSV data needs update and show popup if needed.
+   */
+  async checkAndShowCsvUpdatePopup(): Promise<void> {
+    try {
+      const status = await this.fetchCsvStatus();
+      this.csvLastUpdated = status.last_updated;
+
+      const needsUpdate = !status.last_updated || status.is_stale;
+      if (needsUpdate) {
+        this.showCsvUpdatePopup();
+      }
+    } catch (err) {
+      this.debug("CSV update popup check failed:", err as Error);
+    }
+  },
+
+  /**
+   * Handle the popup update button click - triggers CSV reload.
+   */
+  async handleCsvUpdatePopupClick(): Promise<void> {
+    const btn = document.getElementById("csv-modal-update-btn") as HTMLButtonElement | null;
+    const btnText = document.getElementById("csv-modal-btn-text");
+    const spinner = document.getElementById("csv-modal-spinner");
+
+    if (!btn) return;
+
+    btn.disabled = true;
+    if (btnText) btnText.textContent = window.t ? window.t("csv_update_popup_loading", "Updating...") : "Updating...";
+    if (spinner) spinner.classList.remove("hidden");
+
+    try {
+      await this.reloadCsv();
+    } finally {
+      this.hideCsvUpdatePopup();
+      btn.disabled = false;
+      if (spinner) spinner.classList.add("hidden");
+    }
+  },
 } as Partial<AppUiMixin>);
```

---

## Task 6: Rebuild JS from TypeScript

Run the project's build command to compile TypeScript to JavaScript:

```bash
bun run build
```

---

## Verification

1. Run `bun run build` to compile TS → JS
2. Open the app — popup should appear if data is stale/missing
3. Click "Update Data" — spinner shows, popup closes only after reload completes
4. Test with fresh data — popup should NOT appear
5. Run `ruff check .` and `ty check .` for backend (no backend changes expected)
6. Check existing e2e tests pass with `npx playwright test`

---

## Summary

- **5 files modified** (index.html, custom.css, it.json, en.json, app.ui.interactions.ts)
- **0 new files** created
- **0 backend changes** — all logic is frontend-only
- Existing `reloadCsv()` and `fetchCsvStatus()` functions are reused
- Popup blocks interaction (body scroll locked) until reload completes
- Follows existing i18n, CSS variable, and component patterns in codebase
