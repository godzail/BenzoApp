// i18next initialization and language switcher
window.setLang = function (lang) {
    console.log('[DEBUG] i18next.changeLanguage called with lang:', lang);
    i18next.changeLanguage(lang, function (err, t) {
        updateI18nTexts();
        // Dispatch event to notify app of language change
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: lang } }));
    });
    localStorage.setItem('lang', lang);
};

function updateI18nTexts() {
    const i18nMap = {
        'title-i18n': 'translation.title',
        'city-label-i18n': 'translation.city',
        'radius-label-i18n': 'translation.radius',
        'fuel-label-i18n': 'translation.fuel_type',
        'results-label-i18n': 'translation.results',
        'search-btn-i18n': 'translation.search',
        'recent-searches-i18n': 'translation.recent_searches',
        'no-results-i18n': 'translation.no_results',
        'map-summary-i18n': 'translation.map_summary',
        'results-heading': 'translation.results_heading',
        'search-form-title': 'translation.search_form_title'
    };

    for (const [id, key] of Object.entries(i18nMap)) {
        console.log('[DEBUG] Updating element', id, 'with key', key, 'to value:', i18next.t(key));
        const el = document.getElementById(id);
        if (el) {
            el.innerText = i18next.t(key);
        }
    }

    // Update elements with data-i18n attributes
    document.querySelectorAll('[data-i18n]').forEach(el => {
        let key = el.getAttribute('data-i18n');
        if (key) {
            // Prepend 'translation.' if not already present
            if (!key.startsWith('translation.')) {
                key = 'translation.' + key;
            }
            el.innerText = i18next.t(key);
            console.log('[DEBUG] Updating element with data-i18n', key, 'to value:', i18next.t(key));
        }
    });

    // Update MDC select components
    document.querySelectorAll('.mdc-select').forEach(selectEl => {
        const select = mdc.select.MDCSelect.attachTo(selectEl);
        const selectedTextEl = selectEl.querySelector('.mdc-select__selected-text');
        if (selectedTextEl) {
            // Find the currently selected option
            const hiddenInput = selectEl.querySelector('input[type="hidden"]');
            if (hiddenInput) {
                const currentValue = hiddenInput.value;
                const listItem = selectEl.querySelector(`.mdc-list-item[data-value="${ currentValue }"]`);
                if (listItem) {
                    const textEl = listItem.querySelector('.mdc-list-item__text');
                    if (textEl) {
                        const key = textEl.getAttribute('data-i18n');
                        if (key) {
                            selectedTextEl.textContent = i18next.t(key);
                            console.log('[DEBUG] Updating MDC select selected text with key', key, 'to value:', i18next.t(key));
                        }
                    }
                }
            }
        }
    });

    // Update page title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.innerText = i18next.t('translation.title');
    }
}


// Determine language: use localStorage only if user has explicitly set it
let userLang = localStorage.getItem('lang');

if (!userLang || (userLang !== 'it' && userLang !== 'en')) {
    userLang = 'it';
    localStorage.setItem('lang', 'it');
}

// Function to initialize i18next
function initI18next() {
    i18next
        .use(i18nextHttpBackend)
        .init({
            lng: userLang,
            fallbackLng: 'it',
            debug: false,
            backend: {
                loadPath: '/static/locales/{{lng}}.json'
            }
        }, function (err, t) {
            // Update texts after initialization
            updateI18nTexts();
        });
}

// Initialize i18next when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18next);
} else {
    // DOM is already ready
    initI18next();
}
