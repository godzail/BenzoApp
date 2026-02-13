# Plan: Codebase Review & Fixes

TL;DR — Identify and remediate key issues in BenzoApp: (1) fix async timeout handling, (2) replace prints with Loguru across scripts, (3) remove duplicated distance/contrast utilities by consolidating into shared modules, (4) improve exception specificity and add missing type hints/docstrings. Changes focus on safety, maintainability, and DRY; tests and linters will verify correctness.

## Code Review Report: Issues and Misconceptions

### Summary

| Category | Count |
|----------|-------|
| **Critical** | 2 |
| **High** | 5 |
| Medium | 8 |
| Low | 6 |

---

### 🔴 Critical Issues

| File | Line | Issue |
|------|------|-------|
| main.py | 210, 240 | `except TimeoutError` doesn't catch `asyncio.TimeoutError` — async code uses asyncio timeouts which are a different exception class |

**Fix**: Change to `except (asyncio.TimeoutError, TimeoutError):`

---

### 🟠 High Priority

| File | Lines | Issue |
|------|-------|-------|
| color_contrast.py | 87, 90, 92, 95 | Uses `print()` instead of Loguru logger |
| scan_color_contrast.py | 131-133, 150 | Uses `print()` instead of Loguru logger |
| check_docs.py | 53-55 | Uses `print()` instead of Loguru logger |
| generate_cities_json.py | 174-185 | Uses `print()` instead of Loguru logger |
| fuel_api.py + csv_parser.py | Multiple | Distance calculation implemented differently in both files — violates DRY |
| Multiple scripts | — | WCAG utility functions (contrast calculations) duplicated |

---

### 🟡 Medium Priority

- **main.py** is too large (~500 lines) — should split into route handler modules
- **`src/services/geocoding.py:89`** and **`src/services/csv_fetcher.py:58-66`**: Broad `except Exception:` blocks
- Missing return type annotations in helper functions (`csv_fetcher.py:81`)
- Missing Google-style docstrings on `main()` functions in scripts

---

### 🟢 Low Priority

- Unused imports (`html as _html` in main.py)
- `cors_allowed_origins` in models.py uses `os.getenv()` in default_factory (works but could be cleaner)
- Performance: String concatenation in loops for HTML generation

---

### Verified False Positives (Not Issues)

- The subagent reported `calculate_distance` as duplicated, but fuel_api.py uses `math.radians()` directly (cleaner), while csv_parser.py uses `_deg2rad`/`_haversine_km` — they are different implementations, not the same code. However, this is still a DRY violation since both compute the same formula.

---

## Steps

1. Fix async timeout handling in `src/main.py` — replace `except TimeoutError:` with `except (asyncio.TimeoutError, TimeoutError):` and add `import asyncio`.
2. Replace `print()` with Loguru `logger` in every script under `scripts/` (e.g., `scripts/color_contrast.py`, `scripts/scan_color_contrast.py`, `scripts/check_docs.py`, `scripts/generate_cities_json.py`) and add a module-level logger import `from loguru import logger`.
3. Consolidate distance calculations into `src/services/distance_utils.py` and update `src/services/fuel_api.py` and `src/services/csv_parser.py` to import `calculate_distance`.
4. Consolidate WCAG/contrast helpers into `src/utils/color_contrast.py` and update scripts/tests to import from that module.
5. Replace broad `except Exception:` blocks with specific exceptions in `src/services/geocoding.py`, `src/services/csv_fetcher.py`, and other locations identified.
6. Add missing return type annotations and Google-style docstrings for public functions (scripts' `main()` and public helpers).
7. Refactor `src/main.py` into smaller route handler modules if it remains large after the above (split by feature).
8. Run linters and tests; add/adjust unit tests for new utility modules and critical fixes.

---

## Verification

- Run tests and linters:

```bash
uv run pytest tests/
ruff check . && ruff check . --fix
ty check .
```

- Manual checks:
  - Confirm no remaining `print(` in `scripts/`:
    rg "^\s*print\(" scripts/
  - Confirm `asyncio.TimeoutError` handling present:
    rg "asyncio.TimeoutError" src/main.py
  - Confirm consolidated utilities are imported and duplicates removed.
