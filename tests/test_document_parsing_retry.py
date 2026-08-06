import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.parsing.errors import ParsingError, ParsingInternalError


class _RetryError(Exception):
    def __init__(self, *, defer: int) -> None:
        super().__init__(f"retry defer={defer}")
        self.defer = defer


class _Query:
    def __init__(self, document) -> None:  # noqa: ANN001
        self.document = document

    def filter(self, *_args, **_kwargs):  # noqa: ANN002, ANN003, ANN201
        return self

    def with_for_update(self):  # noqa: ANN201
        return self

    def first(self):  # noqa: ANN201
        return self.document


class _DB:
    def __init__(self, document) -> None:  # noqa: ANN001
        self.document = document

    def query(self, _model):  # noqa: ANN001, ANN201
        return _Query(self.document)

    def commit(self) -> None:
        return None

    def close(self) -> None:
        return None


def _document(source: Path, *, processing_attempts: int = 0):
    return SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        dataset_id=uuid.uuid4(),
        doc_metadata={"pipeline_hash": "pipeline-1"},
        file_path=str(source),
        file_type=source.suffix.lstrip("."),
        processing_attempts=processing_attempts,
        status="pending",
        processing_progress=0,
        current_stage="queued",
        failed_stage=None,
        error_code=None,
        next_retry_at=None,
        error_message=None,
    )


