// i18next initialization and language switcher
window.setLang = function (lang) {
    i18next.changeLanguage(lang, function () {
        updateI18nTexts();
    });
    localStorage.setItem('lang', lang);
};

function updateI18nTexts() {
    var el;
    el = document.getElementById('title-i18n');
    if (el) el.innerText = i18next.t('translation.title');
    el = document.getElementById('city-label-i18n');
    if (el) el.innerText = i18next.t('translation.city');
    el = document.getElementById('radius-label-i18n');
    if (el) el.innerText = i18next.t('translation.radius');
    el = document.getElementById('fuel-label-i18n');
    if (el) el.innerText = i18next.t('translation.fuel_type');
    el = document.getElementById('results-label-i18n');
    if (el) el.innerText = i18next.t('translation.results');
    el = document.getElementById('search-btn-i18n');
    if (el) el.innerText = i18next.t('translation.search');
    el = document.getElementById('recent-searches-i18n');
    if (el) el.innerText = i18next.t('translation.recent_searches');
    el = document.getElementById('no-results-i18n');
    if (el) el.innerText = i18next.t('translation.no_results');
}

i18next
    .use(i18nextHttpBackend)
    .init({
        lng: localStorage.getItem('lang') || 'en',
        fallbackLng: 'en',
        debug: false,
        backend: {
            loadPath: '/static/locales/{{lng}}.json'
        }
    }, function (err, t) {
        updateI18nTexts();
    });
