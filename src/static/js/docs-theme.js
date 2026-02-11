/**
 * Docs theme toggle - handles light/dark mode with SVG icons.
 */

(() => {
  const btn = document.getElementById("docs-theme-toggle");
  const sunIcon = document.getElementById("theme-icon-sun");
  const moonIcon = document.getElementById("theme-icon-moon");

  const applyStoredTheme = () => {
    try {
      const stored = localStorage.getItem("docs-theme");
      if (stored === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      }
    } catch (_e) {}
  };

  const updateIcons = () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (sunIcon && moonIcon) {
      sunIcon.classList.toggle("hidden", isLight);
      moonIcon.classList.toggle("hidden", !isLight);
    }
  };

  const toggleTheme = () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
      try { localStorage.removeItem("docs-theme"); } catch (_e) {}
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      try { localStorage.setItem("docs-theme", "light"); } catch (_e) {}
    }
    updateIcons();
  };

  try {
    applyStoredTheme();
    updateIcons();
    if (btn) btn.addEventListener("click", toggleTheme);
  } catch (e) {
    console.error(e);
  }
})();
