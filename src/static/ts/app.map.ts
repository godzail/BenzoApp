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
    latitude?: number | null;
    longitude?: number | null;
  };
  userLocation?: { lat: number; lon: number } | null;
  [key: string]: unknown;

  clearMapMarkers(): void;
  addMapMarkers(): void;
  fitMapBounds(): void;
  initMap(): void;
  refreshMapMarkersOnLanguageChange(): void;
  selectStationForMap(stationId: string | number): void;
  highlightStationCard(stationId: string | number): void;
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
  translate(key: string, fallback?: string): string;
  updateResultsUI?: () => void;
  updateMap?: () => void;
}

function getStationMarkerIcon(): unknown {
  return (
    L as unknown as {
      divIcon: (opts: {
        className: string;
        html: string;
        iconSize: [number, number];
        iconAnchor: [number, number];
      }) => unknown;
    }
  ).divIcon({
    className: "station-marker",
    html: '<span class="station-marker-dot" aria-hidden="true"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function getUserLocationIcon(): unknown {
  return (
    L as unknown as {
      divIcon: (opts: {
        className: string;
        html: string;
        iconSize: [number, number];
        iconAnchor: [number, number];
      }) => unknown;
    }
  ).divIcon({
    className: "user-location-marker",
    html: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

window.appMapMixin = {
  /**
   * Remove all markers from the map and clear the internal registry.
   */
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
    (
      this as { _userMarker?: { remove?: () => void } | null }
    )._userMarker?.remove?.();
    (this as { _userMarker?: unknown })._userMarker = null;
  },

  /**
   * Add markers for the current `results` to the map and adjust view to fit them.
   */
  addMapMarkers(): void {
    if (!this.results || this.results.length === 0) {
      return;
    }
    const validStations = this.results.filter(
      (
        station,
      ): station is (typeof this.results)[number] & {
        latitude: number;
        longitude: number;
      } =>
        typeof station.latitude === "number" &&
        typeof station.longitude === "number",
    );
    if (validStations.length === 0) {
      return;
    }

    const bounds = validStations.map((st) => [st.latitude, st.longitude]);

    for (const station of validStations) {
      if (station.id === undefined || station.id === null) {
        continue;
      }
      const stationId = station.id;
      const marker = (
        L as unknown as {
          marker: (
            coords: [number, number],
            options?: { icon?: unknown },
          ) => {
            addTo: (map: unknown) => {
              __station?: unknown;
              bindPopup: (content: string) => void;
              on: (event: string, handler: () => void) => void;
            };
          };
        }
      )
        .marker([station.latitude, station.longitude], {
          icon: getStationMarkerIcon(),
        })
        .addTo(this.map);
      marker.__station = station;
      marker.bindPopup(this.buildPopupContent(station));
      marker.on("click", () => {
        this.highlightStationCard?.(stationId);
      });
      this.mapMarkers[stationId] = marker;
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

    // Render the user's own position when a locate-me search is active.
    if (this.userLocation) {
      (
        this as { _userMarker?: { remove?: () => void } | null }
      )._userMarker?.remove?.();
      this._userMarker = (
        L as unknown as {
          marker: (
            coords: [number, number],
            options?: { icon?: unknown },
          ) => { addTo: (map: unknown) => unknown };
        }
      )
        .marker([this.userLocation.lat, this.userLocation.lon], {
          icon: getUserLocationIcon(),
        })
        .addTo(this.map);
    }
  },

  /**
   * Fit the map view to contain all current markers, respecting configured padding and max zoom.
   */
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

  /**
   * Initialize the Leaflet map inside the '#map' element with default center and tile layer.
   */
  initMap(): void {
    if (this.mapInitialized) {
      return;
    }
    const mapContainer = document.getElementById("map");
    if (!mapContainer) {
      return;
    }
    this.map = (
      L as unknown as {
        map: (element: string) => {
          setView: (center: [number, number], zoom: number) => unknown;
        };
      }
    )
      .map("map")
      .setView(window.CONFIG.DEFAULT_MAP_CENTER, window.CONFIG.DEFAULT_ZOOM);
    const attributionUrl = "https://www.openstreetmap.org/copyright";
    const attribution = `&copy; <a href="${attributionUrl}">OpenStreetMap</a> contributors`;
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
        attribution,
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

  /**
   * Refresh popup content for all markers when the application language changes.
   * Ensures popups show translated station information.
   */
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
    Promise.resolve().then(() => {
      this.updateMap?.();
    });
  },

  /**
   * Center the map on the given station and open its popup.
   *
   * @param stationId - Identifier of the station to select on the map.
   */
  selectStationForMap(stationId: string | number): void {
    if (!(this.map && this.mapMarkers && stationId)) {
      return;
    }
    const marker = this.mapMarkers[stationId];
    if (!marker) {
      return;
    }
    const station = (
      marker as { __station?: { latitude?: number; longitude?: number } }
    ).__station;
    if (station?.latitude != null && station?.longitude != null) {
      (
        this.map as {
          setView: (center: [number, number], zoom: number) => void;
        }
      ).setView([station.latitude, station.longitude], 16);
      (marker as { openPopup: () => void }).openPopup();
    }
    this.highlightStationCard(stationId);
  },

  /**
   * Highlight and scroll to the station card matching the given ID.
   *
   * @param stationId - Identifier of the station to highlight.
   */
  highlightStationCard(stationId: string | number): void {
    const cards = document.querySelectorAll(".station-card");
    for (const card of Array.from(cards)) {
      card.classList.remove("selected");
    }

    const targetCard = document.querySelector(
      `.station-card[data-station-id="${stationId}"]`,
    );
    if (targetCard) {
      targetCard.classList.add("selected");
      targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  },

  /**
   * Open directions to a station using Google Maps in a new tab.
   *
   * @param station - Object containing `latitude` and `longitude` of the destination.
   */
  getDirections(station: { latitude?: number; longitude?: number }): void {
    if (!(station?.latitude != null && station.longitude != null)) {
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (newWindow) {
      (newWindow as { opener: null }).opener = null;
    }
  },

  /**
   * Attempt to locate the user via the browser `geolocation` API and submit a search for the current location.
   * Surfaces localized error messages via the standard UI path.
   */
  locateUser(): void {
    if (!navigator.geolocation) {
      this.error = this.translate(
        "geolocation_unsupported",
        "Geolocation is not supported by your browser",
      );
      this.updateResultsUI?.();
      return;
    }
    const locationBtn = document.getElementById(
      "location-btn",
    ) as HTMLButtonElement | null;
    if (locationBtn) locationBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.formData.latitude = position.coords.latitude;
        this.formData.longitude = position.coords.longitude;
        this.formData.city = this.translate(
          "current_location",
          "Current location",
        );
        this.userLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        this.submitForm();
        if (locationBtn) locationBtn.disabled = false;
      },
      (_error) => {
        this.error = this.translate(
          "geolocation_error",
          "Unable to retrieve your location",
        );
        if (locationBtn) locationBtn.disabled = false;
        this.updateResultsUI?.();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  },
} as AppMapMixin;
