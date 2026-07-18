# BenzoApp — Codebase Audit Fixes + UI/UX Redesign ("Totem" palette)

## Context

Literal ask: deep-audit the codebase for issues, bad practices, and conflicts; improve UI/UX; choose a better color palette; deliver tasks with all code diffs.

Findings are verified against source. Headline defects: (1) cache-write race — all writers share one temp name `prezzi_data.json.part` and `/api/reload-csv` never takes the fetch lock (stale `data/prezzi_data.json.part` is direct evidence); (2) `/api/reload-csv` is unrate-limited, deletes the cache before fetching, and returns HTTP 200 on failure; (3) `reload_in_progress` is never true for manual reloads (`_reload_task` never assigned); (4) frontend discards station results whenever the backend also sends a warning; (5) retry decorators re-fire deterministic HTTPExceptions; (6) duplicate price rows keep the *cheapest* not the *newest*; (7) palette is triplicated (base.css tokens ↔ inline Tailwind config ↔ docs-page green `#00c853`) with 10+ hardcoded `rgba(249,115,22,…)` literals; (8) app CSS loads before Leaflet so every Leaflet override is dead (white popups in dark theme); (9) station cards lack `aria-label` — e2e currently failing; (10) orange text fails WCAG AA in light theme (2.57–2.80:1).

End state: race-free locked cache/reload path with truthful status; frontend keeps results on non-fatal warnings; single token source in `base.css`; new petrol-ink + signal-amber palette ("Totem": night-canopy neutrals + amber price-totem accent) with WCAG-AA-verified values; typography Inter → Bricolage Grotesque (display) + Instrument Sans (body); UX fixes (a11y, chips, autocomplete, tap targets, themed map markers, docs-page parity). Palette direction and "keep Tailwind Play CDN" were user decisions.

Conventions: Python via `uv run`, lint `ruff check .`, types `ty check .`; TS compiled 1:1 by `bun run build:ts` (tsc) into `src/static/js/` (committed); biome via `bun run lint:ts`. After EVERY phase, the checks listed in Verification for that phase must pass.

---

## Approach

### Phase 1 — Backend: cache-write race + reload endpoint lockdown

#### Step 1.1 — Unique temp names in `src/services/csv_cache.py`

In `_write_json_file` (csv_cache.py:76), the shared temp name lets concurrent writers interleave:

```diff
-        tmp = p.with_name(f"{p.name}.part")
+        tmp = p.with_name(f"{p.name}.{uuid.uuid4().hex}.part")
```

- Add `import uuid` to the module imports (after `import json`).
- Update the docstring line "Serialize to a temporary file next to the final path (``<name>.part``)." → "(``<name>.<uuid>.part``)".
- Delete the stale artifact `data/prezzi_data.json.part` (untracked; `data/` is gitignored, verified `.gitignore:317`).
- Failure handling: unchanged — existing try/except already cleans up the temp file.

#### Step 1.2 — Lock down `/api/reload-csv` and register its task in `src/main.py`

Replace the whole endpoint (main.py:695-731) with:

```python
@limiter.limit("3/minute")
@app.post("/api/reload-csv")
async def reload_csv(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any] | JSONResponse:
    """Force reload of CSV data.

    Returns:
    - 200 with status message and new CSV timestamp on success.
    - 409 if a reload (manual or startup) is already in progress.
    - 502 if the fetch/parse/save flow fails.
    """
    if _is_reload_in_progress():
        return JSONResponse(
            status_code=409,
            content={"status": "error", "message": "CSV reload already in progress"},
        )
    logger.info("Manual CSV reload requested via API")
    app_context: AppContext = request.app.state.app_context
    task = _start_background_task(request.app, "_reload_task", _run_csv_reload(settings, app_context))
    ok = await task
    if not ok:
        return JSONResponse(
            status_code=HTTP_STATUS_BAD_GATEWAY,
            content={"status": "error", "message": "CSV reload failed; see server logs"},
        )
    return {
        "status": "success",
        "message": "CSV reload completed successfully",
        "last_updated": get_latest_csv_timestamp(settings),
    }
```

Change `_run_csv_reload` (main.py:382-413) to take the shared context, run under the fetch lock, and reuse the shared client (identical timeout/headers, verified main.py:417-420):

```python
async def _run_csv_reload(settings: Settings, app_context: AppContext) -> bool:
    """Fetch, parse, cache, save, and clean CSV data for manual reload.

    Runs under ``app_context.csv_fetch_lock`` so it cannot interleave cache
    writes with the search cold path; reuses the shared lifespan HTTP client.

    Returns:
    - True on success, False if any step raised an exception.
    """
    try:
        logger.debug("Starting CSV fetch...")
        async with app_context.csv_fetch_lock:
            anag_text, prezzi_text = await _fetch_csvs(app_context.http_client, settings)
            force_delimiter = None if settings.prezzi_csv_delimiter == "auto" else settings.prezzi_csv_delimiter
            combined = await asyncio.to_thread(
                lambda: _parse_and_combine_sync(anag_text, prezzi_text, force_delimiter),
            )
            await _write_json_file(settings.prezzi_cache_path, combined)
            saved_dir = await _save_csv_files(anag_text, prezzi_text, settings)
            if saved_dir:
                logger.info("CSV reload completed successfully, saved to: {}", saved_dir)
            else:
                logger.warning("CSV reload completed but failed to save local copies")
            await asyncio.to_thread(csv_admin.cleanup_candidate_csvs, settings)
            logger.info("Cleaned up old CSV files across all candidate directories")
    except Exception as err:
        logger.error("Async CSV reload failed: {}", err)
        logger.exception(err)
        return False
    else:
        return True
```

- Delete `_remove_cache_file` (main.py:365-379) — its only caller was the old endpoint; the fetch overwrites the cache atomically via Step 1.1, so the old cache survives a failed reload (better availability). Do NOT set `app_context.csv_freshly_downloaded` on manual reload: that flag drives the startup "update required" popup via `_startCsvReloadPolling`; manual reload feedback comes from the direct response + the banner that now fires because `_reload_task` is registered.
- Callers of `_run_csv_reload`: only the endpoint (grep `_run_csv_reload` — exactly 2 hits). Test `tests/test_main.py:139` monkeypatches `_fetch_csvs/_parse_and_combine_sync/_write_json_file/_save_csv_files/get_latest_csv_timestamp` — all still used with the same names, and asserts 200 + `status=="success"` + `last_updated`, which the success path still returns.
- Frontend contract: `reloadCsv` in `src/static/ts/app.ui.csv.ts` treats any non-200 as error and reads `result.last_updated` on 200 — compatible unchanged; the +2s `fetchCsvStatus` now also sees the `reload_in_progress` true→false transition and fires the existing "Data reloaded" toast.

### Phase 2 — Backend: correctness + hygiene

#### Step 2.1 — Stop retrying deterministic HTTPExceptions

`src/services/fuel_api.py:26` — `fetch_gas_stations` raises `HTTPException(422)` for schema errors and wraps all failures in `HTTPException(503)`; tenacity retries them 3×:

