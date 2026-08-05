import asyncio
from types import SimpleNamespace

import pytest


def _langchain_options() -> SimpleNamespace:
    return SimpleNamespace(
        execution=SimpleNamespace(
            db=None,
            request_id="cancel-cleanup-test",
            dataset_id_used=None,
            rag_config_template_meta=None,
        ),
        heartbeat_sec=0.0,
        disconnect_check=None,
    )


@pytest.mark.asyncio
async def test_langchain_stream_cancels_producer_when_consumer_is_cancelled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.chat_stream_langchain as stream_module

    started = asyncio.Event()
    cleaned_up = asyncio.Event()
    producer_tasks: list[asyncio.Task[None]] = []

    async def produce_forever(**_kwargs) -> None:  # noqa: ANN003
        producer_tasks.append(asyncio.current_task())
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cleaned_up.set()

    monkeypatch.setattr(stream_module, "produce_langchain_stream_events", produce_forever)
    stream = stream_module.stream_langchain_chat_session_events(
        engine=object(),
        options=_langchain_options(),
    )
    consumer = asyncio.create_task(anext(stream))
    await asyncio.wait_for(started.wait(), timeout=1)

    consumer.cancel()
    try:
        with pytest.raises(asyncio.CancelledError):
            await consumer
        assert cleaned_up.is_set()
        assert all(task.done() for task in producer_tasks)
    finally:
        for task in producer_tasks:
            task.cancel()
        await asyncio.gather(*producer_tasks, return_exceptions=True)
        await stream.aclose()


@pytest.mark.asyncio
async def test_langchain_stream_aclose_cancels_producer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.chat_stream_langchain as stream_module

    cleaned_up = asyncio.Event()
    producer_tasks: list[asyncio.Task[None]] = []

    async def produce_one_event_then_wait(*, queue, **_kwargs) -> None:  # noqa: ANN001, ANN003
        producer_tasks.append(asyncio.current_task())
        try:
            await queue.put({"type": "token", "data": {"content": "x"}})
            await asyncio.Event().wait()
        finally:
            cleaned_up.set()

    monkeypatch.setattr(
        stream_module,
        "produce_langchain_stream_events",
        produce_one_event_then_wait,
    )
    stream = stream_module.stream_langchain_chat_session_events(
        engine=object(),
        options=_langchain_options(),
    )
    assert "\"content\": \"x\"" in await anext(stream)

    try:
        await stream.aclose()
        assert cleaned_up.is_set()
        assert all(task.done() for task in producer_tasks)
    finally:
        for task in producer_tasks:
            task.cancel()
        await asyncio.gather(*producer_tasks, return_exceptions=True)


@pytest.mark.asyncio
async def test_langchain_stream_times_out_before_first_model_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.chat_stream_langchain as stream_module
    from app.core.config import settings

    cleaned_up = asyncio.Event()

    async def produce_citations_then_wait(*, queue, **_kwargs) -> None:  # noqa: ANN001, ANN003
        try:
            await queue.put({"type": "citations", "data": [{"document_id": "doc-1"}]})
            await asyncio.Event().wait()
        finally:
            cleaned_up.set()

    monkeypatch.setattr(settings, "LLM_TIMEOUT", 0.03, raising=False)
    monkeypatch.setattr(
        stream_module,
        "produce_langchain_stream_events",
        produce_citations_then_wait,
    )
    options = _langchain_options()
    options.heartbeat_sec = 0.01
    stream = stream_module.stream_langchain_chat_session_events(
        engine=object(),
        options=options,
    )

    assert '"type": "citations"' in await anext(stream)
    with pytest.raises(TimeoutError, match="before first token"):
        while True:
            await anext(stream)
    assert cleaned_up.is_set()


@pytest.mark.asyncio
async def test_langchain_stream_first_token_timeout_ignores_non_token_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.chat_stream_langchain as stream_module
    from app.core.config import settings

    cleaned_up = asyncio.Event()

    async def produce_progress_without_tokens(*, queue, **_kwargs) -> None:  # noqa: ANN001, ANN003
        try:
            await queue.put({"type": "citations", "data": [{"document_id": "doc-1"}]})
            while True:
                await queue.put({"type": "progress", "data": {"status": "waiting"}})
                await asyncio.sleep(0.005)
        finally:
            cleaned_up.set()

    monkeypatch.setattr(settings, "LLM_TIMEOUT", 0.03, raising=False)
    monkeypatch.setattr(
        stream_module,
        "produce_langchain_stream_events",
        produce_progress_without_tokens,
    )
    options = _langchain_options()
    stream = stream_module.stream_langchain_chat_session_events(
        engine=object(),
        options=options,
    )

    assert '"type": "citations"' in await anext(stream)

    async def consume_until_timeout() -> None:
        while True:
            await anext(stream)

    with pytest.raises(TimeoutError, match="before first token"):
        await asyncio.wait_for(consume_until_timeout(), timeout=0.3)
    assert cleaned_up.is_set()


def _graph_options() -> SimpleNamespace:
    return SimpleNamespace(
        execution=SimpleNamespace(
            db=None,
            tenant_id="tenant-1",
            conversation_id=None,
            request_id="graph-timeout-test",
            dataset_id_used=None,
            effective_rag_config=SimpleNamespace(retrieval_mode="hybrid"),
            rag_config_template_meta=None,
        )
    )


