"""模型服务目录发现的请求与响应解析。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse, urlunparse

_MAX_MODEL_ID_LENGTH = 200
_MAX_DISCOVERED_MODELS = 500


@dataclass(frozen=True)
class ModelCatalogRequest:
    """一次模型目录请求所需的地址和请求头。"""

    urls: tuple[str, ...]
    headers: dict[str, str]


def _append_path(base_url: str, suffix: str) -> str:
    return f"{str(base_url or '').rstrip('/')}/{suffix.lstrip('/')}"


def _origin_url(base_url: str) -> str:
    parsed = urlparse(str(base_url or "").strip())
    return urlunparse((parsed.scheme, parsed.netloc, "", "", "", "")).rstrip("/")


def build_model_catalog_request(
    *,
    base_url: str,
    provider: str,
    api_key: str,
) -> ModelCatalogRequest:
    """按供应商生成模型目录地址和鉴权头。"""

    normalized_provider = str(provider or "").strip().lower()
    normalized_base = str(base_url or "").strip().rstrip("/")
    normalized_key = str(api_key or "").strip()

    headers = {"Accept": "application/json"}
    if normalized_key:
        headers["Authorization"] = f"Bearer {normalized_key}"

    models_url = _append_path(normalized_base, "models")
    if normalized_provider == "ollama":
        return ModelCatalogRequest(
            urls=(models_url, _append_path(_origin_url(normalized_base), "api/tags")),
            headers=headers,
        )
    return ModelCatalogRequest(urls=(models_url,), headers=headers)


def extract_model_ids(payload: Any) -> list[str]:
    """兼容 OpenAI、Anthropic 与 Ollama 的模型目录响应。"""

    if isinstance(payload, list):
        candidates = payload
    elif isinstance(payload, dict):
        candidates = payload.get("data")
        if not isinstance(candidates, list):
            candidates = payload.get("models")
    else:
        candidates = None

    if not isinstance(candidates, list):
        return []

    discovered: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        if isinstance(item, str):
            raw_model_id = item
        elif isinstance(item, dict):
            raw_model_id = item.get("id") or item.get("model") or item.get("name") or ""
        else:
            continue

        model_id = str(raw_model_id or "").strip()
        if not model_id or len(model_id) > _MAX_MODEL_ID_LENGTH:
            continue
        dedupe_key = model_id.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        discovered.append(model_id)
        if len(discovered) >= _MAX_DISCOVERED_MODELS:
            break

    return sorted(discovered, key=str.casefold)


__all__ = ["ModelCatalogRequest", "build_model_catalog_request", "extract_model_ids"]
