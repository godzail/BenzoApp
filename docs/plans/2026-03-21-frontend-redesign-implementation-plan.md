# BenzoApp Frontend Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modernize BenzoApp frontend with warm/friendly palette, rounded soft components, improved spacing, and modern aesthetics while maintaining functionality.

**Architecture:** CSS-first approach - update CSS variables in base.css, update component styles in custom.css, update Tailwind config in index.html, minimal TS changes for class handling.

**Tech Stack:** Vanilla TS/JS, Tailwind CSS (CDN), CSS custom properties, Leaflet.js

---

## Task 1: Update CSS Variables (Warm Color System)

**Files:**
- Modify: `src/static/css/base.css:1-147`

**Step 1: Update base.css with warm palette**

Replace the entire `:root` and `[data-theme="light"]` sections with warm colors:

```css
:root {
  /* Primary Accent - Warm Orange */
  --color-primary: #f97316;
  --color-primary-light: #fed7aa;
  --color-primary-hover: #ea580c;
  --color-primary-dark: #c2410c;

  /* Dark Theme - Warm Stone Tones */
  --bg-primary: #1c1917;        /* stone-900 */
  --bg-surface: #292524;        /* stone-800 */
  --bg-elevated: #44403c;       /* stone-700 */
  --border-color: #57534e;      /* stone-600 */
  --text-primary: #fafaf9;      /* stone-50 */
  --text-secondary: #a8a29e;    /* stone-400 */
  --text-muted: #78716c;        /* stone-500 */

  /* Design Tokens */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Warm Shadows */
  --shadow-sm: 0 1px 2px rgba(28, 25, 23, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(28, 25, 23, 0.08), 0 2px 4px -2px rgba(28, 25, 23, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(28, 25, 23, 0.08), 0 4px 6px -4px rgba(28, 25, 23, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(28, 25, 23, 0.1), 0 8px 10px -6px rgba(28, 25, 23, 0.05);
  --shadow-card: 0 4px 12px rgba(249, 115, 22, 0.08);

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
}

[data-theme="light"] {
  --bg-primary: #fefce8;        /* warm-50 */
  --bg-surface: #ffffff;
  --bg-elevated: #f5f5f4;       /* stone-100 */
  --border-color: #e7e5e4;      /* stone-200 */
  --text-primary: #1c1917;      /* stone-900 */
  --text-secondary: #78716c;    /* stone-500 */
  --text-muted: #a8a29e;        /* stone-400 */
  --color-primary-hover: #ea580c;
}
```

**Step 2: Update fuel colors for warmth**

Replace fuel color section with warmer tones:

```css
/* Fuel Type Colors - Warm Updates */
:root {
  --fuel-benzina-color: #ea580c;
  --fuel-gasolio-color: #475569;
  --fuel-gpl-color: #dc2626;
  --fuel-metano-color: #0369a1;
}

[data-theme="light"] {
  --fuel-benzina-color: #e65100;
  --fuel-gasolio-color: #334155;
  --fuel-gpl-color: #b91c1c;
  --fuel-metano-color: #0369a1;
}
```

**Step 3: Update glass morphism for warmth**

```css
/* Glass Morphism - Warm Tones */
:root {
  --glass-bg: rgba(41, 37, 36, 0.85);
  --glass-border: rgba(250, 250, 249, 0.08);
}

[data-theme="light"] {
  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(28, 25, 23, 0.08);
}
```

**Step 4: Update focus styles**

```css
/* Accessibility: Focus visible */
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.15);
}
```

**Step 5: Update skip link for warm theme**

```css
.skip-link {
  background: var(--color-primary);
  color: #fff;
}
```

---

## Task 2: Update Tailwind Config (index.html)

**Files:**
- Modify: `src/static/index.html:38-108`

**Step 1: Update Tailwind primary color to warm orange**

Replace the tailwind.config colors section:

