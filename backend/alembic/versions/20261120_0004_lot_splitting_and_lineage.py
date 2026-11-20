"""Add lot splitting and materialized path lineage to passports.

Revision ID: 0004_lot_splitting
Revises: 0003_mes_wms
Create Date: 2026-11-20 16:10:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_lot_splitting"
down_revision: Union[str, Sequence[str], None] = "0003_mes_wms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "passports",
        sa.Column("lineage_path", sa.String(length=255), nullable=False, server_default=""),
    )
    op.add_column(
        "passports",
        sa.Column("root_passport_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "passports",
        sa.Column("child_seq", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "passports",
        sa.Column(
            "initial_qty",
            sa.Numeric(precision=12, scale=3),
            nullable=False,
            server_default="0.000",
        ),
    )

    op.create_index("ix_passports_lineage_path", "passports", ["lineage_path"])
    op.create_index("ix_passports_root_passport_id", "passports", ["root_passport_id"])
    op.create_foreign_key(
        "fk_passports_root_passport_id",
        "passports",
        "passports",
        ["root_passport_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Initialize lineage_path and initial_qty for existing rows
    op.execute("UPDATE passports SET lineage_path = passport_code WHERE lineage_path = ''")
    op.execute("UPDATE passports SET initial_qty = current_qty WHERE initial_qty = 0")
    op.execute("UPDATE passports SET root_passport_id = id WHERE root_passport_id IS NULL AND parent_passport_id IS NULL")


def downgrade() -> None:
    op.drop_constraint("fk_passports_root_passport_id", "passports", type_="foreignkey")
    op.drop_index("ix_passports_root_passport_id", "passports")
    op.drop_index("ix_passports_lineage_path", "passports")
    op.drop_column("passports", "initial_qty")
    op.drop_column("passports", "child_seq")
    op.drop_column("passports", "root_passport_id")
    op.drop_column("passports", "lineage_path")