```diff
-from tenacity import retry, stop_after_attempt, wait_exponential
+from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

-@retry(stop=stop_after_attempt(3), wait=wait_exponential(), reraise=True)
+@retry(
+    stop=stop_after_attempt(3),
+    wait=wait_exponential(),
+    retry=retry_if_not_exception_type(HTTPException),
+    reraise=True,
+)
```

`src/services/geocoding.py:456` — same fix on `geocode_city` (imports at geocoding.py:12-14 already include `HTTPException`; extend the tenacity import identically):

```diff
-from tenacity import retry, stop_after_attempt, wait_exponential
+from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

-@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), reraise=True)
+@retry(
+    stop=stop_after_attempt(3),
+    wait=wait_exponential(multiplier=1, min=2, max=10),
+    retry=retry_if_not_exception_type(HTTPException),
+    reraise=True,
+)
```

#### Step 2.2 — Duplicate price rows: newest date wins (`src/services/csv_parser.py`)

At csv_parser.py:416-424 the merge keeps the *cheapest* duplicate (`price < existing.get("prezzo", …)`), which surfaces stale cheaper prices. Reuse the existing `_parse_date` helper (csv_parser.py:41) and replace:

```python
        existing = data[id_impianto]["prezzi"].get(canonical)
        if price is not None:
            new_date = _parse_date(row[date_idx] if date_idx < len(row) else "")
            existing_date = _parse_date(existing.get("data")) if existing else None
            # Newest report wins; equal/unparseable dates fall back to lowest price.
            should_replace = (
                existing is None
                or (new_date is not None and existing_date is None)
                or (
                    new_date is not None
                    and existing_date is not None
                    and new_date > existing_date
                )
                or (new_date == existing_date and price < existing.get("prezzo", float("inf")))
            )
            if should_replace:
                data[id_impianto]["prezzi"][canonical] = {
                    "prezzo": price,
                    "self": (row[self_idx] == "1") if self_idx < len(row) else False,
                    "data": row[date_idx] if date_idx < len(row) else "",
                }
                updates_applied += 1
```

Rewrite the enshrining test `tests/test_csv_parser.py:127` `test_parse_prezzi_duplicate_station_ids_keeps_lowest_price`:

```python
def test_parse_prezzi_duplicate_station_ids_keeps_newest():
    """When the same station/fuel appears twice, the row with the newest date wins."""
    data = _base_data("1")
    csv_text = "col0|col1|col2|col3|col4\n1|benzina|1,50|1|01/01/2026\n1|benzina|1,80|1|02/01/2026\n"

    _parse_prezzi(csv_text, data)

    assert data["1"]["prezzi"]["benzina"]["prezzo"] == 1.8

    # Reverse row order must yield the same result (newest date wins).
    data2 = _base_data("1")
    csv_text2 = "col0|col1|col2|col3|col4\n1|benzina|1,80|1|02/01/2026\n1|benzina|1,50|1|01/01/2026\n"

    _parse_prezzi(csv_text2, data2)

    assert data2["1"]["prezzi"]["benzina"]["prezzo"] == 1.8
```

Also kill the magic 5 at csv_parser.py:471: add `from src.models import DEFAULT_RESULTS_COUNT` (no circularity — models imports only pydantic) and change `max_items = int(params.results) if params else 5` → `max_items = int(params.results) if params else DEFAULT_RESULTS_COUNT`.

#### Step 2.3 — Delete the double parse/cache-write (`src/services/prezzi_csv.py`)

After a cold fetch the facade saves CSVs, re-loads them, re-parses, and re-writes the cache with identical content (prezzi_csv.py:112-121). Replace:

```diff
             await _write_json_file(settings.prezzi_cache_path, combined)
-            saved_dir = await _save_csv_files(anag_text, prezzi_text, settings)
-            if saved_dir:
-                try:
-                    anag_text2, prezzi_text2 = await _load_local_csvs(settings)
-                    combined2 = await asyncio.to_thread(
-                        lambda: _parse_and_combine_sync(anag_text2, prezzi_text2, force_delimiter),
-                    )
-                    await _write_json_file(settings.prezzi_cache_path, combined2)
-                except Exception as e:
-                    logger.warning("Failed to refresh cache after saving CSVs: {}", e)
+            await _save_csv_files(anag_text, prezzi_text, settings)
```

Remove the now-unused `_load_local_csvs` from the `from src.services.csv_fetcher import (...)` block (prezzi_csv.py:29-33) — it is the file's only usage.

#### Step 2.4 — Blocking sync I/O out of async paths

`src/main.py` `render_docs` (main.py:600-606): add a sync helper next to `_resolve_docs_page` and call it via `asyncio.to_thread` (also collapses the exists/read TOCTOU):

```python
def _load_docs_content(page: str) -> tuple[str, str]:
    """Resolve and read a docs Markdown page plus the docs CSS (blocking I/O; call via to_thread)."""
    md_path = _resolve_docs_page(page)
    md_text = md_path.read_text(encoding="utf-8")
    docs_css_path = static_dir / "css" / "docs.css"
    return md_text, docs_css_path.read_text(encoding="utf-8")
```

```diff
-    md_path = _resolve_docs_page(page)
-    md_text = md_path.read_text(encoding="utf-8")
+    md_text, docs_css = await asyncio.to_thread(_load_docs_content, page)
     rendered = _render_markdown(md_text)
-
-    # Read docs CSS for inlining
-    docs_css_path = static_dir / "css" / "docs.css"
-    docs_css = docs_css_path.read_text(encoding="utf-8")
```

`src/services/csv_fetcher.py` — wrap the sync glob/stat in `_load_single_csv` (:79-80) and the identical pattern at :307-308:

```diff
-        files = sorted(d.glob(glob_pattern), key=lambda p: p.stat().st_mtime, reverse=True)
+        files = await asyncio.to_thread(
+            lambda: sorted(d.glob(glob_pattern), key=lambda p: p.stat().st_mtime, reverse=True),
+        )
```

#### Step 2.5 — Tighten CORS (`src/main.py:476-481`)

Same-origin app plus credentialled `*` methods/headers is over-broad:

```diff
 app.add_middleware(
     CORSMiddleware,
     allow_origins=get_settings().cors_allowed_origins,
     allow_credentials=True,
-    allow_methods=["*"],
-    allow_headers=["*"],
+    allow_methods=["GET", "POST"],
+    allow_headers=["Content-Type"],
 )
```

#### Step 2.6 — Stop mounting the whole `docs/` tree (`src/main.py:487-489`)

`/docs-static` exposes `docs/plans`, `docs/agents`, etc. The only referenced assets are screenshots (verified: `user-en.md`/`user-it.md` reference only `screenshots/main.jpg`, resolved via `<base href='/docs-static/'>`):

```diff
-# Serve docs assets (images, included files) under a static route
-docs_dir = Path(__file__).parent.parent / "docs"
-app.mount("/docs-static", StaticFiles(directory=docs_dir), name="docs_static")
+# Serve only docs screenshot assets; other docs/ content (plans, agents) stays private.
+docs_dir = Path(__file__).parent.parent / "docs"
+app.mount("/docs-static/screenshots", StaticFiles(directory=docs_dir / "screenshots"), name="docs_static")
```

URLs stay `/docs-static/screenshots/main.jpg` — unchanged for the markdown.

