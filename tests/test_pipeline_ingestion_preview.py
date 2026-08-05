import json
import uuid
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_account_id
from app.api.dependencies.tenant import get_tenant_id
from app.core.database import get_db


def test_ingestion_preview_accepts_sync_clean_preview_and_policy_override(monkeypatch, tmp_path) -> None:
    import app.api.v1.pipeline as pipeline_module
    from app.services.dataset_service import DatasetService

    tenant_id = uuid.uuid4()
    dataset_id = uuid.uuid4()

    monkeypatch.setattr(pipeline_module.settings, "UPLOAD_DIR", str(tmp_path), raising=False)
    monkeypatch.setattr(pipeline_module.settings, "MAX_FILE_SIZE", 1024 * 1024, raising=False)

    monkeypatch.setattr(DatasetService, "ensure_member", lambda *_a, **_k: None, raising=True)
    monkeypatch.setattr(DatasetService, "get_dataset", lambda *_a, **_k: object(), raising=True)
    monkeypatch.setattr(DatasetService, "assert_dataset_readable", lambda *_a, **_k: None, raising=True)
    writable_checks: list[object] = []
    monkeypatch.setattr(
        DatasetService,
        "assert_dataset_writable",
        lambda *_a, **_k: writable_checks.append(object()),
        raising=True,
    )

    async def _fake_save_upload_file(file, path, *, max_bytes):  # noqa: ANN001, ANN202
        path.write_bytes(await file.read())

    async def _fake_run_subprocess_worker(*, tenant_id, payload, disconnect_check, timeout_sec):  # noqa: ANN001, ANN202
        return {
            "backend": "basic",
            "markdown": "# Preview\n\nHello",
            "images": [],
        }

    monkeypatch.setattr(pipeline_module, "save_upload_file", _fake_save_upload_file, raising=True)
    monkeypatch.setattr(pipeline_module, "_dataset_metadata_dict", lambda _dataset: {}, raising=True)
    monkeypatch.setattr(pipeline_module, "parse_ingestion_policy_from_metadata", lambda _meta: None, raising=True)
    matched_policies: list[object | None] = []

    def _fake_match_ingestion_rule(policy, *, filename, file_ext):  # noqa: ANN001, ANN202, ARG001
        matched_policies.append(policy)
        return None

    monkeypatch.setattr(pipeline_module, "match_ingestion_rule", _fake_match_ingestion_rule, raising=True)
    monkeypatch.setattr(
        pipeline_module,
        "_resolve_ingestion_preview_config",
        lambda **_kwargs: SimpleNamespace(
            preprocess_steps=[],
            patch_dict={},
            parser_backend_choice="basic",
        ),
        raising=True,
    )
    monkeypatch.setattr(
        pipeline_module,
        "_preprocess_ingestion_preview_file",
        lambda temp_path, _steps: (
            temp_path,
            {"changed": False, "size_before": 0, "size_after": 0, "steps": [], "warnings": []},
        ),
        raising=True,
    )
    monkeypatch.setattr(
        pipeline_module,
        "resolve_pipeline_effective",
        lambda **_kwargs: {"governance_enabled": True},
        raising=True,
    )
    monkeypatch.setattr(pipeline_module, "run_subprocess_worker", _fake_run_subprocess_worker, raising=True)
    monkeypatch.setattr(
        pipeline_module,
        "_build_ingestion_clean_preview_request",
        lambda **_kwargs: object(),
        raising=True,
    )
    monkeypatch.setattr(
        pipeline_module,
        "clean_preview",
        lambda **_kwargs: pipeline_module.CleanPreviewResponse(
            markdown="Hello",
            applied_rules=0,
            changed=False,
        ),
        raising=True,
    )
    monkeypatch.setattr(
        pipeline_module,
        "_ingestion_preview_rule_output",
        lambda _matched_rule, _config: {
            "matched": False,
            "preprocess_steps": [],
            "parser_backend": "basic",
            "chunk_strategy": "",
        },
        raising=True,
    )
    monkeypatch.setattr(
        pipeline_module,
        "_ingestion_preview_explain",
        lambda **_kwargs: {"source": "test"},
        raising=True,
    )

    def _override_get_db():  # noqa: ANN202
        yield object()

    app = FastAPI()
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_tenant_id] = lambda: tenant_id
    app.dependency_overrides[get_current_account_id] = lambda: "test-account"
    app.include_router(pipeline_module.router, prefix="/api/v1/pipeline")
    client = TestClient(app)

    response = client.post(
        "/api/v1/pipeline/ingestion-preview",
        data={"dataset_id": str(dataset_id)},
        files={"file": ("preview.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["clean"]["markdown"] == "Hello"
    assert body["parse"]["backend"] == "basic"
    assert matched_policies == [None]
    assert writable_checks == []

    policy_json = json.dumps(
        {
            "version": "1",
            "rules": [
                {
                    "id": "draft-rule",
                    "name": "草稿规则",
                    "match": {"extensions": [".txt"]},
                }
            ],
        }
    )
    override_response = client.post(
        "/api/v1/pipeline/ingestion-preview",
        data={"dataset_id": str(dataset_id), "policy_json": policy_json},
        files={"file": ("preview.txt", b"hello", "text/plain")},
    )

    assert override_response.status_code == 200, override_response.text
    assert len(writable_checks) == 1
    override_policy = matched_policies[-1]
    assert override_policy is not None
    assert override_policy.rules[0].id == "draft-rule"

    invalid_response = client.post(
        "/api/v1/pipeline/ingestion-preview",
        data={"dataset_id": str(dataset_id), "policy_json": '{"version":"2","rules":[]}'},
        files={"file": ("preview.txt", b"hello", "text/plain")},
    )

    assert invalid_response.status_code == 400
    assert invalid_response.json()["detail"] == "Invalid ingestion policy"

    def _deny_write(*_args, **_kwargs):  # noqa: ANN202
        raise HTTPException(status_code=403, detail="No dataset write access")

    monkeypatch.setattr(DatasetService, "assert_dataset_writable", _deny_write, raising=True)
    forbidden_response = client.post(
        "/api/v1/pipeline/ingestion-preview",
        data={"dataset_id": str(dataset_id), "policy_json": policy_json},
        files={"file": ("preview.txt", b"hello", "text/plain")},
    )

    assert forbidden_response.status_code == 403
