import time

import pytest

from app.core.config import settings
from app.services import chat_execution_runtime


@pytest.mark.asyncio
async def test_mock_mode_bypasses_provider_configuration_and_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "", raising=False)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_AVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_CIRCUIT_KEY", "")

    class UnexpectedAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            raise AssertionError("mock mode must not create an external HTTP client")

    monkeypatch.setattr(chat_execution_runtime.httpx, "AsyncClient", UnexpectedAsyncClient)

    assert await chat_execution_runtime.preflight_model_provider_fast() == (True, None)


@pytest.mark.asyncio
async def test_disabling_mock_mode_invalidates_mock_availability_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "", raising=False)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_AVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_CIRCUIT_KEY", "")

    assert await chat_execution_runtime.preflight_model_provider_fast() == (True, None)

    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", False, raising=False)
    available, reason = await chat_execution_runtime.preflight_model_provider_fast()

    assert available is False
    assert reason == "LLM_API_KEY/LLM_API_BASE/LLM_MODEL is not configured"


def test_enabling_mock_mode_invalidates_an_open_provider_circuit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "", raising=False)
    monkeypatch.setattr(
        chat_execution_runtime,
        "_MODEL_PROVIDER_CIRCUIT_KEY",
        chat_execution_runtime._model_provider_circuit_key(),
    )
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", time.monotonic() + 60.0)

    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", True, raising=False)

    assert chat_execution_runtime.is_model_provider_unavailable_circuit_open() is False


@pytest.mark.asyncio
async def test_mock_preflight_ignores_a_previous_real_provider_outage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "", raising=False)
    monkeypatch.setattr(
        chat_execution_runtime,
        "_MODEL_PROVIDER_CIRCUIT_KEY",
        chat_execution_runtime._model_provider_circuit_key(),
    )
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_AVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", time.monotonic() + 60.0)

    class UnexpectedAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            raise AssertionError("mock mode must not probe a previously unavailable provider")

    monkeypatch.setattr(chat_execution_runtime.httpx, "AsyncClient", UnexpectedAsyncClient)
    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", True, raising=False)

    assert await chat_execution_runtime.preflight_model_provider_fast() == (True, None)
    assert chat_execution_runtime._MODEL_PROVIDER_UNAVAILABLE_UNTIL == 0.0


@pytest.mark.asyncio
async def test_local_provider_preflight_accepts_empty_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_headers: dict[str, str] = {}

    class SuccessfulResponse:
        status_code = 200
        text = ""

    class SuccessfulAsyncClient:
        def __init__(self, *args, **kwargs) -> None:  # noqa: ANN002, ANN003, ARG002
            pass

        async def __aenter__(self):  # noqa: ANN204
            return self

        async def __aexit__(self, *args) -> None:  # noqa: ANN002
            return None

        async def post(self, _url: str, *, headers: dict[str, str], json: dict) -> SuccessfulResponse:  # noqa: ARG002
            captured_headers.update(headers)
            return SuccessfulResponse()

    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "http://ollama:11434/v1", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "qwen3:8b", raising=False)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_AVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_CIRCUIT_KEY", "")
    monkeypatch.setattr(chat_execution_runtime.httpx, "AsyncClient", SuccessfulAsyncClient)

    assert await chat_execution_runtime.preflight_model_provider_fast() == (True, None)
    assert captured_headers["Authorization"] == "Bearer local-endpoint-no-auth"


@pytest.mark.asyncio
async def test_provider_preflight_allows_normal_response_latency(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class SuccessfulResponse:
        status_code = 200
        text = ""

    class SuccessfulAsyncClient:
        def __init__(self, *args, timeout, **kwargs) -> None:  # noqa: ANN002, ANN003, ARG002
            captured["timeout"] = timeout

        async def __aenter__(self):  # noqa: ANN204
            return self

        async def __aexit__(self, *args) -> None:  # noqa: ANN002
            return None

        async def post(self, *_args, **_kwargs) -> SuccessfulResponse:  # noqa: ANN002, ANN003
            return SuccessfulResponse()

    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "https://provider.example/v1", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "test-model", raising=False)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_AVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_CIRCUIT_KEY", "")
    monkeypatch.setattr(chat_execution_runtime.httpx, "AsyncClient", SuccessfulAsyncClient)

    assert await chat_execution_runtime.preflight_model_provider_fast() == (True, None)
    timeout = captured["timeout"]
    assert timeout.connect == 5.0
    assert timeout.read == 180.0


def test_reset_model_provider_availability_clears_cached_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "https://provider.example/v1", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "test-model", raising=False)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_AVAILABLE_UNTIL", time.monotonic() + 60.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", time.monotonic() + 60.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_CIRCUIT_KEY", "stale")

    chat_execution_runtime.reset_model_provider_availability()

    assert chat_execution_runtime._MODEL_PROVIDER_CIRCUIT_KEY == chat_execution_runtime._model_provider_circuit_key()
    assert chat_execution_runtime._MODEL_PROVIDER_AVAILABLE_UNTIL == 0.0
    assert chat_execution_runtime._MODEL_PROVIDER_UNAVAILABLE_UNTIL == 0.0


def test_mark_model_provider_available_closes_open_circuit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_MOCK_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key", raising=False)
    monkeypatch.setattr(settings, "LLM_API_BASE", "https://provider.example/v1", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL", "test-model", raising=False)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_AVAILABLE_UNTIL", 0.0)
    monkeypatch.setattr(chat_execution_runtime, "_MODEL_PROVIDER_UNAVAILABLE_UNTIL", time.monotonic() + 60.0)
    monkeypatch.setattr(
        chat_execution_runtime,
        "_MODEL_PROVIDER_CIRCUIT_KEY",
        chat_execution_runtime._model_provider_circuit_key(),
    )

    chat_execution_runtime.mark_model_provider_available(ttl_sec=30.0)

    assert chat_execution_runtime.is_model_provider_unavailable_circuit_open() is False
    assert chat_execution_runtime._MODEL_PROVIDER_AVAILABLE_UNTIL > time.monotonic()
