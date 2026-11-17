import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONBType


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    barcode: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    base_unit_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("units_of_measure.id", ondelete="RESTRICT"), nullable=False
    )
    secondary_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("units_of_measure.id", ondelete="SET NULL"), nullable=True
    )
    conversion_factor: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    current_stock_base: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), default=Decimal("0.0000"), nullable=False
    )
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled_attribute_ids: Mapped[list[str]] = mapped_column(
        JSONBType, default=list, nullable=False
    )
    configured_attributes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBType, default=list, nullable=False
    )
    custom_attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONBType, default=dict, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    category = relationship("Category", lazy="selectin")
    base_unit = relationship("UnitOfMeasure", foreign_keys=[base_unit_id], lazy="selectin")
    secondary_unit = relationship(
        "UnitOfMeasure", foreign_keys=[secondary_unit_id], lazy="selectin"
    )
    allowed_units: Mapped[list["ProductAllowedUnit"]] = relationship(
        "ProductAllowedUnit",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index(
            "ix_products_enabled_attr_gin",
            "enabled_attribute_ids",
            postgresql_using="gin",
        ),
        Index(
            "ix_products_custom_attr_gin",
            "custom_attributes",
            postgresql_using="gin",
        ),
    )


class ProductAllowedUnit(Base):
    __tablename__ = "product_allowed_units"

    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("units_of_measure.id", ondelete="RESTRICT"), primary_key=True
    )
    multiplier_to_base: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    product = relationship("Product", back_populates="allowed_units")
    unit = relationship("UnitOfMeasure", lazy="selectin")
