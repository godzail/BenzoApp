# Product Requirements Document (PRD)

## Overview

This document outlines the requirements for a web application that enables users to search for nearby gas stations by city and radius, displaying sorted fuel prices and addresses. The application uses OpenStreetMap Nominatim for geocoding and supports all available fuel types.

---

## Goals

- Allow users to search for gas stations near a specified city within a given kilometer radius.
- Display addresses and sorted fuel prices for each station.
- Provide a clean, intuitive UI using Material Design components.
- Minimize JavaScript usage by leveraging Alpine.js for interactivity.
- Ensure developer-friendly structure and maintainability.
- Prepare for production deployment.

---

## Implementation Status

The application has been fully implemented with the following technology stack:

- **Backend**: Python with FastAPI
- **Frontend**: HTML, CSS, JavaScript with Alpine.js
- **Styling/UI**: Material Design via Material Web Components
- **Interactivity**: Alpine.js for handling UI state and interactivity
- **Geocoding**: OpenStreetMap Nominatim for city-to-coordinates conversion
- **API**: Prezzi Carburante API for gas station data

All core features and additional UX features have been implemented as specified in this document.

---

## Features

### Core Functionality

- **City & Radius Input:** Users enter a city name and select a search radius (in kilometers).
- **Fuel Type Selection:** Users choose from available fuel types (benzina, diesel, GPL, metano, etc.).
- **Geocoding:** City names are converted to latitude/longitude using OpenStreetMap Nominatim.
- **API Integration:** The app queries [Prezzi Carburante API](https://prezzi-carburante.onrender.com/api/distributori) with geocoded coordinates, radius, and fuel type.
- **Results Display:** List of nearby gas stations with:
  - Address
  - Sorted fuel prices (ascending)
  - Fuel type indicator
- **Responsive UI:** Material Design components for layout, forms, and cards.
- **Alpine.js Interactivity:** Dynamic updates for search results and filters without full page reloads.

### Additional UX Features (Proposed)

- **Loading Indicators:** Show progress during API/geocoding requests.
- **Error Handling:** User-friendly messages for invalid input, no results, or API errors.
- **Map View (Optional):** Display station locations on a map (using Leaflet or similar).
- **Recent Searches:** Optionally store and display recent user queries.
- **Accessibility:** Keyboard navigation, ARIA labels, and color contrast compliance.

---

## Technical Requirements

- **Frontend:** HTML, CSS, JavaScript with Alpine.js.
- **Backend:** Python with [FastAPI](https://fastapi.tiangolo.com/) ([FastAPI LLMs doc](https://context7.com/tiangolo/fastapi/llms.txt)).
- **Styling/UI:** Material Design via [Material Web Components](https://material-web.dev/) or [Materialize CSS](https://materializecss.com/).
- **Interactivity:** [Alpine.js](https://alpinejs.dev/docs/introduction) for handling UI state and interactivity.
- **Geocoding:** [OpenStreetMap Nominatim](https://nominatim.org/) for city-to-coordinates conversion.
- **API:** [Prezzi Carburante API](https://prezzi-carburante.onrender.com/api/distributori).
- **Browser Compatibility:** Latest Chrome, Firefox, Edge, Safari.
- **Accessibility:** WCAG 2.1 AA compliance.

---

## Constraints

- Use only free, open-source services for geocoding and UI.
- Prioritize clean, maintainable code and modular structure.
- Use Alpine.js for dynamic behavior.
- UI must be responsive and mobile-friendly.
- Prepare for deployment in a production-like environment.

---

## User Stories

1. **Search for Gas Stations**
   - As a user, I want to enter a city and radius to find nearby gas stations.
2. **Compare Fuel Prices**
   - As a user, I want to see sorted fuel prices for each station.
3. **Select Fuel Type**
   - As a user, I want to filter stations by fuel type.
4. **View Station Details**
   - As a user, I want to see addresses and optionally view stations on a map.
5. **Error Feedback**
   - As a user, I want clear feedback if my search fails or returns no results.

---

## API Usage Example

```bash
GET https://prezzi-carburante.onrender.com/api/distributori?latitude=45.14027999213074&longitude=7.007186940593831&distance=5&fuel=benzina&results=3
```

- **Parameters:**
  - `latitude`, `longitude`: From geocoding service
  - `distance`: User input (km)
  - `fuel`: Selected fuel type
  - `results`: Optional, number of results to display

---

## Non-Functional Requirements

- **Performance:** Results should load within 2 seconds under normal conditions.
- **Security:** Sanitize user input; handle API errors gracefully.
- **Scalability:** Codebase should support future enhancements (e.g., map view, user accounts).
- **Documentation:** Maintain clear code comments and user/developer documentation.

---

## Future Enhancements

- Map integration for visualizing station locations.
- User authentication for saving preferences.
- Localization for multi-language support.
- Advanced filtering (price range, brand, amenities).

---

## Acceptance Criteria

- Users can search by city and radius, select fuel type, and view sorted results.
- UI is clean, responsive, and uses Material Design.
- Alpine.js is used for interactivity.
- Geocoding uses OpenStreetMap Nominatim.
- All features work in major browsers and meet accessibility standards.

---

## References

- [Prezzi Carburante API Documentation](https://prezzi-carburante.onrender.com/api/distributori)
- [Alpine.js Documentation](https://alpinejs.dev/docs/introduction)
- [OpenStreetMap Nominatim](https://nominatim.org/)
- [Material Web Components](https://material-web.dev/)

---

**End of PRD**