"use strict";
/**
 * Docs theme toggle - handles light/dark mode with SVG icons.
 */
(() => {
    const ThemeStorageKey = "app-theme";
    const btn = document.getElementById("docs-theme-toggle");
    const sunIcon = document.getElementById("theme-icon-sun");
    const moonIcon = document.getElementById("theme-icon-moon");
    const getSystemPreference = () => {
        if (window.matchMedia?.("(prefers-color-scheme: light)")?.matches) {
            return "light";
        }
        return "dark";
    };
    const getStoredTheme = () => {
        try {
            return localStorage.getItem(ThemeStorageKey);
        }
        catch {
            return null;
        }
    };
    const setStoredTheme = (theme) => {
        try {
            localStorage.setItem(ThemeStorageKey, theme);
        }
        catch {
            console.warn("Failed to store theme preference");
        }
    };
    const applyTheme = (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
    };
    const updateIcons = () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const isLight = currentTheme === "light";
        if (sunIcon && moonIcon) {
            sunIcon.classList.toggle("hidden", isLight);
            moonIcon.classList.toggle("hidden", !isLight);
        }
    };
    const init = () => {
        const storedTheme = getStoredTheme();
        console.log("Docs theme init: stored =", storedTheme);
        const theme = storedTheme || getSystemPreference();
        console.log("Docs theme init: applying =", theme);
        applyTheme(theme);
        updateIcons();
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
            mediaQuery.addEventListener("change", (e) => {
                if (!getStoredTheme()) {
                    applyTheme(e.matches ? "light" : "dark");
                    updateIcons();
                }
            });
        }
    };
    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";
        applyTheme(newTheme);
        setStoredTheme(newTheme);
        updateIcons();
    };
    try {
        init();
        if (btn) {
            btn.addEventListener("click", toggleTheme);
        }
    }
    catch (e) {
        console.error(e);
    }
})();
//# sourceMappingURL=docs-theme.js.map