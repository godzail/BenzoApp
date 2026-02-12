/**
 * Docs theme toggle - handles light/dark mode with SVG icons.
 */

((): void => {
  const ThemeStorageKey = "app-theme";
  const btn = document.getElementById("docs-theme-toggle");
  const sunIcon = document.getElementById("theme-icon-sun");
  const moonIcon = document.getElementById("theme-icon-moon");

  const getSystemPreference = (): string => {
    if (window.matchMedia?.("(prefers-color-scheme: light)")?.matches) {
      return "light";
    }
    return "dark";
  };

  const getStoredTheme = (): string | null => {
    try {
      return localStorage.getItem(ThemeStorageKey);
    } catch {
      return null;
    }
  };

  const setStoredTheme = (theme: string): void => {
    try {
      localStorage.setItem(ThemeStorageKey, theme);
    } catch {
      console.warn("Failed to store theme preference");
    }
  };

  const applyTheme = (theme: string): void => {
    document.documentElement.setAttribute("data-theme", theme);
  };

  const updateIcons = (): void => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const isLight = currentTheme === "light";
    if (sunIcon && moonIcon) {
      sunIcon.classList.toggle("hidden", isLight);
      moonIcon.classList.toggle("hidden", !isLight);
    }
  };

  const init = (): void => {
    const storedTheme = getStoredTheme();
    const theme = storedTheme || getSystemPreference();
    applyTheme(theme);
    updateIcons();
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
      mediaQuery.addEventListener("change", (e: MediaQueryListEvent) => {
        if (!getStoredTheme()) {
          applyTheme(e.matches ? "light" : "dark");
          updateIcons();
        }
      });
    }
  };

  const toggleTheme = (): void => {
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
  } catch (e) {
    console.error(e);
  }
})();
