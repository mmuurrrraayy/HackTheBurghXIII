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
    site_base_url: str = "http://localhost:5173"
    api_base_url: str = "http://127.0.0.1:3001"
    run_max_duration_ms: int = 600_000
    villain_dify_api_key: str = ""
    demo_mode: bool = False  # pretend villain and pretend agent for showcasing the loop (no Dify needed)
    demo_rounds: int = 4  # demo: one new trap per round (see backend/demo_villain.py)
    demo_attempts: int = 5  # demo: each attempt gets one round further, the last clears every round
    demo_pause_s: float = 3.0  # demo: pause before re-running with the improvement applied
    villain_dify_api_base_url: str = ""  # empty: same Dify site as the agent (dify_api_base_url)
    loop_max_rounds: int = 3
    loop_agent_timeout_ms: int = 300_000
    s3_bucket: str = ""
    s3_prefix: str = "labyrinth"
    s3_region: str = ""
    site_link_expiry_s: int = 86_400

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            port=_positive_int("PORT", 3001),
            host=os.getenv("HOST") or "127.0.0.1",
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
            data_directory=os.getenv("LABYRINTH_DATA_DIR") or "data",
            site_base_url=_validated_url(
                "SITE_BASE_URL", os.getenv("SITE_BASE_URL", ""), "http://localhost:5173"
            ),
            api_base_url=_validated_url(
                "API_BASE_URL", os.getenv("API_BASE_URL", ""), "http://127.0.0.1:3001"
            ),
            run_max_duration_ms=_positive_int("RUN_MAX_DURATION_MS", 600_000),
            # villain.py reads DIFY_KEY, so accept it as a fallback for the villain app's key.
            villain_dify_api_key=(os.getenv("VILLAIN_DIFY_API_KEY") or os.getenv("DIFY_KEY") or "").strip(),
            demo_mode=os.getenv("DEMO_MODE", "").strip().lower() in {"1", "true", "yes", "on"},
            villain_dify_api_base_url=_validated_url(
                "DIFY_API_VILLAIN_URL",
                os.getenv("DIFY_API_VILLAIN_URL") or os.getenv("VILLAIN_DIFY_API_BASE_URL") or "",
            ),
            loop_max_rounds=_positive_int("LOOP_MAX_ROUNDS", 3),
            loop_agent_timeout_ms=_positive_int("LOOP_AGENT_TIMEOUT_MS", 300_000),
            s3_bucket=os.getenv("S3_BUCKET", "").strip(),
            s3_prefix=os.getenv("S3_PREFIX", "labyrinth").strip(),
            s3_region=os.getenv("S3_REGION", "").strip(),
            # Presigned S3 links cannot outlive 7 days.
            site_link_expiry_s=min(_positive_int("SITE_LINK_EXPIRY_S", 86_400), 604_800),
        )
