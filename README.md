# Gas Station Finder

A web application that enables users to search for nearby gas stations by city and radius, displaying sorted fuel prices and addresses. The application uses OpenStreetMap Nominatim for geocoding and supports all available fuel types.

## Features

- Search for gas stations near a specified city within a given kilometer radius
- Display addresses and sorted fuel prices for each station
- Clean, intuitive UI using Material Design components
- Dynamic updates using Alpine.js for interactivity
- Responsive design that works on mobile and desktop
- Error handling for invalid input or no results

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript with Alpine.js
- **Styling/UI**: Material Design via Material Web Components
- **Interactivity**: Alpine.js for handling UI state and interactivity
- **Geocoding**: OpenStreetMap Nominatim for city-to-coordinates conversion
- **API**: Prezzi Carburante API for gas station data
- **Backend**: Python with FastAPI
- **HTTP Client**: httpx for API requests
- **Build/Package Management**: uv

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/your-username/gas-station-finder.git
    ```

2. Navigate to the project directory:

    ```bash
    cd gas-station-finder
    ```

3. Install [uv](https://github.com/astral-sh/uv) if you don't have it.

4. Create a virtual environment and install dependencies using uv:

    ```bash
    uv sync
    ```

## Usage

1. Activate the virtual environment:
    - On macOS/Linux: `source .venv/bin/activate`
    - On Windows: `.venv\Scripts\activate`

2. Start the development server:

    ```bash
    uv run uvicorn main:app --reload
    ```

3. Open your browser and navigate to `http://localhost:8000`

## Testing

To run the tests for the application components:

```bash
python test.py
```

This will test the geocoding functionality, API integration, and the full workflow.

## Usage Instructions

1. Enter a city name in the "City" field
2. Select a search radius from the dropdown (1km, 5km, 10km, or 20km)
3. Choose a fuel type from the dropdown (Benzina, Diesel, GPL, or Metano)
4. Click the "Search" button
5. View the results showing gas stations with their addresses and sorted fuel prices

## Project Structure

```text
gas-station-finder/
├── index.html          # Main HTML file
├── styles.css          # Custom styles
├── main.py             # Python FastAPI server
├── pyproject.toml      # Python project metadata and dependencies
├── uv.lock             # Lockfile for reproducible builds
├── README.md           # Project documentation
└── .gitignore          # Git ignore file
```

## API Endpoints

- `GET /` - Serve the main page
- `POST /search` - Handle search requests and return results
- `GET /health` - Health check endpoint

## How It Works

1. User enters a city name, selects a radius, and chooses a fuel type
2. The application uses OpenStreetMap Nominatim to geocode the city to latitude/longitude
3. The application queries the Prezzi Carburante API with the coordinates, radius, and fuel type
4. Results are sorted by fuel price and displayed to the user
5. Alpine.js is used for dynamic updates without full page reloads

## Contributing

1. Fork the repository
2. Create a new branch: `git checkout -b feature-name`
3. Make your changes and commit them: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature-name`
5. Create a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Prezzi Carburante API](https://prezzi-carburante.onrender.com/api/distributori)
- [Alpine.js](https://alpinejs.dev/)
- [OpenStreetMap Nominatim](https://nominatim.org/)
- [Material Web Components](https://material-web.dev/)
