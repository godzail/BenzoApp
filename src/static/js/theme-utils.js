"use strict";
/**
 * Theme management utilities.
 * Provides functions for getting, setting, applying, and toggling the application theme.
 * Themes: "light" | "dark"
 * This script attaches utilities to window.themeUtils for global use.
 */
const THEME_STORAGE_KEY = "app-theme";
function getSystemPreference() {
    if (window.matchMedia?.("(prefers-color-scheme: light)")?.matches) {
        return "light";
    }
    return "dark";
}
function getStoredTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY);
    }
    catch {
        return null;
    }
}
function setStoredTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    catch {
        console.warn("Failed to store theme preference");
    }
}
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
}
function updateThemeIcons(theme) {
    const sunIcon = document.getElementById("theme-icon-sun");
    const moonIcon = document.getElementById("theme-icon-moon");
    if (sunIcon && moonIcon) {
        const isLight = theme === "light";
        sunIcon.classList.toggle("hidden", isLight);
        moonIcon.classList.toggle("hidden", !isLight);
    }
}
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || getSystemPreference();
    const newTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(newTheme);
    setStoredTheme(newTheme);
    updateThemeIcons(newTheme);
    return newTheme;
}
function initTheme() {
    const stored = getStoredTheme();
    const theme = stored || getSystemPreference();
    applyTheme(theme);
    updateThemeIcons(theme);
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
        const handler = (e) => {
            if (!getStoredTheme()) {
                const systemTheme = e.matches ? "light" : "dark";
                applyTheme(systemTheme);
                updateThemeIcons(systemTheme);
            }
        };
        mediaQuery.addEventListener("change", handler);
    }
}
// Attach to window for global use
window.themeUtils = {
    getSystemPreference,
    getStoredTheme,
    setStoredTheme,
    applyTheme,
    updateThemeIcons,
    toggleTheme,
    initTheme,
};
//# sourceMappingURL=theme-utils.js.map