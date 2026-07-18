"use strict";
/**
 * i18n utilities: initialize i18next, manage language switching, and
 * update DOM text based on translation resources.
 */
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
function t(key, fallback = "", params) {
    if (typeof i18next !== "undefined" && i18next.t) {
        const translated = i18next.t(key, params);
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
    const app = window.gasStationApp;
    if (app?.debugMode) {
        console.debug("[DEBUG] i18next.changeLanguage called with lang:", lang);
    }
    // Reflect language in <html lang="..."> for screen readers and SEO.
    try {
        document.documentElement.lang = lang;
    }
    catch {
        // ignore non-browser environments
    }
    const refreshUi = () => {
        updateI18nTexts();
        window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
        const statusEl = document.getElementById("status-messages");
        if (statusEl) {
            const statusMsg = t("language_changed", "Language changed");
            statusEl.textContent = statusMsg;
            setTimeout(() => {
                statusEl.textContent = "";
            }, STATUS_MESSAGE_DURATION);
        }
    };
    loadTranslations(lang)
        .catch(() => {
        /* best effort */
    })
        .finally(() => {
        if (typeof i18next !== "undefined" && i18next.changeLanguage) {
            i18next.changeLanguage(lang, refreshUi);
        }
        else {
            refreshUi();
        }
    });
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
    for (const el of Array.from(document.querySelectorAll("[data-i18n]"))) {
        const key = el.getAttribute("data-i18n");
        if (key) {
            const htmlEl = el;
            // Cache the server-rendered text once so translated text never becomes fallback text.
            if (!htmlEl.dataset.i18nFallback)
                htmlEl.dataset.i18nFallback = (htmlEl.textContent || "").trim();
            htmlEl.innerText = t(key, htmlEl.dataset.i18nFallback);
        }
    }
    for (const el of Array.from(document.querySelectorAll("[data-i18n-placeholder]"))) {
        const key = el.getAttribute("data-i18n-placeholder");
        if (key) {
            const input = el;
            if (!input.dataset.i18nFallback)
                input.dataset.i18nFallback = input.placeholder;
            input.placeholder = t(key, input.dataset.i18nFallback);
        }
    }
    for (const el of Array.from(document.querySelectorAll("[data-i18n-aria-label]"))) {
        const key = el.getAttribute("data-i18n-aria-label");
        if (key) {
            const htmlEl = el;
            if (!htmlEl.dataset.i18nFallback)
                htmlEl.dataset.i18nFallback = htmlEl.getAttribute("aria-label") || "";
            htmlEl.setAttribute("aria-label", t(key, htmlEl.dataset.i18nFallback));
        }
    }
}
/**
 * Initialize i18next with the configured language and ensure translations are loaded.
 *
 * This sets the initial language and triggers loading of translation resources.
 */
function initI18next() {
    if (typeof i18next === "undefined") {
        // CDN unavailable: keep the server-rendered text, translations disabled.
        return;
    }
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
/**
 * Load translation JSON for a language and add it to i18next resources.
 *
 * @param lang - Language code to load (e.g., 'it' or 'en').
 */
async function loadTranslations(lang) {
    if (typeof i18next === "undefined")
        return;
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