/**
 * Docs theme toggle behavior and placement.
 * Moves the toggle into the first document H1 so it sits on the same line
 * and persists theme choice in localStorage.
 */

/**
 * Updates the theme toggle button appearance based on current theme.
 * @param {HTMLElement} btn - The toggle button element.
 */
const updateBtn = (btn) => {
  if (!btn) {
    return;
  }
  const cur = document.documentElement.getAttribute("data-theme");
  if (cur === "light") {
    btn.textContent = "🌞";
    btn.title = "Switch to dark theme";
  } else {
    btn.textContent = "🌙";
    btn.title = "Switch to light theme";
  }
};

/**
 * Applies the stored theme from localStorage on page load.
 */
const applyStoredTheme = () => {
  try {
    const stored = localStorage.getItem("docs-theme");
    if (stored === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (_e) {
    // ignore
  }
};

/**
 * Places the theme toggle button in the document, preferably next to the main heading.
 * @param {HTMLElement} btn - The toggle button element.
 */
const placeButton = (btn) => {
  if (!btn) {
    return;
  }

  const container = document.querySelector(".docs-container");
  const firstH1 = container ? container.querySelector("h1") : null;

  if (firstH1) {
    // Wrap the H1 in a title row and append the button
    const row = document.createElement("div");
    row.className = "docs-title-row";
    firstH1.parentNode.insertBefore(row, firstH1);
    row.appendChild(firstH1);
    row.appendChild(btn);

    // Ensure any previous positioning is cleared
    btn.style.position = "";
    btn.style.top = "";
    btn.style.right = "";
    btn.style.zIndex = "";
  } else {
    // Fallback: keep it visible in the top-right corner
    btn.style.position = "fixed";
    btn.style.top = "16px";
    btn.style.right = "16px";
    btn.style.zIndex = "999";
  }
};

/**
 * Toggles the theme between light and dark and updates storage.
 * @param {HTMLElement} btn - The toggle button element.
 */
const toggleTheme = (btn) => {
  const cur = document.documentElement.getAttribute("data-theme");
  if (cur === "light") {
    document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.removeItem("docs-theme");
    } catch (_e) {}
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    try {
      localStorage.setItem("docs-theme", "light");
    } catch (_e) {}
  }
  updateBtn(btn);
};

(() => {
  try {
    const btn = document.getElementById("docs-theme-toggle");

    // Initialize
    applyStoredTheme();
    updateBtn(btn);
    placeButton(btn);

    if (btn) {
      btn.addEventListener("click", () => toggleTheme(btn));
    }
  } catch (e) {
    // Do not break page if something goes wrong
    // eslint-disable-next-line no-console
    console.error(e);
  }
})();