#### Step 2.7 — Config conflicts: dead setting, env example, stale docstrings

- Delete the dead field `prezzi_carburante_api_url` from `Settings` (src/models.py:54-57) — zero usages anywhere (verified grep over src/tests/docs).
- Rewrite `.env.example` wholesale (removes phantom `DEFAULT_RESULTS`/`MIN_RADIUS`/`MAX_RADIUS` and dead `PREZZI_CARBURANTE_API_URL`; documents every real `Settings` key):

```dotenv
# Environment variables for BenzoApp

# -------------------------
# Geocoding
# -------------------------
# Base URL for the OpenStreetMap Nominatim API (city -> coordinates).
NOMINATIM_API_URL=https://nominatim.openstreetmap.org/search
# Photon fallback geocoder URL.
PHOTON_API_URL=https://photon.komoot.io/api/
# Geocoding cache size / TTL.
GEOCODING_CACHE_MAXSIZE=1000
GEOCODING_CACHE_TTL_SECONDS=86400

# -------------------------
# Security
# -------------------------
# Comma-separated list of allowed CORS origins (dev frontend).
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
# User-Agent for external APIs; must include contact info per Nominatim policy.
USER_AGENT=BenzoApp/1.0 (+https://example.com)
# Rate-limit client key: remote-address | x-forwarded-for | x-real-ip
SLOWAPI_KEY_FUNC=remote-address

# -------------------------
# Prezzi CSV source & cache
# -------------------------
PREZZI_CSV_ANAGRAFICA_URL=https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv
PREZZI_CSV_PREZZI_URL=https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv
PREZZI_CACHE_PATH=data/prezzi_data.json
PREZZI_CSV_HTTP_META_PATH=data/prezzi_csv_http_meta.json
PREZZI_CACHE_HOURS=24
# 'auto' to sniff, or force '|' / ';'
PREZZI_CSV_DELIMITER=auto
# Optional local CSV directory; unset falls back to data/ then legacy static dirs.
# PREZZI_LOCAL_DATA_DIR=
PREZZI_KEEP_VERSIONS=1
PREZZI_MIN_CSV_BYTES=10000
PREZZI_PRELOAD_ON_STARTUP=true
PREZZI_RELOAD_ON_STARTUP=true

# -------------------------
# Server
# -------------------------
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
SERVER_RELOAD=true
SERVER_WORKERS=1
SEARCH_TIMEOUT_SECONDS=12
```

- Stale docstrings: `src/main.py` module docstring "Fetches gas station data from Prezzi Carburante API with retry logic." → "Fetches gas station data from the MIMIT Prezzi Carburante CSVs with retry logic."; `src/services/fuel_api.py` `fetch_gas_stations` docstring "Fetch gas stations from Prezzi Carburante API." → "Fetch gas stations from the MIMIT CSV sources." and its Returns line "The JSON response from the Prezzi Carburante API." → "The combined station payload from the CSV pipeline."

### Phase 3 — Frontend: behavior fixes

#### Step 3.1 — i18n interpolation params, CDN guard, fallback drift

`src/static/ts/i18n.ts`:

```diff
-function t(key: string, fallback = ""): string {
+function t(key: string, fallback = "", params?: Record<string, unknown>): string {
   if (typeof i18next !== "undefined" && i18next.t) {
-    const translated = i18next.t(key);
+    const translated = i18next.t(key, params);
```

Add a CDN-failure guard (currently `initI18next` throws a ReferenceError if the i18next CDN fails; static markup already carries Italian text):

```diff
 function initI18next(): void {
+  if (typeof i18next === "undefined") {
+    // CDN unavailable: keep the server-rendered text, translations disabled.
+    return;
+  }
   i18next.init(
```

```diff
 async function loadTranslations(lang: string): Promise<void> {
+  if (typeof i18next === "undefined") return;
   try {
```

Fix fallback drift in `updateDataI18nElements` (translated text is currently re-read as the next fallback):

```diff
   for (const el of Array.from(document.querySelectorAll("[data-i18n]"))) {
     const key = el.getAttribute("data-i18n");
     if (key) {
-      const fallback = el.textContent?.trim() || "";
-      (el as HTMLElement).innerText = t(key, fallback);
+      const htmlEl = el as HTMLElement;
+      // Cache the server-rendered text once; re-reading textContent after a
+      // translation would feed the translated string back as the fallback.
+      if (!htmlEl.dataset.i18nFallback)
+        htmlEl.dataset.i18nFallback = (htmlEl.textContent || "").trim();
+      htmlEl.innerText = t(key, htmlEl.dataset.i18nFallback);
     }
   }
   for (const el of Array.from(
     document.querySelectorAll("[data-i18n-placeholder]"),
   )) {
     const key = el.getAttribute("data-i18n-placeholder");
-    if (key)
-      (el as HTMLInputElement).placeholder = t(
-        key,
-        (el as HTMLInputElement).placeholder,
-      );
+    if (key) {
+      const input = el as HTMLInputElement;
+      if (!input.dataset.i18nFallback) input.dataset.i18nFallback = input.placeholder;
+      input.placeholder = t(key, input.dataset.i18nFallback);
+    }
   }
   for (const el of Array.from(
     document.querySelectorAll("[data-i18n-aria-label]"),
   )) {
     const key = el.getAttribute("data-i18n-aria-label");
-    if (key)
-      (el as HTMLElement).setAttribute(
-        "aria-label",
-        t(key, el.getAttribute("aria-label") || ""),
-      );
+    if (key) {
+      const htmlEl = el as HTMLElement;
+      if (!htmlEl.dataset.i18nFallback)
+        htmlEl.dataset.i18nFallback = htmlEl.getAttribute("aria-label") || "";
+      htmlEl.setAttribute("aria-label", t(key, htmlEl.dataset.i18nFallback));
+    }
   }
```

`src/static/ts/app.ui.helpers.ts:94` — same params passthrough in `translate`:

```diff
-  translate(key: string, fallback = ""): string {
-    if (typeof window.t === "function") return window.t(key, fallback);
+  translate(key: string, fallback = "", params?: Record<string, unknown>): string {
+    if (typeof window.t === "function") return window.t(key, fallback, params);
     if (typeof i18next !== "undefined" && i18next.t) {
-      const translated = i18next.t(key);
+      const translated = i18next.t(key, params);
```

`src/static/ts/globals.d.ts`: change `t: (key: string, fallback?: string) => string;` → `t: (key: string, fallback?: string, params?: Record<string, unknown>) => string;` and both `i18next` declarations' `t: (key: string) => string;` → `t: (key: string, params?: Record<string, unknown>) => string;`.

#### Step 3.2 — Locale keys (`src/static/locales/it.json`, `en.json`)

Add 3 keys — `language` is referenced by `header.html`'s `data-i18n-aria-label="language"` but missing from both files:

- it.json: `"language": "Lingua"`, `"search_timeout": "La ricerca è scaduta. Riprova."`, `"search_failed": "Ricerca non riuscita. Riprova."`
- en.json: `"language": "Language"`, `"search_timeout": "Request timed out. Please try again."`, `"search_failed": "Search failed. Please try again."`

