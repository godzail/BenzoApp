# Fix All Linter/Type Errors — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Zero errors from `ruff check`, `ty check`, and `biome check` by fixing real issues, auto-fixing safe ones, and suppressing complexity/philosophical rules.

**Architecture:** Run auto-fixers first, then manual fixes organized by tool (Python → TypeScript → HTML/CSS), then suppress remaining noise via config.

**Tech Stack:** ruff, ty (Python type checker), biome (JS/HTML/CSS linter)

---

## Summary of Issues

| Tool | Errors | Warnings | Auto-fixable | Manual | Suppress |
|------|--------|----------|--------------|--------|----------|
| ruff | 141 | - | ~15 | ~30 | ~96 |
| ty | 1 | - | 0 | 1 | 0 |
| biome | 19 | 25 | ~5 | ~15 | ~24 |

---

## Task 1: Ruff Auto-fixes (safe)

**Files:**
- `_main.py` — remove unused import
- `src/main.py` — import sort
- `src/services/csv_parser.py` — ternary, trailing comma
- `src/services/geocoding.py` — datetime.UTC
- `tests/test_main.py` — unnecessary lambdas, unused lambda arg
- `tests/test_geocoding_fallback.py` — datetime.UTC
- `tests/test_prezzi_csv.py` — trailing comma, unused variable, parametrize tuple, split assertion

**Step 1: Run ruff auto-fix**

```powershell
ruff check . --fix --unsafe-fixes
```

**Expected changes:**

```diff
--- _main.py
+++ _main.py
@@ -1,7 +1,6 @@
 """Run the BenzoApp FastAPI application using Uvicorn."""
 
 import uvicorn
-from loguru import logger
 
 from src.models import Settings
```

```diff
--- src/services/geocoding.py
+++ src/services/geocoding.py
@@ -3,6 +3,7 @@
 import asyncio
 import json
 import threading
+from datetime import UTC
 from pathlib import Path
 
@@ -52,12 +53,11 @@
         dt = parsedate_to_datetime(s)
         if dt.tzinfo is None:
-            from datetime import timezone
-            dt = dt.replace(tzinfo=timezone.utc)
-        from datetime import datetime, timezone
-        now = datetime.now(tz=timezone.utc)
+            dt = dt.replace(tzinfo=UTC)
+        from datetime import datetime
+        now = datetime.now(tz=UTC)
```

```diff
--- tests/test_main.py
+++ tests/test_main.py
@@ -90,7 +90,7 @@
-    app.dependency_overrides[get_settings] = lambda: FastTimeoutSettings()
+    app.dependency_overrides[get_settings] = FastTimeoutSettings
```
(similar for lines 143, 170, 219)

```diff
--- tests/test_prezzi_csv.py
+++ tests/test_prezzi_csv.py
@@ -363,7 +363,7 @@
 @pytest.mark.parametrize(
-    "price_str,expected",
+    ("price_str", "expected"),

@@ -628,7 +629,8 @@
-    assert "prezzi" in str(exc.value).lower() and "prezzo" in str(exc.value).lower()
+    assert "prezzi" in str(exc.value).lower()
+    assert "prezzo" in str(exc.value).lower()

@@ -777,7 +779,7 @@
-    result = asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))
+    asyncio.run(fetch_and_combine_csv_data(settings, cast("httpx.AsyncClient", client), params=params))
```

**Step 2: Verify**

```powershell
ruff check . 2>&1 | wc -l
```

Expected: significantly fewer errors remaining (complexity, noqa-needed items).

---

## Task 2: Ruff Manual Fixes — Source Code

### 2a: Exception message extraction (EM102/EM101)

**Files:**
- `src/services/csv_parser.py:281` and `:350`
- `tests/test_prezzi_csv.py:214` and `:1018`

**Diff for csv_parser.py:281:**

```diff
-            raise CSVSchemaError(f"CSV schema error (anagrafica): missing required column(s): {', '.join(missing)}")
+            msg = f"CSV schema error (anagrafica): missing required column(s): {', '.join(missing)}"
+            raise CSVSchemaError(msg)
```

**Diff for csv_parser.py:350:**

```diff
-            raise CSVSchemaError(f"CSV schema error (prezzi): missing required column(s): {', '.join(missing)}")
+            msg = f"CSV schema error (prezzi): missing required column(s): {', '.join(missing)}"
+            raise CSVSchemaError(msg)
```

### 2b: Line length fixes (E501)

**Files:**
- `src/main.py:396`
- `src/models.py:88`

**Diff for src/main.py:396** — break the long f-string in the docs HTML template (line 396 is inside `render_docs`).

**Diff for src/models.py:88:**

```diff
-            msg = f"User-Agent must include contact information (email or URL) per Nominatim usage policy. Examples: {examples}"
+            msg = (
+                f"User-Agent must include contact information (email or URL) "
+                f"per Nominatim usage policy. Examples: {examples}"
+            )
```

