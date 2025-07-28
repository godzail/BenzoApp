# BenzoApp Agent Instructions

This document provides instructions for an AI agent to interact with the BenzoApp codebase.

## Project Overview

BenzoApp is a web application built with Flask that provides information about benzodiazepines. The frontend is built with HTML, CSS, and JavaScript, and the backend is written in Python.

## Project Structure

The project is organized as follows:

- `src/main.py`: The main Flask application file.
- `src/static/`: Contains static assets like CSS, JavaScript, and images.
- `src/static/templates/`: Contains HTML templates for the frontend.
- `tests/`: Contains tests for the application.
- `pyproject.toml`: The project's configuration file, including dependencies.
- `.ruff.toml`: Configuration for the Ruff linter.
- `.mypy.ini`: Configuration for the MyPy type checker.

## Coding Conventions

- **Linting**: This project uses Ruff for linting. All code should adhere to the rules defined in `.ruff.toml`.
- **Type Checking**: This project uses MyPy for type checking. All code should be type-hinted.
- **Style**: Follow the existing code style.

## Testing Protocols

This project uses `pytest` for testing. Tests are located in the `tests/` directory. To run the tests, execute the `pytest` command in the root directory.

## Dependencies and Configuration

The project's dependencies are listed in `pyproject.toml`. The project uses `uv` for package management. To install the dependencies, run `uv pip install -e .` in the root directory.

## How to Run the Application

To run the application, execute the `run.bat` script in the root directory. This will start the Flask development server.