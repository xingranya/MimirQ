from datetime import UTC, datetime
from typing import Any

from app.api.schemas.document import DocumentGovernanceState


def apply_document_governance_state(
    document: Any,
    governance: DocumentGovernanceState | None,
) -> None:
    """将治理状态写入用户元数据，并保留同命名空间内的其他字段。"""
    if governance is None:
        return

    metadata = dict(getattr(document, "doc_metadata", None) or {})
    current_user = metadata.get("user")
    user_metadata = dict(current_user) if isinstance(current_user, dict) else {}
    governance_payload = governance.model_dump(mode="json")
    governance_payload["saved_at"] = datetime.now(UTC).isoformat()
    user_metadata["governance"] = governance_payload
    metadata["user"] = user_metadata
    document.doc_metadata = metadata
