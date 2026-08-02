"""租户成员邀请令牌的签发与校验。"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt

from app.core.config import settings
from app.core.constants import UserRoles

INVITATION_PURPOSE = "tenant_member_invitation"
INVITABLE_TENANT_ROLES = frozenset(
    {
        UserRoles.ADMIN,
        UserRoles.AUDITOR,
        UserRoles.EDITOR,
        UserRoles.DATASET_OPERATOR,
        UserRoles.VIEWER,
    }
)


class TenantInvitationTokenError(ValueError):
    """邀请令牌无效、过期或配置不可用。"""


def _invitation_secret() -> str:
    secret = str(getattr(settings, "SECRET_KEY", "") or "").strip()
    if len(secret) < 32:
        raise TenantInvitationTokenError("member invitation secret is not configured")
    return secret


def _invitation_ttl_seconds() -> int:
    try:
        configured = int(getattr(settings, "MEMBER_INVITATION_TTL_SEC", 604800) or 604800)
    except (TypeError, ValueError):
        configured = 604800
    return max(300, min(configured, 2592000))


def issue_tenant_invitation_token(
    *,
    tenant_id: UUID,
    email: str,
    role: str,
    invited_by: str,
) -> tuple[str, datetime]:
    """签发仅用于创建本地租户成员的短期令牌。"""
    normalized_email = str(email or "").strip().lower()
    normalized_role = str(role or "").strip().lower()
    if not normalized_email:
        raise TenantInvitationTokenError("invitation email is required")
    if normalized_role not in INVITABLE_TENANT_ROLES:
        raise TenantInvitationTokenError("invitation role is not allowed")

    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=_invitation_ttl_seconds())
    payload = {
        "sub": normalized_email,
        "tenant_id": str(tenant_id),
        "role": normalized_role,
        "invited_by": str(invited_by or "").strip(),
        "purpose": INVITATION_PURPOSE,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, _invitation_secret(), algorithm="HS256")
    return token, expires_at


def decode_tenant_invitation_token(token: str) -> dict[str, Any]:
    """校验邀请令牌并返回规范化声明。"""
    raw_token = str(token or "").strip()
    if not raw_token:
        raise TenantInvitationTokenError("invitation token is required")

    try:
        payload = jwt.decode(
            raw_token,
            _invitation_secret(),
            algorithms=["HS256"],
            options={"require": ["sub", "tenant_id", "role", "purpose", "iat", "exp"]},
        )
        tenant_id = UUID(str(payload.get("tenant_id") or ""))
    except (jwt.PyJWTError, TypeError, ValueError) as exc:
        raise TenantInvitationTokenError("invitation token is invalid or expired") from exc

    email = str(payload.get("sub") or "").strip().lower()
    role = str(payload.get("role") or "").strip().lower()
    if payload.get("purpose") != INVITATION_PURPOSE or not email or role not in INVITABLE_TENANT_ROLES:
        raise TenantInvitationTokenError("invitation token claims are invalid")

    return {
        "tenant_id": tenant_id,
        "email": email,
        "role": role,
        "invited_by": str(payload.get("invited_by") or "").strip(),
    }