Delete 13 dead keys from both files (zero references, verified by grep over `src/static`): `city`, `radius`, `results`, `price`, `distance`, `required`, `map_summary`, `search_city_label`, `city_suggestions`, `coords_missing`, `data_loading`, `no_data`, `data_reloading_startup`.

#### Step 3.3 — `submitForm` (`src/static/ts/app.ui.interactions.ts`)

Keep results on non-fatal warnings (backend sends `stations` + `warning` when stations were excluded — currently the UI blanks the list), persist recents only on success, and localize hardcoded error strings:

```diff
   this.error = "";
   this.searched = true;
-  this.saveRecentSearch?.({ ...this.formData });
-  this.updateRecentSearchesUI?.();
   const fuelToSend =
```

```diff
-      if (data.warning) {
-        this.error = data.warning;
-        this.results = [];
-      } else {
-        this.results =
-          (data.stations as Station[] | undefined)?.map((station: Station) => ({
-            ...station,
-            gestore: window.extractGestore(station),
-            distance: station.distance || "",
-          })) || [];
-        this.error = "";
-      }
+      this.results =
+        (data.stations as Station[] | undefined)?.map((station: Station) => ({
+          ...station,
+          gestore: window.extractGestore(station),
+          distance: station.distance || "",
+        })) || [];
+      // A warning accompanying stations is non-fatal (e.g. "N stations were
+      // excluded"): keep the results and announce the warning in the live region.
+      if (data.warning) {
+        this.error = this.results.length === 0 ? data.warning : "";
+        if (this.results.length > 0) {
+          const statusEl = document.getElementById("status-messages");
+          if (statusEl) statusEl.textContent = data.warning;
+        }
+      } else {
+        this.error = "";
+      }
+      // Persist only successful searches; coordinate-based (locate-me) searches
+      // are one-shot and must not pollute recents with the pseudo-city.
+      if (!(hasCoords && this.userLocation)) {
+        this.saveRecentSearch?.({ ...this.formData });
+        this.updateRecentSearchesUI?.();
+      }
```

```diff
-      if ((err as Error & { name?: string }).name === "AbortError")
-        this.error = "Request timed out. Please try again.";
-      else this.error = err instanceof Error ? err.message : "Unknown error";
+      if ((err as Error & { name?: string }).name === "AbortError")
+        this.error = this.translate("search_timeout", "Request timed out. Please try again.");
+      else
+        this.error =
+          err instanceof Error && err.message
+            ? err.message
+            : this.translate("search_failed", "Search failed. Please try again.");
```

Fix the two placeholder leaks (Step 3.1 enables params):

```diff
-      msg = window.t("results_count_other", `${n} stations found`);
+      msg = window.t("results_count_other", `${n} stations found`, { count: n });
```

```diff
           label: this.translate(
             "empty_increase_radius",
             `Search within ${doubled} km`,
+            { km: doubled },
           ),
```

#### Step 3.4 — Typing a city must clear locate-me state

`onCityInput` (app.ui.interactions.ts:42, bound to the input event at app.ui.dom.ts:259-264) never clears coords: after "use my location", free-typing "Roma" + Enter still searches the old GPS position because the backend prefers lat/lon:

```diff
   onCityInput(): void {
+    // Manual typing invalidates one-shot locate-me state; otherwise stale
+    // lat/lon silently overrides the city being typed (backend prefers coords).
+    this.formData.latitude = null;
+    this.formData.longitude = null;
+    this.userLocation = null;
     const value = (this.formData.city || "").trim().toLowerCase();
```

#### Step 3.5 — Destroy the Leaflet instance before dropping the ref

`updateMap` (app.ui.interactions.ts:805-813) nulls `this.map` without `remove()`, leaking Leaflet's window/document listeners:

```diff
     if (this.mapInitialized) {
       const mapContainer = document.getElementById("map");
       if (!mapContainer) {
+        // Destroy the Leaflet instance (removes map + listeners) before dropping the ref.
+        (this.map as { remove?: () => void } | null)?.remove?.();
         this.mapInitialized = false;
         this.map = null;
         this.initMap?.();
```

#### Step 3.6 — Delete the dead duplicate `placeMapAccordingToViewport`

The method is defined twice with identical bodies; `Object.assign` order (scripts load `app.ui.dom.js` then `app.ui.interactions.js`) makes the interactions copy win. Delete the losing copy: `src/static/ts/app.ui.dom.ts:335-371` (the entire `placeMapAccordingToViewport(): void { … },` block, leaving `} as Partial<AppUiMixin>);` intact).

#### Step 3.7 — One theme system, system-preference default

Theme logic exists 3× with conflicting defaults: index bootstrap forces `light`, `themeManager` forces `DEFAULT_THEME="light"`, docs `themeUtils` uses system preference (and docs pages flash dark because no bootstrap exists). Consolidate:

a) `src/static/index.html` inline bootstrap — follow the OS when nothing is stored:

```diff
-        stored = localStorage.getItem("app-theme");
-        theme = stored === "light" || stored === "dark" ? stored : "light";
+        stored = localStorage.getItem("app-theme");
+        theme =
+          stored === "light" || stored === "dark"
+            ? stored
+            : window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
+              ? "light"
+              : "dark";
```

b) `src/static/ts/app.config.ts` `themeManager.init` — same rule (Chromium defaults to light, so e2e determinism is preserved):

```diff
-    const theme: "light" | "dark" = (
-      storedTheme === "dark" || storedTheme === "light"
-        ? storedTheme
-        : (window.CONFIG.DEFAULT_THEME as "light" | "dark")
-    ) as "light" | "dark";
+    // No stored preference: follow the OS (headless/test environments report light).
+    const theme: "light" | "dark" =
+      storedTheme === "dark" || storedTheme === "light"
+        ? storedTheme
+        : this.getSystemPreference();
```

Keep `DEFAULT_THEME` in CONFIG (still used as a fallback in `app.ts`/`app.ui.dom.ts`).

c) Delete the duplicate docs-only implementation: `src/static/ts/theme-utils.ts` plus its compiled `src/static/js/theme-utils.js` and `theme-utils.js.map`. No references remain after Step 4.3 (verified: zero test/e2e references to `theme-utils`/`theme-icon-*` outside the docs template).

d) Rewrite `src/static/ts/docs-theme.ts` to use `window.themeManager` (loaded via `app.config.js` on docs pages after Step 4.3):

```ts
/**
 * Docs theme toggle - handles light/dark mode with SVG icons.
 * Uses global window.themeManager (app.config.js) for core theme logic.
 */
(() => {
  const btn = document.getElementById("docs-theme-toggle");
  const theme = window.themeManager;
  if (!btn || !theme) return;

  const updateIcons = (t: string): void => {
    const sun = document.getElementById("theme-icon-sun");
    const moon = document.getElementById("theme-icon-moon");
    const isLight = t === "light";
    sun?.classList.toggle("hidden", isLight);
    moon?.classList.toggle("hidden", !isLight);
  };

  const init = (): void => {
    theme.init();
    updateIcons(document.documentElement.getAttribute("data-theme") || "light");
  };

  const toggle = (): void => updateIcons(theme.toggle());

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    btn.addEventListener("click", toggle);
  } catch (err) {
    console.error("Docs theme init failed:", err);
  }
})();
```

