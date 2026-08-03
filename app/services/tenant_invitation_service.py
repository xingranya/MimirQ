"""租户成员邀请的签发、校验、消费与撤销。"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import UserRoles
from app.models.tenant import Tenant
from app.models.tenant_invitation import TenantInvitation
from app.models.user import User

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


class TenantInvitationStateError(TenantInvitationTokenError):
    """邀请已消费、撤销或与现有账号冲突。"""


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


def _nonce_hash(nonce: str) -> str:
    return hashlib.sha256(str(nonce or "").encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def issue_tenant_invitation_token(
    db: Session,
    *,
    tenant_id: UUID,
    email: str,
    role: str,
    invited_by: str,
) -> tuple[str, TenantInvitation, int]:
    """持久化邀请并返回仅此一次可见的签名令牌。"""
    normalized_email = str(email or "").strip().lower()
    normalized_role = str(role or "").strip().lower()
    normalized_inviter = str(invited_by or "").strip()
    if not normalized_email:
        raise TenantInvitationTokenError("invitation email is required")
    if normalized_role not in INVITABLE_TENANT_ROLES:
        raise TenantInvitationTokenError("invitation role is not allowed")
    if not normalized_inviter:
        raise TenantInvitationTokenError("invitation inviter is required")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).with_for_update().first()
    if tenant is None or str(tenant.status or "").strip().lower() != "active":
        raise TenantInvitationTokenError("invitation tenant is not active")
    if db.query(User.id).filter(User.email == normalized_email).first() is not None:
        raise TenantInvitationStateError("invitation email already belongs to an account")

    now = datetime.now(UTC)
    superseded = (
        db.query(TenantInvitation)
        .filter(
            TenantInvitation.tenant_id == tenant_id,
            TenantInvitation.email == normalized_email,
            TenantInvitation.used_at.is_(None),
            TenantInvitation.revoked_at.is_(None),
        )
        .with_for_update()
        .all()
    )
    for previous in superseded:
        previous.revoked_at = now
        previous.revoked_by = normalized_inviter

    invitation_id = uuid4()
    nonce = secrets.token_urlsafe(32)
    expires_at = now + timedelta(seconds=_invitation_ttl_seconds())
    invitation = TenantInvitation(
        id=invitation_id,
        tenant_id=tenant_id,
        email=normalized_email,
        role=normalized_role,
        invited_by=normalized_inviter,
        nonce_hash=_nonce_hash(nonce),
        expires_at=expires_at,
    )
    db.add(invitation)
    db.flush()

    payload = {
        "jti": str(invitation_id),
        "nonce": nonce,
        "sub": normalized_email,
        "tenant_id": str(tenant_id),
        "role": normalized_role,
        "invited_by": normalized_inviter,
        "purpose": INVITATION_PURPOSE,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, _invitation_secret(), algorithm="HS256")
    return token, invitation, len(superseded)


def decode_tenant_invitation_token(token: str) -> dict[str, Any]:
    """校验邀请令牌签名并返回规范化声明。"""
    raw_token = str(token or "").strip()
    if not raw_token:
        raise TenantInvitationTokenError("invitation token is required")

    try:
        payload = jwt.decode(
            raw_token,
            _invitation_secret(),
            algorithms=["HS256"],
            options={"require": ["jti", "nonce", "sub", "tenant_id", "role", "purpose", "iat", "exp"]},
        )
        invitation_id = UUID(str(payload.get("jti") or ""))
        tenant_id = UUID(str(payload.get("tenant_id") or ""))
    except (jwt.PyJWTError, TypeError, ValueError) as exc:
        raise TenantInvitationTokenError("invitation token is invalid or expired") from exc

    email = str(payload.get("sub") or "").strip().lower()
    role = str(payload.get("role") or "").strip().lower()
    nonce = str(payload.get("nonce") or "").strip()
    if (
        payload.get("purpose") != INVITATION_PURPOSE
        or not email
        or not nonce
        or role not in INVITABLE_TENANT_ROLES
    ):
        raise TenantInvitationTokenError("invitation token claims are invalid")

    return {
        "invitation_id": invitation_id,
        "tenant_id": tenant_id,
        "email": email,
        "role": role,
        "invited_by": str(payload.get("invited_by") or "").strip(),
        "nonce": nonce,
    }


def lock_tenant_invitation_for_acceptance(db: Session, token: str) -> TenantInvitation:
    """锁定并校验待消费邀请，调用方必须在同一事务内完成消费。"""
    claims = decode_tenant_invitation_token(token)
    invitation = (
        db.query(TenantInvitation)
        .filter(TenantInvitation.id == claims["invitation_id"])
        .with_for_update()
        .first()
    )
    if invitation is None:
        raise TenantInvitationTokenError("invitation record does not exist")
    if invitation.used_at is not None:
        raise TenantInvitationStateError("invitation has already been used")
    if invitation.revoked_at is not None:
        raise TenantInvitationStateError("invitation has been revoked")
    if _as_utc(invitation.expires_at) <= datetime.now(UTC):
        raise TenantInvitationTokenError("invitation has expired")

    claims_match = (
        invitation.tenant_id == claims["tenant_id"]
        and str(invitation.email or "").strip().lower() == claims["email"]
        and str(invitation.role or "").strip().lower() == claims["role"]
        and str(invitation.invited_by or "").strip() == claims["invited_by"]
        and hmac.compare_digest(str(invitation.nonce_hash or ""), _nonce_hash(claims["nonce"]))
    )
    if not claims_match:
        raise TenantInvitationTokenError("invitation token does not match its record")
    return invitation


def consume_tenant_invitation(invitation: TenantInvitation, *, user_id: str) -> None:
    """在调用方事务内把已锁定邀请标记为已消费。"""
    invitation.used_at = datetime.now(UTC)
    invitation.used_by_user_id = str(user_id or "").strip()


def revoke_tenant_invitation(
    db: Session,
    *,
    tenant_id: UUID,
    invitation_id: UUID,
    revoked_by: str,
) -> tuple[TenantInvitation, bool]:
    """锁定并撤销指定租户的待处理邀请。"""
    invitation = (
        db.query(TenantInvitation)
        .filter(TenantInvitation.id == invitation_id, TenantInvitation.tenant_id == tenant_id)
        .with_for_update()
        .first()
    )
    if invitation is None:
        raise LookupError("invitation does not exist")
    if invitation.used_at is not None:
        raise TenantInvitationStateError("used invitation cannot be revoked")
    if invitation.revoked_at is not None:
        return invitation, False

    invitation.revoked_at = datetime.now(UTC)
    invitation.revoked_by = str(revoked_by or "").strip()
    return invitation, True


def tenant_invitation_status(invitation: TenantInvitation, *, now: datetime | None = None) -> str:
    """返回邀请当前的稳定状态键。"""
    if invitation.used_at is not None:
        return "used"
    if invitation.revoked_at is not None:
        return "revoked"
    if _as_utc(invitation.expires_at) <= (now or datetime.now(UTC)):
        return "expired"
    return "pending"
