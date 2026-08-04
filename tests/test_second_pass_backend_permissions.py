from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.schemas.rbac import TenantMemberUpdateRequest
from app.models.tenant import TenantMember


class _CommitOnlyDB:
    def __init__(self) -> None:
        self.commits = 0

    def commit(self) -> None:
        self.commits += 1


def test_global_chunk_preset_mutation_requires_editor_role(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.v1 import chunk_presets

    write_called = False

    def _create(**_kwargs):
        nonlocal write_called
        write_called = True
        return SimpleNamespace(id=uuid4(), name="shared", description=None, payload={})

    monkeypatch.setattr(
        chunk_presets.DatasetService,
        "ensure_member",
        lambda *_args, **_kwargs: SimpleNamespace(role="viewer"),
    )
    monkeypatch.setattr(chunk_presets, "_create_chunk_preset_row", _create)

    with pytest.raises(HTTPException) as exc_info:
        chunk_presets.create_chunk_preset(
            chunk_presets.ChunkPresetCreateRequest(name="shared", payload={}),
            db=object(),
            tenant_id=uuid4(),
            account_id="viewer",
        )

    assert exc_info.value.status_code == 403
    assert write_called is False


@pytest.mark.asyncio
async def test_rtbf_execution_requires_lifecycle_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.v1 import rtbf

    cascade_called = False

    def _deny(*_args, **_kwargs) -> None:
        raise HTTPException(status_code=403, detail="denied")

    async def _cascade(*_args, **_kwargs) -> dict:
        nonlocal cascade_called
        cascade_called = True
        return {"deleted": 1}

    monkeypatch.setattr(rtbf, "ensure_tenant_permission", _deny, raising=False)
    monkeypatch.setattr(rtbf, "run_rtbf_cascade", _cascade, raising=True)

    with pytest.raises(HTTPException) as exc_info:
        await rtbf.request_rtbf_cascade(
            rtbf.RTBFRequest(subject_account_id="victim", dry_run=False),
            tenant_id=uuid4(),
            account_id="viewer",
            db=object(),
        )

    assert exc_info.value.status_code == 403
    assert cascade_called is False


@pytest.mark.asyncio
async def test_rtbf_preview_conflict_returns_409(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.v1 import rtbf

    monkeypatch.setattr(rtbf, "ensure_tenant_permission", lambda *_args, **_kwargs: None)

    async def _cascade(*_args, **_kwargs) -> dict:
        raise rtbf.RtbfPreviewRequiredError("请先完成安全预演")

    monkeypatch.setattr(rtbf, "run_rtbf_cascade", _cascade, raising=True)

    with pytest.raises(HTTPException) as exc_info:
        await rtbf.request_rtbf_cascade(
            rtbf.RTBFRequest(subject_account_id="victim", dry_run=False),
            tenant_id=uuid4(),
            account_id="owner",
            db=object(),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "请先完成安全预演"


def test_prompt_template_mutations_require_settings_write(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.v1 import prompt_templates

    def _deny(*_args, **_kwargs) -> None:
        raise HTTPException(status_code=403, detail="denied")

    monkeypatch.setattr(prompt_templates, "ensure_tenant_permission", _deny, raising=False)
    monkeypatch.setattr(prompt_templates, "list_builtin_prompt_templates", lambda: [])
    db = _CommitOnlyDB()
    tenant_id = uuid4()
    template_id = uuid4()
    operations = (
        lambda: prompt_templates.sync_builtin_prompt_templates(
            tenant_id=tenant_id,
            account_id="viewer",
            db=db,
        ),
        lambda: prompt_templates.create_prompt_template(
            prompt_templates.PromptTemplateCreate(name="test", content="content"),
            tenant_id=tenant_id,
            account_id="viewer",
            db=db,
        ),
        lambda: prompt_templates.create_prompt_template_version(
            template_id,
            prompt_templates.PromptTemplateNewVersion(),
            tenant_id=tenant_id,
            account_id="viewer",
            db=db,
        ),
        lambda: prompt_templates.update_prompt_template(
            template_id,
            prompt_templates.PromptTemplateUpdate(name="updated"),
            tenant_id=tenant_id,
            account_id="viewer",
            db=db,
        ),
        lambda: prompt_templates.delete_prompt_template(
            template_id,
            tenant_id=tenant_id,
            account_id="viewer",
            db=db,
        ),
        lambda: prompt_templates.duplicate_prompt_template(
            template_id,
            tenant_id=tenant_id,
            account_id="viewer",
            db=db,
        ),
    )

    for operation in operations:
        with pytest.raises(HTTPException) as exc_info:
            operation()
        assert exc_info.value.status_code == 403
    assert db.commits == 0


@pytest.mark.parametrize("section", ["glossary", "patterns", "intents"])
def test_industry_rule_write_requires_system_settings_permission(
    monkeypatch: pytest.MonkeyPatch,
    section: str,
) -> None:
    from app.api.v1 import industry_rules

    write_called = False

    def _deny(*_args, **_kwargs) -> None:
        raise HTTPException(status_code=403, detail="denied")

    def _write(*_args, **_kwargs) -> dict:
        nonlocal write_called
        write_called = True
        return {"ruleset": "industrial_control", "section": section, "updated_count": 0}

    requests = {
        "glossary": industry_rules.IndustryRulesGlossaryUpdateRequest(glossary={}),
        "patterns": industry_rules.IndustryRulesPatternsUpdateRequest(patterns=[]),
        "intents": industry_rules.IndustryRulesIntentsUpdateRequest(intents=[]),
    }
    endpoints = {
        "glossary": industry_rules.put_industry_ruleset_glossary,
        "patterns": industry_rules.put_industry_ruleset_patterns,
        "intents": industry_rules.put_industry_ruleset_intents,
    }

    monkeypatch.setattr(industry_rules, "_ensure_write", _deny, raising=True)
    monkeypatch.setattr(industry_rules, f"replace_ruleset_{section}", _write, raising=True)

    with pytest.raises(HTTPException) as exc_info:
        endpoints[section](
            "industrial_control",
            requests[section],
            tenant_id=uuid4(),
            account_id="viewer",
            db=object(),
        )

    assert exc_info.value.status_code == 403
    assert write_called is False


@pytest.mark.parametrize(
    ("role", "use_system_tenant"),
    [("admin", True), ("owner", False)],
)
def test_industry_rule_write_rejects_non_platform_owner(
    monkeypatch: pytest.MonkeyPatch,
    role: str,
    use_system_tenant: bool,
) -> None:
    from app.api.v1 import industry_rules

    system_tenant_id = uuid4()
    tenant_id = system_tenant_id if use_system_tenant else uuid4()
    monkeypatch.setattr(
        industry_rules.settings,
        "DEFAULT_TENANT_ID",
        str(system_tenant_id),
    )
    monkeypatch.setattr(
        industry_rules,
        "ensure_tenant_permission",
        lambda *_args, **_kwargs: SimpleNamespace(role=role),
        raising=True,
    )

    with pytest.raises(HTTPException) as exc_info:
        industry_rules._ensure_write(object(), tenant_id, "account")

    assert exc_info.value.status_code == 403


def test_industry_rule_reads_require_settings_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.v1 import industry_rules

    loader_called = False

    def _deny(*_args, **_kwargs) -> None:
        raise HTTPException(status_code=403, detail="denied")

    def _list_rulesets() -> list[str]:
        nonlocal loader_called
        loader_called = True
        return []

    monkeypatch.setattr(industry_rules, "_ensure_read", _deny, raising=True)
    monkeypatch.setattr(industry_rules, "list_rulesets", _list_rulesets, raising=True)

    with pytest.raises(HTTPException) as exc_info:
        industry_rules.get_industry_rulesets(
            tenant_id=uuid4(),
            account_id="viewer",
            db=object(),
        )

    assert exc_info.value.status_code == 403
    assert loader_called is False


def test_industry_rule_preview_checks_read_permission_before_ruleset_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.v1 import industry_rules

    lookup_called = False

    def _deny(*_args, **_kwargs) -> None:
        raise HTTPException(status_code=403, detail="denied")

    def _require_ruleset(_name: str) -> str:
        nonlocal lookup_called
        lookup_called = True
        return "industrial_control"

    monkeypatch.setattr(industry_rules, "_ensure_read", _deny, raising=True)
    monkeypatch.setattr(industry_rules, "_require_ruleset", _require_ruleset, raising=True)

    with pytest.raises(HTTPException) as exc_info:
        industry_rules.preview_industry_rules_rewrite(
            industry_rules.IndustryRulesRewritePreviewRequest(
                ruleset="industrial_control",
                query="授权报错",
            ),
            tenant_id=uuid4(),
            account_id="viewer",
            db=object(),
        )

    assert exc_info.value.status_code == 403
    assert lookup_called is False


def test_industry_rule_detail_checks_read_permission_before_ruleset_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.v1 import industry_rules

    lookup_called = False

    def _deny(*_args, **_kwargs) -> None:
        raise HTTPException(status_code=403, detail="denied")

    def _require_ruleset(_name: str) -> str:
        nonlocal lookup_called
        lookup_called = True
        return "industrial_control"

    monkeypatch.setattr(industry_rules, "_ensure_read", _deny, raising=True)
    monkeypatch.setattr(industry_rules, "_require_ruleset", _require_ruleset, raising=True)

    with pytest.raises(HTTPException) as exc_info:
        industry_rules.get_industry_ruleset(
            "industrial_control",
            tenant_id=uuid4(),
            account_id="viewer",
            db=object(),
        )

    assert exc_info.value.status_code == 403
    assert lookup_called is False


def test_industry_rule_list_exposes_real_write_capability(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.v1 import industry_rules

    tenant_id = uuid4()
    monkeypatch.setattr(industry_rules.settings, "DEFAULT_TENANT_ID", str(tenant_id))
    monkeypatch.setattr(
        industry_rules,
        "_ensure_read",
        lambda *_args, **_kwargs: SimpleNamespace(role="owner"),
        raising=True,
    )
    monkeypatch.setattr(industry_rules, "list_rulesets", lambda: [], raising=True)

    result = industry_rules.get_industry_rulesets(
        tenant_id=tenant_id,
        account_id="owner",
        db=object(),
    )

    assert result["can_manage"] is True


@pytest.mark.parametrize(
    ("role", "use_system_tenant", "expected"),
    [
        ("owner", True, True),
        ("admin", True, False),
        ("viewer", True, False),
        ("owner", False, False),
    ],
)
def test_industry_rule_write_capability_requires_system_owner(
    monkeypatch: pytest.MonkeyPatch,
    role: str,
    use_system_tenant: bool,
    expected: bool,
) -> None:
    from app.api.v1 import industry_rules

    system_tenant_id = uuid4()
    tenant_id = system_tenant_id if use_system_tenant else uuid4()
    monkeypatch.setattr(
        industry_rules.settings,
        "DEFAULT_TENANT_ID",
        str(system_tenant_id),
    )

    assert (
        industry_rules._is_system_tenant_owner(
            tenant_id,
            SimpleNamespace(role=role),
        )
        is expected
    )


def test_industry_ruleset_name_cannot_escape_ruleset_root() -> None:
    from app.rag.industry_rules.loaders import replace_ruleset_glossary, ruleset_exists

    assert ruleset_exists("..") is False
    with pytest.raises(FileNotFoundError):
        replace_ruleset_glossary("..", {})


@pytest.mark.asyncio
async def test_cannot_demote_the_only_active_admin() -> None:
    from app.api.v1.rbac import patch_tenant_member_role

    engine = create_engine("sqlite:///:memory:")
    TenantMember.__table__.create(engine)
    tenant_id = uuid4()

    with Session(engine) as db:
        db.add(
            TenantMember(
                tenant_id=tenant_id,
                user_id="only-owner",
                role="owner",
                is_active=True,
                is_current=True,
            )
        )
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            await patch_tenant_member_role(
                "only-owner",
                TenantMemberUpdateRequest(role="viewer"),
                tenant_id=tenant_id,
                account_id="only-owner",
                db=db,
            )

        assert exc_info.value.status_code == 409
        db.expire_all()
        member = db.query(TenantMember).filter(TenantMember.user_id == "only-owner").one()
        assert member.role == "owner"


def test_can_demote_an_admin_when_another_active_admin_remains() -> None:
    from app.api.v1.rbac import patch_tenant_member_role

    engine = create_engine("sqlite:///:memory:")
    TenantMember.__table__.create(engine)
    tenant_id = uuid4()

    with Session(engine) as db:
        db.add_all(
            [
                TenantMember(
                    tenant_id=tenant_id,
                    user_id="owner",
                    role="owner",
                    is_active=True,
                    is_current=True,
                ),
                TenantMember(
                    tenant_id=tenant_id,
                    user_id="admin",
                    role="admin",
                    is_active=True,
                    is_current=True,
                ),
            ]
        )
        db.commit()

        updated = patch_tenant_member_role(
            "admin",
            TenantMemberUpdateRequest(role="viewer"),
            tenant_id=tenant_id,
            account_id="owner",
            db=db,
        )

        assert updated.role == "viewer"