```javascript
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#f97316",
          hover: "#ea580c",
          light: "#fed7aa",
          dark: "#c2410c",
        },
        benzina: {
          DEFAULT: "#ea580c",
          light: "#fb923c",
        },
        gasolio: {
          DEFAULT: "#475569",
          light: "#94a3b8",
        },
        gpl: {
          DEFAULT: "#dc2626",
          light: "#f87171",
        },
        metano: {
          DEFAULT: "#0369a1",
          light: "#38bdf8",
        },
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(28, 25, 23, 0.05)",
        md: "0 4px 6px -1px rgba(28, 25, 23, 0.08), 0 2px 4px -2px rgba(28, 25, 23, 0.05)",
        lg: "0 10px 15px -3px rgba(28, 25, 23, 0.08), 0 4px 6px -4px rgba(28, 25, 23, 0.05)",
        xl: "0 20px 25px -5px rgba(28, 25, 23, 0.1), 0 8px 10px -6px rgba(28, 25, 23, 0.05)",
        card: "0 4px 12px rgba(249, 115, 22, 0.08)",
      },
    },
  },
};
```

---

## Task 3: Update Component Styles (custom.css)

**Files:**
- Modify: `src/static/css/custom.css:1-693`

**Step 1: Update station card styles (lines 89-127)**

Replace station card section with warmer, more rounded styling:

```css
/* Station Card - Base */
.station-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-md);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
  cursor: pointer;
  position: relative;
}

/* Station Card - Selected State */
.station-card.selected {
  border-color: var(--color-primary);
  border-left: 4px solid var(--color-primary);
  box-shadow: var(--shadow-card), 0 0 20px rgba(249, 115, 22, 0.15);
  transform: translateY(-2px);
  background: linear-gradient(90deg, rgba(249, 115, 22, 0.05) 0%, var(--bg-surface) 20%);
}

/* Station Card - Hover State */
.station-card:hover:not(.selected) {
  transform: translateY(-2px) scale(1.01);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-primary-light);
}

/* Station Card - Focus State */
.station-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.2), var(--shadow-md);
}
```

**Step 2: Update chip styles for softer rounded look (lines 441-576)**

The chips already have a good structure, but update the glow colors:

```css
/* Chip active glow - update orange glow */
.chip.active.benzina {
  --chip-glow: rgba(234, 88, 12, 0.25);
  box-shadow: 0 4px 16px var(--chip-glow), inset 0 -2px 0 var(--chip-color);
}

.chip.active.GPL {
  --chip-glow: rgba(220, 38, 38, 0.25);
  box-shadow: 0 4px 16px var(--chip-glow), inset 0 -2px 0 var(--chip-color);
}
```

**Step 3: Update slider styles (lines 292-348)**

Make sliders more rounded and warmer:

```css
/* Range slider styling */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 9999px;
  background: var(--bg-elevated);
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  box-shadow: var(--shadow-md), 0 0 0 3px var(--bg-surface);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: var(--shadow-lg), 0 0 0 4px var(--bg-surface);
}

input[type="range"]::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  box-shadow: var(--shadow-md), 0 0 0 3px var(--bg-surface);
  border: none;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
}
```

**Step 4: Update button styles**

```css
/* Primary Button */
.btn-primary {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%);
  color: #fff;
  font-weight: 600;
  border-radius: 12px;
  padding: 12px 24px;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.98);
}

/* CSV Popup Button */
.csv-popup-btn {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%);
  color: #fff;
  border-radius: 12px;
  font-weight: 700;
}

.csv-popup-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
}
```

---

## Task 4: Update Template Styles

**Files:**
- Modify: `src/static/templates/header.html:69-130`

**Step 1: Update search bar for softer rounded look**

Replace the search-bar div class:

```html
<div class="search-bar flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl px-4 py-2 shadow-md transition-all duration-200 hover:shadow-lg focus-within:border-[var(--color-primary)] focus-within:shadow-md">
```

**Step 2: Update location pill button**

```html
<button
  id="location-btn"
  class="location-pill flex items-center gap-2 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-full px-4 py-2 text-sm text-[var(--text-secondary)] cursor-pointer transition-all duration-150 hover:bg-[var(--color-primary-light)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
  type="button"
>
```

---

## Task 5: Update Search Template Styles

**Files:**
- Modify: `src/static/templates/search.html:26-109`

