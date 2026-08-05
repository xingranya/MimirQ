from types import SimpleNamespace

from app.api.v1 import connectors_jira


def _install_connector_helpers(monkeypatch) -> None:
    helpers = SimpleNamespace(
        normalize_boundary_ids=lambda _value: [],
        _build_auth_headers=lambda _cfg: {},
        _jira_attachment_limits=lambda _cfg: (False, 0, 0),
        _jira_linked_artifact_limits=lambda _cfg: (False, 0, 0),
    )
    monkeypatch.setattr(connectors_jira, "_leader_module", helpers, raising=False)


def _build_settings(monkeypatch, **overrides):
    _install_connector_helpers(monkeypatch)
    config = {
        "base_url": "https://example.atlassian.net",
        "project_key": "DOC",
        **overrides,
    }
    return connectors_jira._build_jira_project_run_settings(config)


def test_jira_settings_preserve_zero_comment_limit(monkeypatch) -> None:
    settings = _build_settings(monkeypatch, max_comments_per_issue=0)

    assert settings["max_comments_per_issue"] == 0


def test_jira_settings_default_comment_limit_only_when_missing(monkeypatch) -> None:
    settings = _build_settings(monkeypatch)

    assert settings["max_comments_per_issue"] == 20
