"""Dev server with the built-in demo villain: npm run dev:demo.

Same as `npm run dev:backend`, but showcases the loop with a pretend villain (backend/demo_villain.py) and a
pretend agent (backend/demo_agent.py) instead of Dify, so it is repeatable and needs no Dify keys or credits.
Sites are still built, stored (S3 if configured) and scored exactly as in a real trial.
"""
import logging
import os

import uvicorn

os.environ["DEMO_MODE"] = "1"  # inherited by the reloader's worker process

from .config import AppConfig  # noqa: E402

config = AppConfig.from_env()

if __name__ == "__main__":
    logging.getLogger("uvicorn.error").warning("Demo mode: pretend villain and pretend agent (backend/demo_villain.py, backend/demo_agent.py). Dify is not used.")
    uvicorn.run("backend.main:app", host=config.host, port=config.port, reload=True)
