from fastapi import APIRouter

from app.api.schemas.connector import ConnectorInfo
from app.core.config import settings
from app.services.connector_registry import list_connector_definitions

router = APIRouter()


@router.get("")
def list_connectors() -> list[ConnectorInfo]:
    """返回连接器目录及不含敏感配置的可用状态。"""
    return [
        ConnectorInfo(
            id=definition.connector_id,
            name=definition.name,
            description=definition.description,
            available=not definition.requires_url_ingest or bool(settings.URL_INGEST_ENABLED),
            unavailable_reason=(
                "网页导入服务未启用，请联系管理员"
                if definition.requires_url_ingest and not bool(settings.URL_INGEST_ENABLED)
                else None
            ),
            supports_incremental=definition.supports_incremental,
            supports_resume=definition.supports_resume,
            supports_full_reconcile=definition.supports_full_reconcile,
            sync_cursor_kind=definition.sync_cursor_kind,
        )
        for definition in list_connector_definitions()
    ]
