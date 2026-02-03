"""Run the BenzoApp FastAPI application using Uvicorn."""

import uvicorn

if __name__ == "__main__":
    # Run uvicorn programmatically
    uvicorn.run(
        "src.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        workers=1,
    )
