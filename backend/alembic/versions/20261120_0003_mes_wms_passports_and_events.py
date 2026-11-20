"""Add MES/WMS cell passports, processing acts, and EPCIS event snapshots ledger.

Revision ID: 0003_mes_wms
Revises: 0002_stores
Create Date: 2026-11-20 15:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_mes_wms"
down_revision: Union[str, Sequence[str], None] = "0002_stores"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add store_type to stores
    op.add_column(
        "stores",
        sa.Column("store_type", sa.String(length=32), nullable=False, server_default="OTHER"),
    )
    op.create_index("ix_stores_store_type", "stores", ["store_type"])

    # 2. Create processing_acts (Акты обвалки / разделки)
    op.create_table(
        "processing_acts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("act_code", sa.String(length=64), nullable=False),
        sa.Column("source_passport_id", sa.Uuid(), nullable=False),
        sa.Column("store_id", sa.Uuid(), nullable=False),
        sa.Column("target_store_id", sa.Uuid(), nullable=False),
        sa.Column("performed_by_id", sa.Uuid(), nullable=False),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("input_qty", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("output_qty", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("loss_qty", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("loss_percent", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target_store_id"], ["stores.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["performed_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_processing_acts_act_code", "processing_acts", ["act_code"], unique=True)
    op.create_index("ix_processing_acts_source_passport_id", "processing_acts", ["source_passport_id"])
    op.create_index("ix_processing_acts_store_id", "processing_acts", ["store_id"])
    op.create_index("ix_processing_acts_target_store_id", "processing_acts", ["target_store_id"])

    # 3. Create passports (Паспорта ячеек / LPN)
    op.create_table(
        "passports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("passport_code", sa.String(length=64), nullable=False),
        sa.Column("qr_payload", sa.String(length=128), nullable=False),
        sa.Column("parent_passport_id", sa.Uuid(), nullable=True),
        sa.Column("processing_act_id", sa.Uuid(), nullable=True),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("batch_number", sa.String(length=100), nullable=False),
        sa.Column("production_date", sa.Date(), nullable=False),
        sa.Column("current_state", sa.String(length=100), nullable=False),
        sa.Column("current_product_type", sa.String(length=100), nullable=False),
        sa.Column("current_qty", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("current_store_id", sa.Uuid(), nullable=False),
        sa.Column("pending_target_store_id", sa.Uuid(), nullable=True),
        sa.Column("current_storage_responsible", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "custom_attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_by_operator_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parent_passport_id"], ["passports.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["processing_act_id"], ["processing_acts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["current_store_id"], ["stores.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["pending_target_store_id"], ["stores.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_operator_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_passports_passport_code", "passports", ["passport_code"], unique=True)
    op.create_index("ix_passports_qr_payload", "passports", ["qr_payload"], unique=True)
    op.create_index("ix_passports_parent_passport_id", "passports", ["parent_passport_id"])
    op.create_index("ix_passports_processing_act_id", "passports", ["processing_act_id"])
    op.create_index("ix_passports_product_id", "passports", ["product_id"])
    op.create_index("ix_passports_batch_number", "passports", ["batch_number"])
    op.create_index("ix_passports_current_store_id", "passports", ["current_store_id"])
    op.create_index("ix_passports_pending_target_store_id", "passports", ["pending_target_store_id"])
    op.create_index("ix_passports_status", "passports", ["status"])
    op.create_index(
        "ix_passports_custom_attr_gin",
        "passports",
        ["custom_attributes"],
        postgresql_using="gin",
    )

    # Add foreign key from processing_acts.source_passport_id to passports.id
    op.create_foreign_key(
        "fk_processing_acts_source_passport",
        "processing_acts",
        "passports",
        ["source_passport_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # 4. Create passport_events (GS1 EPCIS 10-field Snapshot Event Ledger)
    op.create_table(
        "passport_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("passport_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("state_snapshot", sa.String(length=100), nullable=False),
        sa.Column("product_type_snapshot", sa.String(length=100), nullable=False),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("barcode_qr_snapshot", sa.String(length=128), nullable=False),
        sa.Column("qty_snapshot", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("qty_delta", sa.Numeric(precision=12, scale=3), nullable=False, server_default="0.000"),
        sa.Column("batch_number_snapshot", sa.String(length=100), nullable=False),
        sa.Column("production_date_snapshot", sa.Date(), nullable=False),
        sa.Column("storage_responsible_snapshot", sa.String(length=200), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("operator_id", sa.Uuid(), nullable=True),
        sa.Column("operator_name_snapshot", sa.String(length=200), nullable=False),
        sa.Column("to_location_name", sa.String(length=200), nullable=False),
        sa.Column("to_store_id", sa.Uuid(), nullable=True),
        sa.Column("from_location_name", sa.String(length=200), nullable=False),
        sa.Column("from_store_id", sa.Uuid(), nullable=True),
        sa.Column("balance_before_store", sa.Numeric(precision=12, scale=3), nullable=False, server_default="0.000"),
        sa.Column("balance_after_store", sa.Numeric(precision=12, scale=3), nullable=False, server_default="0.000"),
        sa.Column("state_changed_from", sa.String(length=100), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column(
            "custom_attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.ForeignKeyConstraint(["passport_id"], ["passports.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_passport_events_passport_id", "passport_events", ["passport_id"])
    op.create_index("ix_passport_events_event_type", "passport_events", ["event_type"])
    op.create_index("ix_passport_events_registered_at", "passport_events", ["registered_at"])
    op.create_index("ix_passport_events_operator_id", "passport_events", ["operator_id"])
    op.create_index(
        "ix_passport_events_custom_attr_gin",
        "passport_events",
        ["custom_attributes"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_table("passport_events")
    op.drop_constraint("fk_processing_acts_source_passport", "processing_acts", type_="foreignkey")
    op.drop_table("passports")
    op.drop_table("processing_acts")
    op.drop_index("ix_stores_store_type", "stores")
    op.drop_column("stores", "store_type")
