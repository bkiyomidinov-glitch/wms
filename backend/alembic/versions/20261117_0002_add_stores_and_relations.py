"""Add stores table, store relations to users and transactions, and product configured_attributes.

Revision ID: 0002_stores
Revises: 0001_initial
Create Date: 2026-11-17 14:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_stores"
down_revision: Union[str, Sequence[str], None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create stores table
    op.create_table(
        "stores",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stores_name", "stores", ["name"], unique=True)
    op.create_index("ix_stores_code", "stores", ["code"], unique=True)

    # 2. Add store_id to users
    op.add_column("users", sa.Column("store_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_users_store_id_stores", "users", "stores", ["store_id"], ["id"], ondelete="SET NULL"
    )

    # 3. Add store_id to inventory_transactions
    op.add_column("inventory_transactions", sa.Column("store_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_inventory_tx_store_id_stores",
        "inventory_transactions",
        "stores",
        ["store_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_inventory_transactions_store_id", "inventory_transactions", ["store_id"])

    # 4. Add configured_attributes to products
    op.add_column(
        "products",
        sa.Column(
            "configured_attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("products", "configured_attributes")
    op.drop_index("ix_inventory_transactions_store_id", table_name="inventory_transactions")
    op.drop_constraint("fk_inventory_tx_store_id_stores", "inventory_transactions", type_="foreignkey")
    op.drop_column("inventory_transactions", "store_id")
    op.drop_constraint("fk_users_store_id_stores", "users", type_="foreignkey")
    op.drop_column("users", "store_id")
    op.drop_index("ix_stores_code", table_name="stores")
    op.drop_index("ix_stores_name", table_name="stores")
    op.drop_table("stores")
