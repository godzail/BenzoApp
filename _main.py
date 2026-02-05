"""Run the BenzoApp FastAPI application using Uvicorn."""

import uvicorn

from src.models import Settings

if __name__ == "__main__":
    # Load settings from configuration
    settings = Settings()  # pyright: ignore[reportCallIssue]

    # Run uvicorn programmatically
    uvicorn.run(
        "src.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=settings.server_reload,
        workers=settings.server_workers,
    )
