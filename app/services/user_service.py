"""
User service: register, authenticate, and tenant membership bootstrap.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import UserRoles
from app.core.security import hash_password, verify_password
from app.models.dataset import Dataset, DatasetPermissionEnum
from app.models.tenant import Tenant, TenantMember
from app.models.tenant_group import TenantGroup, TenantGroupMember
from app.models.user import User


class UserService:
    @staticmethod
    def get_default_tenant_id() -> UUID:
        """返回部署配置中的默认租户标识。"""

        raw_tenant = str(getattr(settings, "DEFAULT_TENANT_ID", "") or "").strip()
        if not raw_tenant:
            raise HTTPException(status_code=500, detail="DEFAULT_TENANT_ID is not configured")
        try:
            return UUID(raw_tenant)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="DEFAULT_TENANT_ID is invalid") from exc

    @staticmethod
    def get_by_email(db: Session, email: str) -> User | None:
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def get_by_username(db: Session, username: str) -> User | None:
        return db.query(User).filter(User.username == username).first()

    @staticmethod
    def get_by_id(db: Session, user_id: str) -> User | None:
        try:
            user_uuid = UUID(str(user_id))
        except ValueError:
            return None
        return db.query(User).filter(User.id == user_uuid).first()

    @staticmethod
    def authenticate(db: Session, identifier: str, password: str) -> User:
        ident = (identifier or "").strip()
        ident_lower = ident.lower()
        users = (
            db.query(User)
            .filter((User.email == ident_lower) | (User.username == ident))
            .all()
        )
        if len(users) != 1:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        user = users[0]
        if not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")
        return user

    @staticmethod
    def _create_user_record(db: Session, *, email: str, username: str, password: str) -> User:
        normalized_email = (email or "").strip().lower()
        normalized_username = (username or "").strip()

        if not normalized_email or not normalized_username:
            raise HTTPException(status_code=400, detail="Email and username are required")

        min_len = int(getattr(settings, "PASSWORD_MIN_LENGTH", 8))
        if len(password or "") < min_len:
            raise HTTPException(status_code=400, detail=f"Password must be at least {min_len} characters")

        if UserService.get_by_email(db, normalized_email):
            raise HTTPException(status_code=400, detail="Email already registered")
        if db.query(User.id).filter(func.lower(User.username) == normalized_email).first():
            raise HTTPException(status_code=400, detail="Email already registered")
        if UserService.get_by_username(db, normalized_username):
            raise HTTPException(status_code=400, detail="Username already registered")
        if db.query(User.id).filter(User.email == normalized_username.lower()).first():
            raise HTTPException(status_code=400, detail="Username already registered")

        try:
            password_hash = hash_password(password)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        user = User(
            email=normalized_email,
            username=normalized_username,
            password_hash=password_hash,
            is_active=True,
        )
        db.add(user)
        db.flush()
        return user

    @staticmethod
    def create_user(db: Session, *, email: str, username: str, password: str) -> User:
        """创建首个本地管理员账号并绑定默认租户。"""
        user = UserService._create_user_record(
            db,
            email=email,
            username=username,
            password=password,
        )

        UserService.ensure_default_membership(db, user_id=str(user.id))

        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def create_invited_user(
        db: Session,
        *,
        email: str,
        username: str,
        password: str,
        tenant_id: UUID,
        role: str,
    ) -> User:
        """在调用方事务内创建受邀账号与租户成员关系。"""
        normalized_role = str(role or "").strip().lower()
        allowed_roles = {
            UserRoles.ADMIN,
            UserRoles.AUDITOR,
            UserRoles.EDITOR,
            UserRoles.DATASET_OPERATOR,
            UserRoles.VIEWER,
        }
        if normalized_role not in allowed_roles:
            raise HTTPException(status_code=400, detail="邀请角色无效")

        tenant = (
            db.query(Tenant)
            .filter(Tenant.id == tenant_id, func.lower(Tenant.status) == "active")
            .with_for_update()
            .first()
        )
        if not tenant:
            raise HTTPException(status_code=404, detail="邀请对应的组织不存在或已停用")

        user = UserService._create_user_record(
            db,
            email=email,
            username=username,
            password=password,
        )
        member = TenantMember(
            tenant_id=tenant_id,
            user_id=str(user.id),
            role=normalized_role,
            is_active=True,
            is_current=True,
        )
        db.add(member)
        db.flush()
        return user

    @staticmethod
    def create_self_registered_user(
        db: Session,
        *,
        email: str,
        username: str,
        password: str,
        group_id: UUID,
    ) -> tuple[User, UUID]:
        """在同一事务中创建查看者账号，并加入其选择的成员组。"""

        tenant_id = UserService.get_default_tenant_id()
        tenant = (
            db.query(Tenant)
            .filter(Tenant.id == tenant_id, func.lower(Tenant.status) == "active")
            .with_for_update()
            .first()
        )
        if not tenant:
            raise HTTPException(status_code=404, detail="自助注册对应的组织不存在或已停用")

        group = (
            db.query(TenantGroup)
            .filter(TenantGroup.tenant_id == tenant_id, TenantGroup.id == group_id)
            .with_for_update()
            .first()
        )
        if not group:
            raise HTTPException(status_code=400, detail="选择的成员组不存在，请刷新后重新选择")

        user = UserService._create_user_record(
            db,
            email=email,
            username=username,
            password=password,
        )
        account_id = str(user.id)
        db.add_all(
            [
                TenantMember(
                    tenant_id=tenant_id,
                    user_id=account_id,
                    role=UserRoles.VIEWER,
                    is_active=True,
                    is_current=True,
                ),
                TenantGroupMember(
                    tenant_id=tenant_id,
                    group_id=group.id,
                    user_id=account_id,
                ),
                Dataset(
                    tenant_id=tenant_id,
                    name=f"{user.username} 的个人知识库",
                    description="仅你本人可查看和上传内容。",
                    permission=DatasetPermissionEnum.ONLY_ME,
                    owner_id=account_id,
                    dataset_metadata={"personal_workspace": True},
                ),
            ]
        )
        db.flush()
        return user, tenant_id

    @staticmethod
    def ensure_default_membership(db: Session, *, user_id: str) -> None:
        tenant_id = UserService.get_default_tenant_id()

        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).with_for_update().first()
        if not tenant:
            tenant = Tenant(
                id=tenant_id,
                name=f"tenant-{tenant_id}",
                status="active",
                plan="basic",
            )
            db.add(tenant)
            db.flush()

        if db.query(TenantMember.id).filter(TenantMember.tenant_id == tenant_id).first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="首次设置已关闭。如需开通账号，请发送邮件至 xingranya@qq.com。",
            )
        db.add(
            TenantMember(
                tenant_id=tenant_id,
                user_id=user_id,
                role=UserRoles.OWNER,
                is_active=True,
                is_current=True,
            )
        )

    @staticmethod
    def get_default_tenant_member_count(db: Session) -> int:
        tenant_id = UserService.get_default_tenant_id()
        return int(
            db.query(TenantMember)
            .filter(TenantMember.tenant_id == tenant_id)
            .count()
        )

    @staticmethod
    def mark_login(db: Session, user: User) -> None:
        user.last_login_at = datetime.now(UTC)
        db.add(user)
        db.commit()

    @staticmethod
    def get_current_tenant_id(
        db: Session,
        *,
        user_id: str | None = None,
        _user_id: str | None = None,
    ) -> UUID | None:
        """
        Best-effort current tenant selection for token issuance.

        Prefers an explicit TenantMember marked as is_current; otherwise falls back to the most-recent
        membership row. Returns None when no membership exists.
        """
        uid_raw = user_id if user_id is not None else _user_id
        uid = str(uid_raw or "").strip()
        if not uid:
            return None

        member = (
            db.query(TenantMember)
            .join(Tenant, Tenant.id == TenantMember.tenant_id)
            .filter(
                TenantMember.user_id == uid,
                TenantMember.is_active.is_(True),
                TenantMember.is_current.is_(True),
                func.lower(Tenant.status) == "active",
            )
            .order_by(desc(TenantMember.updated_at), desc(TenantMember.created_at))
            .first()
        )
        if member and getattr(member, "tenant_id", None):
            return member.tenant_id

        member = (
            db.query(TenantMember)
            .join(Tenant, Tenant.id == TenantMember.tenant_id)
            .filter(
                TenantMember.user_id == uid,
                TenantMember.is_active.is_(True),
                func.lower(Tenant.status) == "active",
            )
            .order_by(desc(TenantMember.updated_at), desc(TenantMember.created_at))
            .first()
        )
        if member and getattr(member, "tenant_id", None):
            return member.tenant_id

        return None