e) Rebuild: `bun run build:ts`.

### Phase 4 — Palette consolidation (single token source)

Depends on: nothing. Phase 5 depends on this one.

#### Step 4.1 — Purge hardcoded accent literals via `color-mix`

`rgba(249,115,22,…)` is hardcoded in 9 live spots — a palette change silently misses them. Replace with `color-mix(in srgb, var(--color-primary) X%, transparent)` (2023+ browsers, same baseline as the existing arbitrary-value utilities):

`src/static/css/base.css`:

```diff
-  --shadow-card: 0 4px 12px rgba(249, 115, 22, 0.08);
+  --shadow-card: 0 4px 12px color-mix(in srgb, var(--color-primary) 12%, transparent);
```

```diff
 *:focus-visible {
   outline: 2px solid var(--color-primary);
   outline-offset: 2px;
-  box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.15);
+  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 15%, transparent);
```

```diff
 ::selection {
-  background: rgba(249, 115, 22, 0.2);
+  background: color-mix(in srgb, var(--color-primary) 22%, transparent);
   color: inherit;
 }
```

`src/static/css/custom.css`:

```diff
 .station-card.selected {
   border-color: var(--color-primary);
   border-left: 4px solid var(--color-primary);
   box-shadow:
     var(--shadow-card),
-    0 0 20px rgba(249, 115, 22, 0.15);
+    0 0 20px color-mix(in srgb, var(--color-primary) 15%, transparent);
   transform: translateY(-2px);
   background: linear-gradient(
     90deg,
-    rgba(249, 115, 22, 0.05) 0%,
+    color-mix(in srgb, var(--color-primary) 5%, transparent) 0%,
     var(--bg-surface) 20%
   );
```

```diff
 .station-card:focus-visible {
   outline: 2px solid var(--color-primary);
   outline-offset: 2px;
   box-shadow:
-    0 0 0 4px rgba(249, 115, 22, 0.2),
+    0 0 0 4px color-mix(in srgb, var(--color-primary) 20%, transparent),
     var(--shadow-md);
```

```diff
 .csv-popup-icon {
   …
-  background: rgba(249, 115, 22, 0.15);
+  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
```

```diff
 .csv-popup-btn:hover:not(:disabled) {
   transform: translateY(-1px);
-  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
+  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 30%, transparent);
```

Scrollbar thumbs (stone-tinted literals → text-muted token), all three sites:

```diff
-    scrollbar-color: rgba(120, 113, 108, 0.45) transparent;
+    scrollbar-color: color-mix(in srgb, var(--text-muted) 45%, transparent) transparent;
…
-    background: rgba(120, 113, 108, 0.45);
+    background: color-mix(in srgb, var(--text-muted) 45%, transparent);
…
-    background: rgba(120, 113, 108, 0.65);
+    background: color-mix(in srgb, var(--text-muted) 65%, transparent);
```

Delete dead rules in custom.css: `.best-price-badge` (:265-267) + `@keyframes badge-entrance` (:246-260) + `@keyframes pulse-badge` (:301-309) — no element uses them (verified by grep; the badge markup uses gradient utilities instead).

#### Step 4.2 — Slim the inline Tailwind config (`src/static/index.html`)

Replace the whole `window.tailwind.config` block (index.html:68-134). Colors are deleted (verified: zero `text-primary`/`bg-benzina`-style utility usage — every template uses `var(--*)` arbitrary values); shadows become var references (single source = base.css); dead `pulse-badge` is dropped; fonts updated (Step 5.3 adds the font files):

```js
    window.tailwind = window.tailwind || {};
    window.tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          fontFamily: {
            sans: ["Instrument Sans", "system-ui", "sans-serif"],
            display: ["Bricolage Grotesque", "Instrument Sans", "system-ui", "sans-serif"],
            mono: ["JetBrains Mono", "Fira Code", "monospace"],
          },
          borderRadius: {
            sm: "8px",
            md: "12px",
            lg: "16px",
            xl: "24px",
          },
          boxShadow: {
            sm: "var(--shadow-sm)",
            md: "var(--shadow-md)",
            lg: "var(--shadow-lg)",
            xl: "var(--shadow-xl)",
            card: "var(--shadow-card)",
          },
          animation: {
            shimmer: "shimmer 1.5s infinite",
            spin: "spin 1s linear infinite",
            "loading-pulse": "loading-pulse 1.5s ease-in-out infinite",
          },
          keyframes: {
            shimmer: {
              "0%": { backgroundPosition: "200% 0" },
              "100%": { backgroundPosition: "-200% 0" },
            },
            "loading-pulse": {
              "0%, 100%": { opacity: "1" },
              "50%": { opacity: "0.6" },
            },
          },
        },
      },
    };
```

#### Step 4.3 — Docs page template parity (`src/main.py:608-668`)

The docs generator ships a green `primary: '#00c853'` config, no theme bootstrap (dark FOUC for light users), no `lang`, and a render-blocking Tailwind CDN. In the `html_page` f-string (keep the `{{`/`}}` escaping):

- Add before the f-string: `doc_lang = "en" if page.endswith("-en") else "it"` and change `<html>` → `<html lang='{doc_lang}'>`.
- Add as the FIRST element of `<head>` (before stylesheets, kills the FOUC):

```
            <script>
            (() => {{
              try {{
                const stored = localStorage.getItem("app-theme");
                const theme = stored === "light" || stored === "dark" ? stored
                  : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
                document.documentElement.setAttribute("data-theme", theme);
              }} catch (_e) {{
                document.documentElement.setAttribute("data-theme", "light");
              }}
            }})();
            </script>
```

- Add the font links (docs config now references these families):

```
            <link rel='preconnect' href='https://fonts.googleapis.com'>
            <link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>
            <link href='https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap' rel='stylesheet'>
```

- Replace the green tailwind config with the same slim config as index (f-escaped):

```
            <script>
            window.tailwind = window.tailwind || {{}};
            window.tailwind.config = {{
              darkMode: 'class',
              theme: {{
                extend: {{
                  fontFamily: {{
                    sans: ['Instrument Sans', 'system-ui', 'sans-serif'],
                    display: ['Bricolage Grotesque', 'Instrument Sans', 'system-ui', 'sans-serif'],
                  }},
                  borderRadius: {{ sm: '8px', md: '12px', lg: '16px', xl: '24px' }},
                  boxShadow: {{
                    sm: 'var(--shadow-sm)',
                    md: 'var(--shadow-md)',
                    lg: 'var(--shadow-lg)',
                    xl: 'var(--shadow-xl)',
                    card: 'var(--shadow-card)',
                  }},
                }},
              }},
            }};
            </script>
            <script defer src='https://cdn.tailwindcss.com'></script>
```

- Swap the deleted theme module for the shared one:

```diff
-            <script src='/static/js/theme-utils.js' defer></script>
+            <script src='/static/js/app.config.js' defer></script>
             <script src='/static/js/docs-theme.js' defer></script>
```

### Phase 5 — "Totem" palette + typography + UX polish

