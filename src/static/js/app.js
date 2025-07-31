// Extracts the 'gestore' (manager/operator) from a station object
function extractGestore(station) {
    return station.gestore || '';
}

function gasStationApp() {
    return {
        formData: {
            city: '',
            radius: '5',
            fuel: 'benzina',
            results: '5'
        },
        recentSearches: [],
        loading: false,
        results: [],
        error: '',
        searched: false,
        linearProgress: null,
        map: null,
        mapInitialized: false,
        mapMarkers: [],
        showCitySuggestions: false,
        cityList: [],
        filteredCities: [],

        formatCurrency(value) {
            return new Intl.NumberFormat('it-IT', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            }).format(value);
        },

        async init() {
            // Load all HTML templates and initial data
            await Promise.all([
                this.loadComponent('/static/templates/header.html', 'header-container'),
                this.loadComponent('/static/templates/search.html', 'search-container'),
                this.loadComponent('/static/templates/results.html', 'results-container'),
                this.loadCities()
            ]);

            // Listen for language change events
            window.addEventListener('languageChanged', (event) => {
                console.log('[DEBUG] Language changed to:', event.detail.lang);
                this.reinitializeComponents();
                // Ensure map markers/popups reflect current language (IT expected by user)
                if (this.mapInitialized) {
                    console.log('[DEBUG] Refreshing map markers/popups after language change, current lng:', i18next.language);
                    if (this.mapMarkers && this.mapMarkers.length > 0) {
                        this.mapMarkers.forEach(marker => {
                            if (marker.__station) {
                                const html = this.buildPopupContent(marker.__station);
                                marker.bindPopup(html);
                            }
                        });
                    }
                    // Optionally re-run update to fit bounds and ensure binding is applied
                    this.updateMap();
                }
            });

            // Load recent searches and set last city if available
            this.loadRecentSearches();
            if (this.recentSearches.length > 0 && this.recentSearches[0].city) {
                this.formData.city = this.recentSearches[0].city;
            }

            // Use $nextTick to ensure the DOM is updated before initializing MDC/Leaflet
            this.$nextTick(() => {
                this.initializeComponents();
                // Update i18n texts after templates are loaded
                if (window.updateI18nTexts) {
                    window.updateI18nTexts();
                    console.log('[DEBUG] updateI18nTexts called after templates loaded');
                }
            });
        },

        reinitializeComponents() {
            console.log('[DEBUG] Reinitializing MDC components after language change');

            // First, update i18n texts for all select options (if available)
            if (window.updateI18nTexts) {
                window.updateI18nTexts();
                console.log('[DEBUG] updateI18nTexts called before MDCSelect re-init');
            }

            // Now reinitialize select components
            document.querySelectorAll('.mdc-select').forEach(el => {
                // Destroy existing instance if it exists
                if (el.MDCSelect) {
                    el.MDCSelect.destroy();
                }

                // Create new instance
                const select = mdc.select.MDCSelect.attachTo(el);
                el.MDCSelect = select;

                // Reattach event listener
                select.listen('MDCSelect:change', () => {
                    const hiddenInput = el.querySelector('input[type="hidden"]');
                    if (hiddenInput) {
                        hiddenInput.value = select.value;
                        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });

                // Always set the selected value and update the visible text using current language
                const inputName = el.querySelector('input[type="hidden"]')?.name;
                let currentValue = null;
                if (inputName && this.formData[inputName]) {
                    currentValue = this.formData[inputName];
                    select.value = currentValue;
                } else {
                    // Try to infer from currently marked selected list item
                    const selectedLi = el.querySelector('.mdc-list-item[aria-selected="true"]');
                    currentValue = selectedLi?.getAttribute('data-value') || select.value;
                }
                // Update visible text using data-i18n key from the selected list item
                if (currentValue) {
                    const listItem = el.querySelector(`.mdc-list-item[data-value="${ currentValue }"]`);
                    const selectedTextEl = el.querySelector('.mdc-select__selected-text');
                    if (listItem && selectedTextEl) {
                        const textEl = listItem.querySelector('.mdc-list-item__text');
                        if (textEl) {
                            const key = textEl.getAttribute('data-i18n');
                            // If key present, translate; else keep raw text
                            selectedTextEl.textContent = key ? i18next.t(key) : textEl.textContent;
                        }
                    }
                }
            });
        },

        async loadCities() {
            try {
                const response = await fetch('/static/data/cities.json');
                if (!response.ok) throw new Error('Failed to load city list');
                this.cityList = await response.json();
            } catch (error) {
                console.error('Error loading cities:', error);
                // Fallback to a minimal list in case of failure
                this.cityList = ['Rome', 'Milan', 'Naples'];
            }
        },

        initializeComponents() {
            document.querySelectorAll('.mdc-text-field').forEach(el =>
                mdc.textField.MDCTextField.attachTo(el));

            document.querySelectorAll('.mdc-select').forEach(el => {
                const select = mdc.select.MDCSelect.attachTo(el);
                select.listen('MDCSelect:change', () => {
                    const hiddenInput = el.querySelector('input[type="hidden"]');
                    if (hiddenInput) {
                        hiddenInput.value = select.value;
                        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
                const inputName = el.querySelector('input[type="hidden"]')?.name;
                if (inputName && this.formData[inputName]) {
                    select.value = this.formData[inputName];
                }
                // Ensure selected text reflects current language after init
                const selectedLi = el.querySelector(`.mdc-list-item[data-value="${ select.value }"]`) || el.querySelector('.mdc-list-item[aria-selected="true"]');
                const selectedTextEl = el.querySelector('.mdc-select__selected-text');
                if (selectedLi && selectedTextEl) {
                    const textEl = selectedLi.querySelector('.mdc-list-item__text');
                    if (textEl) {
                        const key = textEl.getAttribute('data-i18n');
                        selectedTextEl.textContent = key ? i18next.t(key) : textEl.textContent;
                    }
                }
            });

            document.querySelectorAll('.mdc-button').forEach(el =>
                mdc.ripple.MDCRipple.attachTo(el));

            const progressEl = document.getElementById('loading-bar');
            if (progressEl) {
                this.linearProgress = mdc.linearProgress.MDCLinearProgress.attachTo(progressEl);
                this.linearProgress.close();
            }
        },

        async loadComponent(url, elementId) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to load component: ${ url }`);
                const data = await response.text();
                const element = document.getElementById(elementId);
                if (element) {
                    element.innerHTML = data;
                }
            } catch (error) {
                console.error(`Error loading component into ${ elementId }:`, error);
            }
        },

        loadRecentSearches() {
            const stored = localStorage.getItem('recentSearches');
            this.recentSearches = stored ? JSON.parse(stored) : [];
        },

        saveRecentSearch(search) {
            this.recentSearches = this.recentSearches.filter(s =>
                !(s.city === search.city && s.radius === search.radius && s.fuel === search.fuel)
            );
            this.recentSearches.unshift(search);
            this.recentSearches = this.recentSearches.slice(0, 5);
            localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
        },

        selectRecentSearch(search) {
            this.formData.city = search.city;
            this.formData.radius = search.radius;
            this.formData.fuel = search.fuel;
            this.formData.results = search.results || '5';
            this.submitForm();
        },

        initMap() {
            console.log('[DEBUG] initMap called');
            if (this.mapInitialized) {
                console.log('[DEBUG] Map already initialized');
                return;
            }
            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                console.warn('[DEBUG] Map container not found');
                return;
            }

            // Initialize the map with default view
            this.map = L.map('map').setView([41.9028, 12.4964], 6); // Default: Italy
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(this.map);

            this.mapInitialized = true;
            console.log('[DEBUG] Map initialized');

            // Handle map resize when container becomes visible
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                    console.log('[DEBUG] Map size invalidated');
                }
            }, 100);
        },

        onCityInput() {
            const value = this.formData.city.trim().toLowerCase();
            if (value.length === 0) {
                this.filteredCities = [];
                this.showCitySuggestions = false;
                return;
            }
            this.filteredCities = this.cityList.filter(city =>
                city.toLowerCase().startsWith(value));
            this.showCitySuggestions = this.filteredCities.length > 0;
        },

        selectCity(city) {
            this.formData.city = city;
            this.filteredCities = [];
            this.showCitySuggestions = false;
        },

        hideCitySuggestions() {
            setTimeout(() => {
                this.showCitySuggestions = false;
            }, 150);
        },

        async submitForm() {
            this.loading = true;
            console.log('[DEBUG] Loading started');
            if (this.linearProgress) this.linearProgress.open();
            this.error = '';
            this.searched = true;
            this.saveRecentSearch({ ...this.formData });

            const fuelToSend = this.formData.fuel === 'diesel' ? 'gasolio' : this.formData.fuel;

            try {
                const response = await fetch('/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        city: this.formData.city,
                        radius: parseInt(this.formData.radius),
                        fuel: fuelToSend,
                        results: parseInt(this.formData.results)
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || `HTTP error! status: ${ response.status }`);
                }

                const data = await response.json();
                if (data.warning) {
                    this.error = data.warning;
                    this.results = [];
                } else {
                    this.results = data.stations?.map(station => ({
                        ...station,
                        gestore: extractGestore(station),
                        distance: station.distance || ''
                    })) || [];
                    this.error = '';
                }

                this.$nextTick(() => {
                    this.updateMap();
                    // Ensure translations are applied to new content
                    console.log('[DEBUG] updateI18nTexts called after search results loaded');
                    if (window.updateI18nTexts) {
                        updateI18nTexts();
                    }
                });

            } catch (err) {
                this.error = err.message;
                this.results = [];
            } finally {
                this.loading = false;
                console.log('[DEBUG] Loading ended');
                if (this.linearProgress) this.linearProgress.close();
            }
        },

        buildPopupContent(station) {
            // Build popup HTML using current i18n language (should be IT when selected)
            const title = station.gestore || i18next.t('translation.station');
            console.log('[DEBUG] buildPopupContent using lang:', i18next.language, 'title:', title);
            return `<b>${ title }</b><br>${ station.address }`;
        },

        updateMap() {
            if (!this.mapInitialized) {
                this.initMap();
            }

            if (!this.map) {
                console.warn('[DEBUG] Map not initialized, cannot update');
                return;
            }

            // Clear existing markers
            if (this.mapMarkers && this.mapMarkers.length > 0) {
                this.mapMarkers.forEach(marker => marker.remove());
                this.mapMarkers = [];
            }

            // Add new markers if we have results
            if (this.results.length > 0) {
                const bounds = [];
                this.results.forEach(station => {
                    if (station.latitude && station.longitude) {
                        const marker = L.marker([station.latitude, station.longitude]).addTo(this.map);
                        // Attach station for later popup refresh
                        marker.__station = station;
                        // Bind popup content using current language
                        const html = this.buildPopupContent(station);
                        marker.bindPopup(html);
                        this.mapMarkers.push(marker);
                        bounds.push([station.latitude, station.longitude]);
                    }
                });

                if (bounds.length > 0) {
                    // Ensure map is properly sized before fitting bounds
                    this.map.invalidateSize();
                    this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
                    console.log('[DEBUG] Map updated with', bounds.length, 'markers');
                }
            }
        }
    };
};

// Expose the gasStationApp function to the window object
window.gasStationApp = gasStationApp;