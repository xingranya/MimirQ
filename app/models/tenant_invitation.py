"""租户成员邀请的持久化生命周期模型。"""

import uuid

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class TenantInvitation(Base):
    """只保存令牌 nonce 哈希的租户成员邀请。"""

    __tablename__ = "tenant_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(32), nullable=False)
    invited_by = Column(String(255), nullable=False)
    nonce_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True, index=True)
    used_by_user_id = Column(String(255), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    revoked_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

