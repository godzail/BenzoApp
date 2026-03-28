# BenzoApp Frontend Redesign - Design Document

**Date:** 2026-03-21  
**Status:** Approved  
**Goal:** Modern, clean aesthetic with warm/friendly palette

---

## 1. Concept & Vision

A warm, approachable fuel station finder that feels modern yet inviting. The design evokes energy and warmth through orange/amber accents while maintaining excellent readability and accessibility. The interface should feel like a helpful companion for daily commuters and travelers in Italy.

---

## 2. Design Language

### Aesthetic Direction
**"Refined Warm Modern"** - Soft rounded components with warm shadows, generous whitespace, and an inviting orange palette that communicates energy and approachability.

### Color Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--color-primary` | `#f97316` | `#fb923c` | Primary accent (CTA, active states) |
| `--color-primary-hover` | `#ea580c` | `#f97316` | Hover states |
| `--color-primary-light` | `#fed7aa` | `#431407` | Backgrounds, chips |
| `--bg-primary` | `#fefce8` | `#1c1917` | Page background (warm white/stone) |
| `--bg-surface` | `#ffffff` | `#292524` | Cards, panels |
| `--bg-elevated` | `#f5f5f4` | `#44403c` | Hover states, inputs |
| `--border-color` | `#e7e5e4` | `#57534e` | Borders, dividers |
| `--text-primary` | `#1c1917` | `#fafaf9` | Headlines, body |
| `--text-secondary` | `#78716c` | `#a8a29e` | Labels, captions |
| `--text-muted` | `#a8a29e` | `#78716c` | Placeholders |

**Fuel Type Colors (Warm Updates):**
| Fuel | Light | Dark | Usage |
|------|-------|------|-------|
| Benzina | `#ea580c` | `#fb923c` | Gasoline |
| Gasolio | `#475569` | `#94a3b8` | Diesel |
| GPL | `#dc2626` | `#f87171` | LPG |
| Metano | `#0369a1` | `#38bdf8` | Natural gas |

### Typography
- **Font Family:** Inter (primary), system-ui fallback
- **Headline (Station Name):** 600 weight, 1.125rem
- **Body:** 400 weight, 0.875rem
- **Caption/Price:** 500 weight, 0.75rem
- **Line Height:** 1.5 for body, 1.25 for headlines

