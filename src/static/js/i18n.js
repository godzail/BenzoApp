// i18next initialization and language switcher
const STATUS_MESSAGE_DURATION = 3000;
const INITIALIZATION_RETRY_DELAY = 100;

/**
 * Safely get translation with fallback
 * @param {string} key - The translation key
 * @param {string} fallback - The fallback text if translation not found
 * @returns {string} Translated text or fallback
 */
function t(key, fallback = "") {
  if (typeof i18next !== "undefined" && i18next.t) {
    // Keys no longer have 'translation.' prefix
    const translated = i18next.t(key);
    // If translation returns the key itself, it means translation not found
    if (translated === key) {
      return fallback || key;
    }
    return translated;
  }
  return fallback || key;
}

/**
 * Set the application language
 * @param {string} lang - The language code ('en' or 'it')
 */
window.setLang = (lang) => {
  console.log("[DEBUG] i18next.changeLanguage called with lang:", lang);

  // Reset and clear translation cache
  if (typeof i18next !== "undefined") {
    i18next.reloadResources(lang, "translation", () => {
      i18next.changeLanguage(lang, () => {
        updateI18nTexts();
        // Announce language change to screen readers
        const statusEl = document.getElementById("status-messages");
        if (statusEl) {
          const langName = lang === "it" ? "Italian" : "English";
          statusEl.textContent = `Language reset and changed to ${langName}`;
          setTimeout(() => {
            statusEl.textContent = "";
          }, STATUS_MESSAGE_DURATION);
        }
        // Dispatch event to notify app of language change
        window.dispatchEvent(
          new CustomEvent("languageChanged", { detail: { lang } }),
        );
      });
    });
  }
  try {
    localStorage.setItem("lang", lang);
  } catch (_e) {
    // ignore storage errors
  }
};

/**
 * Update i18n text content for all mapped elements
 */
function updateI18nTexts() {
  // Map of element IDs to translation keys with fallbacks
  const i18nMap = {
    "title-i18n": { key: "title", fallback: "Gas Station Finder" },
    "recent-searches-i18n": {
      key: "recent_searches",
      fallback: "Recent Searches:",
    },
    "no-results-i18n": {
      key: "no_results",
      fallback: "No results found.",
    },
    "results-heading": {
      key: "results_heading",
      fallback: "Search Results",
    },
    "search-form-title": {
      key: "search_form_title",
      fallback: "Search for gas stations",
    },
  };

  for (const [id, config] of Object.entries(i18nMap)) {
    const el = document.getElementById(id);
    if (el) {
      const translatedText = t(config.key, config.fallback);
      el.innerText = translatedText;
    }
  }

  // Update elements with data-i18n attributes
  updateDataI18nElements();
}

/**
 * Update all elements with data-i18n attributes
 */
function updateDataI18nElements() {
  const elements = document.querySelectorAll("[data-i18n]");
  for (const el of elements) {
    let key = el.getAttribute("data-i18n");
    if (key) {
      // Get fallback from current text content or empty string
      const fallback = el.textContent?.trim() || "";

      const translatedText = t(key, fallback);
      el.innerText = translatedText;
    }
  }
}

// Determine language: use localStorage only if user has explicitly set it
let userLang;
try {
  userLang = localStorage.getItem("lang");
} catch (_e) {
  userLang = null;
}

if (!userLang || (userLang !== "it" && userLang !== "en")) {
  userLang = "it";
  try {
    localStorage.setItem("lang", "it");
  } catch (_e) {
    // ignore
  }
}

// Function to initialize i18next
function initI18next() {
  i18next.use(i18nextHttpBackend).init(
    {
      lng: userLang,
      fallbackLng: "it",
      debug: false,
      backend: {
        loadPath: `/static/locales/{{lng}}.json?v=${new Date().getTime()}`,
      },
    },
    (err) => {
      if (err) {
        console.error("i18next initialization error:", err);
      }
      // Update texts after initialization (even if there was an error)
      updateI18nTexts();

      // Also update on next tick to catch Alpine.js rendered content
      setTimeout(() => {
        updateI18nTexts();
      }, INITIALIZATION_RETRY_DELAY);
    },
  );
}

// Initialize i18next when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initI18next);
} else {
  // DOM is already ready
  initI18next();
}

// Expose functions globally
window.updateI18nTexts = updateI18nTexts;
window.t = t;
