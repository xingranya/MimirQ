from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base
from app.models.tenant import Tenant
from app.models.tenant_invitation import TenantInvitation
from app.models.user import User
from app.services.tenant_invitation_service import (
    INVITATION_PURPOSE,
    TenantInvitationStateError,
    TenantInvitationTokenError,
    consume_tenant_invitation,
    decode_tenant_invitation_token,
    issue_tenant_invitation_token,
    lock_tenant_invitation_for_acceptance,
)


@pytest.fixture
def invitation_db() -> Session:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[Tenant.__table__, User.__table__, TenantInvitation.__table__],
    )
    with Session(engine) as db:
        yield db
    engine.dispose()


def _active_tenant(db: Session):
    tenant = Tenant(id=uuid4(), name=f"tenant-{uuid4()}", status="active")
    db.add(tenant)
    db.commit()
    return tenant


def test_tenant_invitation_token_round_trip(
    invitation_db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant = _active_tenant(invitation_db)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    monkeypatch.setattr(settings, "MEMBER_INVITATION_TTL_SEC", 604800, raising=False)

    token, invitation, superseded_count = issue_tenant_invitation_token(
        invitation_db,
        tenant_id=tenant.id,
        email="Member@Example.com",
        role="viewer",
        invited_by="owner-1",
    )
    claims = decode_tenant_invitation_token(token)

    assert claims["invitation_id"] == invitation.id
    assert claims["tenant_id"] == tenant.id
    assert claims["email"] == "member@example.com"
    assert claims["role"] == "viewer"
    assert claims["invited_by"] == "owner-1"
    assert invitation.nonce_hash != claims["nonce"]
    assert len(invitation.nonce_hash) == 64
    assert invitation.expires_at > datetime.now(UTC) + timedelta(days=6)
    assert superseded_count == 0


def test_tenant_invitation_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    tenant_id = uuid4()
    secret = "k" * 40
    monkeypatch.setattr(settings, "SECRET_KEY", secret, raising=False)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "jti": str(uuid4()),
            "nonce": "expired-nonce",
            "sub": "member@example.com",
            "tenant_id": str(tenant_id),
            "role": "viewer",
            "invited_by": "owner-1",
            "purpose": INVITATION_PURPOSE,
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        },
        secret,
        algorithm="HS256",
    )

    with pytest.raises(TenantInvitationTokenError):
        decode_tenant_invitation_token(token)


def test_consumed_invitation_cannot_be_replayed(
    invitation_db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant = _active_tenant(invitation_db)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    token, _invitation, _superseded_count = issue_tenant_invitation_token(
        invitation_db,
        tenant_id=tenant.id,
        email="member@example.com",
        role="editor",
        invited_by="owner-1",
    )
    invitation_db.commit()

    locked = lock_tenant_invitation_for_acceptance(invitation_db, token)
    consume_tenant_invitation(locked, user_id=str(uuid4()))
    invitation_db.commit()

    with pytest.raises(TenantInvitationStateError, match="already been used"):
        lock_tenant_invitation_for_acceptance(invitation_db, token)


def test_new_invitation_revokes_previous_pending_link(
    invitation_db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant = _active_tenant(invitation_db)
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    first_token, first, _superseded_count = issue_tenant_invitation_token(
        invitation_db,
        tenant_id=tenant.id,
        email="member@example.com",
        role="viewer",
        invited_by="owner-1",
    )
    invitation_db.commit()

    second_token, second, superseded_count = issue_tenant_invitation_token(
        invitation_db,
        tenant_id=tenant.id,
        email="member@example.com",
        role="editor",
        invited_by="owner-1",
    )
    invitation_db.commit()

    assert first.revoked_at is not None
    assert superseded_count == 1
    assert lock_tenant_invitation_for_acceptance(invitation_db, second_token).id == second.id
    with pytest.raises(TenantInvitationStateError, match="revoked"):
        lock_tenant_invitation_for_acceptance(invitation_db, first_token)
