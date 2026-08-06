import asyncio
import io
import json
import uuid
import zipfile
from pathlib import Path

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

    async def _apply(_filename: str, _data_id: str) -> dict[str, str]:
        calls["apply"] += 1
        return {"batch_id": "batch-1", "upload_url": "https://upload.invalid/secret"}

    async def _upload(_file_path: Path, _upload_url: str) -> bool:
        calls["upload"] += 1
        return True

    async def _wait(*_args, **_kwargs) -> dict[str, str]:  # noqa: ANN002, ANN003
        calls["wait"] += 1
        if calls["wait"] == 1:
            raise RuntimeError("MinerU API request failed (HTTP 524)")
        return {"state": "done", "full_zip_url": "https://download.invalid/result.zip"}

    async def _download(_url: str) -> bytes:
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
    assert "upload_url" not in resume_payload
    assert "token" not in resume_payload

    documents = await service.aparse_file(
        source,
        data_id=document_id,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert calls == {"apply": 1, "upload": 1, "wait": 2, "download": 1}
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
    assert await service.aupload_file(source, "https://mineru.invalid/upload") is True
    assert await service.adownload_result("https://mineru.invalid/result") == "markdown"
    assert await service.adownload_result_zip("https://mineru.invalid/result.zip") == b"zip"

    assert [name for name, _kwargs in calls] == ["request", "put", "get", "get"]
    assert all(kwargs["use_external_client"] is True for _name, kwargs in calls)