### Spacing System (8px Grid)
- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-8`: 32px

### Border Radius
- **Small (chips, badges):** 8px
- **Medium (buttons, inputs):** 12px
- **Large (cards):** 16px
- **XL (modals, sheets):** 24px

### Shadows (Warm Tones)
```css
--shadow-sm: 0 1px 2px rgba(28, 25, 23, 0.05);
--shadow-md: 0 4px 6px -1px rgba(28, 25, 23, 0.08), 0 2px 4px -2px rgba(28, 25, 23, 0.05);
--shadow-lg: 0 10px 15px -3px rgba(28, 25, 23, 0.08), 0 4px 6px -4px rgba(28, 25, 23, 0.05);
--shadow-card: 0 4px 12px rgba(249, 115, 22, 0.08);
```

### Motion Philosophy
- **Duration:** 150ms for micro-interactions, 300ms for state changes
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)
- **Hover Effects:** Scale 1.02 + shadow lift for cards
- **Transitions:** All color/background changes animated

---

## 3. Layout & Structure

### Split View Layout
```
┌─────────────────────────────────────────────┐
│  Header (glass effect, sticky)              │
├─────────────────────┬───────────────────────┤
│                     │  Search Panel         │
│                     │  - City search        │
│    Map              │  - Fuel type chips    │
│    (Leaflet)        │  - Radius slider      │
│                     │  - Search button      │
│                     ├───────────────────────┤
│                     │  Results List         │
│                     │  - Station cards      │
│                     │  - Scrollable         │
└─────────────────────┴───────────────────────┘
```

### Responsive Strategy
- **Desktop (>1024px):** Side-by-side split view, 55% map / 45% panel
- **Tablet (768-1024px):** Stacked with collapsible map (30vh)
- **Mobile (<768px):** Bottom sheet pattern, map 40vh, swipe-up results

---

## 4. Component Inventory

### 4.1 Header
- **Appearance:** Frosted glass effect (`backdrop-blur: 12px`), warm shadow
- **Height:** 64px desktop, 56px mobile
- **Contents:** Logo (left), search bar (center), theme toggle + language (right)
- **States:** Default, scrolled (increased blur + shadow)

### 4.2 Search Input
- **Appearance:** Rounded (12px), warm border, search icon left
- **Height:** 48px
- **States:** Default, focus (primary border + shadow), error (red border)

### 4.3 Fuel Type Chips
- **Appearance:** Rounded pills (8px), icon + label, warm colors
- **Size:** Auto width, 36px height
- **States:**
  - Default: Outlined, muted colors
  - Selected: Filled with fuel color, white text
  - Hover: Slight background tint

### 4.4 Range Sliders
- **Track:** Rounded (8px), 6px height, `--bg-elevated` background
- **Fill:** Primary gradient from left
- **Thumb:** 20px circle, primary color, shadow
- **States:** Default, hover (thumb scale 1.1), active (thumb scale 0.95), disabled

### 4.5 Primary Button
- **Appearance:** Rounded (12px), primary gradient background, white text
- **Height:** 48px
- **Padding:** 16px 24px
- **States:**
  - Default: Primary gradient
  - Hover: Slightly darker + shadow lift
  - Active: Scale 0.98
  - Loading: Spinner icon, disabled
  - Disabled: 50% opacity

### 4.6 Station Card
- **Appearance:** Rounded (16px), white background, warm shadow
- **Padding:** 16px
- **Contents:**
  - Header: Station name (bold) + brand badge
  - Body: Address, distance
  - Footer: Fuel prices grid
- **States:**
  - Default: Subtle shadow
  - Hover: Shadow lift + scale 1.02
  - Selected: Primary border left (4px)

### 4.7 Map Markers
- **Appearance:** Teardrop shape, fuel-colored fill, white border
- **Size:** 32px
- **States:** Default, hover (scale 1.2), selected (scale 1.3 + bounce)

### 4.8 Map Popup
- **Appearance:** Rounded (16px), matches card styling
- **Width:** 280px max
- **Contents:** Station name, address, fuel prices, "View Details" link

### 4.9 Language Switcher
- **Appearance:** Rounded (8px), dropdown with flag icons
- **Options:** IT (🇮🇹), EN (🇬🇧)

### 4.10 Theme Toggle
- **Appearance:** Rounded pill (24px), sun/moon icons
- **Animation:** Icon rotation on toggle

---

## 5. Accessibility Updates

### ARIA Enhancements
- All interactive elements have visible focus indicators
- Chips use `role="radio"` within `role="radiogroup"`
- Results list uses `role="listbox"` with `role="option"` items
- Live regions for dynamic content updates (`aria-live="polite"`)

### Keyboard Navigation
- Tab order: Search → Fuel Chips → Sliders → Search Button
- Arrow keys navigate within chip group
- Enter/Space activates selections
- Escape closes any open dialogs

### Visual Accessibility
- Contrast ratios meet WCAG AA (4.5:1 for text)
- Focus indicators: 2px solid primary with 2px offset
- Reduced motion support via `prefers-reduced-motion`
- No color-only information (icons + labels)

---

## 6. Technical Approach

### File Changes

| File | Changes |
|------|---------|
| `src/static/css/base.css` | Update CSS variables with warm palette |
| `src/static/css/custom.css` | Update component styles (cards, chips, buttons) |
| `src/static/templates/header.html` | Add glass effect, improve layout |
| `src/static/templates/search.html` | Update chip/input styling |
| `src/static/templates/results.html` | Update card styling |
| `src/static/templates/map.html` | Update popup styling |
| `src/static/ts/app.ui.interactions.ts` | Add animations, update class handling |

### No Build Changes Required
- All CSS changes are additive/variable-based
- No new dependencies
- Backward compatible with existing JS

---

## 7. Implementation Priority

1. **Phase 1:** Color system updates (CSS variables)
2. **Phase 2:** Component styling (cards, chips, buttons)
3. **Phase 3:** Layout refinements (header, spacing)
4. **Phase 4:** Animations & micro-interactions
5. **Phase 5:** Accessibility audit
