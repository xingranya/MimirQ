from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.constants import UserRoles

_TENANT_ROLE_DESCRIPTION = "owner|admin|auditor|editor|dataset_operator|viewer"


class TenantMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    user_id: str | None = None
    account_id: str | None = None
    username: str | None = None
    email: EmailStr | None = None
    role: str = Field(default=UserRoles.VIEWER, description=_TENANT_ROLE_DESCRIPTION)
    is_active: bool = True
    is_current: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TenantMemberListResponse(BaseModel):
    total: int = 0
    items: list[TenantMemberOut] = Field(default_factory=list)


class TenantMemberDeleteResponse(BaseModel):
    user_id: str
    removed: bool = True
    revoked_group_memberships: int = 0
    revoked_dataset_permissions: int = 0
    revoked_document_permissions: int = 0


class TenantAccessOut(BaseModel):
    tenant_id: UUID
    account_id: str
    role: str = Field(default=UserRoles.VIEWER, description=_TENANT_ROLE_DESCRIPTION)
    permissions: list[str] = Field(default_factory=list)
    navigation_user_visible_modules: list[str] = Field(default_factory=list)
    is_active: bool = True
    is_current: bool = False


class TenantMemberUpdateRequest(BaseModel):
    role: str = Field(..., description=_TENANT_ROLE_DESCRIPTION)

    @field_validator("role", mode="before")
    @classmethod
    def _normalize_role(cls, v):  # noqa: ANN001
        return str(v or "").strip().lower()

    @field_validator("role")
    @classmethod
    def _validate_role(cls, v: str) -> str:
        allowed = {
            UserRoles.OWNER,
            UserRoles.ADMIN,
            UserRoles.AUDITOR,
            UserRoles.EDITOR,
            UserRoles.DATASET_OPERATOR,
            UserRoles.VIEWER,
        }
        if v not in allowed:
            raise ValueError(f"role must be one of: {', '.join(sorted(allowed))}")
        return v


class TenantInvitationCreateRequest(BaseModel):
    email: EmailStr
    role: str = Field(default=UserRoles.VIEWER, description="admin|auditor|editor|dataset_operator|viewer")

    @field_validator("role", mode="before")
    @classmethod
    def _normalize_role(cls, value):  # noqa: ANN001
        return str(value or "").strip().lower()

    @field_validator("role")
    @classmethod
    def _validate_role(cls, value: str) -> str:
        allowed = {
            UserRoles.ADMIN,
            UserRoles.AUDITOR,
            UserRoles.EDITOR,
            UserRoles.DATASET_OPERATOR,
            UserRoles.VIEWER,
        }
        if value not in allowed:
            raise ValueError(f"role must be one of: {', '.join(sorted(allowed))}")
        return value


class TenantInvitationOut(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    token: str
    expires_at: datetime


class TenantInvitationSummary(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    invited_by: str
    status: Literal["pending", "used", "revoked", "expired"]
    expires_at: datetime
    used_at: datetime | None = None
    used_by_user_id: str | None = None
    revoked_at: datetime | None = None
    revoked_by: str | None = None
    created_at: datetime


class TenantInvitationListResponse(BaseModel):
    total: int = 0
    items: list[TenantInvitationSummary] = Field(default_factory=list)


class TenantInvitationRevokeResponse(BaseModel):
    invitation_id: UUID
    revoked: bool
    revoked_at: datetime