Depends on Phase 4. All contrast values below were computed (WCAG relative luminance) and pass the pins in `tests/test_ui_accessibility.py` (fuel colors, `--chip-active-text`, `--text-muted` ≥4.5:1 vs each theme's `--bg-primary`; `--color-primary` ≥2.0 vs white; required var names preserved). The test parses blocks with `[^}]*` regexes — no nested braces inside `:root`/`[data-theme="light"]` blocks (`color-mix` has parens only, safe).

#### Step 5.1 — New token blocks (`src/static/css/base.css`)

Replace the four token blocks verbatim (dark `:root` IS the default theme):

```css
/* Theme Variables - Used by Tailwind dark: variants and inline styles */
:root {
  /* Primary Accent - Signal Amber (station price-totem) */
  --color-primary: #f0a424;
  --color-primary-light: #ffd79a;
  --color-primary-hover: #f7bc5c;
  --color-primary-dark: #a16607; /* white text 4.75:1 (buttons, badges, skip-link) */
  --color-primary-darker: #8f5f0c; /* white text 5.51:1 */
  --color-primary-text: #f7bc5c; /* amber for text on dark surfaces: 10.9:1 on --bg-primary */

  /* Dark Theme - Petrol Ink Tones */
  --bg-primary: #0d1512;
  --bg-surface: #152019;
  --bg-elevated: #203028;
  --border-color: #31473b;
  --text-primary: #eef5f0;
  --text-secondary: #a9bdb1;
  --text-muted: #82a08f; /* 6.51:1 on --bg-primary */

  /* Feedback */
  --color-error: #f87171; /* 6.70:1 on --bg-primary */
  --color-error-bg: color-mix(in srgb, var(--color-error) 12%, transparent);
  --color-error-border: color-mix(in srgb, var(--color-error) 25%, transparent);

  /* Typography */
  --font-sans: "Instrument Sans", system-ui, sans-serif;
  --font-display: "Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif;

  /* Design Tokens - Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Design Tokens - Shadows */
  --shadow-sm: 0 1px 2px rgba(4, 10, 8, 0.3);
  --shadow-md:
    0 4px 6px -1px rgba(4, 10, 8, 0.35), 0 2px 4px -2px rgba(4, 10, 8, 0.25);
  --shadow-lg:
    0 10px 15px -3px rgba(4, 10, 8, 0.4),
    0 4px 6px -4px rgba(4, 10, 8, 0.3);
  --shadow-xl:
    0 20px 25px -5px rgba(4, 10, 8, 0.45),
    0 8px 10px -6px rgba(4, 10, 8, 0.35);
  --shadow-card: 0 4px 12px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

/* Light Theme - Warm Porcelain */
[data-theme="light"] {
  --bg-primary: #f6f4ee;
  --bg-surface: #ffffff;
  --bg-elevated: #ece9df;
  --border-color: #d8d3c3;
  --text-primary: #182420;
  --text-secondary: #46564d; /* 7.78:1 on --bg-surface */
  --text-muted: #5f7268; /* 4.66:1 on --bg-primary */
  --color-primary-hover: #c07f16;
  --color-primary-darker: #8f5f0c;
  --color-primary-text: #8a5a08; /* 5.92:1 on --bg-surface, 4.87:1 on --bg-elevated */
  --color-error: #b91c1c; /* 6.47:1 on --bg-surface */

  --shadow-sm: 0 1px 2px rgba(24, 36, 32, 0.06);
  --shadow-md:
    0 4px 6px -1px rgba(24, 36, 32, 0.09), 0 2px 4px -2px rgba(24, 36, 32, 0.06);
  --shadow-lg:
    0 10px 15px -3px rgba(24, 36, 32, 0.1),
    0 4px 6px -4px rgba(24, 36, 32, 0.06);
  --shadow-xl:
    0 20px 25px -5px rgba(24, 36, 32, 0.12),
    0 8px 10px -6px rgba(24, 36, 32, 0.06);
}

/* Fuel Type Colors - Italian pump-nozzle conventions; shades verified >=4.5:1 on --bg-primary */
:root {
  --fuel-benzina-color: #4ade80;
  --fuel-gasolio-color: #fbbf24;
  --fuel-gpl-color: #60a5fa;
  --fuel-metano-color: #2dd4bf;
  --chip-active-text: #14201a;
}

[data-theme="light"] {
  --fuel-benzina-color: #137a3a; /* 4.93:1 */
  --fuel-gasolio-color: #9a5e07; /* 4.80:1 */
  --fuel-gpl-color: #1d4ed8; /* 6.09:1 */
  --fuel-metano-color: #0f766e; /* 4.98:1 */
  --chip-active-text: #ffffff;
}

/* Glass Morphism - Petrol Tones */
:root {
  --glass-bg: rgba(21, 32, 25, 0.85);
  --glass-border: rgba(238, 245, 240, 0.08);
}

[data-theme="light"] {
  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(24, 36, 32, 0.08);
}
```

Notes: dead tokens `--transition-normal/--transition-slow/--space-*` are intentionally dropped (zero references, verified). `--color-primary-hover` is kept because the test requires the name. Everything else in base.css (focus-visible, sr-only, reduced-motion, selection, high-contrast, skip-link) stays as-is.

#### Step 5.2 — `src/static/css/custom.css` follow-ups

- `.csv-popup-status { color: var(--color-primary); }` → `color: var(--color-primary-text);`
- Append marker styles (used by Step 5.8; `.user-location-marker::after` pulse already exists and re-palettes automatically via the var):

```css
/* Themed station map markers (replace default Leaflet blue pins) */
.station-marker {
  background: transparent;
  border: none;
}

.station-marker-dot {
  display: block;
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  background: var(--color-primary);
  border: 3px solid var(--bg-surface);
  border-radius: 50%;
  box-shadow:
    var(--shadow-md),
    0 0 0 2px color-mix(in srgb, var(--color-primary) 45%, transparent);
}

/* User position dot (pulse ring comes from the existing ::after rule) */
.user-location-marker {
  background: var(--color-primary);
  border: 3px solid var(--bg-surface);
  border-radius: 50%;
  box-shadow: var(--shadow-md);
}
```

- Display font on headings/logo/price (font loaded in Step 5.3):

```css
.app-title,
.station-price,
.empty-message,
.csv-popup-title {
  font-family: var(--font-display);
}
```

#### Step 5.3 — `src/static/index.html` shell

```diff
-    <meta name="theme-color" content="#1c1917">
+    <meta name="theme-color" content="#0d1512" media="(prefers-color-scheme: dark)">
+    <meta name="theme-color" content="#f6f4ee" media="(prefers-color-scheme: light)">
```

```diff
-    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
+    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Fix the Leaflet load-order defeat (app CSS currently loads first, so every `.leaflet-*` override in custom.css loses — white popups on dark theme). Move the app stylesheet AFTER Leaflet's CSS:

```diff
-    <!-- Styles -->
-    <link rel="stylesheet" href="/static/css/styles.split.css">
     <!-- Leaflet -->
     <link
       rel="stylesheet"
       href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
       integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
       crossorigin="anonymous"
     >
+    <!-- Styles (after Leaflet so .leaflet-* overrides win) -->
+    <link rel="stylesheet" href="/static/css/styles.split.css">
```

```diff
-  <body class="bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen font-sans transition-colors duration-250">
+  <body class="bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen font-sans transition-colors duration-[250ms]">
```

(`duration-250` is not on Tailwind's scale — no CSS was generated.)

#### Step 5.4 — `src/static/templates/header.html`

Autocomplete dropdown currently anchors to the sticky header (spans full width) because no ancestor is positioned:

```diff
-  <div class="search-container flex-1 max-w-xl">
+  <div class="search-container relative flex-1 max-w-xl">
```

44px tap targets (WCAG 2.5.5):

```diff
-        class="reload-btn p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
+        class="reload-btn p-2 min-w-11 min-h-11 inline-flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
```

```diff
-      class="theme-toggle inline-flex items-center justify-center w-10 h-9 rounded-lg border …
+      class="theme-toggle inline-flex items-center justify-center w-11 h-11 rounded-lg border …
```
(apply to BOTH `theme-toggle` buttons: `#theme-toggle` and `#docs-link`)

```diff
-        class="lang-btn px-3 py-2 rounded-lg bg-[var(--bg-elevated)] …
+        class="lang-btn px-3 py-2 min-h-11 rounded-lg bg-[var(--bg-elevated)] …
```
(apply to both `#lang-en` and `#lang-it`; keep `hover:text-[var(--text-primary)]` — pinned by `tests/test_ui_buttons.py`.)

#### Step 5.5 — `src/static/templates/search.html`

Fuel chips carry `rounded-xl px-4 py-3` utilities that beat the `.chip` pill CSS (CDN injects later, equal specificity). Strip them from all four chips so the pill design applies:

```diff
-    class="chip benzina flex-1 min-w-24 justify-center inline-flex items-center gap-2 rounded-xl px-4 py-3"
+    class="chip benzina flex-1 min-w-24 justify-center inline-flex items-center gap-2"
```
(same for `chip gasolio`, `chip GPL`, `chip metano`)

Orange slider values fail AA on light surfaces; use the text-tuned token:

```diff
-      <span id="radius-value" class="font-bold text-[var(--color-primary)] min-w-12 text-center"></span>
+      <span id="radius-value" class="font-bold text-[var(--color-primary-text)] min-w-12 text-center"></span>
…
-      <span id="results-value" class="font-bold text-[var(--color-primary)] min-w-8 text-center"></span>
+      <span id="results-value" class="font-bold text-[var(--color-primary-text)] min-w-8 text-center"></span>
```

#### Step 5.6 — `src/static/templates/results.html`

Error box: hardcoded `red-500` utilities (3.76:1 on light — fails) → tokens; add the existing `error-message` class so its slide-in rule finally applies:

```diff
-    class="hidden flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 mt-4"
+    class="error-message hidden flex items-start gap-3 p-4 rounded-xl bg-[var(--color-error-bg)] border border-[var(--color-error-border)] mt-4"
…
-    <div class="error-icon w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
+    <div class="error-icon w-8 h-8 rounded-lg bg-[var(--color-error-border)] flex items-center justify-center flex-shrink-0">
…
-        class="text-red-500"
+        class="text-[var(--color-error)]"
…
-      <p class="text-sm font-medium text-red-500" id="error-text"></p>
+      <p class="text-sm font-medium text-[var(--color-error)]" id="error-text"></p>
```

Skeleton inconsistency: cards 1 and 3 use `rounded-lg` avatars, card 2 `rounded-xl` — make all three `rounded-xl`.

#### Step 5.7 — Station cards (`src/static/ts/app.ui.interactions.ts` `renderResults`)

a) Missing `aria-label` (currently failing e2e `tests/e2e/search.spec.ts:91-104`, which expects `/Distributore/` IT and `/Gas Station/` EN) + keyboard access (the `.station-card:focus-visible` CSS is dead without it):

