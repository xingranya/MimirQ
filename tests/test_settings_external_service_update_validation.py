from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import settings as settings_api


def _request(*, minio=None, dify=None):
    return SimpleNamespace(minio=minio, dify_external_knowledge=dify)


def test_minio_documents_require_enabled_store() -> None:
    with pytest.raises(HTTPException, match="启用文档对象存储"):
        settings_api._validate_external_service_update(
            {
                "MINIO_ENABLED": "false",
                "MINIO_DOCUMENTS_ENABLED": "true",
            },
            _request(minio=object()),
        )


def test_minio_enabled_requires_complete_effective_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings_api.settings, "MINIO_ACCESS_KEY", "", raising=False)
    monkeypatch.setattr(settings_api.settings, "MINIO_SECRET_KEY", "", raising=False)

    with pytest.raises(HTTPException, match="Access Key 和 Secret Key"):
        settings_api._validate_external_service_update(
            {
                "MINIO_ENABLED": "true",
                "MINIO_DOCUMENTS_ENABLED": "true",
                "MINIO_ENDPOINT": "mimirq-minio:9000",
                "MINIO_BUCKET_NAME": "mimirq",
            },
            _request(minio=object()),
        )


def test_minio_masked_values_reuse_existing_process_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings_api.settings, "MINIO_ACCESS_KEY", "saved-access", raising=False)
    monkeypatch.setattr(settings_api.settings, "MINIO_SECRET_KEY", "saved-secret", raising=False)

    settings_api._validate_external_service_update(
        {
            "MINIO_ENABLED": "true",
            "MINIO_DOCUMENTS_ENABLED": "true",
            "MINIO_ENDPOINT": "mimirq-minio:9000",
            "MINIO_BUCKET_NAME": "mimirq",
        },
        _request(minio=object()),
    )


def test_dify_mapped_mode_requires_at_least_one_binding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings_api, "is_production_env", lambda: False)

    with pytest.raises(HTTPException, match="至少配置一条知识绑定"):
        settings_api._validate_external_service_update(
            {
                "DIFY_EXTERNAL_KNOWLEDGE_ENABLED": "true",
                "DIFY_EXTERNAL_KNOWLEDGE_API_KEYS": "valid-key",
                "DIFY_EXTERNAL_KNOWLEDGE_ACCOUNT_ID": "system:dify",
                "DIFY_EXTERNAL_KNOWLEDGE_MAP_JSON": "",
                "DIFY_EXTERNAL_KNOWLEDGE_RESOLUTION_MODE": "mapped_only",
            },
            _request(dify=object()),
        )


def test_dify_mapped_mode_rejects_empty_binding_object(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings_api, "is_production_env", lambda: False)

    with pytest.raises(HTTPException, match="至少配置一条知识绑定"):
        settings_api._validate_external_service_update(
            {
                "DIFY_EXTERNAL_KNOWLEDGE_ENABLED": "true",
                "DIFY_EXTERNAL_KNOWLEDGE_API_KEYS": "valid-key",
                "DIFY_EXTERNAL_KNOWLEDGE_ACCOUNT_ID": "system:dify",
                "DIFY_EXTERNAL_KNOWLEDGE_MAP_JSON": "{}",
                "DIFY_EXTERNAL_KNOWLEDGE_RESOLUTION_MODE": "mapped_only",
            },
            _request(dify=object()),
        )


def test_dify_rejects_invalid_dataset_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings_api, "is_production_env", lambda: False)

    with pytest.raises(HTTPException, match="有效的数据集 UUID"):
        settings_api._validate_external_service_update(
            {
                "DIFY_EXTERNAL_KNOWLEDGE_ENABLED": "true",
                "DIFY_EXTERNAL_KNOWLEDGE_API_KEYS": "valid-key",
                "DIFY_EXTERNAL_KNOWLEDGE_ACCOUNT_ID": "system:dify",
                "DIFY_EXTERNAL_KNOWLEDGE_MAP_JSON": '{"kb_policy":["not-a-uuid"]}',
                "DIFY_EXTERNAL_KNOWLEDGE_RESOLUTION_MODE": "mapped_only",
            },
            _request(dify=object()),
        )


def test_dify_accepts_valid_binding_and_existing_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings_api, "is_production_env", lambda: False)
    monkeypatch.setattr(
        settings_api.settings,
        "DIFY_EXTERNAL_KNOWLEDGE_API_KEYS",
        "saved-key",
        raising=False,
    )

    settings_api._validate_external_service_update(
        {
            "DIFY_EXTERNAL_KNOWLEDGE_ENABLED": "true",
            "DIFY_EXTERNAL_KNOWLEDGE_ACCOUNT_ID": "system:dify",
            "DIFY_EXTERNAL_KNOWLEDGE_MAP_JSON": (
                '{"kb_policy":["00000000-0000-4000-8000-000000000001"]}'
            ),
            "DIFY_EXTERNAL_KNOWLEDGE_RESOLUTION_MODE": "mapped_only",
        },
        _request(dify=object()),
    )


def test_dify_requires_tenant_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings_api, "is_production_env", lambda: True)

    with pytest.raises(HTTPException, match="必须填写租户 ID"):
        settings_api._validate_external_service_update(
            {
                "DIFY_EXTERNAL_KNOWLEDGE_ENABLED": "true",
                "DIFY_EXTERNAL_KNOWLEDGE_API_KEYS": "valid-key",
                "DIFY_EXTERNAL_KNOWLEDGE_ACCOUNT_ID": "system:dify",
                "DIFY_EXTERNAL_KNOWLEDGE_MAP_JSON": (
                    '{"kb_policy":["00000000-0000-4000-8000-000000000001"]}'
                ),
                "DIFY_EXTERNAL_KNOWLEDGE_RESOLUTION_MODE": "mapped_only",
            },
            _request(dify=object()),
        )
