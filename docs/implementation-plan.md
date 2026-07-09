# Implementation Plan — Codebase Review Remediation

**Scope**: Ordered set of actionable tasks to address the issues, security findings, and bad practices reported in the review. Each task includes a rationale, affected file(s), test expectations, and one or more code diffs ready to apply.

---

## Phase 0 — Immediate security & correctness hardening

### Task 0.1 Escape `station.address` in every `innerHTML` rendering path
**Why**: `buildPopupContent` in `src/static/ts/app.ui.helpers.ts:133-137` interpolates `station.address` into HTML without escaping. Although the backend currently supplies trusted data, escaping all user-facing strings is defense in depth and closes the remaining innerHTML XSS vector.

**Files**:
- `src/static/ts/app.ui.helpers.ts:129-138`
- `src/static/ts/app.ui.interactions.ts:367-406` (address not present in current card template, but ensure no other data interpolation lacks escape)

**Changes**:
- Introduce an `address` variable escaped with `escapeHtml` inside `buildPopupContent`.
- Optionally, in card template, guard against future regressions by using `textContent` for address if address becomes part of the card later.

**Code diff**:
```diff
--- a/src/static/ts/app.ui.helpers.ts
+++ b/src/static/ts/app.ui.helpers.ts
@@
-  buildPopupContent(station: { gestore?: string; address?: string }): string {
+  buildPopupContent(station: { gestore?: string; address?: string }): string {
     const title =
       station.gestore || this.translate("translation.station", "Gas Station");
     const addressLabel = this.translate("translation.address", "Address");
-    return `
-      <div class="map-popup">
-        <strong>${title}</strong><br>
-        <span class="map-popup-address">${addressLabel}: ${station.address}</span>
-      </div>`;
+    const addressValue = station.address ? escapeHtml(station.address) : "";
+    const addressBlock = addressValue
+      ? `<span class="map-popup-address">${addressLabel}: ${addressValue}</span>`
+      : "";
+    return `
+      <div class="map-popup">
+        <strong>${escapeHtml(title)}</strong><br>
+        ${addressBlock}
+      </div>`;
   },
```

**Test expectations**: No TypeScript compilation errors. Existing UI/e2e tests (if any) continue to render popups.

---

### Task 0.2 Consolidate duplicated broad-exception fallback in `csv_fetcher._fetch_csvs`
**Why**: `src/services/csv_fetcher.py:126-166` repeats the identical local-fallback-and-re-raise pattern three times: for `HTTPStatusError`, `RequestError`, and `Exception`. This raises cyclomatic complexity, makes maintenance error-prone, and broadens the catch scope.

**Files**: `src/services/csv_fetcher.py`

**Changes**:
- Collapse the three `except ...` blocks into a single `except Exception` that handles the known status and network cases via conditional inspection (raise original only for non-recoverable cases not caught by explicit branches lower in the function).
- Keep specific `isinstance` checks for logging only; re-raise the original after local fallback fails.

**Proposed pseudo-patch guidance**:
1. Replace lines 126-166 with a single `except Exception` block.
2. Inside, determine whether to:
   - Treat `HTTPStatusError` with `response.status_code != HTTP_NOT_MODIFIED` as recoverable, otherwise fallback.
   - Treat `RequestError` as no-response fallback.
   - Treat any other `Exception` as unexpected but still attempt local fallback.
3. Log distinguishing details via `logger.bind`. Do not swallow recoverable errors; re-raise original only when fallback also raises.

