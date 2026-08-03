"""增加租户成员邀请生命周期表。"""

import sqlalchemy as sa

from alembic import op

revision = "0027_add_tenant_invitations"
down_revision = "0026_add_index_drift_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_invitations",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("invited_by", sa.String(255), nullable=False),
        sa.Column("nonce_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_user_id", sa.String(255), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("nonce_hash", name="uq_tenant_invitations_nonce_hash"),
    )
    op.create_index("ix_tenant_invitations_tenant_id", "tenant_invitations", ["tenant_id"])
    op.create_index("ix_tenant_invitations_email", "tenant_invitations", ["email"])
    op.create_index("ix_tenant_invitations_expires_at", "tenant_invitations", ["expires_at"])
    op.create_index("ix_tenant_invitations_used_at", "tenant_invitations", ["used_at"])
    op.create_index("ix_tenant_invitations_revoked_at", "tenant_invitations", ["revoked_at"])


def downgrade() -> None:
    op.drop_index("ix_tenant_invitations_revoked_at", table_name="tenant_invitations")
    op.drop_index("ix_tenant_invitations_used_at", table_name="tenant_invitations")
    op.drop_index("ix_tenant_invitations_expires_at", table_name="tenant_invitations")
    op.drop_index("ix_tenant_invitations_email", table_name="tenant_invitations")
    op.drop_index("ix_tenant_invitations_tenant_id", table_name="tenant_invitations")
    op.drop_table("tenant_invitations")
