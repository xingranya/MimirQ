from contextlib import nullcontext
from importlib import util
from pathlib import Path


def _load_migration():
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "0027_add_tenant_invitations.py"
    spec = util.spec_from_file_location("mimirq_tenant_invitations_migration", migration_path)
    assert spec is not None and spec.loader is not None
    migration = util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_tenant_invitation_migration_applies_table_and_indexes(monkeypatch) -> None:
    migration = _load_migration()
    operations: list[tuple[str, str, list]] = []

    monkeypatch.setattr(
        migration.op,
        "get_bind",
        lambda: type("Binding", (), {"dialect": type("Dialect", (), {"name": "postgresql"})})(),
        raising=False,
    )
    monkeypatch.setattr(
        migration.op,
        "get_context",
        lambda: type("Context", (), {"autocommit_block": lambda: nullcontext()})(),
        raising=False,
    )
    monkeypatch.setattr(
        migration.op,
        "create_table",
        lambda name, *cols, **kwargs: operations.append(("create_table", name, [column for column in cols])),
        raising=False,
    )
    monkeypatch.setattr(
        migration.op,
        "create_index",
        lambda name, table, columns, **kwargs: operations.append(("create_index", name, [table, list(columns)])),
        raising=False,
    )
    monkeypatch.setattr(
        migration.op,
        "drop_index",
        lambda name, **kwargs: operations.append(("drop_index", name, [])),
        raising=False,
    )
    monkeypatch.setattr(
        migration.op,
        "drop_table",
        lambda name: operations.append(("drop_table", name, [])),
        raising=False,
    )

    migration.upgrade()
    migration.downgrade()

    create_tables = [operation for operation in operations if operation[0] == "create_table"]
    assert len(create_tables) == 1
    assert create_tables[0][1] == "tenant_invitations"
    column_names = {column.name for column in create_tables[0][2] if getattr(column, "name", None)}
    assert {"id", "tenant_id", "email", "nonce_hash", "used_at", "revoked_at"} <= column_names

    create_indexes = [operation[1] for operation in operations if operation[0] == "create_index"]
    assert create_indexes == [
        "ix_tenant_invitations_tenant_id",
        "ix_tenant_invitations_email",
        "ix_tenant_invitations_expires_at",
        "ix_tenant_invitations_used_at",
        "ix_tenant_invitations_revoked_at",
    ]
    assert ("drop_table", "tenant_invitations", []) in operations


def test_tenant_invitation_revision_chain_contiguous() -> None:
    migration = _load_migration()
    assert migration.down_revision == "0026_add_index_drift_items"
