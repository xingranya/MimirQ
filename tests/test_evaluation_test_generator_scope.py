from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.schemas.evaluation import TestGenFromConversationsRequest as ConversationsRequest
from app.api.schemas.evaluation import TestGenFromDocsRequest as DocumentsRequest
from app.rag.evaluation import test_generator
from app.services.dataset_service import DatasetService


class _FakeQuery:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def filter(self, *_criteria):  # noqa: ANN001
        return self

    def all(self) -> list[object]:
        return self._rows


class _FakeDB:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows
        self.rollbacks = 0

    def query(self, *_entities):  # noqa: ANN001
        return _FakeQuery(self._rows)

    def rollback(self) -> None:
        self.rollbacks += 1


def _patch_dataset_access(monkeypatch: pytest.MonkeyPatch) -> object:
    dataset = SimpleNamespace(id=uuid4())
    monkeypatch.setattr(DatasetService, "get_dataset", lambda *_args, **_kwargs: dataset)
    monkeypatch.setattr(DatasetService, "assert_dataset_readable", lambda *_args, **_kwargs: None)
    return dataset


def test_test_generation_requests_do_not_auto_save_by_default() -> None:
    assert DocumentsRequest().auto_save_as_cases is False
    assert ConversationsRequest(conversation_ids=[uuid4()]).auto_save_as_cases is False


def test_document_scope_accepts_documents_from_selected_dataset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant_id = uuid4()
    dataset_id = uuid4()
    document_ids = [uuid4(), uuid4()]
    _patch_dataset_access(monkeypatch)
    monkeypatch.setattr(
        test_generator,
        "filter_allowed_document_ids",
        lambda *_args, **_kwargs: document_ids,
    )
    db = _FakeDB([(document_ids[0],), (document_ids[1],)])

    resolved = test_generator._resolve_document_scope_ids(
        db,  # type: ignore[arg-type]
        tenant_id=tenant_id,
        account_id="account-1",
        dataset_id=dataset_id,
        document_ids=document_ids,
    )

    assert resolved == document_ids


def test_document_scope_rejects_documents_from_another_dataset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant_id = uuid4()
    dataset_id = uuid4()
    document_ids = [uuid4(), uuid4()]
    _patch_dataset_access(monkeypatch)
    monkeypatch.setattr(
        test_generator,
        "filter_allowed_document_ids",
        lambda *_args, **_kwargs: document_ids,
    )
    db = _FakeDB([(document_ids[0],)])

    with pytest.raises(HTTPException) as exc_info:
        test_generator._resolve_document_scope_ids(
            db,  # type: ignore[arg-type]
            tenant_id=tenant_id,
            account_id="account-1",
            dataset_id=dataset_id,
            document_ids=document_ids,
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Selected documents must belong to the selected dataset"


def test_dataset_scope_checks_read_access_before_listing_documents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant_id = uuid4()
    dataset_id = uuid4()
    document_ids = [uuid4(), uuid4()]
    dataset = SimpleNamespace(id=dataset_id)
    readable_calls: list[tuple[object, str]] = []
    monkeypatch.setattr(DatasetService, "get_dataset", lambda *_args, **_kwargs: dataset)
    monkeypatch.setattr(
        DatasetService,
        "assert_dataset_readable",
        lambda _db, value, account_id: readable_calls.append((value, account_id)),
    )
    monkeypatch.setattr(
        test_generator,
        "filter_allowed_document_ids",
        lambda _db, _tenant_id, _account_id, values: [values[1]],
    )
    db = _FakeDB([SimpleNamespace(id=document_id) for document_id in document_ids])

    resolved = test_generator._resolve_document_scope_ids(
        db,  # type: ignore[arg-type]
        tenant_id=tenant_id,
        account_id="account-1",
        dataset_id=dataset_id,
        document_ids=None,
    )

    assert resolved == [document_ids[1]]
    assert readable_calls == [(dataset, "account-1")]


def test_conversation_generation_hides_internal_error_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.v1 import evaluations as evaluations_api

    db = _FakeDB([])
    monkeypatch.setattr(DatasetService, "ensure_member", lambda *_args, **_kwargs: None)

    def _raise_generation_error(**_kwargs):  # noqa: ANN003
        raise RuntimeError("database connection refused")

    monkeypatch.setattr(
        evaluations_api,
        "generate_questions_from_conversations",
        _raise_generation_error,
    )

    response = evaluations_api.generate_test_cases_from_conversations(
        ConversationsRequest(conversation_ids=[uuid4()]),
        tenant_id=uuid4(),
        account_id="account-1",
        db=db,  # type: ignore[arg-type]
    )

    assert response.status == "failed"
    assert response.error_message == "暂时无法生成问题，请稍后重试。"
    assert "database connection refused" not in response.error_message
    assert db.rollbacks == 1
