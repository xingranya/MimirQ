from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest

from app.core.config import settings
from app.services.tenant_invitation_service import (
    INVITATION_PURPOSE,
    TenantInvitationTokenError,
    decode_tenant_invitation_token,
    issue_tenant_invitation_token,
)


def test_tenant_invitation_token_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    tenant_id = uuid4()
    monkeypatch.setattr(settings, "SECRET_KEY", "k" * 40, raising=False)
    monkeypatch.setattr(settings, "MEMBER_INVITATION_TTL_SEC", 604800, raising=False)

    token, expires_at = issue_tenant_invitation_token(
        tenant_id=tenant_id,
        email="Member@Example.com",
        role="viewer",
        invited_by="owner-1",
    )
    claims = decode_tenant_invitation_token(token)

    assert claims == {
        "tenant_id": tenant_id,
        "email": "member@example.com",
        "role": "viewer",
        "invited_by": "owner-1",
    }
    assert expires_at > datetime.now(UTC) + timedelta(days=6)


def test_tenant_invitation_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    tenant_id = uuid4()
    secret = "k" * 40
    monkeypatch.setattr(settings, "SECRET_KEY", secret, raising=False)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
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
