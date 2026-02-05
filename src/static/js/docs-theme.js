/* Docs theme toggle behavior and placement
 * Moves the toggle into the first document H1 so it sits on the same line
 * and persists theme choice in localStorage.
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

const applyStoredTheme = () => {
  const stored = localStorage.getItem("docs-theme");
  if (stored === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
};

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

const toggleTheme = (btn) => {
  const cur = document.documentElement.getAttribute("data-theme");
  if (cur === "light") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("docs-theme");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("docs-theme", "light");
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
