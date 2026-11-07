import logging
import uuid
from pathlib import Path
from typing import Any, Callable

from datetime import datetime, timezone

from fastapi import Body, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import AppConfig
from .dify import DifyAdapter, DifyConfig
from .errors import AppError
from .safety import GoalSafetyClassifier, GoalSafetyService, OpenAICompatibleClassifier, SafetyResult
from .storage import JsonStore
from .trials import AgentClient, TrialRunner, to_summary

logger = logging.getLogger("labyrinth")


class RequestSizeLimitMiddleware:
    def __init__(self, app, maximum_bytes: int):
        self.app = app
        self.maximum_bytes = maximum_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        content_length = next(
            (value.decode("latin-1") for name, value in scope.get("headers", []) if name.lower() == b"content-length"),
            None,
        )
        try:
            if content_length is not None and int(content_length) > self.maximum_bytes:
                await self._too_large(send)
                return
        except ValueError:
            await self._too_large(send)
            return

        chunks = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunks.extend(message.get("body", b""))
            if len(chunks) > self.maximum_bytes:
                await self._too_large(send)
                return
            more_body = message.get("more_body", False)
        body = bytes(chunks)
        sent = False

        async def replay_receive():
            nonlocal sent
            if sent:
                return {"type": "http.request", "body": b"", "more_body": False}
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay_receive, send)

    @staticmethod
    async def _too_large(send):
        body = json.dumps({
            "error": {"code": "REQUEST_TOO_LARGE", "message": "Request body exceeds the allowed size."}
        }).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode("ascii"))],
        })
        await send({"type": "http.response.body", "body": body})


class UnconfiguredClassifier:
    async def classify(self, _goal: str) -> SafetyResult:
        raise AppError(
            503,
            "Goal safety validation is not configured. Please contact the application administrator.",
            "GOAL_SAFETY_UNAVAILABLE",
        )


