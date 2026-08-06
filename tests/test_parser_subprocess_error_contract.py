import uuid

import pytest

from app.parsing import subprocess_runner, subprocess_worker
from app.parsing.errors import ParsingError
from app.services.mineru_service import (
    MinerUBatchFailedError,
    MinerUUploadPendingError,
    MinerUUploadRejectedError,
)


def test_worker_serializes_mineru_terminal_failure_contract() -> None:
    error = subprocess_worker._serialize_worker_error(
        MinerUBatchFailedError("MinerU batch entered failed state")
    )

    assert error["type"] == "MinerUBatchFailedError"
    assert error["code"] == "mineru_batch_failed"
    assert error["retryable"] is False


def test_worker_serializes_mineru_pending_upload_contract() -> None:
    serialized = subprocess_worker._serialize_worker_error(
        MinerUUploadPendingError("MinerU upload state is not confirmed")
    )

    error = subprocess_runner.classify_parser_subprocess_error(
        subprocess_runner.SubprocessWorkerError(
            str(serialized["message"]),
            details=serialized,
        )
    )

    assert serialized["type"] == "MinerUUploadPendingError"
    assert error.code == "mineru_upload_pending"
    assert error.retryable is True


@pytest.mark.parametrize(("status_code", "retryable"), [(403, True), (413, False)])
def test_worker_preserves_mineru_upload_rejection_retryability(status_code: int, retryable: bool) -> None:
    serialized = subprocess_worker._serialize_worker_error(MinerUUploadRejectedError(status_code))

    error = subprocess_runner.classify_parser_subprocess_error(
        subprocess_runner.SubprocessWorkerError(
            str(serialized["message"]),
            details=serialized,
        )
    )

    assert error.code == "mineru_upload_rejected"
    assert error.retryable is retryable


@pytest.mark.asyncio
async def test_mineru_terminal_failure_is_not_retried_in_subprocess_layer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    serialized = subprocess_worker._serialize_worker_error(
        MinerUBatchFailedError("MinerU batch entered failed state")
    )

    async def _raise_terminal_failure(**_kwargs):  # noqa: ANN003, ANN202
        nonlocal calls
        calls += 1
        raise subprocess_runner.SubprocessWorkerError(
            str(serialized["message"]),
            details=serialized,
        )

    monkeypatch.setattr(
        subprocess_runner,
        "run_subprocess_worker",
        _raise_terminal_failure,
        raising=True,
    )

    with pytest.raises(ParsingError) as exc_info:
        await subprocess_runner.run_parser_subprocess(
            tenant_id=uuid.uuid4(),
            payload={"action": "parse_documents"},
            max_attempts=2,
            base_delay_sec=0,
        )

    assert calls == 1
    assert exc_info.value.code == "mineru_batch_failed"
    assert exc_info.value.retryable is False
