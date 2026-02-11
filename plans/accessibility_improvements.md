# Accessibility Improvements Plan

## Executive Summary

**Objective:** Enhance accessibility by adapting colors for WCAG compliance and reducing custom CSS through Tailwind utilities, with special attention to forced-color-adjust for high contrast mode support.

**Probabilistic Correctness Ratio:** 85% — Based on established Tailwind patterns and WCAG guidelines, but requires user testing for final validation.

---

## Current State Analysis

### 1. CSS Structure

The project uses:
- **Tailwind CSS** (via CDN with plugins: forms, container-queries)
- **Custom CSS files** in `src/static/css/`:
  - `base.css` — CSS variables and theme definitions
  - `components.css` — Component-level styles (.btn, .card, .row, .col)
  - `layout.css` — Layout utilities (.header, .main, .aside, .hidden)
  - `docs.css` — Documentation-specific styles
  - `map.css` — Map styling

### 2. Color Variables (base.css)

```css
:root {
  --text-primary: #0f172a;       /* Slate 900 */
  --text-secondary: #475569;     /* Slate 600 */
  --bg-surface: #ffffff;
  --bg-elevated: #f8fafc;        /* Slate 50 */
  --border-color: #e6e9f2;
  --color-primary: #006e3b;      /* Custom green */
}

@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #eaeaea;
    --bg-surface: #1e1e1e;
    --bg-elevated: #2b2b2b;
    --border-color: #353535;
    --color-primary: #39E079;    /* Bright green */
  }
}

.dark {
  /* Same as above */
}
```

### 3. Custom Classes to Replace

| Custom Class | Usage | Tailwind Equivalent |
|-------------|-------|---------------------|
| `.btn` | Base button styles | `inline-flex items-center gap-2 px-3 py-2 rounded-lg border` |
| `.card` | Card container | `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4` |
| `.row` | Flex row | `flex gap-3` |
| `.col` | Flex column | `flex flex-col gap-3` |
| `.hidden` | Hide element | `hidden` (Tailwind built-in) |
| `.custom-scrollbar` | Webkit scrollbar styling | Needs custom CSS still, but add forced-color-adjust |

### 4. Accessibility Issues Identified

- **Focus states**: Only `#docs-theme-toggle` has explicit focus styling; other interactive elements may lack visible focus indicators
- **Color contrast**: Primary color `#006e3b` on white may not meet WCAG AA (4.5:1) for normal text; need verification
- **Forced colors mode**: No `forced-color-adjust` utilities; custom scrollbar and decorative elements may break in high contrast mode
- **Preflight conflicts**: Custom `* { box-sizing: border-box; }` conflicts with Tailwind's Preflight (already handled but worth noting)

---

## Implementation Plan

### Phase 1: Color Contrast Analysis & Updates

**Task 1.1:** Run contrast checker to validate current palette

```bash
python scripts/color_contrast.py
```

**Expected improvements needed:**
- `#006e3b` on `#ffffff`: Likely ~8.5:1 (PASS) — verify
- `#006e3b` on `#1e1e1e`: Likely ~4.5:1 (PASS) — verify
- `#39E079` on `#1e1e1e`: Likely ~3.5:1 (FAIL) — needs adjustment
- Text colors: `#0f172a` on `#ffffff` (~16:1 PASS), `#eaeaea` on `#1e1e1e` (~7:1 PASS)

**Task 1.2:** Update dark theme primary color to ensure WCAG AA compliance

If `#39E079` fails, use a slightly darker green like `#32CD68` or `#2EB872`.

**Task 1.3:** Ensure all text/background combinations meet:
- **AA**: 4.5:1 for normal text, 3:1 for large text (18pt+ or 14pt+ bold)
- **AAA**: 7:1 for normal text, 4.5:1 for large text (optional upgrade)

---

### Phase 2: Forced Color Adjust Implementation

**Task 2.1:** Add global forced-color-adjust setting

In `base.css`, add:

