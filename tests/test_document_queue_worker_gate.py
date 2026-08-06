import time
import uuid

import pytest


class _WorkerRegistryRedis:
    def __init__(
        self,
        *,
        workers_active: int = 0,
        fail: bool = False,
        enqueue_results: list[object | None] | None = None,
    ) -> None:
        self.workers_active = workers_active
        self.fail = fail
        self.enqueue_results = list(enqueue_results or [])
        self.prune_calls: list[tuple[str, str, float]] = []
        self.enqueued: list[tuple[tuple[object, ...], dict[str, object]]] = []

    async def zremrangebyscore(self, key: str, minimum: str, maximum: float) -> None:
        if self.fail:
            raise ConnectionError("redis unavailable")
        self.prune_calls.append((key, minimum, maximum))

    async def zcard(self, key: str) -> int:
        if self.fail:
            raise ConnectionError("redis unavailable")
        assert key == "ops:task_queue:workers:documents"
        return self.workers_active

    async def enqueue_job(self, *args, **kwargs):  # noqa: ANN002, ANN003, ANN202
        self.enqueued.append((args, kwargs))
        if self.enqueue_results:
            return self.enqueue_results.pop(0)
        return type("Job", (), {"job_id": kwargs.get("_job_id")})()


@pytest.mark.asyncio
async def test_active_worker_count_prunes_stale_heartbeats(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import task_queue_observability_service as observability

    redis = _WorkerRegistryRedis(workers_active=2)
    monkeypatch.setattr(observability, "_heartbeat_ttl_sec", lambda: 30, raising=True)

    before = time.time() - 31
    count = await observability.count_active_task_workers(redis=redis, queue_name="documents")

    assert count == 2
    assert len(redis.prune_calls) == 1
    key, minimum, cutoff = redis.prune_calls[0]
    assert key == "ops:task_queue:workers:documents"
    assert minimum == "-inf"
    assert before <= cutoff <= time.time() - 29


@pytest.mark.asyncio
async def test_document_enqueue_rejects_when_no_worker_is_active(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.tasks import queue

    redis = _WorkerRegistryRedis(workers_active=0)

    async def _get_queue():  # noqa: ANN202
        return redis

    monkeypatch.setattr(queue, "get_queue", _get_queue, raising=True)
    monkeypatch.setattr(queue.settings, "TASK_QUEUE_NAME", "documents", raising=False)

    with pytest.raises(queue.TaskEnqueueRejectedError, match="no active document worker"):
        await queue.enqueue_document_processing(
            tenant_id=uuid.uuid4(),
            document_id=uuid.uuid4(),
            requested_by="member-1",
            job_id="doc:1",
        )

    assert redis.enqueued == []


@pytest.mark.asyncio
async def test_document_enqueue_rejects_when_worker_health_cannot_be_checked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.tasks import queue

    redis = _WorkerRegistryRedis(fail=True)

    async def _get_queue():  # noqa: ANN202
        return redis

    monkeypatch.setattr(queue, "get_queue", _get_queue, raising=True)
    monkeypatch.setattr(queue.settings, "TASK_QUEUE_NAME", "documents", raising=False)

    with pytest.raises(queue.TaskEnqueueRejectedError, match="unable to verify"):
        await queue.enqueue_document_processing(
            tenant_id=uuid.uuid4(),
            document_id=uuid.uuid4(),
            requested_by="member-1",
            job_id="doc:2",
        )

    assert redis.enqueued == []


@pytest.mark.asyncio
async def test_document_enqueue_succeeds_when_worker_is_active(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.tasks import queue

    redis = _WorkerRegistryRedis(workers_active=1)

    async def _get_queue():  # noqa: ANN202
        return redis

    monkeypatch.setattr(queue, "get_queue", _get_queue, raising=True)
    monkeypatch.setattr(queue.settings, "TASK_QUEUE_NAME", "documents", raising=False)

    task_id = await queue.enqueue_document_processing(
        tenant_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        requested_by="member-1",
        job_id="doc:3",
    )

    assert task_id == "doc:3"
    assert len(redis.enqueued) == 1
    args, kwargs = redis.enqueued[0]
    assert args[0] == "process_document_job"
    assert kwargs["_queue_name"] == "documents"


@pytest.mark.asyncio
async def test_document_enqueue_treats_live_duplicate_as_idempotent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.tasks import queue

    redis = _WorkerRegistryRedis(workers_active=1, enqueue_results=[None])

    async def _get_queue():  # noqa: ANN202
        return redis

    async def _get_status(_job_id: str) -> str:
        return "in_progress"

    monkeypatch.setattr(queue, "get_queue", _get_queue, raising=True)
    monkeypatch.setattr(queue, "get_task_job_status", _get_status, raising=True)
    monkeypatch.setattr(queue.settings, "TASK_QUEUE_NAME", "documents", raising=False)

    task_id = await queue.enqueue_document_processing(
        tenant_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        requested_by="member-1",
        job_id="doc:live",
    )

    assert task_id == "doc:live"
    assert len(redis.enqueued) == 1


@pytest.mark.asyncio
async def test_document_enqueue_uses_new_job_id_after_terminal_duplicate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.tasks import queue

    redis = _WorkerRegistryRedis(
        workers_active=1,
        enqueue_results=[None, type("Job", (), {"job_id": None})()],
    )

    async def _get_queue():  # noqa: ANN202
        return redis

    async def _get_status(_job_id: str) -> str:
        return "complete"

    monkeypatch.setattr(queue, "get_queue", _get_queue, raising=True)
    monkeypatch.setattr(queue, "get_task_job_status", _get_status, raising=True)
    monkeypatch.setattr(queue.settings, "TASK_QUEUE_NAME", "documents", raising=False)

    task_id = await queue.enqueue_document_processing(
        tenant_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        requested_by="member-1",
        job_id="doc:complete",
    )

    assert task_id.startswith("doc:complete:attempt:")
    assert len(redis.enqueued) == 2
    assert redis.enqueued[1][1]["_job_id"] == task_id


@pytest.mark.asyncio
async def test_document_enqueue_rejects_unverifiable_duplicate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.tasks import queue

    redis = _WorkerRegistryRedis(workers_active=1, enqueue_results=[None])

    async def _get_queue():  # noqa: ANN202
        return redis

    async def _get_status(_job_id: str) -> None:
        return None

    monkeypatch.setattr(queue, "get_queue", _get_queue, raising=True)
    monkeypatch.setattr(queue, "get_task_job_status", _get_status, raising=True)
    monkeypatch.setattr(queue.settings, "TASK_QUEUE_NAME", "documents", raising=False)

    with pytest.raises(queue.TaskEnqueueRejectedError, match="status=missing"):
        await queue.enqueue_document_processing(
            tenant_id=uuid.uuid4(),
            document_id=uuid.uuid4(),
            requested_by="member-1",
            job_id="doc:unknown",
        )

    assert len(redis.enqueued) == 1
