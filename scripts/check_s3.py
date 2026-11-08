"""Check the S3 settings in .env: upload a test page, presign it, fetch it the way the agent would, delete it.

Run from the repo root:  python scripts/check_s3.py
"""
import asyncio
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import AppConfig  # noqa: E402  (loads .env)
from backend.site_storage import S3SiteStorage  # noqa: E402


async def main() -> int:
    config = AppConfig.from_env()
    missing = [name for name in ("S3_BUCKET", "S3_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")
               if not os.getenv(name)]
    if missing:
        print("Missing in .env:", ", ".join(missing))
        return 1
    storage = S3SiteStorage(config.s3_bucket, config.s3_prefix, config.s3_region, 300)
    key = "healthcheck/index.html"
    print("Uploading to", await storage.put(key, "<!doctype html><p>labyrinth-s3-ok</p>"))
    url = await storage.link(key)
    with urllib.request.urlopen(url, timeout=15) as response:
        body = response.read().decode()
        print("Presigned link HTTP", response.status, response.headers.get("content-type"))
    storage._client.delete_object(Bucket=config.s3_bucket, Key=storage._full(key))
    if "labyrinth-s3-ok" not in body:
        print("Fetched the link but the content was wrong.")
        return 1
    print("S3 is ready: upload, presigned link and delete all work.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