**Step 1: Update fuel chips container**

```html
<div
  class="fuel-chips flex gap-3 mb-6 flex-wrap"
  role="group"
  aria-label="Seleziona tipo di carburante"
>
```

**Step 2: Update chip buttons with better rounded corners**

```html
<button
  id="fuel-benzina"
  class="chip benzina flex-1 min-w-24 justify-center inline-flex items-center gap-2 rounded-xl px-4 py-3"
  type="button"
>
```

---

## Task 6: Update Results Template

**Files:**
- Modify: `src/static/templates/results.html:1-96`

**Step 1: Update skeleton card to match new style**

```html
<div class="skeleton-card bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-6">
```

**Step 2: Update empty state with warmer styling**

```html
<div
  id="empty-state"
  class="hidden text-center py-12 px-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl"
>
```

**Step 3: Update error message styling**

```html
<div
  id="error-message"
  class="hidden flex items-start gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 mt-4"
  role="alert"
>
```

---

## Task 7: Update Station Card Render (JS)

**Files:**
- Modify: `src/static/ts/app.ui.interactions.ts:303-350`

**Step 1: Update station card HTML generation**

Replace the article.className and innerHTML with:

```typescript
article.className =
  "station-card bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 shadow-md transition-all duration-200 cursor-pointer relative min-h-[160px] hover:translate-y-[-2px] hover:shadow-xl hover:scale-[1.01] hover:border-[var(--color-primary-light)]";
```

Replace the station icon background:

```typescript
<div class="station-icon w-10 h-10 bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-primary)] rounded-xl flex items-center justify-center text-white shadow-sm">\
```

Replace the best price badge animation to use warm glow:

```typescript
${isCheapest ? `<span class="inline-block bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-md" style="animation: badge-entrance 0.4s ease-out;">${this.translate("best_price", "Miglior Prezzo!")}</span>` : ""}
```

---

## Task 8: Update Animation Keyframes (custom.css)

**Files:**
- Modify: `src/static/css/custom.css:219-290`

**Step 1: Update pulse-badge animation to warm orange**

```css
@keyframes pulse-badge {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.6);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(249, 115, 22, 0);
  }
}
```

**Step 2: Add new entrance animation for cards**

```css
@keyframes card-entrance {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.station-card {
  animation: card-entrance 0.3s ease-out;
}
```

---

## Task 9: Update Leaflet Popup Styles (custom.css)

**Files:**
- Modify: `src/static/css/custom.css:399-423`

**Step 1: Update popup styling**

```css
.leaflet-popup-content-wrapper {
  background: var(--bg-surface);
  border-radius: 16px;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-color);
}

.leaflet-popup-content {
  color: var(--text-primary);
  margin: 16px;
  font-family: inherit;
}

.leaflet-popup-tip {
  background: var(--bg-surface);
}
```

---

## Task 10: Add Smooth Scrolling & Global Styles (base.css)

**Files:**
- Modify: `src/static/css/base.css`

**Step 1: Add smooth scrolling**

```css
/* Smooth scrolling */
html {
  scroll-behavior: smooth;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

**Step 2: Add selection color**

```css
/* Text selection */
::selection {
  background: rgba(249, 115, 22, 0.2);
  color: inherit;
}
```

---

## Verification Steps

After all changes:

1. **Visual Check:** Load app in browser, verify:
   - Header has frosted glass effect
   - Search bar is rounded (not sharp corners)
   - Fuel chips are pill-shaped with warm colors
   - Station cards are rounded with warm shadows
   - Sliders have orange thumb
   - Best price badge has warm gradient

2. **Theme Toggle:** Click theme toggle, verify both light/dark modes work with warm palette

3. **Mobile:** Resize to mobile width, verify responsive layout

4. **Accessibility:** Tab through controls, verify focus states are visible

---

## Implementation Notes

- All changes are CSS-only except Task 7 (minimal class changes in TS)
- No build process needed - CSS served directly
- Backward compatible with existing functionality
- Focus on warm orange (#f97316) as primary accent
- Stone tones for backgrounds (warmer than zinc)
