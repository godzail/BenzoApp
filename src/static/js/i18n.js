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
    const app = window.gasStationApp;
    if (app?.debugMode) {
        console.log("[DEBUG] i18next.changeLanguage called with lang:", lang);
    }
    if (typeof i18next !== "undefined" && i18next.reloadResources) {
        // Try to reload resources (some i18next backends populate bundles via reloadResources),
        // but if the bundle is still missing, fall back to fetch-based loader `loadTranslations`.
        i18next.reloadResources(lang, "translation", () => {
            // If resources are not present after reloadResources, fetch them explicitly.
            const i18nWithGetter = i18next;
            const hasBundle = typeof i18nWithGetter.getResourceBundle === "function" && !!i18nWithGetter.getResourceBundle?.(lang, "translation");
            if (!hasBundle) {
                // best-effort fetch; do not block the UI if it fails
                loadTranslations(lang).catch(() => { });
            }
            if (i18next.changeLanguage) {
                i18next.changeLanguage(lang, () => {
                    // Ensure texts are refreshed; if bundle still missing, load then update.
                    const i18nWithGetter2 = i18next;
                    const bundleNow = typeof i18nWithGetter2.getResourceBundle === "function" && !!i18nWithGetter2.getResourceBundle?.(lang, "translation");
                    if (!bundleNow) {
                        loadTranslations(lang).then(() => updateI18nTexts()).catch(() => updateI18nTexts());
                    }
                    else {
                        updateI18nTexts();
                    }
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
    else {
        // No reloadResources support — explicitly load the JSON bundle then change language
        loadTranslations(lang)
            .then(() => {
            if (i18next.changeLanguage) {
                i18next.changeLanguage(lang, () => {
                    updateI18nTexts();
                    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
                });
            }
            else {
                updateI18nTexts();
                window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
            }
        })
            .catch(() => {
            // If loading translations fails, still set language and update texts (best-effort)
            if (i18next.changeLanguage) {
                i18next.changeLanguage(lang, () => {
                    updateI18nTexts();
                    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
                });
            }
            else {
                updateI18nTexts();
                window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
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
 * Initialize i18next with the configured language and ensure translations are loaded.
 *
 * This sets the initial language and triggers loading of translation resources.
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
/**
 * Load translation JSON for a language and add it to i18next resources.
 *
 * @param lang - Language code to load (e.g., 'it' or 'en').
 */
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