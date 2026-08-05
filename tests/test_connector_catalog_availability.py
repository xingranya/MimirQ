from app.api.v1 import connectors_catalog


def _connector_map() -> dict[str, object]:
    return {connector.id: connector for connector in connectors_catalog.list_connectors()}


def test_url_connectors_report_disabled_service(monkeypatch) -> None:
    monkeypatch.setattr(connectors_catalog.settings, "URL_INGEST_ENABLED", False)

    connectors = _connector_map()

    for connector_id in (
        "url_batch",
        "web_crawl",
        "github_repo",
        "drive_files",
        "minio_bucket",
        "confluence_space",
        "jira_project",
    ):
        connector = connectors[connector_id]
        assert connector.available is False
        assert connector.unavailable_reason == "网页导入服务未启用，请联系管理员"

    assert connectors["mysql_catalog"].available is True
    assert connectors["mysql_catalog"].unavailable_reason is None


def test_url_connectors_report_available_service(monkeypatch) -> None:
    monkeypatch.setattr(connectors_catalog.settings, "URL_INGEST_ENABLED", True)

    connectors = _connector_map()

    assert connectors["url_batch"].available is True
    assert connectors["url_batch"].unavailable_reason is None
    assert connectors["jira_project"].available is True
    assert connectors["jira_project"].unavailable_reason is None
