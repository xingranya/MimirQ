from types import SimpleNamespace

from app.api.schemas.document import DocumentGovernanceState
from app.services.document_governance_state import apply_document_governance_state


def test_apply_document_governance_state_preserves_other_user_metadata() -> None:
    document = SimpleNamespace(
        doc_metadata={
            "parser_backend": "mineru",
            "user": {"tags": ["保留标签"], "owner_note": "保留说明"},
        }
    )
    governance = DocumentGovernanceState(
        annotations=[
            {
                "id": "annotation-1",
                "text": "见外传媒",
                "type": "entity",
                "label": "机构",
                "start": 0,
                "end": 4,
            }
        ],
        tags=["品牌", "品牌", "知识库"],
        category="产品资料",
        quality_score=96,
        issues=[],
    )

    apply_document_governance_state(document, governance)

    assert document.doc_metadata["parser_backend"] == "mineru"
    assert document.doc_metadata["user"]["tags"] == ["保留标签"]
    assert document.doc_metadata["user"]["owner_note"] == "保留说明"
    saved = document.doc_metadata["user"]["governance"]
    assert saved["tags"] == ["品牌", "知识库"]
    assert saved["category"] == "产品资料"
    assert saved["quality_score"] == 96
    assert saved["saved_at"]


def test_apply_document_governance_state_ignores_missing_payload() -> None:
    document = SimpleNamespace(doc_metadata={"user": {"tags": ["原标签"]}})

    apply_document_governance_state(document, None)

    assert document.doc_metadata == {"user": {"tags": ["原标签"]}}
