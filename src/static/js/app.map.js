"use strict";
/**
 * Map-related helper methods for the gas station application.
 */
window.appMapMixin = {
    /**
     * Remove all markers from the map and clear the internal registry.
     */
    clearMapMarkers() {
        if (this.mapMarkers) {
            for (const marker of Object.values(this.mapMarkers)) {
                if (marker &&
                    typeof marker.remove === "function") {
                    marker.remove();
                }
            }
            this.mapMarkers = {};
        }
    },
    /**
     * Add markers for the current `results` to the map and adjust view to fit them.
     */
    addMapMarkers() {
        if (!this.results || this.results.length === 0) {
            return;
        }
        const validStations = this.results.filter((s) => s.latitude && s.longitude);
        if (validStations.length === 0) {
            return;
        }
        const bounds = validStations.map((st) => [st.latitude, st.longitude]);
        for (const station of validStations) {
            if (!station.id) {
                continue;
            }
            const marker = L
                .marker([station.latitude, station.longitude])
                .addTo(this.map);
            marker.__station = station;
            marker.bindPopup(this.buildPopupContent(station));
            this.mapMarkers[station.id] = marker;
        }
        this.map?.invalidateSize?.();
        const validBounds = bounds;
        this.map.fitBounds(validBounds, {
            padding: window.CONFIG.MAP_PADDING,
            maxZoom: window.CONFIG.MAX_ZOOM,
        });
    },
    /**
     * Fit the map view to contain all current markers, respecting configured padding and max zoom.
     */
    fitMapBounds() {
        const markers = Object.values(this.mapMarkers || {});
        if (markers.length > 0) {
            const bounds = markers.map((m) => m.getLatLng());
            this.map.fitBounds(bounds, {
                padding: window.CONFIG.MAP_PADDING,
                maxZoom: window.CONFIG.MAX_ZOOM,
            });
        }
    },
    /**
     * Initialize the Leaflet map inside the '#map' element with default center and tile layer.
     */
    initMap() {
        if (this.mapInitialized) {
            return;
        }
        const mapContainer = document.getElementById("map");
        if (!mapContainer) {
            return;
        }
        this.map = L
            .map("map")
            .setView(window.CONFIG.DEFAULT_MAP_CENTER, window.CONFIG.DEFAULT_ZOOM);
        L
            .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
            .addTo(this.map);
        this.mapInitialized = true;
        setTimeout(() => {
            if (this.map &&
                typeof this.map.invalidateSize ===
                    "function") {
                this.map.invalidateSize();
            }
        }, window.CONFIG.MAP_RESIZE_DELAY);
    },
    /**
     * Refresh popup content for all markers when the application language changes.
     * Ensures popups show translated station information.
     */
    refreshMapMarkersOnLanguageChange() {
        for (const marker of Object.values(this.mapMarkers || {})) {
            if (marker &&
                marker
                    .__station) {
                marker.setPopupContent(this.buildPopupContent(marker
                    .__station));
            }
        }
        this.$nextTick?.(() => {
            this.updateMap?.();
        });
    },
    /**
     * Center the map on the given station and open its popup.
     *
     * @param stationId - Identifier of the station to select on the map.
     */
    selectStationForMap(stationId) {
        if (!(this.map && this.mapMarkers && stationId)) {
            return;
        }
        const marker = this.mapMarkers[stationId];
        if (!marker) {
            return;
        }
        const station = marker.__station;
        if (station?.latitude && station?.longitude) {
            this.map.setView([station.latitude, station.longitude], 16);
            marker.openPopup();
        }
    },
    /**
     * Open directions to a station using Google Maps in a new tab.
     *
     * @param station - Object containing `latitude` and `longitude` of the destination.
     */
    getDirections(station) {
        if (!(station?.latitude && station.longitude)) {
            return;
        }
        const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;
        const newWindow = window.open(url, "_blank", "noopener,noreferrer");
        if (newWindow) {
            newWindow.opener = null;
        }
    },
    /**
     * Attempt to locate the user via the browser `geolocation` API and submit a search for the current location.
     * Sets an error message if location cannot be retrieved.
     */
    locateUser() {
        if (!navigator.geolocation) {
            this.error = "Geolocation is not supported by your browser";
            return;
        }
        navigator.geolocation.getCurrentPosition((_position) => {
            this.formData.city = "Current Location";
            this.submitForm();
        }, (_error) => {
            this.error = "Unable to retrieve your location";
        });
    },
};
//# sourceMappingURL=app.map.js.map