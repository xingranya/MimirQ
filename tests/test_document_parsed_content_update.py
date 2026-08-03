import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.schemas.document import (
    DocumentGovernanceState,
    DocumentParsedContentUpdateRequest,
)
from app.api.v1 import document_content
from app.models.document import Document as DBDocument
from app.models.document import DocumentParsedContent


class _Query:
    def __init__(self, value) -> None:  # noqa: ANN001
        self._value = value

    def filter(self, *_args, **_kwargs):  # noqa: ANN002, ANN003
        return self

    def first(self):  # noqa: ANN201
        return self._value


class _DB:
    def __init__(self, document, parsed_content) -> None:  # noqa: ANN001
        self.document = document
        self.parsed_content = parsed_content
        self.added: list[object] = []
        self.commits = 0

    def query(self, model):  # noqa: ANN001, ANN201
        if model is DBDocument:
            return _Query(self.document)
        if model is DocumentParsedContent:
            return _Query(self.parsed_content)
        raise AssertionError(f"Unexpected model: {model}")

    def add(self, value) -> None:  # noqa: ANN001
        self.added.append(value)
        if isinstance(value, DocumentParsedContent):
            self.parsed_content = value

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _value) -> None:  # noqa: ANN001
        return None


def test_update_document_parsed_content_persists_governance_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant_id = uuid.uuid4()
    document_id = uuid.uuid4()
    document = SimpleNamespace(
        id=document_id,
        tenant_id=tenant_id,
        dataset_id=uuid.uuid4(),
        status="completed",
        doc_metadata={"ingest_checkpoint": {"stage": "parsed"}},
    )
    parsed_content = SimpleNamespace(
        document_id=document_id,
        tenant_id=tenant_id,
        markdown_content="旧内容",
        original_markdown_content="原始内容",
    )
    db = _DB(document, parsed_content)

    monkeypatch.setattr(
        document_content.DatasetService,
        "ensure_member",
        lambda *_args, **_kwargs: None,
        raising=True,
    )
    monkeypatch.setattr(
        document_content,
        "assert_document_writable_for_lifecycle",
        lambda *_args, **_kwargs: None,
        raising=True,
    )

    response = document_content.update_document_parsed_content(
        document_id=document_id,
        payload=DocumentParsedContentUpdateRequest(
            markdown_content="治理后\x00内容",
            governance=DocumentGovernanceState(
                tags=["已审核"],
                category="合同",
                quality_score=92,
            ),
        ),
        tenant_id=tenant_id,
        account_id="account-1",
        db=db,
    )

    assert response.markdown_content == "治理后内容"
    assert response.original_markdown_content == "原始内容"
    assert parsed_content.markdown_content == "治理后内容"
    assert document.doc_metadata.get("ingest_checkpoint") is None
    assert document.doc_metadata["parsed_content_persisted"]["cleaned"] == {
        "raw_len": 5,
        "stored_len": 5,
        "truncated": False,
    }
    assert document.doc_metadata.get("governance_content_edited_at")
    assert document.doc_metadata["user"]["governance"]["tags"] == ["已审核"]
    assert document.doc_metadata["user"]["governance"]["category"] == "合同"
    assert document.doc_metadata["user"]["governance"]["quality_score"] == 92
    assert db.commits == 1


def test_update_document_parsed_content_rejects_processing_document(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant_id = uuid.uuid4()
    document_id = uuid.uuid4()
    document = SimpleNamespace(
        id=document_id,
        tenant_id=tenant_id,
        dataset_id=uuid.uuid4(),
        status="processing",
        doc_metadata={},
    )
    db = _DB(document, None)

    monkeypatch.setattr(
        document_content.DatasetService,
        "ensure_member",
        lambda *_args, **_kwargs: None,
        raising=True,
    )
    monkeypatch.setattr(
        document_content,
        "assert_document_writable_for_lifecycle",
        lambda *_args, **_kwargs: None,
        raising=True,
    )

    with pytest.raises(HTTPException) as exc_info:
        document_content.update_document_parsed_content(
            document_id=document_id,
            payload=DocumentParsedContentUpdateRequest(
                markdown_content="治理后内容",
            ),
            tenant_id=tenant_id,
            account_id="account-1",
            db=db,
        )

    assert exc_info.value.status_code == 409
    assert db.commits == 0
