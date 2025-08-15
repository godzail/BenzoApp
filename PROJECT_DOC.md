# BenzoApp - Project Documentation

## Project Overview

**Name:** BenzoApp
**Type:** Full-stack Web Application (Backend API + Frontend)
**Primary Language:** Python 3.13.*
**Backend Framework:** FastAPI
**Frontend:** Static HTML, CSS, JavaScript with Material Components
**Description:** A gas station finder web application that allows users to search for gas stations by city, radius, and fuel type, with support for internationalization (English/Italian).

## Environment Setup

**Operating System:** Windows 11 (based on environment detection)
**Shell:** PowerShell (C:\Program Files\PowerShell\7\pwsh.exe)
**Package Manager:** uv (recommended) or pip
**Virtual Environment:** uv-managed (recommended)

### Environment Setup Commands

#### Create and activate virtual environment

```bash
# Create virtual environment using uv
uv venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate

# On Unix-like systems:
source .venv/bin/activate
```

#### Install dependencies

```bash
# Install all dependencies (production + development)
uv pip install -e .

# Or using pip:
pip install -e .
```

### Virtual Environment Activation Commands

**Windows:**

```bash
.venv\Scripts\activate
```

**Unix-like systems:**

```bash
source .venv/bin/activate
```

## Project Structure

```text
BenzoApp/
├── .github/                  # GitHub workflows and issue templates
│   └── ...
├── .roo/                     # Roo AI assistant configuration
│   └── ...
├── .vscode/                  # VS Code settings and workspace configuration
│   └── ...
├── docs/                     # Project documentation
│   ├── frontend-code-review.md
│   └── ...
├── src/                      # Source code
│   ├── main.py               # FastAPI application entry point and API endpoints
│   │   ├── Contains the main FastAPI app with lifespan management
│   │   ├── API endpoints: /, /search, /health, /favicon.png
│   │   ├── Service functions for geocoding and fetching gas stations
│   │   └── CORS middleware and static file mounting
│   ├── models.py             # Pydantic models for data validation and settings
│   │   ├── Settings: Application configuration from environment variables
│   │   ├── SearchRequest/SearchResponse: Request/response models
│   │   ├── Station: Gas station data model
│   │   ├── FuelPrice: Fuel pricing model
│   │   └── StationSearchParams: Parameters for external API calls
│   └── static/               # Static assets served by FastAPI
│       ├── css/              # Stylesheets
│       ├── data/             # Static data files (e.g., cities.json)
│       │   └── cities.json   # List of Italian cities for search suggestions
│       ├── js/               # JavaScript files
│       │   └── app.js        # Main frontend application logic
│       │       ├── Vue-like reactive frontend using vanilla JavaScript
│       │       ├── MDC Material Components integration
│       │       ├── Leaflet map integration for station visualization
│       │       ├── i18next internationalization support
│       │       └── Local storage for recent searches
│       ├── locales/          # Internationalization files
│       │   ├── en.json       # English translations
│       │   └── it.json       # Italian translations
│       ├── templates/        # HTML templates
│       │   ├── header.html   # Page header template
│       │   ├── search.html   # Search form template
│       │   └── results.html  # Results display template
│       ├── favicon.png       # Site favicon
│       └── index.html        # Main HTML page
├── tests/                    # Test files
│   ├── __init__.py
│   └── test_main.py          # Main application tests
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules
├── .mypy.ini                 # MyPy configuration for type checking
├── .pytest.ini               # PyTest configuration
├── .rooignore                # Roo ignore rules
├── .ruff.toml                # Ruff configuration for linting and formatting
├── .uv.toml                  # uv package manager configuration
├── pyproject.toml            # Python project configuration and dependencies
├── README.md                 # Project README
├── run.bat                   # Windows batch script to run the application
├── screenshot.png            # Application screenshot
├── TODOLIST.md               # Todo list for ongoing development
├── uv.lock                   # uv lock file (exact dependency versions)
└── PROJECT_DOC.md            # This project documentation file
```

## Common Commands

### Running the Application

```bash
# Development server with auto-reload
uv run uvicorn src.main:app --reload

# Alternative using run.bat (Windows)
.\run.bat

# Production server
uv run uvicorn src.main:app --host 0.0.0.0 --port 8000
```

### Testing

```bash
# Run all tests
uv run pytest

# Run tests with coverage
uv run pytest --cov=src

# Run tests in parallel
uv run pytest -n auto
```

### Code Quality

```bash
# Lint code
uv run ruff check .

# Format code
uv run ruff format .

# Type checking
uv run mypy .

# Security audit
uv run pip-audit
```

## External API Dependencies

### OpenStreetMap Nominatim

- **Purpose:** Geocoding city names to coordinates
- **URL:** `https://nominatim.openstreetmap.org/search`
- **Rate Limits:** Be respectful, include proper User-Agent header

### Prezzi Carburante API

- **Purpose:** Fetch gas station pricing and location data
- **URL:** `https://prezzi-carburante.onrender.com/api/distributori`
- **Rate Limits:** Implement retry logic with exponential backoff

## Security Considerations

- **CORS:** Configured to allow specific origins
- **Input Validation:** All inputs validated via Pydantic models
- **Environment Variables:** Sensitive data stored in `.env` file
- **Dependencies:** Regular security audits with `pip-audit`

## Performance Optimization

- **Caching:** Geocoding results cached with `cachetools`
- **Async Operations:** HTTP requests use async/await patterns
- **Connection Pooling:** Shared HTTP client across requests
- **Static Files:** Efficient serving with proper caching headers

## Deployment Considerations

- **ASGI Server:** Uvicorn for production deployment
- **Environment:** Proper virtual environment setup
- **Dependencies:** Lock exact versions with `uv.lock`
- **Monitoring:** Health check endpoint at `/health`

## Troubleshooting

### Common Issues

1. **Import Errors:** Ensure virtual environment is activated
2. **Port Already in Use:** Change port in uvicorn command
3. **API Rate Limits:** Implement delays between requests
4. **Type Errors:** Run `mypy .` to identify type issues

This documentation provides a comprehensive overview of the BenzoApp project structure, dependencies, and development workflow. For more specific information, refer to the individual files and comments in the codebase.
