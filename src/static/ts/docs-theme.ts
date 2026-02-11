/**
 * Docs theme toggle - handles light/dark mode with SVG icons.
 */

((): void => {
  const btn = document.getElementById("docs-theme-toggle");
  const sunIcon = document.getElementById("theme-icon-sun");
  const moonIcon = document.getElementById("theme-icon-moon");

  const applyStoredTheme = (): void => {
    try {
      const stored = localStorage.getItem("docs-theme");
      if (stored === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      }
    } catch {
      // ignore
    }
  };

  const updateIcons = (): void => {
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    if (sunIcon && moonIcon) {
      sunIcon.classList.toggle("hidden", isLight);
      moonIcon.classList.toggle("hidden", !isLight);
    }
  };

  const toggleTheme = (): void => {
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
      try {
        localStorage.removeItem("docs-theme");
      } catch {
        // ignore
      }
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      try {
        localStorage.setItem("docs-theme", "light");
      } catch {
        // ignore
      }
    }
    updateIcons();
  };

  try {
    applyStoredTheme();
    updateIcons();
    if (btn) {
      btn.addEventListener("click", toggleTheme);
    }
  } catch (e) {
    console.error(e);
  }
})();