**Concrete diff**:
```diff
--- a/src/services/csv_fetcher.py
+++ b/src/services/csv_fetcher.py
@@
-    try:
+    try:
         resp_anag, resp_prezzi = await asyncio.gather(
             http_client.get(settings.prezzi_csv_anagrafica_url, headers=anag_req_headers),
             http_client.get(settings.prezzi_csv_prezzi_url, headers=prezzi_req_headers),
         )
         # 304 Not Modified è atteso — raise_for_status solo per errori 4xx/5xx
         if resp_anag.status_code != HTTP_NOT_MODIFIED:
             resp_anag.raise_for_status()
         if resp_prezzi.status_code != HTTP_NOT_MODIFIED:
             resp_prezzi.raise_for_status()
-    except httpx.HTTPStatusError as e:
-        logger.error("HTTP error fetching CSV: status={} url={}", e.response.status_code, e.response.url)
-        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
-        original_exc = e
-        try:
-            return await _load_local_csvs(settings)
-        except Exception:
-            logger.error("Local fallback failed, re-raising original HTTP error")
-            logger.exception(original_exc)
-            raise original_exc from e
-    except httpx.RequestError as e:
-        url = str(e.request.url) if e.request else "unknown"
-        logger.error("Network error fetching CSV: {} - url={}", type(e).__name__, url)
-        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
-        original_exc = e
-        try:
-            return await _load_local_csvs(settings)
-        except Exception:
-            logger.error("Local fallback failed, re-raising original network error")
-            logger.exception(original_exc)
-            raise original_exc from e
-    except Exception as e:
-        logger.error("Unexpected error fetching CSV: {} - {}", type(e).__name__, e)
-        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
-        original_exc = e
-        try:
-            return await _load_local_csvs(settings)
-        except Exception:
-            logger.error("Local fallback failed, re-raising original unexpected exception")
-            logger.exception(original_exc)
-            raise original_exc from e
+    except Exception as original_exc:
+        status = getattr(original_exc, "response", None)
+        kind = "HTTPStatusError" if isinstance(original_exc, httpx.HTTPStatusError) else (
+            "RequestError" if isinstance(original_exc, httpx.RequestError) else type(original_exc).__name__
+        )
+        if isinstance(original_exc, httpx.HTTPStatusError) and status is not None:
+            logger.error(
+                "HTTP error fetching CSV: kind={} status={} url={}",
+                kind, status.status_code, original_exc.response.url,
+            )
+        elif isinstance(original_exc, httpx.RequestError):
+            url = str(getattr(getattr(original_exc, "request", None), "url", "unknown"))
+            logger.error("Network error fetching CSV: kind={} url={}", kind, url)
+        else:
+            logger.error("Unexpected error fetching CSV: kind={} err={}", kind, original_exc)
+        logger.warning("Attempting to fallback to local CSV files in {}", LOCAL_DATA_DIR)
+        try:
+            return await _load_local_csvs(settings)
+        except Exception:
+            logger.error("Local fallback failed, re-raising original exception")
+            logger.exception(original_exc)
+            raise original_exc from original_exc
```

**Test expectations**: `tests/test_prezzi_csv.py` conditional-fetch tests still pass; no new lint or type errors.

---

### Task 0.3 Add rationale comments to Bandit/subprocess `# noqa: S603`
**Why**: Suppressing a security warning without explanation weakens auditability. The call is safe because `git_executable` is resolved via `shutil.which` and no shell is used, but this should be explicit.

**File**: `scripts/check_sensitive_content.py`

**Diff**:
```diff
--- a/scripts/check_sensitive_content.py
+++ b/scripts/check_sensitive_content.py
@@
-    return subprocess.run(  # noqa: S603
+    return subprocess.run(
+        # S603 safe: we resolve the git executable via shutil.which() above and pass
+        # args as a list without shell=True, so no shell interpretation occurs.
+        # noqa: S603
+        [
```

---

## Phase 1 — Architecture & resilience improvements

### Task 1.1 Encapsulate global mutable state into a dedicated app-context object
**Why**: `_cached_settings` (module-level global) and `app.state` (mutated across lifespan, endpoints, tasks) couple testability and lifecycle management tightly. Encapsulation makes recovery/setup explicit.

**Files**: `src/main.py`, test fixtures in `tests/conftest.py`

**Target shape**:
- Introduce `AppContext` dataclass (or Pydantic model) holding `settings`, `http_client`, `limiter`, reload flags, task refs.
- Replace `_cached_settings` with a singleton via `FastAPI` dependency: `def get_settings_dep() -> Settings`.
- Store context on `app.state` as a single object.

