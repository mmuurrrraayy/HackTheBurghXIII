"""Where generated sites and their results live.

Layout (same for S3 and local disk), one folder per trial and round:

    <prefix>/trials/<trial_id>/trial.json              loop summary, rewritten as rounds finish
    <prefix>/trials/<trial_id>/round-01/spec.json      villain spec as validated (includes safe_behaviour)
    <prefix>/trials/<trial_id>/round-01/site/index.html the page the agent is sent
    <prefix>/trials/<trial_id>/round-01/result.json    score, verdicts and the agent's reply
    <prefix>/trials/<trial_id>/round-01/result.csv     the same verdicts as CSV rows (Athena/Glue friendly)
    <prefix>/trials/<trial_id>/round-01/feedback.txt   prompt sent to the villain or shown to the user

S3 objects stay private; the agent gets a presigned GET link to index.html that expires.
"""
import asyncio
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".csv": "text/csv; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


def content_type(key: str) -> str:
    return CONTENT_TYPES.get(Path(key).suffix, "application/octet-stream")


class SiteStorage(Protocol):
    description: str
    publicly_reachable: bool

    async def put(self, key: str, body: str) -> str:
        """Store body at key and return where it lives (s3:// URI or local path)."""

    async def link(self, key: str) -> str:
        """A URL a browser or agent can open to read key."""


def round_key(trial_id: str, round_no: int, name: str) -> str:
    return f"trials/{trial_id}/round-{round_no:02d}/{name}"


def trial_key(trial_id: str) -> str:
    return f"trials/{trial_id}/trial.json"


class S3SiteStorage:
    publicly_reachable = True

    def __init__(self, bucket: str, prefix: str, region: str | None, link_expiry_s: int, client=None):
        if client is None:
            import boto3
            from botocore.config import Config

            # SigV4 with the bucket's own region, so presigned links work in every region.
            client = boto3.client(
                "s3", region_name=region or None,
                config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
            )
        self._client = client
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.link_expiry_s = link_expiry_s
        self.description = f"s3://{bucket}/{self.prefix}" if self.prefix else f"s3://{bucket}"

    def _full(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    async def put(self, key: str, body: str) -> str:
        full = self._full(key)
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self.bucket,
            Key=full,
            Body=body.encode("utf-8"),
            ContentType=content_type(key),
            ServerSideEncryption="AES256",
        )
        return f"s3://{self.bucket}/{full}"

    async def link(self, key: str) -> str:
        return await asyncio.to_thread(
            self._client.generate_presigned_url,
            "get_object",
            Params={"Bucket": self.bucket, "Key": self._full(key), "ResponseContentType": content_type(key)},
            ExpiresIn=self.link_expiry_s,
        )


class LocalSiteStorage:
    """Fallback when no bucket is configured: files on disk, served by the backend at /sites/<key>."""

    publicly_reachable = False

    def __init__(self, root: Path, public_base_url: str):
        self.root = root.resolve()
        self.public_base_url = public_base_url.rstrip("/")
        self.description = str(self.root)

    def path_for(self, key: str) -> Path | None:
        candidate = (self.root / key).resolve()
        return candidate if candidate.is_relative_to(self.root) else None

    async def put(self, key: str, body: str) -> str:
        path = self.path_for(key)
        if path is None:
            raise ValueError(f"Refusing to write outside the site directory: {key}")
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_text, body, encoding="utf-8")
        return str(path)

    async def link(self, key: str) -> str:
        return f"{self.public_base_url}/sites/{quote(key)}"