```diff
       article.setAttribute("data-station-id", String(station.id ?? ""));
-      // Card is clickable but not focusable as a single button to avoid
-      // nested <button> elements (the action buttons handle their own focus).
+      // Card acts as one focusable control; inner action buttons keep their own focus.
+      const stationTypeLabel = this.translate("station", "Gas Station");
+      article.setAttribute(
+        "aria-label",
+        station.gestore ? `${stationTypeLabel} ${stationName}` : stationName,
+      );
+      article.tabIndex = 0;
+      article.setAttribute("role", "button");
```

```diff
       article.addEventListener("click", (e) => {
         // Ignore clicks on inner buttons (they handle their own action).
         const target = e.target as HTMLElement;
         if (target.closest("button")) return;
         this.selectStationForMap(station.id);
       });
+
+      article.addEventListener("keydown", (e: KeyboardEvent) => {
+        if (e.key !== "Enter" && e.key !== " ") return;
+        if ((e.target as HTMLElement).closest("button")) return;
+        e.preventDefault();
+        this.selectStationForMap(station.id);
+      });
```

b) Contrast + dead classes inside the card template:

```diff
-                <span class="text-2xl font-bold text-[var(--color-primary)]">
+                <span class="text-2xl font-bold text-[var(--color-primary-text)]">
```

```diff
-            ${station.fuel_prices && station.fuel_prices.length > 0 && !isCheapest ? `<span class="text-sm text-red-500 font-medium">${this.getPriceDifference(index)}</span>` : ""}
+            ${station.fuel_prices && station.fuel_prices.length > 0 && !isCheapest ? `<span class="text-sm text-[var(--color-error)] font-medium">${this.getPriceDifference(index)}</span>` : ""}
```

```diff
-          <div class="station-address-row flex items-start gap-2 text-sm text-[var(--text-secondary)] break-word overflow-wrap-break-word">
+          <div class="station-address-row flex items-start gap-2 text-sm text-[var(--text-secondary)] break-words">
…
-            <span class="break-word overflow-wrap-break-word leading-relaxed max-w-full">
+            <span class="break-words leading-relaxed max-w-full">
```
(`break-word`/`overflow-wrap-break-word` are not Tailwind utilities — no wrapping CSS was generated.)

c) Empty-state action chips (interactions.ts:430) misuse the `.chip` class (whose fuel `--chip-*` vars are unset there): drop it, the utilities already cover styling:

```diff
-          "chip inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";
+          "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";
```

#### Step 5.8 — Themed map markers + user position (`src/static/ts/app.map.ts`)

Default blue Leaflet pins clash with the palette, and `userLocation` is stored but never rendered (its pulse CSS was dead). Add module-level icon factories above `window.appMapMixin` (no existing equivalent found):

```ts
function getStationMarkerIcon(): unknown {
  return (
    L as unknown as {
      divIcon: (opts: {
        className: string;
        html: string;
        iconSize: [number, number];
        iconAnchor: [number, number];
      }) => unknown;
    }
  ).divIcon({
    className: "station-marker",
    html: '<span class="station-marker-dot" aria-hidden="true"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function getUserLocationIcon(): unknown {
  return (
    L as unknown as {
      divIcon: (opts: {
        className: string;
        html: string;
        iconSize: [number, number];
        iconAnchor: [number, number];
      }) => unknown;
    }
  ).divIcon({
    className: "user-location-marker",
    html: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
```

