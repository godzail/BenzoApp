# Fix Map Details Element Collapse Issue

## Problem Diagnosis

The map is currently inside a `<details>` element in `src/static/templates/search.html` (lines 99-113). The user reports that the map cannot "rollup" (collapse) to show only the summary.

### Current Implementation Issues

1. **Summary styling incomplete**: The CSS for `.map-card summary` uses `list-style: none` but doesn't properly remove the default disclosure triangle in all browsers (needs `::-webkit-details-marker` and `::marker` pseudo-elements).

2. **Lack of visual feedback**: The summary doesn't have clear hover/focus states to indicate it's interactive.

3. **Missing collapse indicator**: No visual cue showing expanded/collapsed state.

4. **Map container sizing**: The `.map-view` height is fixed at 400px in `map.css`, but when nested in the search column, it should be 300px. The current CSS in `map.css` line 23-25 handles this, but the structure could be cleaner.

5. **Toggle handler limitation**: The `@toggle` event only invalidates map size when opening, but doesn't handle closing. This is fine, but we should ensure the map properly releases resources when collapsed to avoid rendering issues.

## Proposed Solution

### 1. Update CSS in `src/static/css/components.css`

Replace the existing `.map-card-header, .map-card summary` block (lines 2-16) with comprehensive styles for the map card details element:

```css
/* Map Card - Details Element */
.map-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.map-card summary {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  list-style: none;
  /* Remove default disclosure triangle */
  &::-webkit-details-marker {
    display: none;
  }
  &::marker {
    display: none;
  }
  /* Hover and focus states */
  &:hover {
    background: var(--bg-elevated);
    color: var(--color-primary);
  }
  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  /* Custom indicator for expanded/collapsed state */
  &::after {
    content: "";
    margin-left: auto;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid currentColor;
    transition: transform var(--transition-fast);
  }
}

/* Rotate indicator when details is open */
.map-card[open] summary::after {
  transform: rotate(180deg);
}

/* Map view container - collapses with details */
.map-card .map-view {
  padding: 0 var(--space-md) var(--space-md);
}

.map-card .map-view #map {
  width: 100%;
  height: 300px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
}
```

**Note**: The existing `.map-card` styles from `map.css` (lines 9-16) will be overridden by the above. We should consolidate or ensure the above takes precedence. The above includes the card styling and removes the old margin-bottom pattern.

### 2. Update `src/static/css/map.css`

Remove duplicate map container styles since they're now in `components.css`. Specifically, remove or comment out:

- Lines 19-25 (`.search-column-map` and its `.map-view`)
- Lines 27-34 (`.map-view` and its styles)
- Lines 36-39 (`#map`)

Keep only the marker-related styles and Leaflet overrides.

Alternatively, keep them but ensure they don't conflict. The new styles in `components.css` should be more specific (`.map-card .map-view #map`) to override.

### 3. Optional: Improve Toggle Handler in `src/static/templates/search.html`

Update the `@toggle` to handle both open and close:

```html
<details class="map-card search-column-map" open
  @toggle="$nextTick(() => { if ($event.target.open) { map?.invalidateSize(); } else { /* optional: pause/destroy map to save resources */ } })">
```

This is optional; the current handler is mostly fine.

### 4. Ensure HTML Structure is Correct

The current HTML in `search.html` is well-structured. No changes needed, but verify:

- The `<details>` has `class="map-card search-column-map"`
- The `<summary>` contains the icon and text
- The `.map-view` contains `#map`

## Expected Outcome

- The summary displays with a custom dropdown indicator (triangle) that rotates when open
- Clicking the summary toggles the map visibility smoothly
- The summary has hover/focus states for better UX
- The map collapses completely when closed, showing only the summary bar
- No default browser disclosure triangle appears
- The map resizes correctly when reopened

## Files to Modify

1. `src/static/css/components.css` - Replace lines 1-16 with the new CSS block above
2. `src/static/css/map.css` - Remove or simplify duplicate map container styles (lines 19-39)
3. `src/static/templates/search.html` - Optional: improve `@toggle` handler (line 101)

## Implementation Notes

- The CSS uses SCSS-like nested syntax (`&::after`). The project appears to use plain CSS (based on existing files). **Need to verify if the build pipeline processes SCSS**. Looking at `biome.json` and `pyproject.toml` would help.

If plain CSS is required (no nesting), rewrite nested rules as:

```css
.map-card summary::-webkit-details-marker {
  display: none;
}
.map-card summary::marker {
  display: none;
}
.map-card summary:hover {
  background: var(--bg-elevated);
  color: var(--color-primary);
}
.map-card summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.map-card summary::after {
  content: "";
  margin-left: auto;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid currentColor;
  transition: transform var(--transition-fast);
}
.map-card[open] summary::after {
  transform: rotate(180deg);
}
.map-card .map-view {
  padding: 0 var(--space-md) var(--space-md);
}
.map-card .map-view #map {
  width: 100%;
  height: 300px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
}
```

## Verification Steps

1. Run the application (`uv run _main.py`)
2. Perform a search to populate results (map appears)
3. Click the map summary to collapse it - only the summary bar should remain visible
4. Click again to expand - map should render properly
5. Test keyboard accessibility (Tab to summary, press Enter/Space to toggle)
6. Test in both light and dark themes
7. Verify the custom triangle indicator rotates on expand/collapse
