/**
 * Docs theme toggle - handles light/dark mode with SVG icons.
 * Uses global window.themeManager (app.config.js) for core theme logic.
 */
(() => {
  const btn = document.getElementById("docs-theme-toggle");
  const theme = window.themeManager;
  if (!(btn && theme)) return;

  const updateIcons = (t: string): void => {
    const sun = document.getElementById("theme-icon-sun");
    const moon = document.getElementById("theme-icon-moon");
    const isLight = t === "light";
    sun?.classList.toggle("hidden", isLight);
    moon?.classList.toggle("hidden", !isLight);
  };

  const init = (): void => {
    theme.init();
    updateIcons(document.documentElement.getAttribute("data-theme") || "light");
  };

  const toggle = (): void => updateIcons(theme.toggle());

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    btn.addEventListener("click", toggle);
  } catch (err) {
    console.error("Docs theme init failed:", err);
  }
})();
