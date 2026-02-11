"""Documentation page checker utility for BenzoApp.

Verifies that documentation pages are accessible and contain expected elements.
"""

from fastapi.testclient import TestClient

from src.main import app


def check_docs_pages(pages: list[str]) -> list[dict[str, str | int | bool]]:
    """Check documentation pages for accessibility and expected elements.

    Parameters:
    - pages: List of documentation page identifiers to check.

    Returns:
    - List of dictionaries containing page check results with status code
      and toggle presence indicator.
    """
    client = TestClient(app)
    results: list[dict[str, str | int | bool]] = []

    for page in pages:
        response = client.get(f"/help/{page}")
        toggle_present = 'id="docs-theme-toggle"' in response.text

        # Extract snippet starting from first h1 tag
        start_idx = response.text.find("<h1")
        snippet = response.text[start_idx : start_idx + 200] if start_idx != -1 else ""

        results.append({
            "page": page,
            "status_code": response.status_code,
            "toggle_present": toggle_present,
            "snippet": snippet,
        })

    return results


def main() -> None:
    """Run documentation page checks and display results."""
    pages = ["user-it", "user-en"]
    results = check_docs_pages(pages)

    for result in results:
        page = result["page"]
        status = result["status_code"]
        toggle = result["toggle_present"]
        snippet = result["snippet"]

        print(f"{page} {status} docs-toggle-present {toggle}")  # noqa: T201
        print(f"snippet: {snippet}")  # noqa: T201
        print("---")  # noqa: T201


if __name__ == "__main__":
    main()
