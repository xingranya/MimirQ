import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.api.v1.pipeline_support.governance_profiles import (
    governance_profile_timestamps_match,
)

PIPELINE_SOURCE = Path("app/api/v1/pipeline.py").read_text(encoding="utf-8")
PIPELINE_TREE = ast.parse(PIPELINE_SOURCE)


def _function_source(name: str) -> str:
    for node in PIPELINE_TREE.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return ast.get_source_segment(PIPELINE_SOURCE, node) or ""
    raise AssertionError(f"未找到函数：{name}")


def test_governance_profile_writes_require_admin_permission() -> None:
    for function_name in (
        "create_governance_profile",
        "update_governance_profile",
        "delete_governance_profile",
        "import_governance_profiles",
    ):
        source = _function_source(function_name)
        assert "_ensure_governance_profile_write(db, tenant_id, account_id)" in source


def test_governance_profile_update_checks_locked_version() -> None:
    source = _function_source("update_governance_profile")
    assert "db.refresh(row, with_for_update=True)" in source
    assert "governance_profile_timestamps_match" in source
    assert "status_code=409" in source


def test_governance_profile_timestamp_match_handles_timezones() -> None:
    current = datetime(2026, 8, 4, 0, 0, tzinfo=timezone.utc)
    same_in_east_eight = current.astimezone(timezone(timedelta(hours=8)))

    assert governance_profile_timestamps_match(current, same_in_east_eight)
    assert governance_profile_timestamps_match(current.replace(tzinfo=None), current)
    assert not governance_profile_timestamps_match(
        current,
        current + timedelta(microseconds=1),
    )
    assert not governance_profile_timestamps_match(None, current)
    assert governance_profile_timestamps_match(current, None)
