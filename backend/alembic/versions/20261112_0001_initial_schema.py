"""Initial WMS Core PostgreSQL 16 schema with JSONB GIN indexes.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-12 15:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("shift_name", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_role", "users", ["role"], unique=False)

    op.create_table(
        "units_of_measure",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("plural_name", sa.String(length=64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_units_of_measure_code", "units_of_measure", ["code"], unique=True)

    op.create_table(
        "custom_dictionaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_custom_dictionaries_slug", "custom_dictionaries", ["slug"], unique=True)
    op.create_index(
        "ix_custom_dictionaries_items_gin",
        "custom_dictionaries",
        ["items"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "attribute_definitions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=150), nullable=False),
        sa.Column("field_type", sa.String(length=32), nullable=False),
        sa.Column("dictionary_id", sa.Uuid(), nullable=True),
        sa.Column("default_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.ForeignKeyConstraint(
            ["dictionary_id"], ["custom_dictionaries.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("target_type", "key", name="uq_attribute_target_key"),
    )
    op.create_index(
        "ix_attribute_definitions_target_type",
        "attribute_definitions",
        ["target_type"],
        unique=False,
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_categories_slug", "categories", ["slug"], unique=True)

    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("barcode", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sku", sa.String(length=100), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("base_unit_id", sa.Uuid(), nullable=False),
        sa.Column("secondary_unit_id", sa.Uuid(), nullable=True),
        sa.Column("conversion_factor", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column(
            "current_stock_base",
            sa.Numeric(precision=14, scale=4),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "allow_negative_stock",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "enabled_attribute_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "custom_attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["base_unit_id"], ["units_of_measure.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["secondary_unit_id"], ["units_of_measure.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_products_barcode", "products", ["barcode"], unique=True)
    op.create_index("ix_products_name", "products", ["name"], unique=False)
    op.create_index("ix_products_sku", "products", ["sku"], unique=True)
    op.create_index(
        "ix_products_enabled_attr_gin",
        "products",
        ["enabled_attribute_ids"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_products_custom_attr_gin",
        "products",
        ["custom_attributes"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "product_allowed_units",
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("unit_id", sa.Uuid(), nullable=False),
        sa.Column("multiplier_to_base", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["unit_id"], ["units_of_measure.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("product_id", "unit_id"),
    )

    op.create_table(
        "inventory_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tx_type", sa.String(length=32), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("quantity_entered", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("unit_id", sa.Uuid(), nullable=False),
        sa.Column("quantity_base_calculated", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("stock_before_base", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("stock_after_base", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("performed_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("counterparty_name", sa.String(length=200), nullable=False),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "custom_attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["performed_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["unit_id"], ["units_of_measure.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_transactions_tx_type", "inventory_transactions", ["tx_type"], unique=False)
    op.create_index("ix_inventory_transactions_product_id", "inventory_transactions", ["product_id"], unique=False)
    op.create_index(
        "ix_inventory_transactions_performed_by_user_id",
        "inventory_transactions",
        ["performed_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_transactions_performed_at",
        "inventory_transactions",
        ["performed_at"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_tx_custom_attr_gin",
        "inventory_transactions",
        ["custom_attributes"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.String(length=128), nullable=True),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity"], unique=False)
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)
    op.create_index(
        "ix_audit_logs_payload_gin",
        "audit_logs",
        ["payload"],
        unique=False,
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("inventory_transactions")
    op.drop_table("product_allowed_units")
    op.drop_table("products")
    op.drop_table("categories")
    op.drop_table("attribute_definitions")
    op.drop_table("custom_dictionaries")
    op.drop_table("units_of_measure")
    op.drop_table("users")
