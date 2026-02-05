"""Tests for the rendered documentation pages."""

from fastapi.testclient import TestClient
from starlette import status

from src.main import app


def test_docs_user_page(client: TestClient) -> None:
    """Request /help/user and ensure rendered content includes the main H1."""
    response = client.get("/help/user")
    assert response.status_code == status.HTTP_200_OK
    assert "BenzoApp User Guide" in response.text
    # The doc should render a table (converted from markdown) and the theme toggle should be present
    assert "<table" in response.text
    assert 'id="docs-theme-toggle"' in response.text


def test_docs_page_not_found(client: TestClient) -> None:
    """Request a non-existent docs page returns 404."""
    response = client.get("/help/thispagedoesnotexist")
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_docs_static_image(client: TestClient) -> None:
    """The docs screenshots should be served under /docs-static."""
    response = client.get("/docs-static/screenshots/main.png")
    assert response.status_code == status.HTTP_200_OK
    # Basic binary-ish check
    assert response.content[:8] in (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff\xe0\x00\x10JFIF")


def test_docs_css_served(client: TestClient) -> None:
    """Ensure the docs CSS file is served and contains the docs container selector."""
    r = client.get("/static/css/docs.css")
    assert r.status_code == status.HTTP_200_OK
    assert ".docs-container" in r.text


def test_favicon_routes(client: TestClient) -> None:
    """Both /favicon.png and /favicon.ico should return the favicon file."""
    r1 = client.get("/favicon.png")
    r2 = client.get("/favicon.ico")
    assert r1.status_code == status.HTTP_200_OK
    assert r2.status_code == status.HTTP_200_OK
    assert r1.content == r2.content


def test_styles_css_served(client: TestClient) -> None:
    """Legacy `styles.css` should be served as a compatibility shim."""
    r = client.get("/static/css/styles.css")
    assert r.status_code == status.HTTP_200_OK
    # Ensure the shim references the split stylesheet
    assert '@import url("/static/css/styles.split.css")' in r.text
