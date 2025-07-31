# BenzoApp Project Documentation

## Project Overview

BenzoApp is a FastAPI-based web application for finding gas stations. It provides an API to search for gas stations near a city within a given radius, with support for multiple fuel types. The frontend is built with static HTML, CSS, and JavaScript, with internationalization support.

- **Name**: BenzoApp
- **Type**: Web Application (Backend API + Static Frontend)
- **Language**: Python 3.13.*
- **Framework**: FastAPI
- **Description**: Fuel service for finding gas stations with price information.

## Environment Setup

- **OS**: Windows 11
- **Shell**: PowerShell 7 (pwsh.exe)
- **Python Version**: 3.13.*
- **Virtual Environment**: Managed with `uv`
- **Activation Command**: `uv venv` to create and `uv activate` to activate (or use `source .venv/Scripts/activate` on Windows)

## Project Structure

```text
BenzoApp/
├── .github/                  # GitHub workflows and issue templates
├── .roo/                     # Roo AI assistant configuration
├── .vscode/                  # VS Code settings
├── docs/                     # Project documentation
│   └── frontend-code-review.md
├── src/                      # Source code
│   ├── main.py               # FastAPI application entry point
│   ├── models.py             # Pydantic models for data validation
│   └── static/               # Static assets (HTML, CSS, JS, images)
│       ├── css/
│       ├── data/             # Static data files (e.g., cities.json)
│       ├── js/               # JavaScript files
│       ├── locales/          # Internationalization files
│       └── templates/        # HTML templates
├── tests/                    # Test files
│   ├── __init__.py
│   └── test_main.py
├── .env.example              # Environment variables example
├── .gitignore                # Git ignore rules
├── .mypy.ini                 # MyPy configuration
├── .pytest.ini               # PyTest configuration
├── .rooignore                # Roo ignore rules
├── .ruff.toml                # Ruff configuration
├── .uv.toml                  # uv configuration
├── agent.md                  # Agent documentation
├── frontend_analysis_report.md
├── git_diff.bat              # Windows batch script for generating git diff
├── init_instruction.sh       # Shell script for initializing project instructions
├── PRD.md                    # Product Requirements Document
├── PROJECT_DOC.md            # This documentation file
├── pyproject.toml            # Python project configuration
├── README.md                 # Project README
├── run.bat                   # Windows batch script to run the application
├── screenshot.png            # Screenshot image
├── TODOLIST.md               # Todo list
├── uv.lock                   # uv lock file
└── README.md                 # Project README
```

## Dependencies

### Production Dependencies

- `cachetools`: 6.1.0 - In-memory caching
- `fastapi[standard]`: 0.116.1 - Web framework
- `httptools`: 0.6.4 - HTTP protocol tools
- `humanize`: 4.12.3 - Human-readable formatting
- `loguru`: 0.7.3 - Logging
- `orjson`: 3.11.1 - Fast JSON parser
- `pathvalidate`: 3.3.1 - Path validation
- `pydantic_settings`: 2.7.1 - Settings management
- `pydantic`: 2.9.2 - Data validation
- `python-dateutil`: 2.9.0.post0 - Date utilities
- `python-dotenv`: 1.1.0 - Environment variables
- `python-multipart`: 0.0.9 - Multipart form data parsing
- `tabulate`: 0.9.0 - Tabular data formatting
- `tzdata`: 2025.2 - Timezone data
- `uvicorn[standard]`: 0.32.1 - ASGI server
- `wrapt`: 1.17.2 - Decorator library
- `tenacity`: 9.0.0 - Retry mechanism

### Development Dependencies

- `datamodel-code-generator`: 0.32.0 - Generate Pydantic models from JSON Schema
- `httpx`: 0.28.1 - HTTP client for testing
- `ipykernel`: 6.30.0 - IPython kernel
- `mypy`: 1.17.0 - Static type checker
- `pip-audit`: 2.9.0 - Security vulnerability scanning
- `pip`: 25.1.1 - Package installer
- `pipgrip`: 0.8.0 - Dependency resolver
- `pytest-cov`: 5.0.0 - Test coverage
- `pytest-env`: 0.8.2 - Environment variables in tests
- `pytest-randomly`: 3.17.0 - Randomize test order
- `pytest-sugar`: 0.9.7 - Pretty test output
- `pytest-xdist`: 3.6.1 - Parallel test execution
- `pytest`: 8.3.4 - Testing framework
- `ruff`: 0.6.8 - Code linter and formatter
- `types-cachetools`: 5.3.0.20241125 - Type stubs
- `types-python-dateutil`: 2.9.0.20241125 - Type stubs
- `types-tabulate`: 0.9.0.20241125 - Type stubs
- `watchfiles`: 0.22.0 - File watching

## Common Commands

### Running the Application

```bash
# Windows
uv run uvicorn src.main:app --reload

# Alternative using run.bat
run.bat
```

### Testing

```bash
uv run pytest
uv run pytest --cov=src  # With coverage
```

### Linting

```bash
ruff check .
ruff format .
```

### Type Checking

```bash
mypy .
```

### Generating Git Diff

```bash
git_diff.bat  # On Windows
```

### Development Workflow

1. Create and activate virtual environment: `uv venv && uv activate`
2. Install dependencies: `uv pip install -e .`
3. Run tests: `uv run pytest`
4. Check code style: `ruff check .`
5. Check types: `mypy .`
6. Run application: `uv run uvicorn src.main:app --reload`

## Known Patterns & Conventions

### Code Style

- Follows PEP 8, PEP 257, and PEP 484
- Uses Google-style docstrings
- Type hints with built-in types (`list`, `dict`, `tuple`, `|`) instead of `typing` module
- Meaningful variable, function, and class names
- Descriptive inline comments for non-obvious logic
- Clean code principles: DRY, single responsibility, separation of concerns

### Testing

- Uses pytest with fixtures and parametrization
- Test coverage with pytest-cov
- Randomized test order with pytest-randomly
- Parallel execution with pytest-xdist
- Environment variables in tests with pytest-env

### Logging

- Uses Loguru instead of standard logging
- Configured with timestamp, level, and message format
- Appropriate log levels (INFO, WARNING, ERROR, etc.)
- Context included in log messages
- Exceptions logged with tracebacks using `logger.exception()`

### Error Handling

- Errors caught and logged gracefully
- HTTP exceptions raised with appropriate status codes
- Retry mechanism with exponential backoff using tenacity
- Input validation with Pydantic

### Internationalization

- Uses i18next for frontend internationalization
- Language files in `src/static/locales/` (en.json, it.json)
- Language switching in the UI

### Security

- Environment variables for configuration
- Input validation with Pydantic
- Proper error handling without sensitive information disclosure
- Security vulnerability scanning with pip-audit

## Suggested OS-Specific Alternatives

### Windows

- Use `run.bat` to run the application
- Use `git_diff.bat` to generate git diff
- Activate virtual environment with `.\.venv\Scripts\activate`

### Unix-like (Linux, macOS)

- Use `uv run uvicorn src.main:app --reload` to run the application
- Use `source .venv/bin/activate` to activate virtual environment
- Use `init_instruction.sh` to initialize project instructions

## Continuous Updates

To refresh the documentation, re-run the `/init` command. This will scan the project again and update this document with any changes in structure, dependencies, or configuration.