```css
/* Support for Windows High Contrast Mode */
@media (forced-colors: active) {
  * {
    forced-color-adjust: auto;
  }

  /* Opt out for decorative elements that should not be forced */
  .custom-scrollbar::-webkit-scrollbar-thumb {
    forced-color-adjust: none;
  }

  /* Ensure borders are visible in high contrast */
  .btn, .card, input, select, textarea {
    forced-color-adjust: auto;
  }
}
```

**Task 2.2:** Update custom scrollbar CSS to include forced-color-adjust

In `index.html` inline styles:

```css
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #dbe0e6;
  border-radius: 10px;
  forced-color-adjust: auto; /* Allow system colors in high contrast */
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #374151;
  forced-color-adjust: auto;
}
```

**Task 2.3:** Verify all interactive elements have forced-color-adjust: auto (default is auto, so explicit only if needed)

---

### Phase 3: Replace Custom CSS with Tailwind Utilities

**Task 3.1:** Replace `.btn` class

**Current usage:**
- `class="btn"` in templates (need to verify)
- Custom styles: `display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-surface);`

**Replace with Tailwind:**
```html
<button class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
```

**Action:** Search for `.btn` usage and replace with Tailwind classes directly in HTML templates.

**Task 3.2:** Replace `.card` class

**Current:**
```css
.card { background:var(--bg-surface); border:1px solid var(--border-color); border-radius:12px; padding:12px; }
```

**Replace with:**
```html
<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
```

**Task 3.3:** Replace `.row` and `.col` layout classes

**Current:**
```css
.row { display:flex; gap:12px; }
.col { display:flex; flex-direction:column; gap:12px; }
```

**Replace with:**
- `.row` → `flex gap-3`
- `.col` → `flex flex-col gap-3`