def _configure_document_job(monkeypatch: pytest.MonkeyPatch, document, db: _DB) -> None:  # noqa: ANN001
    from app.tasks import jobs

    async def _acquire(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        return None

    async def _lock(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        return True

    async def _release(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        return None

    async def _update_status(_db, _tenant_id, _document_id, status, progress, stage, **kwargs):  # noqa: ANN001, ANN202
        document.status = status
        document.processing_progress = progress
        document.current_stage = stage
        for key, value in kwargs.items():
            setattr(document, key, value)

    async def _raise_parsing_error(**_kwargs):  # noqa: ANN003, ANN202
        raise ParsingInternalError("upstream gateway returned 524")

    monkeypatch.setattr(jobs, "SessionLocal", lambda: db, raising=True)
    monkeypatch.setattr(jobs, "get_retry_exc", lambda: _RetryError, raising=True)
    monkeypatch.setattr(jobs, "_task_queue_redis_or_retry", lambda *_args, **_kwargs: object(), raising=True)
    monkeypatch.setattr(jobs, "tenant_acquire", _acquire, raising=True)
    monkeypatch.setattr(jobs, "dataset_acquire", _acquire, raising=True)
    monkeypatch.setattr(jobs, "_acquire_task_lock_or_retry", _lock, raising=True)
    monkeypatch.setattr(jobs, "release_lock", _release, raising=True)
    monkeypatch.setattr(jobs, "dataset_release", _release, raising=True)
    monkeypatch.setattr(jobs, "tenant_release", _release, raising=True)
    monkeypatch.setattr(jobs.document_processor, "_update_status", _update_status, raising=True)
    monkeypatch.setattr(jobs, "_run_document_processing_without_blocking_event_loop", _raise_parsing_error, raising=True)
    monkeypatch.setattr(jobs.settings, "TASK_DOCUMENT_JOB_MAX_TRIES", 80, raising=False)
    monkeypatch.setattr(jobs.settings, "TASK_DOCUMENT_PARSE_MAX_TRIES", 3, raising=False)
    monkeypatch.setattr(jobs.settings, "TASK_DOCUMENT_RETRY_DEFER_SEC", 30, raising=False)


@pytest.mark.asyncio
async def test_document_job_records_retry_state_for_temporary_parsing_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.tasks import jobs

    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    document = _document(source)
    db = _DB(document)
    _configure_document_job(monkeypatch, document, db)

    with pytest.raises(_RetryError) as exc_info:
        await jobs.process_document_job(
            {"job_try": 3, "redis": object()},
            str(document.tenant_id),
            str(document.id),
            "member-1",
        )

    assert exc_info.value.defer == 30
    assert document.status == "processing"
    assert document.current_stage == "retry_wait"
    assert document.processing_attempts == 1
    assert document.failed_stage == "parsing"
    assert document.error_code == "internal"
    assert document.next_retry_at is not None
    assert document.error_message == "解析服务暂时不可用，系统将在 30 秒后自动重试"


@pytest.mark.asyncio
async def test_document_job_stops_after_bounded_parsing_retries(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.tasks import jobs

    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    document = _document(source, processing_attempts=2)
    db = _DB(document)
    _configure_document_job(monkeypatch, document, db)

    result = await jobs.process_document_job(
        {"job_try": 3, "redis": object()},
        str(document.tenant_id),
        str(document.id),
        "member-1",
    )

    assert result["ok"] is False
    assert result["reason"] == "parsing_internal"
    assert document.status == "failed"
    assert document.current_stage == "failed"
    assert document.failed_stage == "parsing"
    assert document.next_retry_at is None
    assert document.error_message == "解析服务连续失败，自动重试已停止，请稍后重新处理"
    assert document.processing_attempts == 3


@pytest.mark.asyncio
async def test_document_job_does_not_retry_mineru_terminal_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.tasks import jobs

    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    document = _document(source)
    db = _DB(document)
    _configure_document_job(monkeypatch, document, db)

    async def _raise_terminal_failure(**_kwargs):  # noqa: ANN003, ANN202
        raise ParsingError(
            "MinerU batch entered failed state",
            code="mineru_batch_failed",
            retryable=False,
        )

    monkeypatch.setattr(
        jobs,
        "_run_document_processing_without_blocking_event_loop",
        _raise_terminal_failure,
        raising=True,
    )

    result = await jobs.process_document_job(
        {"job_try": 1, "redis": object()},
        str(document.tenant_id),
        str(document.id),
        "member-1",
    )

    assert result["ok"] is False
    assert result["reason"] == "parsing_mineru_batch_failed"
    assert document.processing_attempts == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("integrated", [False, True])
async def test_parsing_stage_preserves_retryable_error_type(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    integrated: bool,
) -> None:
    from app.parsing.processors.support import stages

    source = tmp_path / "document.txt"
    source.write_text("content", encoding="utf-8")
    strategy = "integrated_parent_child" if integrated else "langchain_recursive"
    error = ParsingInternalError("upstream gateway returned 521")

    class _Service:
        INTEGRATED_PIPELINE_STRATEGIES = {"integrated_parent_child"}

        def _record_processing_metadata(self, *_args, **_kwargs) -> None:  # noqa: ANN002, ANN003
            return None

        def _build_cancel_check(self, **_kwargs):  # noqa: ANN003, ANN201
            async def _not_cancelled() -> bool:
                return False

            return _not_cancelled

    class _StageDB:
        def commit(self) -> None:
            return None

        def refresh(self, _document) -> None:  # noqa: ANN001
            return None

    async def _raise_error(**_kwargs):  # noqa: ANN003, ANN202
        raise error

    monkeypatch.setattr(stages.chunker_factory, "resolve_strategy", lambda _value: strategy, raising=True)
    monkeypatch.setattr(stages, "run_parser_subprocess", _raise_error, raising=True)
    monkeypatch.setattr(stages.settings, "PARSE_CACHE_ENABLED", False, raising=False)

    with pytest.raises(ParsingInternalError) as exc_info:
        await stages.ParsingStage(_Service()).run(
            db=_StageDB(),
            db_document=SimpleNamespace(doc_metadata={}),
            file_path=source,
            document_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            dataset_id=str(uuid.uuid4()),
            parser_backend="auto",
            chunk_strategy=strategy,
        )

    assert exc_info.value is error


@pytest.mark.asyncio
async def test_mineru_ingest_uses_single_subprocess_attempt(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.parsing.processors.support import stages

    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.4")
    error = ParsingInternalError("MinerU cloud polling timed out")
    captured: dict[str, object] = {}

    class _Service:
        INTEGRATED_PIPELINE_STRATEGIES: set[str] = set()

        def _build_cancel_check(self, **_kwargs):  # noqa: ANN003, ANN201
            async def _not_cancelled() -> bool:
                return False

            return _not_cancelled

    class _StageDB:
        def commit(self) -> None:
            return None

        def refresh(self, _document) -> None:  # noqa: ANN001
            return None

    async def _capture_and_raise(**kwargs):  # noqa: ANN003, ANN202
        captured.update(kwargs)
        raise error

    monkeypatch.setattr(
        stages.chunker_factory,
        "resolve_strategy",
        lambda _value: "langchain_recursive",
        raising=True,
    )
    monkeypatch.setattr(stages, "run_parser_subprocess", _capture_and_raise, raising=True)
    monkeypatch.setattr(stages.settings, "PARSE_CACHE_ENABLED", False, raising=False)

    with pytest.raises(ParsingInternalError) as exc_info:
        await stages.ParsingStage(_Service()).run(
            db=_StageDB(),
            db_document=SimpleNamespace(doc_metadata={}),
            file_path=source,
            document_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            dataset_id=str(uuid.uuid4()),
            parser_backend="mineru",
            chunk_strategy="langchain_recursive",
        )

    assert exc_info.value is error
    assert captured["max_attempts"] == 1
