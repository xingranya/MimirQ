from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.v1.auth as auth_module
import app.api.v1.rbac as rbac_module
from app.core.config import settings
from app.core.database import Base
from app.core.security import hash_password
from app.models.dataset import Dataset, DatasetPermissionEnum
from app.models.tenant import Tenant, TenantMember
from app.models.tenant_group import TenantGroup, TenantGroupMember
from app.models.tenant_invitation import TenantInvitation
from app.models.user import User
from app.services.user_service import UserService


@compiles(JSONB, "sqlite")
def _compile_jsonb_as_json(_type, _compiler, **_kwargs) -> str:  # noqa: ANN001
    return "JSON"


def _build_auth_test_client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Tenant.__table__,
            TenantMember.__table__,
            TenantInvitation.__table__,
            TenantGroup.__table__,
            TenantGroupMember.__table__,
            Dataset.__table__,
        ],
    )
    test_session = sessionmaker(bind=engine)

    def _get_test_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(auth_module.router, prefix="/auth")
    app.dependency_overrides[auth_module.get_db] = _get_test_db
    return engine, test_session, app


def _configure_invitation_auth(monkeypatch, tenant_id) -> None:
    monkeypatch.setattr(settings, "AUTH_MODE", "jwt", raising=False)
    monkeypatch.setattr(settings, "ALGORITHM", "HS256", raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY_FALLBACKS", "", raising=False)
    monkeypatch.setattr(settings, "JWT_ISSUER", "", raising=False)
    monkeypatch.setattr(settings, "JWT_AUDIENCE", "", raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_CLAIM", "tenant_id", raising=False)
    monkeypatch.setattr(settings, "JWT_ENFORCE_TENANT_HEADER_MATCH", False, raising=False)
    monkeypatch.setattr(settings, "JWT_GROUPS_SYNC_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_MEMBER_AUTO_PROVISION_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "DEFAULT_TENANT_ID", str(tenant_id), raising=False)
    monkeypatch.setattr(settings, "INITIAL_REGISTRATION_TOKEN", "", raising=False)
    monkeypatch.setattr(settings, "MEMBER_INVITATION_TTL_SEC", 604800, raising=False)
    monkeypatch.setattr(settings, "SELF_REGISTRATION_ENABLED", False, raising=False)


def _configure_self_registration(monkeypatch, tenant_id) -> None:
    _configure_invitation_auth(monkeypatch, tenant_id)
    monkeypatch.setattr(settings, "SELF_REGISTRATION_ENABLED", True, raising=False)


def test_local_account_bootstrap_login_and_me(monkeypatch) -> None:
    monkeypatch.setattr(settings, "AUTH_MODE", "jwt", raising=False)
    monkeypatch.setattr(settings, "ALGORITHM", "HS256", raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY_FALLBACKS", "", raising=False)
    monkeypatch.setattr(settings, "JWT_ISSUER", "", raising=False)
    monkeypatch.setattr(settings, "JWT_AUDIENCE", "", raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_CLAIM", "tenant_id", raising=False)
    monkeypatch.setattr(settings, "JWT_ENFORCE_TENANT_HEADER_MATCH", False, raising=False)
    monkeypatch.setattr(settings, "JWT_GROUPS_SYNC_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_MEMBER_AUTO_PROVISION_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "DEFAULT_TENANT_ID", str(uuid4()), raising=False)
    monkeypatch.setattr(settings, "INITIAL_REGISTRATION_TOKEN", "", raising=False)

    engine, test_session, app = _build_auth_test_client()

    try:
        with TestClient(app) as client:
            registered = client.post(
                "/auth/register",
                json={
                    "email": "Owner@Example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            assert registered.status_code == 201, registered.text
            registration = registered.json()
            assert registration["user"]["email"] == "owner@example.com"
            assert registration["token"]["token_type"] == "bearer"

            token = registration["token"]["access_token"]
            current_user = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert current_user.status_code == 200, current_user.text
            assert current_user.json()["id"] == registration["user"]["id"]

            invalid_login = client.post(
                "/auth/login",
                json={"identifier": "OWNER@EXAMPLE.COM", "password": "wrong-password"},
            )
            assert invalid_login.status_code == 401

            logged_in = client.post(
                "/auth/login",
                json={
                    "identifier": "OWNER@EXAMPLE.COM",
                    "password": "correct-horse-battery-staple",
                },
            )
            assert logged_in.status_code == 200, logged_in.text
            assert logged_in.json()["user"]["last_login_at"] is not None

            later_registration = client.post(
                "/auth/register",
                json={
                    "email": "later@example.com",
                    "username": "later",
                    "password": "another-valid-password",
                },
            )
            assert later_registration.status_code == 409
            assert later_registration.json()["detail"] == (
                "首次设置已关闭。如需开通账号，请发送邮件至 xingranya@qq.com。"
            )

        with test_session() as db:
            assert db.query(User).count() == 1
            assert db.query(TenantMember).count() == 1
    finally:
        engine.dispose()


def test_owner_can_invite_member_and_invitee_can_create_account(monkeypatch) -> None:
    tenant_id = uuid4()
    _configure_invitation_auth(monkeypatch, tenant_id)
    monkeypatch.setattr(auth_module, "audit_log_event", lambda *args, **kwargs: None, raising=True)
    monkeypatch.setattr(rbac_module, "audit_log_event", lambda *args, **kwargs: None, raising=True)

    engine, test_session, app = _build_auth_test_client()
    app.include_router(rbac_module.router, prefix="/rbac")

    try:
        with TestClient(app) as client:
            owner = client.post(
                "/auth/register",
                json={
                    "email": "owner@example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            assert owner.status_code == 201, owner.text
            owner_token = owner.json()["token"]["access_token"]

            invitation = client.post(
                "/rbac/invitations",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"email": "member@example.com", "role": "editor"},
            )
            assert invitation.status_code == 201, invitation.text
            assert invitation.headers["cache-control"] == "no-store"
            invitation_token = invitation.json()["token"]

            accepted = client.post(
                "/auth/invitations/accept",
                json={
                    "token": invitation_token,
                    "username": "member",
                    "password": "member-password",
                },
            )
            assert accepted.status_code == 201, accepted.text
            assert accepted.json()["user"]["email"] == "member@example.com"

            revocable = client.post(
                "/rbac/invitations",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"email": "revoked@example.com", "role": "viewer"},
            )
            assert revocable.status_code == 201, revocable.text
            pending = client.get(
                "/rbac/invitations",
                headers={"Authorization": f"Bearer {owner_token}"},
            )
            assert pending.status_code == 200, pending.text
            assert [item["id"] for item in pending.json()["items"]] == [revocable.json()["id"]]
            revoked = client.delete(
                f"/rbac/invitations/{revocable.json()['id']}",
                headers={"Authorization": f"Bearer {owner_token}"},
            )
            assert revoked.status_code == 200, revoked.text
            assert revoked.json()["revoked"] is True
            revoked_acceptance = client.post(
                "/auth/invitations/accept",
                json={
                    "token": revocable.json()["token"],
                    "username": "revoked-member",
                    "password": "member-password",
                },
            )
            assert revoked_acceptance.status_code == 409

            replayed = client.post(
                "/auth/invitations/accept",
                json={
                    "token": invitation_token,
                    "username": "member-two",
                    "password": "member-password",
                },
            )
            assert replayed.status_code == 409

        with test_session() as db:
            member_user = db.query(User).filter(User.email == "member@example.com").one()
            membership = (
                db.query(TenantMember)
                .filter(TenantMember.tenant_id == tenant_id, TenantMember.user_id == str(member_user.id))
                .one()
            )
            assert membership.role == "editor"
            assert membership.is_current is True
            invitation_record = (
                db.query(TenantInvitation)
                .filter(TenantInvitation.email == "member@example.com")
                .one()
            )
            assert invitation_record.used_at is not None
            assert invitation_record.used_by_user_id == str(member_user.id)
    finally:
        engine.dispose()


def test_employee_can_self_register_into_selected_group_as_viewer(monkeypatch) -> None:
    tenant_id = uuid4()
    _configure_self_registration(monkeypatch, tenant_id)
    monkeypatch.setattr(auth_module, "audit_log_event", lambda *args, **kwargs: None, raising=True)
    engine, test_session, app = _build_auth_test_client()

    try:
        with test_session() as db:
            tenant = Tenant(id=tenant_id, name="company", status="active", plan="basic")
            group = TenantGroup(tenant_id=tenant_id, name="内容运营")
            db.add_all([tenant, group])
            db.commit()
            group_id = group.id

        with TestClient(app) as client:
            options = client.get("/auth/registration-options")
            assert options.status_code == 200, options.text
            assert options.headers["cache-control"] == "no-store"
            assert options.json() == {
                "enabled": True,
                "groups": [{"id": str(group_id), "name": "内容运营"}],
            }

            registered = client.post(
                "/auth/self-register",
                json={
                    "email": "employee@example.com",
                    "username": "employee",
                    "password": "employee-password",
                    "group_id": str(group_id),
                },
            )
            assert registered.status_code == 201, registered.text
            assert registered.json()["user"]["email"] == "employee@example.com"

        with test_session() as db:
            user = db.query(User).filter(User.email == "employee@example.com").one()
            member = db.query(TenantMember).filter(TenantMember.user_id == str(user.id)).one()
            group_member = (
                db.query(TenantGroupMember)
                .filter(TenantGroupMember.group_id == group_id, TenantGroupMember.user_id == str(user.id))
                .one()
            )
            assert member.tenant_id == tenant_id
            assert member.role == "viewer"
            assert member.is_current is True
            assert group_member.tenant_id == tenant_id
            personal_dataset = db.query(Dataset).filter(Dataset.owner_id == str(user.id)).one()
            assert personal_dataset.tenant_id == tenant_id
            assert personal_dataset.name == "employee 的个人知识库"
            assert personal_dataset.permission == DatasetPermissionEnum.ONLY_ME
            assert personal_dataset.dataset_metadata == {"personal_workspace": True}
    finally:
        engine.dispose()


def test_self_registration_disabled_does_not_expose_groups_or_create_account(monkeypatch) -> None:
    tenant_id = uuid4()
    _configure_invitation_auth(monkeypatch, tenant_id)
    engine, test_session, app = _build_auth_test_client()

    try:
        with test_session() as db:
            tenant = Tenant(id=tenant_id, name="company", status="active", plan="basic")
            group = TenantGroup(tenant_id=tenant_id, name="财务")
            db.add_all([tenant, group])
            db.commit()
            group_id = group.id

        with TestClient(app) as client:
            options = client.get("/auth/registration-options")
            assert options.status_code == 200
            assert options.json() == {"enabled": False, "groups": []}

            denied = client.post(
                "/auth/self-register",
                json={
                    "email": "employee@example.com",
                    "username": "employee",
                    "password": "employee-password",
                    "group_id": str(group_id),
                },
            )
            assert denied.status_code == 403
            assert denied.json()["detail"] == "员工自助注册尚未开放"

        with test_session() as db:
            assert db.query(User).count() == 0
            assert db.query(TenantMember).count() == 0
            assert db.query(TenantGroupMember).count() == 0
            assert db.query(Dataset).count() == 0
    finally:
        engine.dispose()


def test_self_registration_rolls_back_when_audit_fails(monkeypatch) -> None:
    tenant_id = uuid4()
    _configure_self_registration(monkeypatch, tenant_id)
    engine, test_session, app = _build_auth_test_client()

    try:
        with test_session() as db:
            tenant = Tenant(id=tenant_id, name="company", status="active", plan="basic")
            group = TenantGroup(tenant_id=tenant_id, name="数据运营")
            db.add_all([tenant, group])
            db.commit()
            group_id = group.id

        monkeypatch.setattr(
            auth_module,
            "audit_log_event",
            lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("audit unavailable")),
            raising=True,
        )
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/auth/self-register",
                json={
                    "email": "employee@example.com",
                    "username": "employee",
                    "password": "employee-password",
                    "group_id": str(group_id),
                },
            )
            assert response.status_code == 500

        with test_session() as db:
            assert db.query(User).count() == 0
            assert db.query(TenantMember).count() == 0
            assert db.query(TenantGroupMember).count() == 0
            assert db.query(Dataset).count() == 0
    finally:
        engine.dispose()


def test_invitation_accept_rolls_back_when_audit_fails(monkeypatch) -> None:
    tenant_id = uuid4()
    _configure_invitation_auth(monkeypatch, tenant_id)
    monkeypatch.setattr(rbac_module, "audit_log_event", lambda *args, **kwargs: None, raising=True)

    engine, test_session, app = _build_auth_test_client()
    app.include_router(rbac_module.router, prefix="/rbac")

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            owner = client.post(
                "/auth/register",
                json={
                    "email": "owner@example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            owner_token = owner.json()["token"]["access_token"]
            invitation = client.post(
                "/rbac/invitations",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"email": "member@example.com", "role": "editor"},
            )
            monkeypatch.setattr(
                auth_module,
                "audit_log_event",
                lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("audit unavailable")),
                raising=True,
            )

            accepted = client.post(
                "/auth/invitations/accept",
                json={
                    "token": invitation.json()["token"],
                    "username": "member",
                    "password": "member-password",
                },
            )
            assert accepted.status_code == 500

        with test_session() as db:
            assert db.query(User).count() == 1
            assert db.query(TenantMember).count() == 1
            assert db.query(TenantInvitation).one().used_at is None
    finally:
        engine.dispose()


def test_invitation_accept_maps_concurrent_identity_conflict_to_409(monkeypatch) -> None:
    tenant_id = uuid4()
    _configure_invitation_auth(monkeypatch, tenant_id)
    monkeypatch.setattr(auth_module, "audit_log_event", lambda *args, **kwargs: None, raising=True)
    monkeypatch.setattr(rbac_module, "audit_log_event", lambda *args, **kwargs: None, raising=True)

    engine, test_session, app = _build_auth_test_client()
    app.include_router(rbac_module.router, prefix="/rbac")

    try:
        with TestClient(app) as client:
            owner = client.post(
                "/auth/register",
                json={
                    "email": "owner@example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            owner_token = owner.json()["token"]["access_token"]
            invitation = client.post(
                "/rbac/invitations",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"email": "member@example.com", "role": "viewer"},
            )
            monkeypatch.setattr(
                auth_module.UserService,
                "create_invited_user",
                lambda *args, **kwargs: (_ for _ in ()).throw(
                    IntegrityError("INSERT users", {}, RuntimeError("uq_users_email"))
                ),
                raising=True,
            )

            accepted = client.post(
                "/auth/invitations/accept",
                json={
                    "token": invitation.json()["token"],
                    "username": "member",
                    "password": "member-password",
                },
            )
            assert accepted.status_code == 409
            assert accepted.json()["detail"] == "邮箱或用户名已被使用"

        with test_session() as db:
            assert db.query(User).count() == 1
            assert db.query(TenantInvitation).one().used_at is None
    finally:
        engine.dispose()


def test_production_bootstrap_registration_requires_token(monkeypatch) -> None:
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(settings, "AUTH_MODE", "jwt", raising=False)
    monkeypatch.setattr(settings, "ALGORITHM", "HS256", raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY_FALLBACKS", "", raising=False)
    monkeypatch.setattr(settings, "JWT_ISSUER", "", raising=False)
    monkeypatch.setattr(settings, "JWT_AUDIENCE", "", raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_CLAIM", "tenant_id", raising=False)
    monkeypatch.setattr(settings, "JWT_ENFORCE_TENANT_HEADER_MATCH", False, raising=False)
    monkeypatch.setattr(settings, "JWT_GROUPS_SYNC_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_MEMBER_AUTO_PROVISION_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "DEFAULT_TENANT_ID", str(uuid4()), raising=False)
    monkeypatch.setattr(settings, "INITIAL_REGISTRATION_TOKEN", "bootstrap-secret", raising=False)

    engine, _test_session, app = _build_auth_test_client()

    try:
        with TestClient(app) as client:
            denied = client.post(
                "/auth/register",
                json={
                    "email": "owner@example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            assert denied.status_code == 403
            assert denied.json()["detail"] == "Initial registration bootstrap token required"
    finally:
        engine.dispose()


def test_production_bootstrap_registration_accepts_matching_token(monkeypatch) -> None:
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(settings, "AUTH_MODE", "jwt", raising=False)
    monkeypatch.setattr(settings, "ALGORITHM", "HS256", raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY_FALLBACKS", "", raising=False)
    monkeypatch.setattr(settings, "JWT_ISSUER", "", raising=False)
    monkeypatch.setattr(settings, "JWT_AUDIENCE", "", raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_CLAIM", "tenant_id", raising=False)
    monkeypatch.setattr(settings, "JWT_ENFORCE_TENANT_HEADER_MATCH", False, raising=False)
    monkeypatch.setattr(settings, "JWT_GROUPS_SYNC_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_MEMBER_AUTO_PROVISION_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "DEFAULT_TENANT_ID", str(uuid4()), raising=False)
    monkeypatch.setattr(settings, "INITIAL_REGISTRATION_TOKEN", "sha256:fc17cbe42905e3308ba7175fd672651094e30c926f2bdd426636f12dd19df41b", raising=False)

    engine, test_session, app = _build_auth_test_client()

    try:
        with TestClient(app) as client:
            registered = client.post(
                "/auth/register",
                headers={"X-Bootstrap-Token": "bootstrap-secret"},
                json={
                    "email": "owner@example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            assert registered.status_code == 201, registered.text

        with test_session() as db:
            assert db.query(User).count() == 1
            assert db.query(TenantMember).count() == 1
    finally:
        engine.dispose()


def test_production_existing_owner_registration_still_returns_conflict_without_token(monkeypatch) -> None:
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(settings, "AUTH_MODE", "jwt", raising=False)
    monkeypatch.setattr(settings, "ALGORITHM", "HS256", raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    monkeypatch.setattr(settings, "SECRET_KEY_FALLBACKS", "", raising=False)
    monkeypatch.setattr(settings, "JWT_ISSUER", "", raising=False)
    monkeypatch.setattr(settings, "JWT_AUDIENCE", "", raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_CLAIM", "tenant_id", raising=False)
    monkeypatch.setattr(settings, "JWT_ENFORCE_TENANT_HEADER_MATCH", False, raising=False)
    monkeypatch.setattr(settings, "JWT_GROUPS_SYNC_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "JWT_TENANT_MEMBER_AUTO_PROVISION_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "DEFAULT_TENANT_ID", str(uuid4()), raising=False)
    monkeypatch.setattr(settings, "INITIAL_REGISTRATION_TOKEN", "", raising=False)

    engine, _test_session, app = _build_auth_test_client()

    try:
        with TestClient(app) as client:
            first = client.post(
                "/auth/register",
                headers={"X-Bootstrap-Token": "bootstrap-secret"},
                json={
                    "email": "owner@example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            assert first.status_code == 403

        monkeypatch.setattr(settings, "INITIAL_REGISTRATION_TOKEN", "bootstrap-secret", raising=False)

        with TestClient(app) as client:
            first = client.post(
                "/auth/register",
                headers={"X-Bootstrap-Token": "bootstrap-secret"},
                json={
                    "email": "owner@example.com",
                    "username": "owner",
                    "password": "correct-horse-battery-staple",
                },
            )
            assert first.status_code == 201, first.text

            second = client.post(
                "/auth/register",
                json={
                    "email": "later@example.com",
                    "username": "later",
                    "password": "another-valid-password",
                },
            )
            assert second.status_code == 409
            assert second.json()["detail"] == (
                "首次设置已关闭。如需开通账号，请发送邮件至 xingranya@qq.com。"
            )
    finally:
        engine.dispose()


def test_get_current_tenant_id_ignores_inactive_memberships_and_tenants() -> None:
    engine, test_session, _app = _build_auth_test_client()

    try:
        with test_session() as db:
            user = User(
                email="owner@example.com",
                username="owner",
                password_hash=hash_password("correct-horse-battery-staple"),
                is_active=True,
            )
            db.add(user)
            db.flush()

            active_current_tenant = Tenant(name="active-current", status="active", plan="basic")
            active_fallback_tenant = Tenant(name="active-fallback", status="active", plan="basic")
            inactive_member_tenant = Tenant(name="inactive-member-tenant", status="active", plan="basic")
            inactive_tenant = Tenant(name="inactive-tenant", status="inactive", plan="basic")
            db.add_all([active_current_tenant, active_fallback_tenant, inactive_member_tenant, inactive_tenant])
            db.flush()

            now = datetime.now(timezone.utc)
            db.add_all(
                [
                    TenantMember(
                        tenant_id=active_current_tenant.id,
                        user_id=str(user.id),
                        role="owner",
                        is_active=True,
                        is_current=True,
                        created_at=now - timedelta(hours=4),
                        updated_at=now - timedelta(hours=4),
                    ),
                    TenantMember(
                        tenant_id=active_fallback_tenant.id,
                        user_id=str(user.id),
                        role="owner",
                        is_active=True,
                        is_current=False,
                        created_at=now - timedelta(hours=3),
                        updated_at=now - timedelta(hours=3),
                    ),
                    TenantMember(
                        tenant_id=inactive_member_tenant.id,
                        user_id=str(user.id),
                        role="owner",
                        is_active=False,
                        is_current=True,
                        created_at=now - timedelta(hours=2),
                        updated_at=now - timedelta(hours=2),
                    ),
                    TenantMember(
                        tenant_id=inactive_tenant.id,
                        user_id=str(user.id),
                        role="owner",
                        is_active=True,
                        is_current=True,
                        created_at=now - timedelta(hours=1),
                        updated_at=now - timedelta(hours=1),
                    ),
                ]
            )
            db.commit()

            assert UserService.get_current_tenant_id(db, user_id=str(user.id)) == active_current_tenant.id

            current_member = (
                db.query(TenantMember)
                .filter(
                    TenantMember.user_id == str(user.id),
                    TenantMember.tenant_id == active_current_tenant.id,
                )
                .one()
            )
            current_member.is_active = False
            current_member.is_current = False
            db.commit()

            assert UserService.get_current_tenant_id(db, user_id=str(user.id)) == active_fallback_tenant.id

            fallback_member = (
                db.query(TenantMember)
                .filter(
                    TenantMember.user_id == str(user.id),
                    TenantMember.tenant_id == active_fallback_tenant.id,
                    TenantMember.is_active.is_(True),
                )
                .one()
            )
            fallback_member.is_active = False
            db.commit()

            assert UserService.get_current_tenant_id(db, user_id=str(user.id)) is None
    finally:
        engine.dispose()


def test_authenticate_rejects_ambiguous_identifier_collision() -> None:
    engine, test_session, _app = _build_auth_test_client()

    try:
        with test_session() as db:
            db.add_all(
                [
                    User(
                        email="owner@example.com",
                        username="owner",
                        password_hash=hash_password("owner-password"),
                        is_active=True,
                    ),
                    User(
                        email="other@example.com",
                        username="owner@example.com",
                        password_hash=hash_password("other-password"),
                        is_active=True,
                    ),
                ]
            )
            db.commit()

            for password in ("owner-password", "other-password"):
                with pytest.raises(HTTPException) as excinfo:
                    UserService.authenticate(db, "owner@example.com", password)

                assert excinfo.value.status_code == 401
                assert excinfo.value.detail == "Invalid credentials"
    finally:
        engine.dispose()


def test_create_user_rejects_cross_field_namespace_collisions_case_insensitively() -> None:
    engine, test_session, _app = _build_auth_test_client()

    try:
        with test_session() as db:
            db.add(
                User(
                    email="owner@example.com",
                    username="Owner",
                    password_hash=hash_password("correct-horse-battery-staple"),
                    is_active=True,
                )
            )
            db.commit()

            with pytest.raises(HTTPException) as username_exc:
                UserService.create_user(
                    db,
                    email="other@example.com",
                    username="OWNER@example.com",
                    password="another-valid-password",
                )
            assert username_exc.value.status_code == 400

            with pytest.raises(HTTPException) as email_exc:
                UserService.create_user(
                    db,
                    email="owner",
                    username="later",
                    password="another-valid-password",
                )
            assert email_exc.value.status_code == 400
    finally:
        engine.dispose()
