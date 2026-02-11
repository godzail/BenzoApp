# Version 2 Tasks

## Implementation Checklist

### Phase 1: Tailwind Integration

- [ ] **T1.1** Add Tailwind CDN script to `src/static/index.html`
- [ ] **T1.2** Add Tailwind config with custom colors matching existing design tokens
- [ ] **T1.3** Verify Tailwind loads without conflicts with existing CSS

### Phase 2: Layout Restructure

- [ ] **T2.1** Create `src/static/templates/map.html` with extracted map component
- [ ] **T2.2** Remove map card from `src/static/templates/search.html` (lines 98-113)
- [ ] **T2.3** Add `#map-container` div to `src/static/index.html` in right column
- [ ] **T2.4** Move `#results-container` inside `#search-column` in `src/static/index.html`
- [ ] **T2.5** Update grid classes for new 3-column layout

### Phase 3: CSS Updates

- [ ] **T3.1** Update `src/static/css/layout.css` for new column arrangement
- [ ] **T3.2** Add styles for full-height map in right column
- [ ] **T3.3** Update mobile responsive styles for stacked layout
- [ ] **T3.4** Ensure resizer handle still works with new layout

### Phase 4: Result Card Enhancements

- [ ] **T4.1** Add `getPriceDifference(index)` to `src/static/js/app.ui.js`
- [ ] **T4.2** Add `formatDistance(distance)` to `src/static/js/app.ui.js`
- [ ] **T4.3** Update `src/static/templates/results.html` with price diff display
- [ ] **T4.4** Update `src/static/templates/results.html` with distance display in header
- [ ] **T4.5** Style price diff with Tailwind (red for positive, green/badge for best)

### Phase 5: Component Loading

- [ ] **T5.1** Update `init()` in `src/static/js/app.ui.js` to load map.html template
- [ ] **T5.2** Ensure map initializes correctly in new container
- [ ] **T5.3** Test map resize on column width changes

### Phase 6: Testing & Verification

- [ ] **T6.1** Test desktop layout (Search + Results left, Map right)
- [ ] **T6.2** Test mobile layout (vertical stack)
- [ ] **T6.3** Verify price difference calculation accuracy
- [ ] **T6.4** Verify distance display formatting
- [ ] **T6.5** Test dark mode compatibility
- [ ] **T6.6** Test resizer functionality
- [ ] **T6.7** Cross-browser testing (Chrome, Firefox, Safari)

---

## Task Details

### T1.1 - Add Tailwind CDN

**File:** `src/static/index.html`

Add after existing stylesheets:

```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>
```

---

### T1.2 - Tailwind Config

**File:** `src/static/index.html`

Add after Tailwind script:

```html
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: '#00c853',
            hover: '#00b248',
            light: '#b9f6ca',
            dark: '#009624',
          }
        }
      }
    }
  }
</script>
```

---

### T2.1 - Create map.html

**File:** `src/static/templates/map.html` (new)

```html
<!-- Map Component - Right Column -->
<template x-if="results.length > 0">
  <div class="map-card h-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-surface">
    <div class="map-view h-full p-2">
      <div id="map" class="w-full h-full rounded-md"></div>
    </div>
  </div>
</template>
```

---

### T2.2 - Remove map from search.html

**File:** `src/static/templates/search.html`

Delete lines 98-113:

```html
<!-- Map Card - Moved from results to search column -->
<template x-if="results.length > 0">
  <details class="map-card search-column-map" open
    @toggle="$nextTick(() => { if (map && $event.target.open) { map.invalidateSize(); } })">
    <summary>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
      <span x-text="translate('map_summary', 'Mappa') + (currentLang ? '' : '')"></span>
    </summary>
    <div class="map-view">
      <div id="map"></div>
    </div>
  </details>
</template>
```

---

### T2.3 & T2.4 - Restructure index.html

**File:** `src/static/index.html`

Update main-layout section:

```html
<div class="main-layout">
  <!-- Left Column: Search + Results -->
  <div class="search-column" id="search-column">
    <div id="search-container" role="search" aria-label="Gas station search"></div>
    <div id="results-container" role="region" aria-label="Search results"></div>
  </div>
  <!-- Resizer Handle -->
  <div class="resizer" id="layout-resizer" ...></div>
  <!-- Right Column: Map -->
  <div id="map-column" class="map-column">
    <div id="map-container" role="region" aria-label="Map view"></div>
  </div>
</div>
```

---

### T4.1 - getPriceDifference Helper

