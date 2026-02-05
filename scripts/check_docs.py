from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)
for page in ["user-it", "user-en"]:
    r = client.get(f"/help/{page}")
    print(page, r.status_code, "docs-toggle-present", 'id="docs-theme-toggle"' in r.text)
    start = r.text.find("<h1")
    print("snippet:", r.text[start : start + 200])
    print("---")
