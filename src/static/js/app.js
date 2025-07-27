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
        loading: false,
        results: [],
        error: '',
        searched: false,
        linearProgress: null,

        // Simplified city list for autocomplete
        showCitySuggestions: false,
        cityList: [
            'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna',
            'Florence', 'Bari', 'Catania', 'Venice', 'Verona', 'Messina', 'Padua',
            'Trieste', 'Taranto', 'Brescia', 'Prato', 'Parma', 'Modena'
        ],
        filteredCities: [],

        formatCurrency(value) {
            return new Intl.NumberFormat('it-IT', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            }).format(value);
        },

        init() {
            // Streamlined MDC initialization
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

                // Set default values
                if (el.querySelector('input[name="radius"]')) select.value = '5';
                if (el.querySelector('input[name="fuel"]')) select.value = 'benzina';
                if (el.querySelector('input[name="results"]')) select.value = '5';
            });

            document.querySelectorAll('.mdc-button').forEach(el =>
                mdc.ripple.MDCRipple.attachTo(el));

            this.linearProgress = mdc.linearProgress.MDCLinearProgress.attachTo(
                document.querySelector('.mdc-linear-progress'));
            this.linearProgress.close();
        },

        // Simplified autocomplete
        onCityInput(e) {
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
            }, 100);
        },

        async submitForm() {
            this.loading = true;
            this.linearProgress.open();
            this.error = '';
            this.searched = true;

            // Map fuel type for API compatibility
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
            } catch (err) {
                this.error = err.message;
                this.results = [];
            } finally {
                this.loading = false;
                this.linearProgress.close();
            }
        }
    };
}