### 2c: Add logging to bare except-continue (S112)

**Files:**
- `src/services/csv_cache.py:231`
- `src/services/csv_parser.py:300`

Add `logger.debug(...)` before `continue` in except blocks.

### 2d: Fix bare except-pass (S110)

**File:** `src/services/geocoding.py:45`

```diff
     except Exception:
-        pass
+        logger.debug("Failed to parse Retry-After as float: {}", s)
```

### 2e: Move imports to top-level where possible (PLC0415)

**Files:**
- `src/services/geocoding.py:50,55,58` — move `parsedate_to_datetime` and `datetime` imports to top

---

## Task 3: Ruff Suppressions via noqa

Add `# noqa: <CODE>` comments for rules we intentionally don't fix:

| Rule | Files | Rationale |
|------|-------|-----------|
| PLR0912 | `src/main.py:222`, `src/services/csv_parser.py:183`, `src/services/geocoding.py:247` | Complex but functional |
| PLR0915 | `src/main.py:84`, `src/services/geocoding.py:247` | Long but clear |
| C901 | `src/services/geocoding.py:247` | Complexity accepted |
| PLR2004 | `src/main.py:297`, `src/services/csv_parser.py:231,240` | Magic values are self-documenting |
| TRY300 | `src/main.py:557` | Style preference |
| S112 | remaining | Already addressed or test code |

**Configuration approach:** Add to `pyproject.toml` under `[tool.ruff.lint.per-file-ignores]` for test files with bulk ARG001, SLF001, D103, PLC0415, PLR2004:

```toml
[tool.ruff.lint.per-file-ignores]
"tests/**" = ["ARG001", "SLF001", "D100", "D103", "PLR2004", "PLC0415", "PT018", "E402", "N802"]
```

---

## Task 4: ty Type Check Fix

**File:** `tests/test_prezzi_csv.py:703`

**Diff:**

```diff
-    csv_fetcher.datetime = type("MockDatetime", (), {"now": mock_datetime_now})()
+    csv_fetcher.datetime = type("MockDatetime", (), {"now": mock_datetime_now})()  # type: ignore[assignment]
```

---

## Task 5: Biome Config Migration

**File:** `biome.json`

**Command:**

```powershell
biome migrate --write
```

This updates the `$schema` version to match CLI (2.4.6) and reformats the file.

---

## Task 6: Biome Auto-fixes (safe)

**Files:**
- `src/static/ts/app.ui.csv.ts` — `!!` → `Boolean()` (3 occurrences)
- `src/static/ts/i18n.ts` — `!!` → `Boolean()` (2 occurrences)
- `src/static/ts/app.ui.interactions.ts:229` — string concat → template literal
- `src/static/ts/app.ui.interactions.ts:143` — unused param prefix with `_`
- `src/static/templates/search.html:13` — add `type="button"`

**Command:**

```powershell
biome check . --write --unsafe
```

---

## Task 7: HTML SVG Accessibility (a11y)

**Files:**
- `src/static/templates/header.html` (7 SVGs)
- `src/static/templates/search.html` (5 SVGs)
- `src/static/templates/results.html` (2 SVGs)
- `src/static/index.html` (1 SVG)

**Approach:** Add `aria-hidden="true"` to decorative SVGs (those already inside labeled buttons or with adjacent text).

**Diff example for header.html:6:**

```diff
-      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
+      <svg aria-hidden="true" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
```

---

## Task 8: Biome Suppressions via Config

**File:** `biome.json`

Add to `linter.rules` to suppress noise:

```json
"complexity": {
  "noExcessiveCognitiveComplexity": "warn",
  "noExcessiveLinesPerFunction": "warn",
  "noForEach": "off"
},
"style": {
  "noNonNullAssertion": "warn",
  "useNamingConvention": { "level": "off" }
},
"suspicious": {
  "noExplicitAny": "warn"
},
"a11y": {
  "noSvgWithoutTitle": "warn",
  "useAriaPropsForRole": "warn"
}
```

Also add inline `// biome-ignore` comments for known false positives:
- `src/static/ts/app.map.ts` — `noNonNullAssertion` (data is validated upstream)
- `src/static/ts/app.storage.ts` — `noExplicitAny` (dynamic mixin pattern)
- `src/static/ts/docs-theme.ts` — `noExplicitAny` (window augmentation)
- `src/static/ts/theme-utils.ts` — `noExplicitAny` (window augmentation)
- `src/static/css/custom.css` — `noDescendingSpecificity` (intentional cascade)

---

## Task 9: Verify All Clean

Run all three tools and confirm zero errors:

```powershell
ruff check .
ty check .
biome check .
```

Expected: 0 errors from each tool.

---

## Task 10: Run Tests

```powershell
uv run pytest tests/ -x -q
```

Expected: All tests pass.
