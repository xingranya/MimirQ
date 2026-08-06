import asyncio
import io
import json
import time
import uuid
import zipfile
from pathlib import Path

import httpx
import pytest


def _result_zip(markdown: str = "# 已解析\n\n正文") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("full.md", markdown)
    return buffer.getvalue()


def _service(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):  # noqa: ANN202
    from app.services import mineru_service as module

    monkeypatch.setattr(module.settings, "UPLOAD_DIR", str(tmp_path), raising=False)
    monkeypatch.setattr(module.settings, "MINIO_ENABLED", False, raising=False)
    service = module.MinerUService()
    monkeypatch.setattr(service, "_ensure_online_enabled", lambda: None, raising=True)
    return service


def _upload_result(outcome: str = "accepted", status_code: int | None = 200):  # noqa: ANN202
    from app.services.mineru_service import MinerUUploadResult

    return MinerUUploadResult(outcome, status_code)


@pytest.mark.asyncio
async def test_cloud_parse_resumes_existing_batch_without_reupload(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    calls = {"apply": 0, "upload": 0, "wait": 0, "download": 0}
    wait_filenames: list[str] = []

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["apply"] += 1
        return {"batch_id": "batch-1", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        calls["upload"] += 1
        return _upload_result()

    async def _wait(*_args, **kwargs) -> dict[str, str]:  # noqa: ANN002, ANN003
        calls["wait"] += 1
        wait_filenames.append(str(kwargs.get("filename") or ""))
        if calls["wait"] == 1:
            raise RuntimeError("MinerU API request failed (HTTP 524)")
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    async def _download(_url: str, **_kwargs) -> bytes:  # noqa: ANN003
        calls["download"] += 1
        return _result_zip()

    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", _download, raising=True)

    with pytest.raises(RuntimeError, match="524"):
        await service.aparse_file(
            source,
            data_id=document_id,
            tenant_id=tenant_id,
            document_id=document_id,
        )

    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    assert resume_path is not None and resume_path.is_file()
    resume_payload = json.loads(resume_path.read_text(encoding="utf-8"))
    assert resume_payload["batch_id"] == "batch-1"
    assert resume_payload["phase"] == "uploaded"
    assert resume_payload["file_sha256"] == service._calculate_file_sha256(source)
    assert "upload_url" not in resume_payload
    assert "token" not in resume_payload
    assert resume_path.stat().st_mode & 0o777 == 0o600

    retry_source = tmp_path / "document-retry-with-random-name.pdf"
    retry_source.write_bytes(source.read_bytes())
    documents = await service.aparse_file(
        retry_source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert calls == {"apply": 1, "upload": 1, "wait": 2, "download": 1}
    assert wait_filenames == [source.name, source.name]
    assert documents[0].page_content == "# 已解析\n\n正文"
    assert documents[0].metadata["batch_id"] == "batch-1"
    assert not resume_path.exists()


@pytest.mark.asyncio
async def test_cloud_parse_discards_resume_state_when_batch_expired(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="expired-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="uploaded",
        file_sha256=service._calculate_file_sha256(source),
    )

    async def _expired(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        raise LookupError("task not found or expired")

    monkeypatch.setattr(service, "await_for_completion", _expired, raising=True)

    with pytest.raises(LookupError, match="expired"):
        await service.aparse_file(
            source,
            data_id=document_id,
            tenant_id=tenant_id,
            document_id=document_id,
        )

    assert resume_path is not None and not resume_path.exists()


@pytest.mark.asyncio
async def test_cloud_parse_discards_resume_state_when_batch_failed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services.mineru_service import MinerUBatchFailedError

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="failed-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="uploaded",
        file_sha256=service._calculate_file_sha256(source),
    )

    async def _failed(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        raise MinerUBatchFailedError("task failed")

    monkeypatch.setattr(service, "await_for_completion", _failed, raising=True)

    with pytest.raises(MinerUBatchFailedError, match="task failed"):
        await service.aparse_file(
            source,
            data_id=document_id,
            tenant_id=tenant_id,
            document_id=document_id,
        )

    assert resume_path is not None and not resume_path.exists()


@pytest.mark.asyncio
async def test_cloud_parse_discards_resume_state_when_source_file_changes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"old content")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="old-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="uploaded",
        file_sha256=service._calculate_file_sha256(source),
    )
    source.write_bytes(b"new content")
    calls = {"apply": 0, "upload": 0}

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["apply"] += 1
        return {"batch_id": "new-batch", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        calls["upload"] += 1
        return _upload_result()

    async def _wait(batch_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        assert batch_id == "new-batch"
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", lambda _url, **_kwargs: asyncio.sleep(0, result=_result_zip()), raising=True)

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert calls == {"apply": 1, "upload": 1}
    assert documents[0].metadata["batch_id"] == "new-batch"


@pytest.mark.asyncio
async def test_cloud_parse_recovers_after_upload_succeeds_before_state_update(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    calls = {"apply": 0, "upload": 0, "query": 0, "wait": 0}
    original_save = service._save_cloud_resume_state
    fail_uploaded_save = True

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["apply"] += 1
        return {"batch_id": "batch-interrupted", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        calls["upload"] += 1
        return _upload_result()

    def _save(*args, **kwargs) -> None:  # noqa: ANN002, ANN003
        nonlocal fail_uploaded_save
        if kwargs.get("phase") == "uploaded" and fail_uploaded_save:
            fail_uploaded_save = False
            raise OSError("simulated interruption")
        original_save(*args, **kwargs)

    async def _query(batch_id: str) -> dict[str, object]:
        calls["query"] += 1
        assert batch_id == "batch-interrupted"
        return {"extract_result": [{"data_id": document_id, "state": "running"}]}

    async def _wait(batch_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["wait"] += 1
        assert batch_id == "batch-interrupted"
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)
    monkeypatch.setattr(service, "_save_cloud_resume_state", _save, raising=True)
    monkeypatch.setattr(service, "aget_batch_results", _query, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", lambda _url, **_kwargs: asyncio.sleep(0, result=_result_zip()), raising=True)

    with pytest.raises(OSError, match="simulated interruption"):
        await service.aparse_file(source, data_id=document_id, tenant_id=tenant_id, document_id=document_id)

    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    assert resume_path is not None
    assert json.loads(resume_path.read_text(encoding="utf-8"))["phase"] == "upload_in_flight"

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert calls == {"apply": 1, "upload": 1, "query": 1, "wait": 1}
    assert documents[0].metadata["batch_id"] == "batch-interrupted"
    assert not resume_path.exists()


@pytest.mark.asyncio
async def test_cloud_parse_keeps_long_upload_in_flight_state_for_reconciliation(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="slow-upload-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="upload_in_flight",
        file_sha256=service._calculate_file_sha256(source),
        created_at=time.time() - 901,
    )
    calls = {"query": 0, "wait": 0}

    async def _query(_batch_id: str) -> dict[str, object]:
        calls["query"] += 1
        return {"extract_result": [{"data_id": document_id, "state": "running"}]}

    async def _wait(_batch_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["wait"] += 1
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    monkeypatch.setattr(service, "aget_batch_results", _query, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", lambda _url, **_kwargs: asyncio.sleep(0, result=_result_zip()), raising=True)

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert calls == {"query": 1, "wait": 1}
    assert documents[0].metadata["batch_id"] == "slow-upload-batch"
    assert resume_path is not None and not resume_path.exists()


@pytest.mark.asyncio
async def test_cloud_parse_keeps_pending_batch_after_gateway_timeout_budget(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="uncertain-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="upload_unknown",
        file_sha256=service._calculate_file_sha256(source),
    )
    monkeypatch.setattr(service, "_cloud_upload_pending_ttl_sec", lambda _phase: 0.02, raising=True)
    calls = {"query": 0, "apply": 0, "upload": 0}

    async def _gateway_timeout(_batch_id: str) -> dict[str, object]:
        calls["query"] += 1
        raise RuntimeError("MinerU API request failed (HTTP 524)")

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["apply"] += 1
        return {"batch_id": "replacement-batch", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        calls["upload"] += 1
        return _upload_result()

    async def _wait(_batch_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    monkeypatch.setattr(service, "aget_batch_results", _gateway_timeout, raising=True)
    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", lambda _url, **_kwargs: asyncio.sleep(0, result=_result_zip()), raising=True)

    from app.services.mineru_service import MinerUUploadPendingError

    with pytest.raises(MinerUUploadPendingError, match="remained unavailable"):
        await service.aparse_file(
            source,
            data_id=document_id,
            tenant_id=tenant_id,
            document_id=document_id,
        )

    assert calls["query"] >= 1
    assert calls["apply"] == calls["upload"] == 0
    assert resume_path is not None and resume_path.exists()
    assert json.loads(resume_path.read_text(encoding="utf-8"))["phase"] == "upload_unknown"


@pytest.mark.asyncio
async def test_cloud_parse_only_replaces_pending_batch_after_explicit_expiry(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="expired-pending-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="upload_unknown",
        file_sha256=service._calculate_file_sha256(source),
    )
    calls = {"apply": 0, "upload": 0}

    async def _expired(_batch_id: str) -> dict[str, object]:
        raise LookupError("task not found or expired")

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["apply"] += 1
        return {"batch_id": "replacement-batch", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        calls["upload"] += 1
        return _upload_result()

    async def _wait(_batch_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aget_batch_results", _expired, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", lambda _url, **_kwargs: asyncio.sleep(0, result=_result_zip()), raising=True)

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert calls == {"apply": 1, "upload": 1}
    assert documents[0].metadata["batch_id"] == "replacement-batch"
    assert resume_path is not None and not resume_path.exists()


def test_cloud_resume_marks_locally_expired_pending_state_for_reconciliation(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import mineru_service as module

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    file_sha256 = service._calculate_file_sha256(source)
    monkeypatch.setattr(module.settings, "MINERU_CLOUD_UPLOAD_UNKNOWN_TTL_SEC", 60, raising=False)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="stale-pending-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="upload_unknown",
        file_sha256=file_sha256,
        created_at=time.time() - 61,
    )

    state = service._load_cloud_resume_state(
        resume_path,
        data_id=document_id,
        file_sha256=file_sha256,
    )

    assert state is not None and state["expired"] is True
    assert resume_path is not None and resume_path.exists()


@pytest.mark.asyncio
async def test_cloud_parse_replaces_continuously_waiting_batch_within_same_attempt(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import mineru_service as module

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="waiting-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="upload_unknown",
        file_sha256=service._calculate_file_sha256(source),
    )
    monkeypatch.setattr(service, "_cloud_upload_pending_ttl_sec", lambda _phase: 0.02, raising=True)
    monkeypatch.setattr(module.settings, "MINERU_CLOUD_UPLOAD_RECONCILE_POLL_SEC", 0.005, raising=False)
    queries = 0
    calls = {"apply": 0, "upload": 0}

    async def _waiting(_batch_id: str) -> dict[str, object]:
        nonlocal queries
        queries += 1
        return {"extract_result": [{"data_id": document_id, "state": "waiting-file"}]}

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["apply"] += 1
        return {"batch_id": "replacement-batch", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        calls["upload"] += 1
        return _upload_result()

    async def _wait(_batch_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    monkeypatch.setattr(service, "aget_batch_results", _waiting, raising=True)
    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", lambda _url, **_kwargs: asyncio.sleep(0, result=_result_zip()), raising=True)

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert queries >= 2
    assert calls == {"apply": 1, "upload": 1}
    assert documents[0].metadata["batch_id"] == "replacement-batch"
    assert resume_path is not None and not resume_path.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "outcome", "state_kept", "retryable"),
    [
        (403, "rejected", False, True),
        (413, "rejected", False, False),
        (521, "unknown", True, True),
        (524, "unknown", True, True),
    ],
)
async def test_cloud_parse_classifies_upload_failures_without_locking_document(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    status_code: int,
    outcome: str,
    state_kept: bool,
    retryable: bool,
) -> None:
    from app.services.mineru_service import MinerUUploadPendingError, MinerUUploadRejectedError

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        return {"batch_id": f"batch-{status_code}", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        return _upload_result(outcome, status_code)

    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)

    expected_error = MinerUUploadRejectedError if outcome == "rejected" else MinerUUploadPendingError
    with pytest.raises(expected_error) as exc_info:
        await service.aparse_file(source, data_id=document_id, tenant_id=tenant_id, document_id=document_id)

    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    assert resume_path is not None
    assert resume_path.exists() is state_kept
    assert exc_info.value.retryable is retryable


@pytest.mark.asyncio
async def test_cloud_parse_keeps_uploaded_state_when_zip_url_is_temporarily_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services.mineru_service import MinerUUploadPendingError

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    calls = {"apply": 0, "upload": 0, "wait": 0}

    async def _apply(_filename: str, _data_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["apply"] += 1
        return {"batch_id": "batch-missing-zip", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str, **_kwargs):  # noqa: ANN003, ANN202
        calls["upload"] += 1
        return _upload_result()

    async def _wait(_batch_id: str, **_kwargs) -> dict[str, str]:  # noqa: ANN003
        calls["wait"] += 1
        if calls["wait"] == 1:
            return {"state": "done"}
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    monkeypatch.setattr(service, "aapply_upload_url", _apply, raising=True)
    monkeypatch.setattr(service, "aupload_file", _upload, raising=True)
    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", lambda _url, **_kwargs: asyncio.sleep(0, result=_result_zip()), raising=True)

    with pytest.raises(MinerUUploadPendingError, match="downloadable result"):
        await service.aparse_file(source, data_id=document_id, tenant_id=tenant_id, document_id=document_id)

    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    assert resume_path is not None and resume_path.is_file()

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert calls == {"apply": 1, "upload": 1, "wait": 2}
    assert documents[0].metadata["batch_id"] == "batch-missing-zip"
    assert not resume_path.exists()


@pytest.mark.asyncio
async def test_cloud_parse_reserves_deadline_for_result_download_and_finalize(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import mineru_service as module

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    tenant_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    resume_path = service._cloud_resume_state_path(tenant_id=tenant_id, document_id=document_id)
    service._save_cloud_resume_state(
        resume_path,
        batch_id="budgeted-batch",
        data_id=document_id,
        filename=source.name,
        model_version=service.model_version,
        phase="uploaded",
        file_sha256=service._calculate_file_sha256(source),
    )
    monkeypatch.setattr(module.settings, "MINERU_CLOUD_RESULT_RESERVE_SEC", 60, raising=False)
    captured: dict[str, float] = {}

    async def _wait(_batch_id: str, **kwargs) -> dict[str, str]:  # noqa: ANN003
        captured["poll_timeout"] = float(kwargs["timeout_sec"])
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    async def _download(_url: str, **kwargs) -> bytes:  # noqa: ANN003
        captured["download_timeout"] = float(kwargs["timeout_sec"])
        return _result_zip()

    monkeypatch.setattr(service, "await_for_completion", _wait, raising=True)
    monkeypatch.setattr(service, "adownload_result_zip", _download, raising=True)

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
        job_deadline_epoch=time.time() + 100,
    )

    assert 0 < captured["poll_timeout"] <= 40
    assert 0 < captured["download_timeout"] <= 40
    assert documents[0].metadata["batch_id"] == "budgeted-batch"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "expected_outcome"),
    [(200, "accepted"), (204, "accepted"), (403, "rejected"), (413, "rejected"), (521, "unknown"), (524, "unknown")],
)
async def test_cloud_upload_classifies_http_status(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    status_code: int,
    expected_outcome: str,
) -> None:
    from app.services import mineru_service as module

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")

    class _Response:
        async def aclose(self) -> None:
            return None

    response = _Response()
    response.status_code = status_code  # type: ignore[attr-defined]

    class _Pool:
        async def put(self, _url: str, **_kwargs):  # noqa: ANN003, ANN202
            return response

    monkeypatch.setattr(module, "get_http_client_pool", lambda: _Pool(), raising=True)

    result = await service.aupload_file(source, "https://mineru.invalid/upload")

    assert result.outcome == expected_outcome
    assert result.status_code == status_code


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "expected_outcome"),
    [(403, "rejected"), (413, "rejected"), (521, "unknown"), (524, "unknown")],
)
async def test_cloud_upload_classifies_http_status_errors_from_shared_client(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    status_code: int,
    expected_outcome: str,
) -> None:
    from app.services import mineru_service as module

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    request = httpx.Request("PUT", "https://mineru.invalid/upload")
    response = httpx.Response(status_code, request=request)

    class _Pool:
        async def put(self, _url: str, **_kwargs):  # noqa: ANN003, ANN202
            raise httpx.HTTPStatusError("upload failed", request=request, response=response)

    monkeypatch.setattr(module, "get_http_client_pool", lambda: _Pool(), raising=True)

    result = await service.aupload_file(source, "https://mineru.invalid/upload")

    assert result.outcome == expected_outcome
    assert result.status_code == status_code


@pytest.mark.asyncio
async def test_cloud_polling_has_total_timeout(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    service = _service(monkeypatch, tmp_path)

    async def _never_returns(_batch_id: str) -> dict[str, object]:
        await asyncio.sleep(1)
        return {"extract_result": []}

    monkeypatch.setattr(service, "aget_batch_results", _never_returns, raising=True)

    with pytest.raises(TimeoutError, match="did not finish within 0.01 seconds"):
        await service.await_for_completion("batch-timeout", timeout_sec=0.01, jitter=0)


@pytest.mark.asyncio
async def test_cloud_requests_use_external_http_client(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import mineru_service as module

    service = _service(monkeypatch, tmp_path)
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    calls: list[tuple[str, dict[str, object]]] = []

    class _Response:
        status_code = 200
        text = "markdown"
        content = b"zip"

        def json(self) -> dict[str, int]:
            return {"code": 0}

        async def aclose(self) -> None:
            return None

    class _Pool:
        async def request_with_retry(self, _method: str, _url: str, **kwargs):  # noqa: ANN003, ANN202
            calls.append(("request", kwargs))
            return _Response()

        async def put(self, _url: str, **kwargs):  # noqa: ANN003, ANN202
            calls.append(("put", kwargs))
            return _Response()

        async def get(self, _url: str, **kwargs):  # noqa: ANN003, ANN202
            calls.append(("get", kwargs))
            return _Response()

    monkeypatch.setattr(module, "get_http_client_pool", lambda: _Pool(), raising=True)

    assert await service._arequest_json("GET", "https://mineru.invalid/status") == {"code": 0}
    assert (await service.aupload_file(source, "https://mineru.invalid/upload")).accepted is True
    assert await service.adownload_result("https://mineru.invalid/result") == "markdown"
    assert await service.adownload_result_zip("https://mineru.invalid/result.zip") == b"zip"

    assert [name for name, _kwargs in calls] == ["request", "put", "get", "get"]
    assert all(kwargs["use_external_client"] is True for _name, kwargs in calls)
    assert calls[1][1]["max_retries"] == 0
