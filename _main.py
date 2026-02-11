"""Run the BenzoApp FastAPI application using Uvicorn."""

import uvicorn
from loguru import logger

from src.models import Settings

if __name__ == "__main__":
    # Load settings from configuration
    settings = Settings()  # pyright: ignore[reportCallIssue]

    # run bun build src/ts/*.ts --outdir static/js --watch
    run_command = "bun build src/static/ts/app.ts --outdir src/static/js --minify --sourcemap --target browser--watch"
    logger.info(f"Starting build process with command: {run_command}")

    # Run uvicorn programmatically
    uvicorn.run(
        "src.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=settings.server_reload,
        workers=settings.server_workers,
    )