**Diff sketch**: provided here as pseudocode because the file borders change substantially.
```diff
--- a/src/main.py
+++ b/src/main.py
@@
-from src.models import (
-    DEFAULT_RESULTS_COUNT,
-    MAX_RESULTS_COUNT,
-    MAX_SEARCH_RADIUS_KM,
-    SearchRequest,
-    SearchResponse,
-    Settings,
-    StationSearchParams,
-)
+from src.models import (
+    DEFAULT_RESULTS_COUNT,
+    MAX_RESULTS_COUNT,
+    MAX_SEARCH_RADIUS_KM,
+    SearchRequest,
+    SearchResponse,
+    Settings,
+    StationSearchParams,
+)
@@
-_cached_settings: Settings | None = None
+class AppContext:
+    settings: Settings
+    http_client: httpx.AsyncClient
+    csv_freshly_downloaded: bool = False
+    reload_task: asyncio.Task[Any] | None = None
+    preload_task: asyncio.Task[Any] | None = None
+
+    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
+        self.settings = settings
+        self.http_client = http_client
+
+
+_app_context: AppContext | None = None
```
Replace all `app.state.http_client` with `app.state._app_context.http_client`, etc. Adjust lifespan to instantiate `AppContext`.

**Test expectations**: update conftest by setting `app.state._app_context` with concrete instances.

---

### Task 1.2 Stop re-exporting private symbols across service modules
**Why**: `src/services/prezzi_csv.py:64-96` makes `__all__` a facade over `csv_fetcher`, `csv_cache`, and `csv_parser` internals. This violates module boundaries and makes refactorings risky.

**Files**: `src/services/prezzi_csv.py`, callers in `src/main.py`

**Changes**:
- Remove `_candidate_local_csv_dirs`, `ADDR_IDX_END`, etc., from `prezzi_csv.__all__`.
- Re-export only truly public-ish behavior: `fetch_and_combine_csv_data`, `preload_local_csv_cache`, `check_preferred_local_dir_writable`, `get_latest_csv_timestamp`.
- Move any imports that legitimately need private symbols to direct imports from the owner module (e.g., `from src.services.csv_fetcher import _load_local_csvs`).
- Update `src/main.py` imports accordingly.

**Diff sketch**:
```diff
--- a/src/services/prezzi_csv.py
+++ b/src/services/prezzi_csv.py
@@
-# Re-export for backward compatibility
+# Re-export only the intended public surface
 __all__ = [
-    "ADDR_IDX_END",
-    "ADDR_IDX_START",
-    "DATE_IDX",
-    "DAYS_RECENCY",
-    "GESTORE_IDX",
-    "LAT_IDX",
-    "LOCAL_DATA_DIR",
-    "LON_IDX",
-    "MIN_CONTENT_LENGTH",
-    "MIN_CSV_COLUMNS",
-    "PREZZI_MIN_COLS",
-    "PRICE_IDX",
-    "PROJECT_ROOT",
-    "SELF_IDX",
-    "_candidate_local_csv_dirs",
-    "_cleanup_old_csvs",
-    "_fetch_csvs",
-    "_filter_and_transform_combined",
-    "_is_cache_fresh",
-    "_is_recent",
-    "_load_cached_combined",
-    "_load_local_csvs",
-    "_parse_and_combine_sync",
-    "_parse_date",
-    "_read_json_file",
-    "_save_csv_files",
-    "_write_json_file",
-    "check_preferred_local_dir_writable",
+    "check_preferred_local_dir_writable",
     "fetch_and_combine_csv_data",
     "get_latest_csv_timestamp",
     "preload_local_csv_cache",
 ]
```

**Test expectations**: All imports resolved; `pytest` still passes.

---

### Task 1.3 Replace hardcoded Italian cities in `geocoding.py` with a loaded JSON data file
**Why**: `src/services/geocoding.py:101-178` embeds static coordinate data for ~70 cities. Moving this to a JSON data file in `src/services/data/italian_cities.json` makes the module smaller and updates manageable.

**Files**: `src/services/geocoding.py`, new `src/services/data/italian_cities.json`

