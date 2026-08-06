"""租户成员的本地账号目录解析。"""

from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.user import User


@dataclass(frozen=True)
class TenantAccountProfile:
    """可安全返回给租户管理员的本地账号信息。"""

    account_id: str
    username: str
    email: str


def resolve_local_account_profiles(
    db: Session,
    account_ids: Iterable[str | None],
) -> dict[str, TenantAccountProfile]:
    """一次查询解析本地账号；外部身份或无效标识保留为无资料状态。"""

    local_user_ids: set[UUID] = set()
    for raw_account_id in account_ids:
        account_id = str(raw_account_id or "").strip()
        if not account_id:
            continue
        try:
            local_user_ids.add(UUID(account_id))
        except ValueError:
            continue

    if not local_user_ids:
        return {}

    users = db.query(User).filter(User.id.in_(local_user_ids)).all()
    return {
        str(user.id): TenantAccountProfile(
            account_id=str(user.id),
            username=str(user.username or "").strip(),
            email=str(user.email or "").strip(),
        )
        for user in users
    }


__all__ = ["TenantAccountProfile", "resolve_local_account_profiles"]
