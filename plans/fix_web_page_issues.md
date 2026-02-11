# Web Page Not Working - Bug Analysis and Fix Plan

## Summary

The web page is not displaying data and JS/TS functionality is broken due to several critical issues:

1. **Property name mismatch** between backend (snake_case) and frontend (camelCase)
2. **Script loading order** issues in index.html
3. **Function accessibility** problems in Alpine.js templates

---

## Critical Issues

### Issue 1: Property Name Mismatch (CRITICAL)

**Problem:** The backend sends data with `snake_case` property names, but the frontend TypeScript types and some code expect `camelCase`.

**Evidence:**

- Backend [`src/models.py`](src/models.py:118) defines:
  ```python
  fuel_prices: list[FuelPrice]  # snake_case
  ```

- Frontend [`src/static/ts/types.ts`](src/static/ts/types.ts:28) defines:
  ```typescript
  fuelPrices?: readonly FuelPrice[];  // camelCase
  ```

- Template [`src/static/templates/results.html`](src/static/templates/results.html:67) uses:
  ```html
  x-text="formatCurrency(station.fuel_prices[0].price)"  <!-- snake_case -->
  ```

- But compiled [`src/static/js/app.js`](src/static/js/app.js) uses `fuelPrices` internally

**Impact:** When data is received from the API, accessing `station.fuelPrices` returns `undefined` because the actual property is `station.fuel_prices`.

**Fix Options:**

1. **Option A (Recommended):** Convert property names in the frontend when receiving API data
2. **Option B:** Configure Pydantic to export camelCase using `alias_generator`
3. **Option C:** Update all frontend code to use snake_case consistently

---

### Issue 2: Script Loading Order (CRITICAL)

**Problem:** Scripts are loaded with `defer` but the order may cause issues with Leaflet not being available when app.js executes.

**Current order in [`src/static/index.html`](src/static/index.html:22-31):**

```html
<script defer src="https://unpkg.com/i18next@latest/dist/umd/i18next.min.js"></script>
<script defer src="https://unpkg.com/i18next-http-backend@latest/i18nextHttpBackend.min.js"></script>
<script defer src="/static/js/app.js"></script>
<script defer src="https://unpkg.com/alpinejs@latest/dist/cdn.min.js"></script>
<!-- Leaflet loaded AFTER app.js -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<script defer src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
```

**Impact:** The app.js may try to use `L` (Leaflet) before it's defined, causing map initialization to fail.

**Fix:** Move Leaflet script BEFORE app.js:

```html
<!-- Leaflet - must load before app.js -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<script defer src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>

<!-- App Scripts - loads after dependencies -->
<script defer src="/static/js/app.js"></script>
<script defer src="https://unpkg.com/alpinejs@latest/dist/cdn.min.js"></script>
```

---

### Issue 3: formatCurrency Not Accessible in Alpine.js Templates (CRITICAL)

**Problem:** The `formatCurrency` function is defined in the UI mixin but is not directly accessible in Alpine.js template expressions.

**Evidence in [`src/static/templates/results.html`](src/static/templates/results.html:67):**

```html
x-text="formatCurrency(station.fuel_prices[0].price)"
```

**Impact:** This will throw a `ReferenceError: formatCurrency is not defined` when Alpine.js tries to evaluate the expression.

**Fix:** The function exists in the mixin but needs to be called with proper context. Options:

1. Expose `formatCurrency` on the window object
2. Use the Alpine.js data context: `formatCurrency(...)` should work if the function is in `x-data`

Looking at [`src/static/ts/app.ui.ts`](src/static/ts/app.ui.ts:65), `formatCurrency` is a standalone function that's also added to the mixin. The issue is that in the template, it's being called as a free function, not as a method on the Alpine data object.

---

### Issue 4: Missing formatCurrency in Mixin

**Problem:** The `formatCurrency` function is defined as a standalone function in [`src/static/ts/app.ui.ts`](src/static/ts/app.ui.ts:65-85) but it's NOT included in the `createAppUiMixin()` object.

**Evidence:**

```typescript
// Standalone function - line 65-85
function formatCurrency(value: number | string | undefined): string { ... }

// Mixin object - line 205+
function createAppUiMixin(): Record<string, unknown> {
  const mixin: Record<string, unknown> = {
    // formatCurrency is NOT here!
    debugMode: false,
    loadingBar: null,
    // ...
  };
}
```

**Impact:** The Alpine.js templates cannot access `formatCurrency` because it's not part of the app state.

**Fix:** Add `formatCurrency` to the mixin object:

```typescript
const mixin: Record<string, unknown> = {
  // ... existing properties
  formatCurrency(value: number | string | undefined): string {
    return formatCurrency(value);
  },
  // ...
};
```

---

## Secondary Issues

### Issue 5: Inconsistent Property Access in Templates

The results template uses `station.fuel_prices` (snake_case) but the TypeScript code internally uses `fuelPrices` (camelCase). This inconsistency will cause issues.

**Files affected:**
- [`src/static/templates/results.html`](src/static/templates/results.html:67) - uses `fuel_prices`
- [`src/static/ts/app.map.ts`](src/static/ts/app.map.ts:76) - uses `fuelPrices`
- [`src/static/ts/app.ui.ts`](src/static/ts/app.ui.ts:187) - uses `fuelPrices`

---

## Fix Implementation Plan

### Step 1: Fix Script Loading Order

**File:** [`src/static/index.html`](src/static/index.html)

Move Leaflet CSS and JS before app.js in the head section.

### Step 2: Add formatCurrency to Mixin

**File:** [`src/static/ts/app.ui.ts`](src/static/ts/app.ui.ts)

Add `formatCurrency` method to the `createAppUiMixin()` return object.

### Step 3: Normalize API Response Property Names

**File:** [`src/static/ts/app.ui.ts`](src/static/ts/app.ui.ts) - in `submitForm()` method

Add property name conversion after receiving API response:

```typescript
// Convert snake_case to camelCase for frontend consistency
function normalizeStation(station: any): Station {
  return {
    ...station,
    fuelPrices: station.fuel_prices,
  };
}

// In submitForm():
const data = await response.json();
self.results = (data.results || data.stations || []).map(normalizeStation);
```

### Step 4: Update Templates to Use camelCase

**File:** [`src/static/templates/results.html`](src/static/templates/results.html)

Change all `station.fuel_prices` to `station.fuelPrices`.

### Step 5: Rebuild TypeScript

Run `bun run build:ts` to compile the updated TypeScript files.

---

## Verification Steps

1. Start the server: `uv run _main.py`
2. Open browser to `http://localhost:8000`
3. Open browser DevTools Console - check for errors
4. Search for a city (e.g., "Roma")
5. Verify results appear in the sidebar
6. Verify map markers appear on the map
7. Click on a station to verify popup works

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/static/index.html` | Reorder script loading |
| `src/static/ts/app.ui.ts` | Add formatCurrency to mixin, add response normalization |
| `src/static/templates/results.html` | Change fuel_prices to fuelPrices |

---

## Risk Assessment

- **High confidence (90%+)** that these are the root causes based on code analysis
- The property name mismatch is definitely causing data display issues
- The missing formatCurrency in the mixin will cause runtime errors
- Script loading order may cause intermittent issues depending on network speed