**File:** `src/static/js/app.ui.js`

Add after `isCheapestStation()`:

```javascript
getPriceDifference(index) {
  if (!this.results || this.results.length === 0) return '';
  const prices = this.results
    .map(s => Number(s.fuel_prices?.[0]?.price))
    .filter(p => Number.isFinite(p));
  if (prices.length === 0) return '';
  const minPrice = Math.min(...prices);
  const stationPrice = Number(this.results[index]?.fuel_prices?.[0]?.price);
  if (!Number.isFinite(stationPrice)) return '';
  const diff = stationPrice - minPrice;
  if (diff === 0) {
    return this.translate('best_price_short', 'Best');
  }
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(3)} €`;
},
```

---

### T4.2 - formatDistance Helper

**File:** `src/static/js/app.ui.js`

Add after `getPriceDifference()`:

```javascript
formatDistance(distance) {
  const num = parseFloat(distance);
  if (isNaN(num)) return distance;
  return `${num.toFixed(1)} km`;
},
```

---

### T4.3 - Update results.html

**File:** `src/static/templates/results.html`

Update the `.station-price` section (around line 58-74):

```html
<div class="station-price flex flex-col items-end gap-1" aria-label="Price">
  <!-- Best Price Badge -->
  <template x-if="isCheapestStation(index)">
    <span class="best-price-badge-inline"
      x-text="translate('best_price', 'Best Price!') + (currentLang ? '' : '')"></span>
  </template>
  
  <!-- Price Value -->
  <template x-if="station.fuel_prices && station.fuel_prices.length > 0">
    <span class="price-large" x-text="formatCurrency(station.fuel_prices[0].price)"></span>
  </template>
  
  <!-- Price Difference (not shown for cheapest) -->
  <template x-if="station.fuel_prices && station.fuel_prices.length > 0 && !isCheapestStation(index)">
    <span class="price-diff text-red-500 text-sm font-medium"
      x-text="getPriceDifference(index)"></span>
  </template>
  
  <!-- Fuel Type -->
  <template x-if="station.fuel_prices && station.fuel_prices.length > 0">
    <span class="price-fuel" :class="{
      'benzina': station.fuel_prices[0].type === 'benzina',
      'gasolio': station.fuel_prices[0].type === 'gasolio',
      'GPL': station.fuel_prices[0].type === 'GPL',
      'metano': station.fuel_prices[0].type === 'metano'
    }" x-text="translateFuel(station.fuel_prices[0].type) + (currentLang ? '' : '')"></span>
  </template>
  
  <!-- Distance in Header -->
  <template x-if="station.distance">
    <span class="distance-header text-xs text-gray-500 dark:text-gray-400 mt-1">
      <span x-text="formatDistance(station.distance)"></span>
    </span>
  </template>
</div>
```

---

### T3.1 - Update layout.css

**File:** `src/static/css/layout.css`

Update the `@media (min-width: 1024px)` section:

```css
@media (min-width: 1024px) {
  .main-layout {
    display: grid;
    grid-template-columns: 1fr 4px 1fr;
    gap: 0;
    align-items: start;
  }

  .search-column {
    position: sticky;
    top: 100px;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    padding-right: var(--space-md);
  }

  /* Results now in search column */
  #results-container {
    padding-top: var(--space-lg);
  }

  /* Map column - right side */
  .map-column {
    padding-left: var(--space-md);
    position: sticky;
    top: 100px;
    height: calc(100vh - 120px);
  }

  #map-container {
    height: 100%;
  }

  #map-container .map-card {
    height: 100%;
  }

  #map-container #map {
    height: 100%;
    min-height: 400px;
  }

  /* Resizer Handle Styling */
  .resizer { ... }
}

/* Mobile: stack map below results */
@media (max-width: 1023px) {
  .map-column {
    margin-top: var(--space-xl);
  }

  #map-container #map {
    height: 300px;
  }
}
```

---

## Execution Order

1. **Phase 1** → Tailwind setup (foundation)
2. **Phase 2** → Template changes (structure)
3. **Phase 3** → CSS updates (styling)
4. **Phase 4** → Card enhancements (features)
5. **Phase 5** → Component loading (wiring)
6. **Phase 6** → Testing (verification)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Tailwind conflicts with existing CSS | Use Tailwind sparingly, keep existing CSS |
| Map not initializing in new container | Test early, ensure `#map` ID is unique |
| Resizer not working with new layout | Update resizer to reference both columns |
| Mobile layout broken | Test breakpoints, ensure proper stacking |