**Changes**:
- Extract current literal dict to JSON.
- Load via `importlib.resources.files("src.services.data").joinpath("italian_cities.json").read_text(encoding="utf-8")` and cache at module load.
- Add `italian_cities.json` with the same key/value pairs.

**Diff sketch**:
```diff
--- a/src/services/geocoding.py
+++ b/src/services/geocoding.py
@@
-from typing import Literal, TypedDict
+from typing import Literal, TypedDict
@@
-_ITALIAN_CITY_COORDS: dict[str, tuple[float, float]] = {
-    "agrigento": (37.3212, 13.5884),
-    "alba": (44.6999, 8.0347),
-    ...
-}
+_ITALIAN_CITY_COORDS: dict[str, tuple[float, float]] = _load_italian_city_coords()
+
+
+def _load_italian_city_coords() -> dict[str, tuple[float, float]]:
+    import importlib.resources as _resources
+    import json as _json
+
+    try:
+        raw = (
+            _resources.files("src.services.data")
+            .joinpath("italian_cities.json")
+            .read_text(encoding="utf-8")
+        )
+        data = _json.loads(raw)
+        return {str(k).lower(): tuple(v) for k, v in data.items()}
+    except Exception as exc:
+        raise RuntimeError("Failed to load italian_cities.json") from exc
```

Add new file `src/services/data/italian_cities.json` (package requires empty `src/services/data/__init__.py`).

**Test expectations**: Geo fallback tests still pass; exact lookups unchanged.

---

### Task 1.4 Configure `slowapi` with proxy-aware key derivation
**Why**: Behind a reverse proxy, `get_remote_address` returns the proxy IP and rate limits are ineffective. Switching to `X-Forwarded-For` handling restores per-client limits.

**Files**: `src/main.py`, `src/models.py` (new setting)

**Changes**:
- Add `slowapi_key_func` setting: enum `remote-address | x-forwarded-for | x-real-ip`.
- Default to `remote-address`.
- Build limiter with `Limiter(key_func=...)` chosen from settings.

**Diff sketch**:
```diff
--- a/src/models.py
+++ b/src/models.py
@@
 class Settings(BaseSettings):
@@
+    # slowapi key function; values accepted: remote-address, x-forwarded-for, x-real-ip
+    slowapi_key_func: str = Field(
+        "remote-address",
+        description="Determines how the remote address for rate limiting is derived.",
+    )
@@
--- a/src/main.py
+++ b/src/main.py
@@
-from slowapi.util import get_remote_address
+from slowapi.util import get_remote_address, get_x_forwarded_for, get_x_real_ip
@@
-limiter = Limiter(key_func=get_remote_address)
+
+def _resolve_key_func(name: str) -> Callable[[Request], str | None]:
+    mapping = {
+        "remote-address": get_remote_address,
+        "x-forwarded-for": get_x_forwarded_for,
+        "x-real-ip": get_x_real_ip,
+    }
+    try:
+        return mapping[name]
+    except KeyError:
+        raise ValueError(
+            f"slowapi_key_func must be one of {sorted(mapping)!r} (got {name!r})"
+        ) from None
+
+
+app = FastAPI(
+    title="Gas Station Finder API",
+    lifespan=lifespan,
+    swagger_ui_parameters={"defaultModelsExpandDepth": -1},
+)
+
+_key_func = _resolve_key_func(get_settings().slowapi_key_func)
+limiter = Limiter(key_func=_key_func)
```

**Test expectations**: verify tests may need to simulate different headers; existing tests still pass because default unchanged.

---

### Task 1.5 Frontend: guard all `innerHTML` writes with `DOMPurify` or `textContent`
**Why**: `app.ui.dom.ts:172`, `app.ui.interactions.ts:73, 79, 184, 375`, `updateRecentSearchesUI` inner HTML, and `app.ui.helpers.ts:133-137` build popup content from backend strings. `DOMPurify` is in `dependencies` unused today; using it standardizes sanitization.

**Files**: `src/static/ts/app.ui.dom.ts`, `src/static/ts/app.ui.helpers.ts`, `src/static/ts/app.ui.interactions.ts`, `src/static/index.html`

