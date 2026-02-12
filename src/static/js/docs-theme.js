"use strict";
/**
 * Docs theme toggle - handles light/dark mode with SVG icons.
 * Uses global window.themeUtils for core theme logic.
 */
(() => {
    const btn = document.getElementById("docs-theme-toggle");
    const theme = window.themeUtils;
    const init = () => {
        // Initialize theme (applies stored or system preference)
        theme.initTheme();
        // Ensure icons match current theme
        const currentTheme = document.documentElement.getAttribute("data-theme") ||
            theme.getStoredTheme() ||
            theme.getSystemPreference();
        theme.updateThemeIcons(currentTheme);
        // Listen for system theme changes (when not overridden by user)
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
            const handler = (e) => {
                if (!theme.getStoredTheme()) {
                    theme.updateThemeIcons(e.matches ? "light" : "dark");
                }
            };
            mediaQuery.addEventListener("change", handler);
        }
    };
    const toggle = () => {
        const newTheme = theme.toggleTheme();
        theme.updateThemeIcons(newTheme);
    };
    try {
        init();
        if (btn) {
            btn.removeEventListener("click", toggle); // guard against duplicates
            btn.addEventListener("click", toggle);
        }
    }
    catch (e) {
        console.error(e);
    }
})();
//# sourceMappingURL=docs-theme.js.map