Use them and render the user dot; keep `_userMarker` out of `mapMarkers` so popup iteration is unaffected:

```diff
-      const marker = (
-        L as unknown as {
-          marker: (coords: [number, number]) => {
+      const marker = (
+        L as unknown as {
+          marker: (
+            coords: [number, number],
+            options?: { icon?: unknown },
+          ) => {
             addTo: (map: unknown) => {
               __station?: unknown;
               bindPopup: (content: string) => void;
               on: (event: string, handler: () => void) => void;
             };
           };
         }
-      )
-        .marker([station.latitude, station.longitude])
+      )
+        .marker([station.latitude, station.longitude], {
+          icon: getStationMarkerIcon(),
+        })
         .addTo(this.map);
```

At the end of `addMapMarkers` (after `fitBounds`):

```ts
    // Render the user's own position when a locate-me search is active.
    if (this.userLocation) {
      (this as { _userMarker?: { remove?: () => void } | null })._userMarker?.remove?.();
      this._userMarker = (
        L as unknown as {
          marker: (
            coords: [number, number],
            options?: { icon?: unknown },
          ) => { addTo: (map: unknown) => unknown };
        }
      )
        .marker([this.userLocation.lat, this.userLocation.lon], {
          icon: getUserLocationIcon(),
        })
        .addTo(this.map);
    }
```

And clean it up in `clearMapMarkers`:

```diff
       this.mapMarkers = {};
+      (this as { _userMarker?: { remove?: () => void } | null })._userMarker?.remove?.();
+      (this as { _userMarker?: unknown })._userMarker = null;
     }
```

#### Step 5.9 — `src/static/css/docs.css`

```diff
 .docs-content a {
-  color: var(--color-primary);
+  color: var(--color-primary-text);
   text-decoration: none;
 }
```

Append:

```css
/* Display font for docs headings */
.docs-content h1,
.docs-content h2,
.docs-content h3 {
  font-family: var(--font-display);
}
```

After Phases 3-5: run `bun run build:ts` (recompiles `src/static/js/*.js`, which is committed).

---

## Critical files & anchors

- `src/main.py` — `reload_csv` endpoint, `_run_csv_reload`, `_is_reload_in_progress`, docs `html_page` f-string: the race fix, status contract, and docs parity all land here; mind the f-string `{{`/`}}` escaping in the docs template.
- `src/static/css/base.css` — the four token blocks; `tests/test_ui_accessibility.py` parses them with `[^}]*` regexes, so no nested braces and fuel/bg/muted/chip vars must stay 6-digit hex literals.
- `src/static/ts/app.ui.interactions.ts` — `submitForm` (warning/recents/timeout), `onCityInput`, `updateMap`, `renderResults`; highest-density bug file (833 lines).
- `src/static/index.html` — inline bootstrap, inline Tailwind config, stylesheet order: three separate defects, one file.
- `src/services/csv_parser.py` — `_parse_prezzi` duplicate rule (:416) reuses `_parse_date` (:41); the magic 5 is at :471.

## Verification

Working dir: `D:\Workspace\BenzoApp`. Backend checks after Phases 1-2; frontend checks after Phases 3-5.

1. Unit/static gates:
   - `uv run python -m pytest tests/` — full suite green, including the rewritten `test_parse_prezzi_duplicate_station_ids_keeps_newest` and the contrast pins in `test_ui_accessibility.py` (they validate the NEW palette values).
   - `ruff check .` and `ty check .` — clean.
   - `bun run build:ts` — compiles; `bun run lint:ts` — clean.
2. Backend behavior (new paths, concrete):
   - Start the app: `uv run _main.py` (env: defaults; uses `data/` cache).
   - Reload lockdown: `curl -X POST http://127.0.0.1:8000/api/reload-csv` then immediately again while the first runs → second returns HTTP **409** `{"status":"error","message":"CSV reload already in progress"}`; first returns 200 with `last_updated`. During the first, `curl http://127.0.0.1:8000/api/csv-status` shows `"reload_in_progress": true`.
   - Cache integrity: after any reload, `data/` contains **no** `.part` files; `data/prezzi_data.json` parses as JSON.
   - Retry fix: search an unknown city (`curl -X POST http://127.0.0.1:8000/search -H "Content-Type: application/json" -d '{"city":"Zzzqq","radius":5,"fuel":"benzina","results":5}'`) → warning "City not found…" returns fast; server log shows ONE geocoding attempt, not 3.
3. Frontend behavior (browser, `http://127.0.0.1:8000`):
   - Search "Roma" → cards render; DevTools: `#stations-list article` has `aria-label="Distributore …"`; Tab to a card, press Enter → map pans and popup opens. Switch to EN → aria-labels read "Gas Station …".
   - Dark theme: click a station → popup surface is dark (`var(--bg-surface)`), not white (proves the Leaflet load-order fix); markers are amber dots, not blue pins.
   - Fuel chips are pill-shaped; active chip is a solid fill with readable text in both themes (toggle with the header button).
   - Type in the city field → suggestions dropdown is as wide as the search bar, not the header.
   - Locate-me (position button), then type "Milano" + Enter → results are near Milan, not the GPS position (proves Step 3.4); recent searches do NOT contain "Posizione Attuale".
   - Toggle both themes and reload the page: no flash of the wrong theme; docs page `/help/user-it` matches the app theme and shows no green accent.
4. E2E: with the server running, `bun run test:e2e` — the previously failing `search.spec.ts` aria-label test and `lang.spec.ts` pass.
5. Risk-tied check for Step 1.1/1.2: temporarily point `PREZZI_CSV_PREZZI_URL` at a 404 URL, restart, `curl -X POST …/api/reload-csv` → HTTP **502** and the previous `data/prezzi_data.json` is still intact (not deleted).

## Assumptions & contingencies

- Tailwind Play CDN is kept (user decision over a precompiled build). The inline config is now var-referenced, so the palette stays single-source regardless.
- `color-mix()` requires 2023+ browsers; if a legacy target appears, the fallback pattern is `rgba(var(--color-primary-rgb), α)` with a `--color-primary-rgb: 240 164 36;` triplet — apply the same percentages.
- New default for first-time visitors follows OS color scheme (previously forced light). E2E is unaffected (Chromium reports light). If a stakeholder wants forced-light back, the change is two lines (index bootstrap + `themeManager.init`).
- `theme-utils.ts` is deleted with no shim — zero references remain after Step 4.3 (clean cutover). If an external page hot-links `/static/js/theme-utils.js`, restore a 3-line delegating shim to `themeManager`.
- `freshly_downloaded` is intentionally NOT set by manual reloads (it drives the startup popup); the reload toast now fires from the registered `_reload_task` transition instead.
- If the reload 409/502 codes surface in other tests beyond `test_main.py:139` (none found by inspection), update those assertions — not the endpoint.
- If e2e flake appears around theme assertions after the system-preference change, set `colorScheme: 'light'` in `playwright.config.ts` `use` — do not revert the default logic.

## Housekeeping on execution start

The user asked for this plan at `plans/kimi.md`; plan mode blocked working-tree writes. First action on execution: copy this file verbatim to `plans/kimi.md`, then proceed with Phase 1.
