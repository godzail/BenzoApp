# BenzoApp

[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

BenzoApp is a modern web application for finding gas stations and fuel prices, powered by a FastAPI backend and a responsive web interface. Designed for both technical and non-technical users, BenzoApp provides a seamless experience for searching, viewing, and comparing gas stations by location and fuel type.

---

## Table of Contents

- [BenzoApp](#benzoapp)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Screenshots](#screenshots)
  - [Project Structure](#project-structure)
  - [Setup](#setup)
  - [Usage](#usage)
  - [API Reference](#api-reference)
    - [`POST /search`](#post-search)
    - [`GET /`](#get-)
    - [`GET /health`](#get-health)
  - [Running Tests](#running-tests)
  - [Contributing](#contributing)
  - [License](#license)
  - [Contact](#contact)
  - [Acknowledgments](#acknowledgments)

---

## Features

- 🚀 FastAPI backend for high performance and easy extensibility
- 🌐 Static web frontend (HTML, CSS, JS) for user-friendly interaction
- 🔍 Search gas stations by city, radius, and fuel type
- 📊 View and compare fuel prices
- 🧪 Automated tests for reliability
- 🛠️ Simple setup and modular codebase

---

## Screenshots

<!-- If available, add screenshots here. Example: -->
<!--
![Main UI](src/static/screenshots/main.png)
-->

---

## Project Structure

```text
BenzoApp/
├── src/
│   ├── main.py           # FastAPI backend
│   └── static/           # Frontend assets
│       ├── index.html
│       ├── css/
│       │   └── styles.css
│       └── js/
│           └── app.js
├── tests/
│   └── test_main.py      # Automated tests
├── pyproject.toml        # Project metadata and dependencies
├── run.bat               # Windows run script
├── README.md
└── ...
```

---

## Setup

1. **Clone the repository:**

   ```text
   git clone https://github.com/yourusername/BenzoApp.git
   cd BenzoApp
   ```

2. **Install dependencies (recommended with [uv](https://github.com/astral-sh/uv)):**

   ```sh
   uv sync
   ```

3. **Run the application:**

   ```text
   # On Windows
   .\run.bat
   ```

---

## Usage

1. Open your browser and navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000).
2. Use the search form to find gas stations by city, radius, fuel type and results number.
3. View results and compare fuel prices.

---

## API Reference

### `POST /search`

Search for gas stations near a city.

**Request Body:**

```json
{
  "city": "Rome",
  "radius": 10,
  "fuel": "diesel",
  "results": 5
}
```

**Response:**

```json
{
  "stations": [
    {
      "id": "123",
      "address": "Via Roma 1",
      "latitude": 41.9028,
      "longitude": 12.4964,
      "fuel_prices": [
        {
          "type": "diesel",
          "price": 1.799
        }
      ]
    }
  ],
  "warning": null
}
```

### `GET /`

Returns the main HTML page.

### `GET /health`

Health check endpoint. Returns `{"status": "ok"}`.

---

## Running Tests

```text
pytest
```

---

## Contributing

Contributions are welcome! Please open issues or pull requests for improvements, bug fixes, or new features.

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to your fork and submit a pull request

---

## License

This project is licensed under the MIT License.

---

## Contact

For questions or support, please open an issue on GitHub or contact the maintainer.

---

## Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/)
- [Loguru](https://github.com/Delgan/loguru)
- [httpx](https://www.python-httpx.org/)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/)
- [Prezzi Carburante API](https://prezzi-carburante.onrender.com/)
This project is licensed under the MIT License.
