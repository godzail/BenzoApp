"use strict";
// i18next initialization and language switcher
const STATUS_MESSAGE_DURATION = 3000;
const INITIALIZATION_RETRY_DELAY = 100;
let userLang = "it";
try {
    const storedLang = localStorage.getItem("lang");
    if (storedLang && (storedLang === "it" || storedLang === "en")) {
        userLang = storedLang;
    }
}
catch {
    // ignore
}
window.APP_USER_LANG = userLang;
/**
 * Safely get translation with fallback
 * @param key - The translation key
 * @param fallback - The fallback text if translation not found
 * @returns Translated text or fallback
 */
function t(key, fallback = "") {
    if (typeof i18next !== "undefined" && i18next.t) {
        const translated = i18next.t(key);
        if (translated === key) {
            return fallback || key;
        }
        return translated;
    }
    return fallback || key;
}
/**
 * Set the application language
 * @param lang - The language code ('en' or 'it')
 */
window.setLang = (lang) => {
    const app = typeof window.gasStationApp === "function" ? window.gasStationApp() : null;
    if (app?.debugMode) {
        console.log("[DEBUG] i18next.changeLanguage called with lang:", lang);
    }
    if (typeof i18next !== "undefined" && i18next.reloadResources) {
        i18next.reloadResources(lang, "translation", () => {
            if (i18next.changeLanguage) {
                i18next.changeLanguage(lang, () => {
                    updateI18nTexts();
                    const statusEl = document.getElementById("status-messages");
                    if (statusEl) {
                        const langName = lang === "it" ? "Italian" : "English";
                        statusEl.textContent = `Language reset and changed to ${langName}`;
                        setTimeout(() => {
                            statusEl.textContent = "";
                        }, STATUS_MESSAGE_DURATION);
                    }
                    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
                });
            }
        });
    }
    try {
        localStorage.setItem("lang", lang);
        window.APP_USER_LANG = lang;
    }
    catch {
        // ignore storage errors
    }
};
/**
 * Update i18n text content for all mapped elements
 */
function updateI18nTexts() {
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
    // Update browser tab title with translated title
    try {
        document.title = t("title", "Gas Station Finder");
    }
    catch {
        // ignore errors setting document.title in non-browser environments
    }
    updateDataI18nElements();
}
/**
 * Update all elements with data-i18n attributes
 */
function updateDataI18nElements() {
    const elements = document.querySelectorAll("[data-i18n]");
    for (const el of Array.from(elements)) {
        const key = el.getAttribute("data-i18n");
        if (key) {
            const fallback = el.textContent?.trim() || "";
            const translatedText = t(key, fallback);
            el.innerText = translatedText;
        }
    }
}
/**
 * Function to initialize i18next
 */
function initI18next() {
    i18next.init({
        lng: window.APP_USER_LANG,
        fallbackLng: "it",
        debug: false,
        resources: {},
    }, (err) => {
        if (err) {
            console.error("i18next initialization error:", err);
        }
        loadTranslations(window.APP_USER_LANG);
    });
}
async function loadTranslations(lang) {
    try {
        const response = await fetch(`/static/locales/${lang}.json`);
        if (response.ok) {
            const resources = await response.json();
            i18next.addResourceBundle(lang, "translation", resources, true, true);
            updateI18nTexts();
            setTimeout(() => {
                updateI18nTexts();
            }, INITIALIZATION_RETRY_DELAY);
        }
    }
    catch (err) {
        console.error("Failed to load translations:", err);
    }
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initI18next);
}
else {
    initI18next();
}
window.updateI18nTexts = updateI18nTexts;
window.t = t;
//# sourceMappingURL=i18n.js.map