def create_app(
    config: AppConfig,
    store: JsonStore,
    *,
    safety_classifier: GoalSafetyClassifier | None = None,
    dify_factory: Callable[[], DifyAdapter] | None = None,
    agent_client_factory: Callable[[str], AgentClient] | None = None,
    serve_frontend: bool = False,
) -> FastAPI:
    app = FastAPI(title="Labyrinth Backend", docs_url=None, redoc_url=None)
    app.add_middleware(RequestSizeLimitMiddleware, maximum_bytes=32 * 1024)
    adapter_factory = dify_factory or (
        lambda: DifyAdapter(DifyConfig(config.dify_api_key, config.dify_api_base_url, config.dify_timeout_ms))
    )
    if safety_classifier is None:
        if config.safety_classifier_url and config.safety_classifier_api_key and config.safety_classifier_model:
            safety_classifier = OpenAICompatibleClassifier(
                config.safety_classifier_url,
                config.safety_classifier_api_key,
                config.safety_classifier_model,
                config.safety_classifier_timeout_ms,
            )
        else:
            safety_classifier = UnconfiguredClassifier()
    goal_safety = GoalSafetyService(safety_classifier)

    def get_agent_client(agent_id: str) -> AgentClient:
        if not store.get_agent(agent_id):
            raise AppError(404, "Selected agent was not found.", "AGENT_NOT_FOUND")
        ensure_dify_configured(config)
        if agent_client_factory:
            return agent_client_factory(agent_id)
        return adapter_factory()

    runner = TrialRunner(store, config.trial_action_limit, config.trial_time_limit_ms, get_agent_client)
    app.state.config = config
    app.state.store = store
    app.state.runner = runner

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, error: AppError):
        if error.status >= 500:
            logger.error("[%s] %s", error.code, error.message)
        return JSONResponse(
            status_code=error.status,
            content={"error": {"code": error.code, "message": error.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, _error: RequestValidationError):
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "INVALID_JSON", "message": "Request body must be valid JSON."}},
        )

    @app.get("/health")
    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/agents")
    async def list_agents():
        return {"agents": store.list_agents()}

    @app.post("/api/agents")
    async def register_agent(body: Any = Body(...)):
        ensure_dify_configured(config)
        if not isinstance(body, dict):
            raise AppError(400, "A JSON request body is required.", "INVALID_AGENT_CONFIGURATION")
        name = body.get("name")
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 60:
            raise AppError(400, "Agent name must be between 2 and 60 characters.", "INVALID_AGENT_NAME")
        if body.get("provider") != "dify":
            raise AppError(400, "Only the server-configured Dify provider is supported currently.", "UNSUPPORTED_PROVIDER")
        if set(body) != {"name", "provider"}:
            raise AppError(
                400,
                "Unexpected agent configuration. Provider credentials must remain server-side.",
                "INVALID_AGENT_CONFIGURATION",
            )
        info = await adapter_factory().test_connection()
        if info["mode"] not in {"agent", "agent-chat"}:
            raise AppError(422, f'The configured Dify application is "{info["mode"]}", not an Agent application.', "DIFY_WRONG_APP_TYPE")
        name = name.strip()
        existing = store.list_agents()
        if existing:
            if existing[0]["name"] == name:
                return {"agent": existing[0]}
            raise AppError(
                409,
                "This backend currently supports one Dify app/API key. Configure that app before registering another agent.",
                "DIFY_AGENT_ALREADY_REGISTERED",
            )
        agent = {
            "id": str(uuid.uuid4()),
            "name": name,
            "provider": "dify",
            "createdAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        return JSONResponse(status_code=201, content={"agent": store.add_agent(agent)})

    @app.post("/api/dify/test")
    async def test_dify():
        ensure_dify_configured(config)
        return {"connected": True, **(await adapter_factory().test_connection())}

    @app.post("/api/agents/{agent_id}/test")
    async def test_agent(agent_id: str):
        agent = store.get_agent(agent_id)
        if not agent:
            raise AppError(404, "Agent was not found.", "AGENT_NOT_FOUND")
        ensure_dify_configured(config)
        adapter = adapter_factory()
        info = await adapter.test_connection()
        if info["mode"] not in {"agent", "agent-chat"}:
            raise AppError(422, "The configured Dify application is not an Agent application.", "DIFY_WRONG_APP_TYPE")
        reply = await adapter.chat(
            "Reply with exactly this text and no other content: LABYRINTH_CONNECTION_OK",
            f"labyrinth-connection-test-{uuid.uuid4()}",
        )
        if reply["answer"] != "LABYRINTH_CONNECTION_OK" or not reply["conversationId"]:
            raise AppError(502, "Dify did not return a usable response.", "DIFY_UNUSABLE_RESPONSE")
        return {
            "connected": True,
            "usable": True,
            "agentId": agent["id"],
            "applicationName": info["name"],
        }

    @app.post("/api/trials")
    async def start_trial(body: Any = Body(...)):
        if not isinstance(body, dict):
            raise AppError(400, "A JSON request body is required.", "INVALID_TRIAL_REQUEST")
        agent_id = body.get("agentId")
        if not isinstance(agent_id, str) or not agent_id:
            raise AppError(400, "Select an agent before starting a trial.", "INVALID_AGENT_ID")
        goal = body.get("goal")
        if not isinstance(goal, str) or not 5 <= len(goal.strip()) <= 300:
            raise AppError(400, "Goal must be between 5 and 300 characters.", "INVALID_GOAL")
        prompt = body.get("prompt", "")
        if not isinstance(prompt, str) or len(prompt) > 500:
            raise AppError(400, "Agent prompt must be 500 characters or fewer.", "INVALID_AGENT_PROMPT")
        difficulty = body.get("difficulty")
        if type(difficulty) is not int or not 0 <= difficulty <= 100:
            raise AppError(400, "Difficulty must be a whole number from 0 to 100.", "INVALID_DIFFICULTY")
        goal = goal.strip()
        prompt = prompt.strip()
        safety_input = f"{goal}\nAdditional agent prompt: {prompt}" if prompt else goal
        try:
            safety = await goal_safety.evaluate(safety_input)
        except AppError as error:
            if not error.code.startswith("GOAL_SAFETY_"):
                raise
            unavailable = SafetyResult(
                "review",
                "Goal safety validation is unavailable. Please try again later.",
                "safety_service_unavailable",
            )
            _record_safety(store, unavailable)
            return JSONResponse(
                status_code=503,
                content={"error": {
                    "code": error.code,
                    "message": unavailable.reason,
                    "safety": unavailable.to_dict(),
                }},
            )
        _record_safety(store, safety)
        if safety.decision == "block":
            return JSONResponse(status_code=403, content={"error": {
                "code": "GOAL_SAFETY_BLOCKED",
                "message": "This goal may involve unsafe or unauthorised activity. Please enter a legitimate website-navigation task.",
                "safety": safety.to_dict(),
            }})
        if safety.decision == "review":
            return JSONResponse(status_code=422, content={"error": {
                "code": "GOAL_SAFETY_REVIEW",
                "message": safety.reason,
                "safety": safety.to_dict(),
            }})
        if runner.active_count >= 3:
            raise AppError(429, "The server is already running the maximum number of trials.", "TRIAL_CAPACITY_REACHED")
        ensure_dify_configured(config)
        trial = runner.start(agent_id, goal, difficulty, prompt)
        return JSONResponse(status_code=202, content={"trial": to_summary(trial)})

    @app.get("/api/trials")
    async def list_trials():
        return {"trials": [to_summary(trial) for trial in store.list_trials()]}

    @app.get("/api/trials/{trial_id}")
    async def get_trial(trial_id: str):
        trial = store.get_trial(trial_id)
        if not trial:
            raise AppError(404, "Trial was not found.", "TRIAL_NOT_FOUND")
        return {"trial": to_summary(trial)}

    @app.get("/api/trials/{trial_id}/events")
    async def get_trial_events(trial_id: str):
        trial = store.get_trial(trial_id)
        if not trial:
            raise AppError(404, "Trial was not found.", "TRIAL_NOT_FOUND")
        return {"events": trial["events"]}

    if serve_frontend:
        dist = Path("dist").resolve()
        assets = dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        async def frontend_index():
            return FileResponse(dist / "index.html")

        @app.get("/{full_path:path}")
        async def frontend_routes(full_path: str):
            if full_path == "api" or full_path.startswith("api/") or full_path == "health":
                raise AppError(404, "Route was not found.", "NOT_FOUND")
            candidate = (dist / full_path).resolve()
            if candidate.is_relative_to(dist) and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


def ensure_dify_configured(config: AppConfig) -> None:
    if not config.dify_api_key:
        raise AppError(503, "Dify is not configured. Set DIFY_API_KEY in the backend environment.", "DIFY_NOT_CONFIGURED")


def _record_safety(store: JsonStore, result: SafetyResult) -> None:
    from .trials import _now

    try:
        store.record_safety_decision({
            "timestamp": _now(),
            "decision": result.decision,
            "category": result.category,
        })
    except Exception as error:
        raise AppError(503, "Goal safety validation is unavailable. Please try again later.", "GOAL_SAFETY_AUDIT_FAILED") from error
