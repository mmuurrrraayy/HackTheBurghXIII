import logging

import uvicorn

from .app import create_app
from .config import AppConfig
from .storage import JsonStore

logging.basicConfig(level=logging.INFO)

config = AppConfig.from_env()
app = create_app(config, JsonStore(config.data_directory), serve_frontend=True)


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host=config.host, port=config.port, reload=False)
