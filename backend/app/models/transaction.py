import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONBType


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tx_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    quantity_entered: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("units_of_measure.id", ondelete="RESTRICT"), nullable=False
    )
    quantity_base_calculated: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    stock_before_base: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    stock_after_base: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    performed_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    counterparty_name: Mapped[str] = mapped_column(String(200), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    custom_attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONBType, default=dict, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    product = relationship("Product", lazy="selectin")
    unit = relationship("UnitOfMeasure", lazy="selectin")
    performed_by = relationship("User", lazy="selectin")

    __table_args__ = (
        Index(
            "ix_inventory_tx_custom_attr_gin",
            "custom_attributes",
            postgresql_using="gin",
        ),
    )
