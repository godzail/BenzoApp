// Map-related helpers (split from app.js)
window.appMapMixin = {
  clearMapMarkers() {
    if (this.mapMarkers) {
      for (const marker of Object.values(this.mapMarkers)) {
        if (marker && typeof marker.remove === "function") {
          marker.remove();
        }
      }
      this.mapMarkers = {};
    }
  },

  addMapMarkers() {
    if (!this.results || this.results.length === 0) return;
    const validStations = this.results.filter((s) => s.latitude && s.longitude);
    if (validStations.length === 0) return;

    const bounds = validStations.map((st) => [st.latitude, st.longitude]);

    for (const station of validStations) {
      if (!station.id) continue;
      const marker = L.marker([station.latitude, station.longitude]).addTo(
        this.map,
      );
      marker.__station = station;
      marker.bindPopup(this.buildPopupContent(station));
      this.mapMarkers[station.id] = marker;
    }

    this.map.invalidateSize();
    this.map.fitBounds(bounds, {
      padding: window.CONFIG.MAP_PADDING,
      maxZoom: window.CONFIG.MAX_ZOOM,
    });
  },

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

  initMap() {
    if (this.mapInitialized) return;
    const mapContainer = document.getElementById("map");
    if (!mapContainer) return;
    this.map = L.map("map").setView(
      window.CONFIG.DEFAULT_MAP_CENTER,
      window.CONFIG.DEFAULT_ZOOM,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.mapInitialized = true;
    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, window.CONFIG.MAP_RESIZE_DELAY);
  },

  refreshMapMarkersOnLanguageChange() {
    for (const marker of Object.values(this.mapMarkers || {})) {
      if (marker?.__station)
        marker.setPopupContent(this.buildPopupContent(marker.__station));
    }
    this.$nextTick?.(() => {
      this.updateMap?.();
    });
  },

  selectStationForMap(stationId) {
    if (!(this.map && this.mapMarkers && stationId)) return;
    const marker = this.mapMarkers[stationId];
    if (!marker) return;
    const station = marker.__station;
    if (station?.latitude && station?.longitude) {
      this.map.setView([station.latitude, station.longitude], 16);
      marker.openPopup();
    }
  },

  getDirections(station) {
    if (!(station?.latitude && station.longitude)) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;
    window.open(url, "_blank");
  },

  locateUser() {
    if (!navigator.geolocation) {
      this.error = "Geolocation is not supported by your browser";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.formData.city = "Current Location";
        this.submitForm();
      },
      (error) => {
        this.error = "Unable to retrieve your location";
      },
    );
  },
};
