from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1 import settings as settings_api


def _rag(**overrides):
    values = {
        "chunk_size": 1000,
        "chunk_overlap": 200,
        "chunk_min_chars": 30,
        "retrieval_top_k": 5,
        "similarity_threshold": 0.7,
        "default_parser_backend": "auto",
        "default_chunk_strategy": "langchain_recursive",
        "bm25_index_enabled": True,
        "enable_reranker": False,
        "reranker_provider": "llm",
        "reranker_top_n": 20,
        "show_image_in_answer": True,
        "image_append_max": 3,
    }
    values.update(overrides)
    return settings_api.RAGConfig(**values)


@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ({"chunk_size": 0}, "greater than or equal to 1"),
        ({"chunk_overlap": -1}, "greater than or equal to 0"),
        ({"chunk_size": 200, "chunk_overlap": 200}, "less than chunk_size"),
        ({"retrieval_top_k": 0}, "greater than or equal to 1"),
        ({"similarity_threshold": 1.1}, "less than or equal to 1"),
    ],
)
def test_rag_model_rejects_values_that_downstream_cannot_use(
    patch: dict[str, object],
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        _rag(**patch)


@pytest.mark.parametrize(
    ("provider", "message"),
    [
        ("none", "不能选择"),
        ("weighted", "单独配置权重"),
    ],
)
def test_enabled_reranker_rejects_non_executable_default_provider(
    provider: str,
    message: str,
) -> None:
    request = settings_api.UpdateSettingsRequest(
        rag=_rag(enable_reranker=True, reranker_provider=provider)
    )

    with pytest.raises(HTTPException, match=message):
        settings_api._validate_rag_update(request)


def test_ltr_requires_an_active_model(monkeypatch: pytest.MonkeyPatch) -> None:
    request = settings_api.UpdateSettingsRequest(
        rag=_rag(enable_reranker=True, reranker_provider="ltr")
    )
    monkeypatch.setattr(settings_api, "_ltr_reranker_ready", lambda: False)

    with pytest.raises(HTTPException, match="激活一个模型"):
        settings_api._validate_rag_update(request)


def test_ltr_accepts_an_existing_model_path(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    model_path = tmp_path / "model.json"
    model_path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(settings_api.settings, "LTR_MODEL_PATH", str(model_path), raising=False)

    request = settings_api.UpdateSettingsRequest(
        rag=_rag(enable_reranker=True, reranker_provider="ltr")
    )

    settings_api._validate_rag_update(request)


def test_local_bge_is_valid_as_default_reranker() -> None:
    request = settings_api.UpdateSettingsRequest(
        rag=_rag(enable_reranker=True, reranker_provider="local_bge_v2_m3")
    )

    settings_api._validate_rag_update(request)