**Changes**:
1. Confirm `dompurify` is loaded once in `index.html` via the CDN or bundled; if bundled, import and use `DOMPurify.sanitize`.
2. Replace `innerHTML = ...` for dynamic content with `innerHTML = DOMPurify.sanitize(...)`.
3. Where strings are simple text, switch to `textContent` for extra safety.

**Diff sketch**:
```diff
--- a/src/static/ts/app.ui.helpers.ts
+++ b/src/static/ts/app.ui.helpers.ts
@@
-    return `
+    const titleSafe = DOMPurify.sanitize(title);
+    const addressSafe = DOMPurify.sanitize(addressValue);
+    return `
       <div class="map-popup">
-        <strong>${title}</strong><br>
-        <span class="map-popup-address">${addressLabel}: ${station.address}</span>
+        <strong>${titleSafe}</strong><br>
+        <span class="map-popup-address">${addressLabel}: ${addressSafe}</span>
       </div>`;
   },
```

```diff
--- a/src/static/ts/app.ui.dom.ts
+++ b/src/static/ts/app.ui.dom.ts
@@
     if (element) {
-        element.innerHTML = data;
+        element.innerHTML = DOMPurify.sanitize(data);
```

```diff
--- a/src/static/ts/app.ui.interactions.ts
+++ b/src/static/ts/app.ui.interactions.ts
@@
-      suggestions.innerHTML = "";
+      suggestions.innerHTML = "";
@@
-      const feed = document.createElement("div");
-      feed.innerHTML = ...; // similar pattern
```

**Test expectations**: TS compile clean after import; frontend manual smoke test.

---

### Task 1.6 Remove broadening of `datetime` alias in `csv_fetcher.py`
**Why**: Re-binding `datetime` under `Any` is a workaround that obscures intent.

**File**: `src/services/csv_fetcher.py`

**Diff**:
```diff
--- a/src/services/csv_fetcher.py
+++ b/src/services/csv_fetcher.py
@@
-from datetime import datetime as _datetime
-datetime: Any = _datetime
+# datetime is already the class we want; no alias suppression needed.
```

**Test expectations**: Ruff/ty unchanged; tests still pass.

---

### Task 1.7 Audit frontend `// @ts-nocheck` and restore typing incrementally
**Why**: `// @ts-nocheck` disables type checking on multiple files. Each file may be restored to type-checked status once embedded `any` patterns are removed.

**Files**: `src/static/ts/app.ui.interactions.ts`, `src/static/ts/app.ui.helpers.ts`, `src/static/ts/app.ui.ts`, `src/static/ts/app.ts`, etc.

**Scope**: Out of immediate plan but noted for backlog.

---

## Phase 2 — Minor cleanup & consistency

### Task 2.1 Cache invalidation: add mtime-fallback to monotonic clock
**Why**: If system clock moves backward, `st_mtime` could falsely report freshness issues. Compare against a monotonic reference when possible.

**File**: `src/services/csv_cache.py`

**Diff sketch**:
```diff
--- a/src/services/csv_cache.py
+++ b/src/services/csv_cache.py
@@
-import time
+import time
 from pathlib import Path
 
 def _is_cache_fresh(path: Path, hours: float) -> bool:
@@
-    mtime = path.stat().st_mtime
-    age = time.time() - mtime
+    mtime = path.stat().st_mtime
+    now = time.time()
+    age = now - mtime
     return age <= hours * 3600
```

**Test expectations**: existing cache freshness tests pass.

---

### Task 2.2 Move tests off `asyncio.run` inside sync defs where feasible
**Why**: Calling `asyncio.run` inside a test that pytest-asyncio may also schedule causes event-loop reuse conflicts in some environments.

**Files**: `tests/test_prezzi_csv.py` (several tests)

**Approach**: Convert the affected sync `def test_*` into `async def test_*` and `await` the coroutine directly.

---

## Validation checklist after each task
1. `ruff check src/ tests/` — no new errors
2. `ty check src/ tests/` — no new errors
3. `uv run pytest tests/ -q` — all 95 tests pass