@pytest.mark.asyncio
async def test_graph_stream_times_out_when_model_blocks_after_citations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.chat_stream_graph as stream_module
    from app.core.config import settings

    cleaned_up = asyncio.Event()

    async def stream_citations_then_wait(**_kwargs):  # noqa: ANN003, ANN202
        try:
            yield {"type": "citations", "data": [{"document_id": "doc-1"}]}
            await asyncio.Event().wait()
        finally:
            cleaned_up.set()

    monkeypatch.setattr(settings, "LLM_TIMEOUT", 0.03, raising=False)
    monkeypatch.setattr(
        stream_module,
        "stream_graph_chat_events",
        stream_citations_then_wait,
    )
    stream = stream_module.stream_graph_chat_session_events(options=_graph_options())

    assert (await anext(stream))["type"] == "citations"
    with pytest.raises(TimeoutError, match="before first token"):
        await asyncio.wait_for(anext(stream), timeout=0.3)
    assert cleaned_up.is_set()


@pytest.mark.asyncio
async def test_graph_stream_first_token_timeout_ignores_non_token_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.chat_stream_graph as stream_module
    from app.core.config import settings

    cleaned_up = asyncio.Event()

    async def stream_progress_without_tokens(**_kwargs):  # noqa: ANN003, ANN202
        try:
            yield {"type": "citations", "data": [{"document_id": "doc-1"}]}
            while True:
                yield {"type": "graph", "data": {"status": "waiting"}}
                await asyncio.sleep(0.005)
        finally:
            cleaned_up.set()

    monkeypatch.setattr(settings, "LLM_TIMEOUT", 0.03, raising=False)
    monkeypatch.setattr(
        stream_module,
        "stream_graph_chat_events",
        stream_progress_without_tokens,
    )
    stream = stream_module.stream_graph_chat_session_events(options=_graph_options())

    assert (await anext(stream))["type"] == "citations"

    async def consume_until_timeout() -> None:
        while True:
            await anext(stream)

    with pytest.raises(TimeoutError, match="before first token"):
        await asyncio.wait_for(consume_until_timeout(), timeout=0.3)
    assert cleaned_up.is_set()


async def _multi_agent_stream(monkeypatch: pytest.MonkeyPatch, run_sub_agent):  # noqa: ANN001, ANN202
    import app.rag.agents.multi_agent as multi_agent

    engine = SimpleNamespace(
        _score_question_complexity=lambda *_args: 300.0,
        _select_llm=lambda *_args: (SimpleNamespace(model_name="fake"), "fast", "test"),
    )
    runner = multi_agent.MultiAgentRAGRunner(engine)

    async def decompose(**_kwargs):  # noqa: ANN202
        return [
            multi_agent.MultiAgentPlanStep(query="one", rationale="test"),
            multi_agent.MultiAgentPlanStep(query="two", rationale="test"),
        ]

    monkeypatch.setattr(runner, "_decompose", decompose)
    monkeypatch.setattr(runner, "_run_sub_agent", run_sub_agent)
    monkeypatch.setattr(multi_agent, "build_rag_state", lambda **kwargs: dict(kwargs))
    return runner.stream(request=multi_agent.AgenticStreamRequest(question="question"))


async def _advance_multi_agent_to_fanout(stream) -> asyncio.Task:  # noqa: ANN001
    assert (await anext(stream))["type"] == "route"
    assert (await anext(stream))["data"]["step"] == "planning"
    assert (await anext(stream))["data"]["status"] == "started"
    assert (await anext(stream))["data"]["status"] == "started"
    return asyncio.create_task(anext(stream))


@pytest.mark.asyncio
async def test_multi_agent_consumer_cancellation_cleans_up_all_fanout_tasks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = asyncio.Event()
    blocker = asyncio.Event()
    task_by_index: dict[int, asyncio.Task] = {}
    cancelled: set[int] = set()

    async def run_sub_agent(*, index, **_kwargs):  # noqa: ANN001, ANN003, ANN202
        task_by_index[index] = asyncio.current_task()
        if len(task_by_index) == 2:
            started.set()
        try:
            await blocker.wait()
        except asyncio.CancelledError:
            cancelled.add(index)
            raise

    stream = await _multi_agent_stream(monkeypatch, run_sub_agent)
    consumer = await _advance_multi_agent_to_fanout(stream)
    await asyncio.wait_for(started.wait(), timeout=1)

    consumer.cancel()
    try:
        with pytest.raises(asyncio.CancelledError):
            await consumer
        assert cancelled == {1, 2}
        assert all(task.done() for task in task_by_index.values())
    finally:
        for task in task_by_index.values():
            task.cancel()
        await asyncio.gather(*task_by_index.values(), return_exceptions=True)
        await stream.aclose()


@pytest.mark.asyncio
async def test_multi_agent_child_failure_cleans_up_other_fanout_tasks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    second_started = asyncio.Event()
    task_by_index: dict[int, asyncio.Task] = {}
    cancelled: set[int] = set()

    async def run_sub_agent(*, index, **_kwargs):  # noqa: ANN001, ANN003, ANN202
        task_by_index[index] = asyncio.current_task()
        if index == 1:
            await second_started.wait()
            raise RuntimeError("sub-agent failed")
        second_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.add(index)
            raise

    stream = await _multi_agent_stream(monkeypatch, run_sub_agent)
    consumer = await _advance_multi_agent_to_fanout(stream)

    try:
        with pytest.raises(RuntimeError, match="sub-agent failed"):
            await consumer
        assert cancelled == {2}
        assert all(task.done() for task in task_by_index.values())
    finally:
        for task in task_by_index.values():
            task.cancel()
        await asyncio.gather(*task_by_index.values(), return_exceptions=True)
        await stream.aclose()
