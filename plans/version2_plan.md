# Version 2 Implementation Plan

## Overview

Redesign the layout to move the map to the right column and results under the search form. Add distance and price difference information to each result card using Tailwind CSS.

## Current State

```
┌─────────────────┬──┬─────────────────┐
│  Search Form    │  │                 │
│                 │  │   Results       │
│  ┌───────────┐  │  │   (station      │
│  │   MAP     │  │  │    cards)       │
│  └───────────┘  │  │                 │
└─────────────────┴──┴─────────────────┘
```

## Target State

```
┌─────────────────┬──┬─────────────────┐
│  Search Form    │  │                 │
├─────────────────┤  │                 │
│                 │  │      MAP        │
│   Results       │  │   (sticky,      │
│   (station      │  │   full-height)  │
│    cards)       │  │                 │
└─────────────────┴──┴─────────────────┘
```

## Technical Changes

### 1. Tailwind CSS Integration (CDN)

**File:** `src/static/index.html`

Add Tailwind CSS via CDN in the `<head>` section:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: '#00c853',
          'primary-hover': '#00b248',
          'primary-light': '#b9f6ca',
          'primary-dark': '#009624',
        }
      }
    }
  }
</script>
```

### 2. Layout Restructure

**File:** `src/static/index.html`

Update the main layout grid to swap columns:

```html
<div class="main-layout grid grid-cols-1 lg:grid-cols-[1fr_4px_1fr] gap-0">
  <!-- Left Column: Search + Results -->
  <div class="search-column lg:sticky lg:top-[100px] lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:pr-4">
    <div id="search-container"></div>
    <div id="results-container"></div>
  </div>
  
  <!-- Resizer -->
  <div class="resizer hidden lg:block"></div>
  
  <!-- Right Column: Map -->
  <div id="map-column" class="hidden lg:block lg:sticky lg:top-[100px] lg:max-h-[calc(100vh-120px)] lg:pl-4">
    <div id="map-container"></div>
  </div>
</div>
```

### 3. Move Map from search.html to New Template

**New File:** `src/static/templates/map.html`

Extract the map card from `search.html`:

```html
<template x-if="results.length > 0">
  <div class="map-card h-full" x-data="{ mapOpen: true }">
    <div class="map-view h-full">
      <div id="map" class="w-full h-full min-h-[400px] lg:min-h-0 lg:h-full rounded-lg border border-gray-200 dark:border-gray-700"></div>
    </div>
  </div>
</template>
```

**File:** `src/static/templates/search.html`

Remove lines 98-113 (the map card section).

### 4. Update Result Cards with Distance & Price Difference

**File:** `src/static/templates/results.html`

Add distance and price difference display in the station card header:

```html
<div class="station-price flex flex-col items-end gap-1">
  <!-- Best Price Badge -->
  <template x-if="isCheapestStation(index)">
    <span class="inline-block bg-primary text-white px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide">
      <span x-text="translate('best_price', 'Best Price!')"></span>
    </span>
  </template>
  
  <!-- Price -->
  <template x-if="station.fuel_prices && station.fuel_prices.length > 0">
    <span class="text-2xl font-bold text-primary" x-text="formatCurrency(station.fuel_prices[0].price)"></span>
  </template>
  
  <!-- Price Difference -->
  <template x-if="station.fuel_prices && station.fuel_prices.length > 0 && !isCheapestStation(index)">
    <span class="text-sm text-red-500 font-medium" x-text="getPriceDifference(index)"></span>
  </template>
  
  <!-- Distance -->
  <template x-if="station.distance">
    <span class="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span x-text="formatDistance(station.distance)"></span>
    </span>
  </template>
</div>
```

### 5. Add Helper Functions

**File:** `src/static/js/app.ui.js`

Add two new helper functions:

```javascript
/**
 * Calculates the price difference from the cheapest station.
 * @param {number} index - Index of the station in the results array.
 * @returns {string} Formatted price difference (e.g., "+0.002 €" or "Best").
 */
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

/**
 * Formats distance value with unit.
 * @param {number|string} distance - The distance value.
 * @returns {string} Formatted distance (e.g., "2.5 km").
 */
formatDistance(distance) {
  const num = parseFloat(distance);
  if (isNaN(num)) return distance;
  return `${num.toFixed(1)} km`;
},
```

### 6. Update Component Loading

**File:** `src/static/js/app.ui.js`

Update the `init()` method to load the map template:

```javascript
async init() {
  try {
    await Promise.all([
      this.loadComponent("/static/templates/header.html", "header-container"),
      this.loadComponent("/static/templates/search.html", "search-container"),
      this.loadComponent("/static/templates/results.html", "results-container"),
      this.loadComponent("/static/templates/map.html", "map-container"),
      this.loadCities(),
    ]);
    // ... rest of init
  }
}
```

### 7. CSS Updates for New Layout

**File:** `src/static/css/layout.css`

Update the desktop layout styles:

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

  #map-container {
    padding-left: var(--space-md);
    height: calc(100vh - 120px);
  }

  #map-container .map-card {
    height: 100%;
  }

  #map-container #map {
    height: 100%;
    min-height: 400px;
  }

  /* Move results into search column */
  #results-container {
    padding-top: var(--space-lg);
    max-height: none;
    overflow-y: visible;
  }
}
```

## Tailwind Utility Classes Reference

For the new components, use these Tailwind classes alongside existing CSS:

| Element | Tailwind Classes |
|---------|-----------------|
| Layout Grid | `grid grid-cols-1 lg:grid-cols-[1fr_4px_1fr]` |
| Sticky Column | `lg:sticky lg:top-[100px]` |
| Price | `text-2xl font-bold text-primary` |
| Price Diff (positive) | `text-sm text-red-500 font-medium` |
| Price Diff (best) | `text-sm text-green-500 font-bold` |
| Distance Badge | `inline-flex items-center gap-1 text-sm text-gray-500` |
| Best Price Badge | `bg-primary text-white px-2 py-0.5 rounded-full text-xs font-bold` |

## Mobile Responsiveness

On mobile/tablet (< 1024px):
- Stack layout vertically: Search → Results → Map
- Map appears below results
- Full-width cards

## File Changes Summary

| File | Action | Changes |
|------|--------|---------|
| `src/static/index.html` | Modify | Add Tailwind CDN, restructure layout grid |
| `src/static/templates/search.html` | Modify | Remove map card (lines 98-113) |
| `src/static/templates/results.html` | Modify | Add price diff & distance display |
| `src/static/templates/map.html` | Create | New map template for right column |
| `src/static/js/app.ui.js` | Modify | Add `getPriceDifference()`, `formatDistance()`, update `init()` |
| `src/static/css/layout.css` | Modify | Update grid layout for new column arrangement |

## Testing Checklist

- [ ] Desktop layout shows Search + Results on left, Map on right
- [ ] Mobile layout stacks Search → Results → Map
- [ ] Resizer handle still works to adjust column widths
- [ ] Map is full-height and sticky on desktop
- [ ] Price difference shows correctly (e.g., "+0.002 €")
- [ ] Distance shows in km on each card
- [ ] Best price badge displays correctly
- [ ] Dark mode styles work with Tailwind classes
- [ ] No layout shift during page load

## Probabilistic Correctness

**High confidence — 90%+**

Based on:
- Established patterns in the codebase (Alpine.js templates, existing CSS variables)
- Simple layout swap with minimal structural changes
- CDN approach avoids build complexity
- Helper functions follow existing code style
