# Codebase Review: Issues & Remediation Plan

> Generated: 2026-03-12
> Scope: All Python source, tests, and scripts

---

## Summary

| Category | Count |
|----------|-------|
| Dead Code | 4 |
| Duplicated Code | 2 |
| Code Smells | 4 |
| Bad Process | 3 |
| Test Quality | 2 |
| **Total** | **15** |

---

## Category 1: Dead Code

### Task 1.1 — Remove unused `_main.py` build command variable

**File:** `_main.py:12-14`

The `run_command` variable is defined and logged but never executed.

```diff
-    # run bun build src/ts/*.ts --outdir static/js --watch
-    run_command = "bun watch:ts"
-    logger.info(f"Starting build process with command: {run_command}")
-
```

---

### Task 1.2 — Remove debug script `scripts/_debug_price_parse.py`

**File:** `scripts/_debug_price_parse.py`

This is a developer debug script with no tests, no docstring, no `if __name__` guard. It's dead code that should be deleted entirely.

```bash
rm scripts/_debug_price_parse.py
```

---

### Task 1.3 — Remove duplicate script `scripts/color_contrast.py`

**File:** `scripts/color_contrast.py`

This script only imports from `src/utils/color_contrast.py` and prints hardcoded color candidates. `scripts/scan_color_contrast.py` already does this better. Delete it.

```bash
rm scripts/color_contrast.py
```

---

### Task 1.4 — Remove unused constants in `src/models.py`

**File:** `src/models.py:246-248`

```python
MAX_ZOOM_LEVEL = 14  # Maximum zoom level for map tiles
MAP_PADDING_PX = 50  # Padding around map bounds when fitting stations
```

These Python constants are never referenced in Python code (only in frontend JS). Dead code in this module.

```diff
-
-# Map configuration
-MAX_ZOOM_LEVEL = 14  # Maximum zoom level for map tiles
-MAP_PADDING_PX = 50  # Padding around map bounds when fitting stations
-
```

---

## Category 2: Duplicated Code

### Task 2.1 — Deduplicate delimiter detection in `scripts/generate_cities_json.py`

**File:** `scripts/generate_cities_json.py:134-150`

The script defines its own `detect_delimiter()` that's a simplified version of `src/services/csv_parser._detect_delimiter()`. It should import and reuse the existing function.

```diff
+from src.services.csv_parser import _detect_delimiter as detect_delimiter

-def detect_delimiter(csv_text: str) -> str:
-    """Detect the delimiter used in a CSV text.
-
-    Parameters:
-    - csv_text: The raw CSV text content.
-
-    Returns:
-    - The detected delimiter character (|, ;, ,, or tab).
-    """
-    lines = [ln for ln in csv_text.splitlines() if ln.strip()]
-    if not lines:
-        return "|"
-    header = lines[0]
-    for d in ["|", ";", ",", "\t"]:
-        if d in header:
-            return d
-    return "|"
```

---

### Task 2.2 — Deduplicate BOM stripping in `scripts/generate_cities_json.py`

**File:** `scripts/generate_cities_json.py:163-166`

Extract BOM stripping into a shared utility since this pattern appears in both `csv_parser.py` and this script.

Create `src/services/csv_utils.py`:

```python
"""Shared CSV utilities."""


def strip_bom(text: str) -> str:
    """Strip UTF-8 BOM from CSV text (handles both decoded and mis-decoded forms)."""
    if text.startswith("\ufeff"):
        text = text[1:]
    elif text.startswith("ï»¿"):
        text = text[3:]
    return text
```

Then update `scripts/generate_cities_json.py`:

```diff
+from src.services.csv_utils import strip_bom

-    if text.startswith("\ufeff"):
-        text = text[1:]
-    elif text.startswith("ï»¿"):
-        text = text[3:]
+    text = strip_bom(text)
```

And update `src/services/csv_parser.py`:

```diff
+from src.services.csv_utils import strip_bom

 def _parse_anagrafica(csv_text: str, force_delimiter: str | None = None) -> dict[str, dict[str, Any]]:
-    if csv_text.startswith("\ufeff"):
-        csv_text = csv_text[1:]
-    elif csv_text.startswith("ï»¿"):
-        csv_text = csv_text[3:]
+    csv_text = strip_bom(csv_text)
```

Same for `_parse_prezzi()`.

---

## Category 3: Code Smells

### Task 3.1 — Remove duplicate `logger.exception()` calls in `src/services/geocoding.py`

**File:** `src/services/geocoding.py`

`logger.exception()` already logs the error message AND the traceback. Calling `logger.warning()` with the same error context right before it creates duplicate log entries.

**Line 312-313:**

```diff
                 logger.warning(
                     "Geocoding provider rate-limited: status={} reason={} retry_after={}",
                     status,
                     reason,
                     retry_after,
                 )
-                logger.exception(err)
```

**Line 333-334:**

