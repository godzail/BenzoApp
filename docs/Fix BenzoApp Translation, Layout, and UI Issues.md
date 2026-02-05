# Fix BenzoApp Translation, Layout, and UI Issues

## Problem Statement

The application has several issues:

1. **Translation sync issue**: EN button is highlighted (green) but text is in Italian
2. **Layout issue**: Map should be in a card under the search button, results on the right (desktop)
3. **UI stability**: Buttons cause objects to not refresh properly and move in the window

## Current State

* `app.js:114`: `currentLang` initialized to `"it"` but not synced with i18next
* `i18n.js:109-114`: Uses localStorage or defaults to "it", but doesn't update app state
* Layout: Map only appears after search results exist, causing layout shift
* CSS grid: `grid-template-columns: 60% 40%` with search/map left, results right

## Proposed Changes

### 1. Fix Language Synchronization (i18n.js + app.js)

**i18n.js changes:**

* After i18next initialization, dispatch an event with the actual language used
* This ensures the app state matches i18next's actual language
**app.js changes:**
* On init, synchronize `currentLang` with the actual i18next language
* Listen for the initialization event to update `currentLang`
* Remove hardcoded `currentLang: "it"` default and use dynamic detection

### 2. Fix Layout - Map Card Under Search (CSS + Templates)

**styles.css changes:**

* Keep the 2-column desktop layout but adjust structure
* Add `.map-card` styling for the map container card
* Ensure map always has reserved height to prevent layout shifts
**search.html changes:**
* Move map outside the `x-if` conditional so it always renders
* Wrap map in a card container with proper styling
* Show a placeholder or default map view when no results
**index.html changes:**
* Ensure the structure supports: left (search form + map card), right (results)

### 3. Fix UI Stability Issues (CSS + JS)

**styles.css changes:**

* Add `min-height` to map container to prevent layout shifts
* Add smooth transitions for state changes
* Ensure buttons have stable dimensions
**app.js changes:**
* Initialize map earlier (not just after results)
* Add debouncing for map updates
* Ensure proper Alpine.js reactivity for language state

### 4. Additional Translation Fixes

**header.html changes:**

* Ensure language button active state uses proper reactive binding
**en.json / it.json:**
* Verify all translation keys are present (already complete)

## Files to Modify

1. `src/static/js/i18n.js` - Dispatch language init event
2. `src/static/js/app.js` - Sync currentLang on init, init map earlier
3. `src/static/css/styles.css` - Map card styling, layout fixes
4. `src/static/templates/search.html` - Always show map in card
5. `src/static/templates/header.html` - Fix language button sync
6. `src/static/index.html` - Minor structure adjustment if needed
