# Fix Recent Searches Styling

## Problem
The recent searches component in [`search.html`](src/static/templates/search.html:1-17) uses CSS classes that are only defined in [`styles.css`](src/static/css/styles.css:780-817) but missing from the split CSS modules. When the application uses [`styles.split.css`](src/static/css/styles.split.css), the recent searches component appears unstyled.

## Solution

### 1. Add Recent Searches Styles to components.css
Add the following styles to [`components.css`](src/static/css/components.css) after line 324 (after `.station-actions-row .btn`):

```css
/* ============================================
   RECENT SEARCHES
   ============================================ */

.recent-searches-container {
  margin-bottom: var(--space-lg);
}

.recent-searches-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.recent-searches-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.recent-search-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-md);
  font-size: 0.8125rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.recent-search-btn:hover {
  background: var(--bg-surface);
  border-color: var(--color-primary);
  color: var(--color-primary);
}
```

**Note:** The `pulse-badge` keyframes animation is already present in [`components.css`](src/static/css/components.css:59-68) (used for `.best-price-badge-inline`), so no additional animations need to be added.

### 2. Remove Duplicate Styles from styles.css
Remove lines 776-817 from [`styles.css`](src/static/css/styles.css), which contain:
- The "RECENT SEARCHES" section comment
- `.recent-searches-container` styles
- `.recent-searches-title` styles
- `.recent-searches-list` styles
- `.recent-search-btn` styles (including hover state)

This prevents CSS duplication and ensures styles are only loaded from the split modules.

### 3. Verify CSS File Line Counts
After changes:
- [`components.css`](src/static/css/components.css): 327 → ~360 lines (well under 500)
- [`styles.css`](src/static/css/styles.css): 1138 → ~1120 lines (still serves as compatibility wrapper)

All other CSS files remain unchanged.

## Expected Outcome
- Recent searches component will be properly styled when using [`styles.split.css`](src/static/css/styles.split.css)
- No CSS duplication across files
- All CSS module files stay under 500 lines
- Application maintains backward compatibility via [`styles.css`](src/static/css/styles.css) wrapper

## Files to Modify
1. [`src/static/css/components.css`](src/static/css/components.css) - Add recent searches styles
2. [`src/static/css/styles.css`](src/static/css/styles.css) - Remove duplicate recent searches styles