```diff
                 logger.warning(
                     "Using local fallback coordinates for '{}' due to provider rate limit",
                     normalized_city,
                 )
-                logger.exception(err)
                 set_in_cache(normalized_city, coords)
```

**Line 378-379:**

```diff
             logger.warning("Geocoding request error: {}", err)
-            logger.exception(err)
             # Try local fallback coordinates before failing
```

**Line 388-389:**

```diff
                 logger.warning(
                     "Using local fallback coordinates for '{}' due to request error",
                     normalized_city,
                 )
-                logger.exception(err)
                 set_in_cache(normalized_city, coords)
```

---

### Task 3.2 — Fix incorrect return type annotation

**File:** `src/main.py:318`

The function returns `FileResponse` but the decorator specifies `HTMLResponse`.

```diff
-@app.get("/", response_class=HTMLResponse)
-async def read_root() -> FileResponse:
+@app.get("/", response_class=HTMLResponse)
+async def read_root() -> HTMLResponse:
```

---

### Task 3.3 — Reduce complexity in `get_latest_csv_timestamp`

**File:** `src/services/csv_cache.py:167`

The function has `# noqa: C901, PLR0912` indicating it's too complex. Refactor into smaller helpers:

```diff
+def _find_timestamped_csvs(candidates: list[Path]) -> datetime | None:
+    """Find the latest timestamp from timestamped CSV filenames."""
+    latest_ts: datetime | None = None
+    ts_format_length = 14
+    patterns = ["anagrafica_impianti_attivi_*.csv", "prezzo_alle_8_*.csv"]
+
+    for d in candidates:
+        if not d.exists():
+            continue
+        for pattern in patterns:
+            for csv_file in d.glob(pattern):
+                filename = csv_file.name
+                if len(filename) < len("YYYYMMDD_HHMMSS.csv"):
+                    continue
+                ts_str = filename.replace("anagrafica_impianti_attivi_", "").replace("prezzo_alle_8_", "")
+                ts_str = ts_str.replace(".csv", "")
+                if len(ts_str) >= ts_format_length:
+                    try:
+                        ts = datetime.strptime(ts_str[:ts_format_length], "%Y%m%d_%H%M%S").replace(tzinfo=UTC)
+                        if latest_ts is None or ts > latest_ts:
+                            latest_ts = ts
+                    except ValueError:
+                        continue
+    return latest_ts
+
+
+def _find_latest_mtime(candidates: list[Path]) -> datetime | None:
+    """Find the latest mtime from non-timestamped base CSV files."""
+    latest_ts: datetime | None = None
+    base_files = ["anagrafica_impianti_attivi.csv", "prezzo_alle_8.csv"]
+
+    for d in candidates:
+        if not d.exists():
+            continue
+        for base_name in base_files:
+            csv_file = d / base_name
+            if csv_file.exists():
+                try:
+                    st = csv_file.stat()
+                    mtime_ts = datetime.fromtimestamp(st.st_mtime, tz=UTC)
+                    if latest_ts is None or mtime_ts > latest_ts:
+                        latest_ts = mtime_ts
+                except Exception:
+                    continue
+    return latest_ts
+
 
-def get_latest_csv_timestamp(settings: Settings) -> str | None:  # noqa: C901, PLR0912
+def get_latest_csv_timestamp(settings: Settings) -> str | None:
     """Extract timestamp from the most recent CSV filename."""
     from src.services.csv_fetcher import _candidate_local_csv_dirs  # noqa: PLC0415
 
     try:
         candidates = _candidate_local_csv_dirs(settings)
-        latest_ts: datetime | None = None
-        # ... (all the complex logic replaced by:)
+        latest_ts = _find_timestamped_csvs(candidates)
+        if latest_ts is None:
+            latest_ts = _find_latest_mtime(candidates)
         return latest_ts.isoformat() if latest_ts else None
```

---

### Task 3.4 — Reduce complexity in `_load_local_city_coords`

**File:** `src/services/geocoding.py:169`

The function has `# noqa: PLR0912` (too many branches). Extract JSON parsing logic:

```diff
+def _parse_cities_json(data: dict | list) -> dict[str, dict[str, float]]:
+    """Parse cities JSON data (dict or list format) into a normalized mapping."""
+    mapping: dict[str, dict[str, float]] = {}
+
+    if isinstance(data, dict):
+        for k, v in data.items():
+            if isinstance(v, dict):
+                lat = v.get("latitude") or v.get("lat")
+                lon = v.get("longitude") or v.get("lon")
+                if lat is not None and lon is not None:
+                    mapping[k.strip().lower()] = {
+                        "latitude": float(lat),
+                        "longitude": float(lon),
+                    }
+    elif isinstance(data, list):
+        for item in data:
+            if not isinstance(item, dict):
+                continue
+            city = (item.get("city") or item.get("name") or item.get("nome") or "").strip().lower()
+            lat = item.get("lat") or item.get("latitude")
+            lon = item.get("lon") or item.get("longitude")
+            if city and lat is not None and lon is not None:
+                mapping[city] = {"latitude": float(lat), "longitude": float(lon)}
+
+    return mapping
+
 
-def _load_local_city_coords(settings: Settings) -> dict[str, dict[str, float]]:  # noqa: PLR0912
+def _load_local_city_coords(settings: Settings) -> dict[str, dict[str, float]]:
     global _LOCAL_CITY_COORDS  # noqa: PLW0603
     with _local_coords_lock:
         if _LOCAL_CITY_COORDS is not None:
             return _LOCAL_CITY_COORDS
         # ... (file loading logic simplified to:)
-                    mapping: dict[str, dict[str, float]] = {}
-                    if isinstance(data, dict):
-                        # ... 30 lines of parsing
-                    elif isinstance(data, list):
-                        # ... 10 lines of parsing
+                    mapping = _parse_cities_json(data)
```

