import uvicorn

from .config import AppConfig

config = AppConfig.from_env()

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=config.host,
        port=config.port,
        reload=True,
    )
