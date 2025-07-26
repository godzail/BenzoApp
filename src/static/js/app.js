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

        // Autocomplete state
        showCitySuggestions: false,
        cityList: [
            'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Bari', 'Catania',
            'Venice', 'Verona', 'Messina', 'Padua', 'Trieste', 'Taranto', 'Brescia', 'Prato', 'Parma', 'Modena'
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
            // Initialize all MDC components here
            document.querySelectorAll('.mdc-text-field').forEach(el => mdc.textField.MDCTextField.attachTo(el));

            document.querySelectorAll('.mdc-select').forEach(el => {
                const select = mdc.select.MDCSelect.attachTo(el);
                select.listen('MDCSelect:change', () => {
                    const hiddenInput = el.querySelector('input[type="hidden"]');
                    if (hiddenInput) {
                        hiddenInput.value = select.value;
                        hiddenInput.dispatchEvent(new Event('input', {
                            bubbles: true
                        }));
                    }
                });
                // Set default visually for selects
                if (el.querySelector('input[name="radius"]')) {
                    select.value = '5';
                }
                if (el.querySelector('input[name="fuel"]')) {
                    select.value = 'benzina';
                }
                if (el.querySelector('input[name="results"]')) {
                    select.value = '5';
                }
            });

            document.querySelectorAll('.mdc-button').forEach(el => mdc.ripple.MDCRipple.attachTo(el));

            this.linearProgress = mdc.linearProgress.MDCLinearProgress.attachTo(document.querySelector('.mdc-linear-progress'));
            this.linearProgress.close();
        },

        // Autocomplete logic
        onCityInput(e) {
            const value = this.formData.city.trim().toLowerCase();
            if (value.length === 0) {
                this.filteredCities = [];
                this.showCitySuggestions = false;
                return;
            }
            this.filteredCities = this.cityList.filter(city => city.toLowerCase().startsWith(value));
            this.showCitySuggestions = this.filteredCities.length > 0;
        },
        selectCity(city) {
            this.formData.city = city;
            this.filteredCities = [];
            this.showCitySuggestions = false;
        },
        hideCitySuggestions() {
            // Delay hiding to allow click event to register
            setTimeout(() => {
                this.showCitySuggestions = false;
            }, 100);
        },

        async submitForm() {
            console.log('submitForm started.');
            this.loading = true;
            this.linearProgress.open();
            this.error = '';
            this.searched = true;

            // Map 'diesel' to 'gasolio' for API compatibility
            let fuelToSend = this.formData.fuel;
            if (fuelToSend === 'diesel') {
                fuelToSend = 'gasolio';
            }

            console.log('Form data to be sent:', JSON.stringify({
                ...this.formData,
                fuel: fuelToSend
            }));

            try {
                const response = await fetch('/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        city: this.formData.city,
                        radius: parseInt(this.formData.radius),
                        fuel: fuelToSend,
                        results: parseInt(this.formData.results)
                    })
                });

                console.log('Received response from server:', response);

                if (!response.ok) {
                    let errorText = `HTTP error! status: ${ response.status }`;
                    try {
                        const errorData = await response.json();
                        console.error('Server error data:', errorData);
                        errorText = errorData.detail || JSON.stringify(errorData);
                    } catch (e) {
                        console.error('Could not parse error response as JSON.', e);
                        errorText = await response.text();
                    }
                    throw new Error(errorText);
                }

                const data = await response.json();
                console.log('Received data:', data);
                if (data && data.stations) {
                    // Enhance each station with gestore and distance if available
                    this.results = data.stations.map(station => {
                        // Try to get gestore and distance from the backend if present
                        let gestore = station.gestore;
                        let distance = station.distance;
                        // If not present, try to extract from address (legacy)
                        if (!gestore && station.address) {
                            const match = station.address.match(/^(.*?)-/);
                            if (match) gestore = match[1].trim();
                        }
                        return {
                            ...station,
                            gestore: gestore || '',
                            distance: distance || '',
                        };
                    });
                    console.log('Results assigned:', this.results);
                    console.table(this.results);
                } else {
                    console.warn('Response data is missing "stations" property.');
                    this.results = [];
                }
            } catch (err) {
                console.error('Error in submitForm:', err);
                this.error = err.message;
                this.results = [];
            } finally {
                console.log('submitForm finished.');
                this.loading = false;
                this.linearProgress.close();
            }
        }
    };
}