---

## Category 4: Bad Process

### Task 4.1 — Move misplaced `import re` in `csv_parser.py`

**File:** `src/services/csv_parser.py:123`

```python
import re
```

This import appears in the middle of the file (after class definition) instead of at the top with other imports.

```diff
 # Line 9 area
 import csv
+import re
 from datetime import UTC, datetime, timedelta

 # Line 123 area — remove
-import re
-
```

---

### Task 4.2 — Cache `Settings()` instantiation

**File:** `src/main.py:64-73`

`get_settings()` creates a new `Settings()` instance on every call. Meanwhile `app.add_middleware` at line 180 calls `get_settings()` at module load time, creating yet another instance.

```diff
+_cached_settings: Settings | None = None
+
 
 def get_settings() -> Settings:
     """Get application settings instance."""
-    return Settings()
+    global _cached_settings  # noqa: PLW0603
+    if _cached_settings is None:
+        _cached_settings = Settings()
+    return _cached_settings
```

---

### Task 4.3 — Fix eager import in `scripts/check_docs.py`

**File:** `scripts/check_docs.py:9`

The script imports `from src.main import app` at module level, which triggers full app initialization on import.

```diff
-from src.main import app
-
 
 def check_docs_pages(pages: list[str]) -> list[dict[str, str | int | bool]]:
     """Check documentation pages for accessibility and expected elements."""
+    from src.main import app  # lazy import to avoid side effects
     client = TestClient(app)
```

---

## Category 5: Test Quality

### Task 5.1 — Add return type annotations to test functions

**Files:** `tests/test_main.py`, `tests/test_fuel_api.py`

```diff
 # tests/test_main.py:132
-def test_reload_csv_triggers_fetch_and_saves(client: TestClient, monkeypatch):
+def test_reload_csv_triggers_fetch_and_saves(client: TestClient, monkeypatch) -> None:

 # tests/test_main.py:160
-def test_startup_triggers_background_reload(monkeypatch):
+def test_startup_triggers_background_reload(monkeypatch) -> None:

 # tests/test_main.py:208
-def test_startup_blocks_when_cache_missing(monkeypatch):
+def test_startup_blocks_when_cache_missing(monkeypatch) -> None:

 # tests/test_fuel_api.py:6
-def test_parse_and_normalize_stations_filters_zero_coords():
+def test_parse_and_normalize_stations_filters_zero_coords() -> None:

 # tests/test_fuel_api.py:19
-def test_parse_and_normalize_stations_malformed_price_skips():
+def test_parse_and_normalize_stations_malformed_price_skips() -> None:
```

---

### Task 5.2 — Remove unused module-level import in `tests/test_main.py`

**File:** `tests/test_main.py:3`

```diff
-import asyncio
```

This import at module level is unused — `asyncio` is only used inside test functions where it's re-imported locally.

---

## Priority Order

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| P0 | 3.1 Duplicate logger.exception | Log noise reduction | Low |
| P0 | 4.1 Misplaced import | Code organization | Trivial |
| P1 | 1.1 Dead code in _main.py | Cleanup | Trivial |
| P1 | 1.4 Unused constants | Cleanup | Trivial |
| P1 | 4.2 Settings caching | Performance | Low |
| P1 | 2.1 Deduplicate detect_delimiter | Maintainability | Low |
| P2 | 1.2 Delete debug script | Cleanup | Trivial |
| P2 | 1.3 Delete duplicate script | Cleanup | Trivial |
| P2 | 3.2 Fix return type annotation | Type safety | Trivial |
| P2 | 5.1 Test type annotations | Quality | Low |
| P2 | 5.2 Unused test import | Cleanup | Trivial |
| P3 | 2.2 Extract BOM strip utility | Maintainability | Low |
| P3 | 3.3 Reduce complexity (csv_cache) | Maintainability | Medium |
| P3 | 3.4 Reduce complexity (geocoding) | Maintainability | Medium |
| P3 | 4.3 Lazy import in check_docs | Correctness | Low |

---

## Verification Steps

After implementing all changes:

```powershell
ruff check .              # lint
ty check .                # type check
uv run pytest tests/      # run all tests
```
