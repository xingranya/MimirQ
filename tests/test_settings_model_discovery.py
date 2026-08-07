import asyncio
from uuid import uuid4

import httpx
import pytest

from app.api.v1 import settings as settings_api
from app.core.config import settings
from app.services.model_catalog_discovery import build_model_catalog_request, extract_model_ids


def test_build_model_catalog_request_supports_openai_compatible_and_ollama() -> None:
    compatible = build_model_catalog_request(
        base_url="https://models.example.com/v1",
        provider="custom",
        api_key="secret",
    )
    assert compatible.urls == ("https://models.example.com/v1/models",)
    assert compatible.headers["Authorization"] == "Bearer secret"

    ollama = build_model_catalog_request(
        base_url="http://ollama:11434/v1",
        provider="ollama",
        api_key="",
    )
    assert ollama.urls == (
        "http://ollama:11434/v1/models",
        "http://ollama:11434/api/tags",
    )
    assert "Authorization" not in ollama.headers


def test_extract_model_ids_accepts_supported_shapes_and_limits_invalid_values() -> None:
    openai_models = extract_model_ids(
        {
            "data": [
                {"id": "model-b"},
                {"id": "model-a"},
                {"id": "MODEL-A"},
                {"id": ""},
                {"id": "x" * 201},
            ]
        }
    )
    assert openai_models == ["model-a", "model-b"]

    ollama_models = extract_model_ids({"models": [{"model": "qwen:latest"}, {"name": "deepseek:8b"}]})
    assert ollama_models == ["deepseek:8b", "qwen:latest"]


def test_resolve_settings_secret_reuses_masked_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_API_KEY", "saved-llm-key", raising=False)
    monkeypatch.setattr(settings, "EMBEDDING_API_KEY", "saved-embedding-key", raising=False)

    assert settings_api._resolve_settings_secret("save***-key", category="model") == "saved-llm-key"
    assert settings_api._resolve_settings_secret("", category="embedding") == "saved-embedding-key"
    assert settings_api._resolve_settings_secret("new-key", category="model") == "new-key"


def test_discover_models_uses_saved_key_and_normalizes_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_headers: dict[str, str] = {}
    target = settings_api._ValidatedFetchTarget(
        raw="https://api.example.com/v1",
        connect_url="https://93.184.216.34:443/v1",
        host="api.example.com",
        host_header="api.example.com:443",
    )

    async def model_service_target(
        _base_url: str,
        *,
        provider: str = "",
        category: str = "model",
    ) -> object:
        assert provider == "custom"
        assert category == "model"
        return target

    def transport_handler(request: httpx.Request) -> httpx.Response:
        captured_headers.update(dict(request.headers))
        return httpx.Response(
            200,
            json={"data": [{"id": "z-model"}, {"id": "a-model"}, {"id": "a-model"}]},
        )

    def build_clients(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        transport = httpx.MockTransport(transport_handler)
        return httpx.Client(transport=transport), httpx.AsyncClient(transport=transport)

    monkeypatch.setattr(settings, "LLM_API_KEY", "saved-key", raising=False)
    monkeypatch.setattr(settings_api, "_ensure_settings_writable", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(settings_api, "_model_service_target", model_service_target)
    monkeypatch.setattr(settings_api, "_build_pinned_http_clients", build_clients)

    response = asyncio.run(
        settings_api.discover_models(
            settings_api.DiscoverModelsRequest(
                api_key="save***-key",
                api_base="https://api.example.com/v1",
                provider="custom",
            ),
            tenant_id=uuid4(),
            account_id="owner",
            db=object(),
        )
    )

    assert response.models == ["a-model", "z-model"]
    assert captured_headers["authorization"] == "Bearer saved-key"


def test_unconfigured_private_custom_service_remains_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_API_BASE", "https://api.example.com/v1", raising=False)

    assert (
        settings_api._local_model_service_target(
            "http://private-model:8000/v1",
            provider="custom",
            category="model",
        )
        is None
    )
    assert (
        settings_api._local_model_service_target(
            "http://ollama:11434/v1",
            provider="ollama",
            category="model",
        )
        is not None
    )
