import os
from dataclasses import dataclass
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()


def _positive_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _validated_url(name: str, value: str, default: str = "") -> str:
    url = value.strip() or default
    if not url:
        return ""
    parsed = urlparse(url)
    local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    if (parsed.scheme != "https" and not local_http) or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError(f"{name} must use HTTPS, except for localhost testing, and contain no credentials.")
    return url.rstrip("/")


@dataclass(frozen=True)
class AppConfig:
    port: int = 3001
    host: str = "127.0.0.1"
    dify_api_key: str = ""
    dify_api_base_url: str = "https://api.dify.ai/v1"
    dify_timeout_ms: int = 45_000
    safety_classifier_url: str = ""
    safety_classifier_api_key: str = ""
    safety_classifier_model: str = ""
    safety_classifier_timeout_ms: int = 8_000
    trial_action_limit: int = 12
    trial_time_limit_ms: int = 180_000
    data_directory: str = "data"

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            port=_positive_int("PORT", 3001),
            host=os.getenv("HOST", "127.0.0.1"),
            dify_api_key=os.getenv("DIFY_API_KEY", "").strip(),
            dify_api_base_url=_validated_url(
                "DIFY_API_BASE_URL",
                os.getenv("DIFY_API_BASE_URL", ""),
                "https://api.dify.ai/v1",
            ),
            dify_timeout_ms=_positive_int("DIFY_TIMEOUT_MS", 45_000),
            safety_classifier_url=_validated_url(
                "SAFETY_CLASSIFIER_URL", os.getenv("SAFETY_CLASSIFIER_URL", "")
            ),
            safety_classifier_api_key=os.getenv("SAFETY_CLASSIFIER_API_KEY", "").strip(),
            safety_classifier_model=os.getenv("SAFETY_CLASSIFIER_MODEL", "").strip(),
            safety_classifier_timeout_ms=_positive_int("SAFETY_CLASSIFIER_TIMEOUT_MS", 8_000),
            trial_action_limit=_positive_int("TRIAL_ACTION_LIMIT", 12),
            trial_time_limit_ms=_positive_int("TRIAL_TIME_LIMIT_MS", 180_000),
            data_directory=os.getenv("LABYRINTH_DATA_DIR", "data"),
        )
