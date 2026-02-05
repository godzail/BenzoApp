"""Fixtures for testing the FastAPI application."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture
def client() -> Generator[TestClient]:
    """Fixture to provide a TestClient for the FastAPI app with lifespan handled."""
    with TestClient(app) as client:
        yield client