**Task 3.4:** Remove `.hidden` class (use Tailwind's `hidden`)

**Current:** `src/static/css/layout.css` line 12: `.hidden { display: none !important; }`

**Action:** Remove this rule and update all HTML uses of `class="hidden"` to use Tailwind's `hidden` utility (already same effect).

**Task 3.5:** Migrate `docs.css` utilities to Tailwind where possible

Review `docs.css` for custom styles that can be replaced:
- `.docs-container` → Could use Tailwind's `max-w-980px` (custom) or keep as custom wrapper
- Typography utilities (`h1`, `h2`, `p`, `li` spacing) → Use Tailwind's `@tailwindcss/typography` plugin (consider adding)
- Table styles → Could use Tailwind's table utilities
- Code block styles → Keep custom for syntax highlighting, but ensure forced-color-adjust

**Task 3.6:** Update `map.css` to use Tailwind

Current:
```css
#map { position: absolute; inset: 0; }
.map-view { height: 400px; }
.map-card { border-radius: 8px; overflow: hidden; }
```

Replace with Tailwind classes directly in HTML:
- `#map` → `class="absolute inset-0"` (already in use)
- `.map-view` → `class="h-96"` or `h-[400px]`
- `.map-card` → `class="rounded-lg overflow-hidden"`

---

### Phase 4: Enhance Focus States

**Task 4.1:** Audit all interactive elements for focus visibility

Check:
- Buttons (all)
- Inputs (search input, range slider)
- Links
- Cards with `tabindex` or click handlers
- Map markers (if keyboard accessible)

**Task 4.2:** Add consistent focus ring utilities

Use Tailwind's focus-visible to avoid mouse focus:

```html
<button class="... focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
```

**Task 4.3:** Ensure focus rings have sufficient contrast

- Light theme: `focus-visible:ring-primary` (green) should have 3:1 contrast against white background
- Dark theme: `focus-visible:ring-primary` (bright green) likely sufficient
- Test: `#006e3b` ring on `#ffffff` — contrast ratio?

If needed, use `focus-visible:ring-blue-500` or `focus-visible:ring-offset` adjustments.

---

### Phase 5: Remove Redundant CSS

**Task 5.1:** After migrating all classes, remove `components.css` entirely or keep only necessary overrides

**Task 5.2:** Remove `layout.css` and replace with Tailwind utilities in HTML

**Task 5.3:** Keep `base.css` for CSS variables and forced-color-adjust overrides

**Task 5.4:** Keep `docs.css` for typography and table styles (or migrate to Tailwind typography plugin)

**Task 5.5:** Keep `map.css` minimal or inline

---

### Phase 6: Testing & Validation

**Task 6.1:** Run color contrast script after changes

```bash
python scripts/color_contrast.py
```

**Task 6.2:** Test in browser with forced-colors emulation

Chrome DevTools → Rendering → Emulate CSS media feature `forced-colors: active`

**Task 6.3:** Run Lighthouse accessibility audit

Check for:
- Color contrast issues
- Focusable elements not visible
- ARIA attributes
- List semantics (if using unstyled lists)

**Task 6.4:** Manual keyboard navigation test

Tab through entire interface, verify focus rings visible and logical order.

**Task 6.5:** Test with Windows High Contrast Mode (if available)

---

## Implementation Order (Prioritized)

1. **High Priority:**
   - Fix dark theme primary color contrast (if failing)
   - Add forced-color-adjust utilities
   - Ensure focus states on all interactive elements

2. **Medium Priority:**
   - Replace `.btn`, `.card`, `.row`, `.col` with Tailwind
   - Remove `.hidden` custom class
   - Update custom scrollbar for forced colors

3. **Low Priority (Nice to Have):**
   - Migrate docs.css to Tailwind typography plugin
   - Remove `components.css` and `layout.css` entirely
   - Refactor HTML templates to use consistent Tailwind patterns

---

## Files to Modify

### CSS Files
- `src/static/css/base.css` — Add forced-color-adjust, update colors if needed
- `src/static/css/components.css` — To be removed or emptied
- `src/static/css/layout.css` — To be removed
- `src/static/css/docs.css` — Add forced-color-adjust for code blocks, keep minimal
- `src/static/css/map.css` — Remove or keep minimal

### HTML Templates
- `src/static/index.html` — Update inline styles for scrollbar, add forced-color-adjust
- `src/static/templates/header.html` — Replace `.btn` classes
- `src/static/templates/search.html` — Replace custom classes
- `src/static/templates/results.html` — Replace custom classes

### TypeScript/JavaScript
- No changes needed, unless generating class strings dynamically

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing layout during class replacement | Medium | High | Test each change incrementally; use browser dev tools |
| Missing some `.btn` or `.card` usages | Low | Medium | Search entire codebase for class references |
| Forced colors mode not fully supported in all browsers | Low | Low | Document that high contrast mode is best in Edge/Chrome |
| Focus rings may not be visible on some backgrounds | Medium | Medium | Test all combinations; use `ring-offset` if needed |
| Removing custom CSS may affect legacy styles | Low | Low | Keep fallback styles in `base.css` if needed |

---

## Success Criteria

✅ All color combinations meet WCAG AA (4.5:1 for normal text, 3:1 for large text)  
✅ Forced colors mode works without breaking layout  
✅ No custom `.btn`, `.card`, `.row`, `.col`, `.hidden` classes remain in use  
✅ All interactive elements have visible focus states  
✅ Custom CSS files reduced by at least 50%  
✅ Lighthouse accessibility score > 90  
✅ No regression in existing functionality (passes current tests)

---

## Next Steps

1. Present this plan to user for approval
2. Upon approval, switch to Code mode to implement changes
3. Start with Phase 1 (color contrast) and proceed incrementally
4. Run tests after each phase
5. Finalize with Phase 6 testing and documentation updates

---

## References

- [Tailwind forced-color-adjust docs](https://tailwindcss.com/docs/forced-color-adjust)
- [Tailwind preflight accessibility](https://tailwindcss.com/docs/preflight#accessibility-considerations)
- [WCAG 2.1 Contrast Requirements](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Forced Colors Mode Explained](https://polypane.app/blog/forced-colors-explained-a-practical-guide/)
