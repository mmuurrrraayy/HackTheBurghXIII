import asyncio
import json
import re
import codecs
from dataclasses import dataclass
from typing import Any

import httpx

from .errors import AppError


@dataclass(frozen=True)
class DifyConfig:
    api_key: str
    base_url: str
    timeout_ms: int


class DifyAdapter:
    def __init__(self, config: DifyConfig, transport: httpx.AsyncBaseTransport | None = None):
        self.config = config
        self._transport = transport

    async def test_connection(self) -> dict[str, str]:
        response = await self._request("GET", f"{self.config.base_url}/info")
        try:
            body = response.json()
        except ValueError as error:
            raise AppError(502, "Dify returned an invalid application info response.", "DIFY_INVALID_RESPONSE") from error
        if not isinstance(body, dict) or not isinstance(body.get("name"), str) or not isinstance(body.get("mode"), str):
            raise AppError(502, "Dify returned an invalid application info response.", "DIFY_INVALID_RESPONSE")
        return {"name": body["name"], "mode": body["mode"]}

    async def chat(self, query: str, user: str, conversation_id: str | None = None) -> dict[str, str]:
        request_body: dict[str, Any] = {
            "inputs": {},
            "query": query,
            "response_mode": "streaming",
            "user": user,
        }
        if conversation_id:
            request_body["conversation_id"] = conversation_id
        try:
            async with httpx.AsyncClient(
                timeout=self.config.timeout_ms / 1000,
                transport=self._transport,
            ) as client:
                async with client.stream(
                    "POST",
                    f"{self.config.base_url}/chat-messages",
                    headers=self._headers(),
                    json=request_body,
                ) as response:
                    self._check_response(response)
                    return await asyncio.wait_for(self._read_stream(response), self.config.timeout_ms / 1000)
        except TimeoutError as error:
            raise AppError(504, "Dify did not respond before the request timed out.", "DIFY_TIMEOUT") from error
        except httpx.TimeoutException as error:
            raise AppError(504, "Dify did not respond before the request timed out.", "DIFY_TIMEOUT") from error
        except httpx.HTTPError as error:
            raise AppError(502, "Could not reach the configured Dify service.", "DIFY_UNAVAILABLE") from error

    async def _request(self, method: str, url: str) -> httpx.Response:
        try:
            async with httpx.AsyncClient(
                timeout=self.config.timeout_ms / 1000,
                transport=self._transport,
            ) as client:
                response = await client.request(method, url, headers=self._headers())
        except httpx.TimeoutException as error:
            raise AppError(504, "Dify did not respond before the request timed out.", "DIFY_TIMEOUT") from error
        except httpx.HTTPError as error:
            raise AppError(502, "Could not reach the configured Dify service.", "DIFY_UNAVAILABLE") from error
        self._check_response(response)
        return response

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    @staticmethod
    def _check_response(response: httpx.Response) -> None:
        if response.is_success:
            return
        if response.status_code in (401, 403):
            raise AppError(502, "Dify rejected the server API key. Check DIFY_API_KEY.", "DIFY_AUTHENTICATION_FAILED")
        if response.status_code == 429:
            raise AppError(503, "Dify rate limit reached. Try again later.", "DIFY_RATE_LIMITED")
        raise AppError(502, f"Dify returned an unsuccessful response ({response.status_code}).", "DIFY_REQUEST_FAILED")

    @staticmethod
    async def _read_stream(response: httpx.Response) -> dict[str, str]:
        answer = ""
        conversation_id = ""
        got_end_event = False
        buffer = ""
        bytes_read = 0
        decoder = codecs.getincrementaldecoder("utf-8")("replace")

        async for chunk in response.aiter_bytes():
            bytes_read += len(chunk)
            if bytes_read > 64 * 1024:
                raise AppError(502, "Dify response exceeded the allowed size.", "DIFY_RESPONSE_TOO_LARGE")
            buffer += decoder.decode(chunk)
            blocks = re.split(r"\r?\n\r?\n", buffer)
            buffer = blocks.pop()
            for block in blocks:
                answer, conversation_id, got_end_event = DifyAdapter._process_event(
                    block, answer, conversation_id, got_end_event
                )
        buffer += decoder.decode(b"", final=True)
        blocks = re.split(r"\r?\n\r?\n", buffer)
        buffer = blocks.pop()
        for block in blocks:
            answer, conversation_id, got_end_event = DifyAdapter._process_event(
                block, answer, conversation_id, got_end_event
            )
        if buffer.strip():
            answer, conversation_id, got_end_event = DifyAdapter._process_event(
                buffer, answer, conversation_id, got_end_event
            )
        if not got_end_event or not answer.strip() or not conversation_id:
            raise AppError(502, "Dify ended the stream without a complete usable reply.", "DIFY_INCOMPLETE_STREAM")
        return {"answer": answer.strip(), "conversationId": conversation_id}

    @staticmethod
    def _process_event(
        block: str, answer: str, conversation_id: str, got_end_event: bool
    ) -> tuple[str, str, bool]:
        data = "\n".join(line[5:].strip() for line in block.splitlines() if line.startswith("data:"))
        if not data or data == "[DONE]":
            return answer, conversation_id, got_end_event
        try:
            event = json.loads(data)
        except json.JSONDecodeError as error:
            raise AppError(502, "Dify returned a malformed streaming event.", "DIFY_MALFORMED_STREAM") from error
        if not isinstance(event, dict):
            raise AppError(502, "Dify returned a malformed streaming event.", "DIFY_MALFORMED_STREAM")
        if isinstance(event.get("conversation_id"), str):
            conversation_id = event["conversation_id"]
        if event.get("event") == "agent_message" and isinstance(event.get("answer"), str):
            answer += event["answer"]
        elif event.get("event") == "message" and isinstance(event.get("answer"), str):
            answer = event["answer"]
        elif event.get("event") == "message_end":
            got_end_event = True
        elif event.get("event") == "error":
            raise AppError(502, "Dify reported an error while generating a response.", "DIFY_STREAM_ERROR")
        return answer, conversation_id, got_end_event
