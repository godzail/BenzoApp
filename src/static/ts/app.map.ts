/**
 * Map-related helper methods for the gas station application.
 */

interface AppMapMixin {
  map: unknown;
  mapInitialized: boolean;
  mapMarkers: Record<string, unknown>;
  results: Array<{
    id?: string | number;
    latitude?: number;
    longitude?: number;
    gestore?: string;
    address?: string;
    fuel_prices?: Array<{ price?: number }>;
    distance?: string | number;
  }>;
  error: string;
  formData: {
    city: string;
    radius: string;
    fuel: string;
    results: string;
  };
  [key: string]: unknown;

  clearMapMarkers(): void;
  addMapMarkers(): void;
  fitMapBounds(): void;
  initMap(): void;
  refreshMapMarkersOnLanguageChange(): void;
  selectStationForMap(stationId: string | number): void;
  getDirections(station: { latitude?: number; longitude?: number }): void;
  locateUser(): void;
  buildPopupContent(station: {
    id?: string | number;
    latitude?: number;
    longitude?: number;
    gestore?: string;
    address?: string;
  }): string;
  submitForm(): Promise<void>;
  $nextTick?: (callback: () => void) => void;
  updateMap?: () => void;
}

window.appMapMixin = {
  clearMapMarkers(): void {
    if (this.mapMarkers) {
      for (const marker of Object.values(this.mapMarkers)) {
        if (
          marker &&
          typeof (marker as { remove?: () => void }).remove === "function"
        ) {
          (marker as { remove: () => void }).remove();
        }
      }
      this.mapMarkers = {};
    }
  },

  addMapMarkers(): void {
    if (!this.results || this.results.length === 0) return;
    const validStations = this.results.filter((s) => s.latitude && s.longitude);
    if (validStations.length === 0) return;

    const bounds = validStations.map((st) => [st.latitude!, st.longitude!]);

    for (const station of validStations) {
      if (!station.id) continue;
      const marker = (
        L as unknown as {
          marker: (coords: [number, number]) => {
            addTo: (map: unknown) => {
              __station?: unknown;
              bindPopup: (content: string) => void;
            };
          };
        }
      )
        .marker([station.latitude!, station.longitude!])
        .addTo(this.map);
      marker.__station = station;
      marker.bindPopup(this.buildPopupContent(station));
      this.mapMarkers[station.id!] = marker;
    }

    (this.map as { invalidateSize?: () => void })?.invalidateSize?.();
    const validBounds: [[number, number], [number, number]] = bounds as [
      [number, number],
      [number, number],
    ];
    (
      this.map as {
        fitBounds: (
          bounds: [[number, number], [number, number]],
          options?: { padding?: [number, number]; maxZoom?: number },
        ) => void;
      }
    ).fitBounds(validBounds, {
      padding: window.CONFIG.MAP_PADDING,
      maxZoom: window.CONFIG.MAX_ZOOM,
    });
  },

  fitMapBounds(): void {
    const markers = Object.values(this.mapMarkers || {});
    if (markers.length > 0) {
      const bounds = markers.map((m) =>
        (m as { getLatLng: () => [number, number] }).getLatLng(),
      );
      (
        this.map as {
          fitBounds: (
            bounds: [[number, number], [number, number]],
            options?: { padding?: [number, number]; maxZoom?: number },
          ) => void;
        }
      ).fitBounds(bounds as [[number, number], [number, number]], {
        padding: window.CONFIG.MAP_PADDING,
        maxZoom: window.CONFIG.MAX_ZOOM,
      });
    }
  },

  initMap(): void {
    if (this.mapInitialized) return;
    const mapContainer = document.getElementById("map");
    if (!mapContainer) return;
    this.map = (
      L as unknown as {
        map: (element: string) => {
          setView: (center: [number, number], zoom: number) => unknown;
        };
      }
    )
      .map("map")
      .setView(window.CONFIG.DEFAULT_MAP_CENTER, window.CONFIG.DEFAULT_ZOOM);
    (
      L as unknown as {
        tileLayer: (
          url: string,
          options: { attribution: string },
        ) => {
          addTo: (map: unknown) => void;
        };
      }
    )
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
      .addTo(this.map);
    this.mapInitialized = true;
    setTimeout(() => {
      if (
        this.map &&
        typeof (this.map as { invalidateSize?: () => void }).invalidateSize ===
          "function"
      ) {
        (this.map as { invalidateSize: () => void }).invalidateSize();
      }
    }, window.CONFIG.MAP_RESIZE_DELAY);
  },

  refreshMapMarkersOnLanguageChange(): void {
    for (const marker of Object.values(this.mapMarkers || {})) {
      if (
        marker &&
        (marker as { __station?: { gestore?: string; address?: string } })
          .__station
      ) {
        (
          marker as {
            setPopupContent: (content: string) => void;
            __station?: { gestore?: string; address?: string };
          }
        ).setPopupContent(
          this.buildPopupContent(
            (marker as { __station: { gestore?: string; address?: string } })
              .__station,
          ),
        );
      }
    }
    this.$nextTick?.(() => {
      this.updateMap?.();
    });
  },

  selectStationForMap(stationId: string | number): void {
    if (!(this.map && this.mapMarkers && stationId)) return;
    const marker = this.mapMarkers[stationId];
    if (!marker) return;
    const station = (
      marker as { __station?: { latitude?: number; longitude?: number } }
    ).__station;
    if (station?.latitude && station?.longitude) {
      (
        this.map as {
          setView: (center: [number, number], zoom: number) => void;
        }
      ).setView([station.latitude, station.longitude], 16);
      (marker as { openPopup: () => void }).openPopup();
    }
  },

  getDirections(station: { latitude?: number; longitude?: number }): void {
    if (!(station?.latitude && station.longitude)) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (newWindow) (newWindow as { opener: null }).opener = null;
  },

  locateUser(): void {
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
} as AppMapMixin;
