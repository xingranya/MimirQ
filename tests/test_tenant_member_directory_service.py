import uuid
from types import SimpleNamespace

from app.services.tenant_member_directory_service import resolve_local_account_profiles


class _UserQuery:
    def __init__(self, users):  # noqa: ANN001
        self._users = users

    def filter(self, *_args):  # noqa: ANN002, ANN202
        return self

    def all(self):  # noqa: ANN202
        return self._users


class _DirectoryDB:
    def __init__(self, users):  # noqa: ANN001
        self._users = users
        self.query_count = 0

    def query(self, _model):  # noqa: ANN001, ANN202
        self.query_count += 1
        return _UserQuery(self._users)


def test_resolve_local_account_profiles_returns_username_email_and_account_id() -> None:
    user_id = uuid.uuid4()
    db = _DirectoryDB([SimpleNamespace(id=user_id, username="fox", email="fox@example.com")])

    profiles = resolve_local_account_profiles(db, [str(user_id), "external-user", None])

    assert db.query_count == 1
    assert profiles[str(user_id)].account_id == str(user_id)
    assert profiles[str(user_id)].username == "fox"
    assert profiles[str(user_id)].email == "fox@example.com"
    assert "external-user" not in profiles


def test_resolve_local_account_profiles_skips_query_without_local_user_ids() -> None:
    db = _DirectoryDB([])

    assert resolve_local_account_profiles(db, ["external-user", "", None]) == {}
    assert db.query_count == 0
