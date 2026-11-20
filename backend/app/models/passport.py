from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONBType


class ProcessingAct(Base):
    """Акт обвалки / разделки сырья с живым материальным балансом потерь (Mass Balance)."""

    __tablename__ = "processing_acts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    act_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    source_passport_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("passports.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("stores.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    target_store_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("stores.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    performed_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    input_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    output_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    loss_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    loss_percent: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    store = relationship("Store", foreign_keys=[store_id], lazy="selectin")
    target_store = relationship("Store", foreign_keys=[target_store_id], lazy="selectin")
    performed_by = relationship("User", foreign_keys=[performed_by_id], lazy="selectin")


class Passport(Base):
    """Паспорт ячейки (LPN) — текущее состояние и неизменяемое ядро ячейки."""

    __tablename__ = "passports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    passport_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    lineage_path: Mapped[str] = mapped_column(String(255), index=True, nullable=False, default="")
    qr_payload: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    root_passport_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("passports.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parent_passport_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("passports.id", ondelete="SET NULL"), nullable=True, index=True
    )
    processing_act_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("processing_acts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    child_seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    batch_number: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    production_date: Mapped[date] = mapped_column(Date, nullable=False)
    current_state: Mapped[str] = mapped_column(String(100), nullable=False)
    current_product_type: Mapped[str] = mapped_column(String(100), nullable=False)
    initial_qty: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), default=Decimal("0.000"), nullable=False
    )
    current_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    current_store_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("stores.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    pending_target_store_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True, index=True
    )
    current_storage_responsible: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    custom_attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONBType, default=dict, nullable=False
    )
    created_by_operator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
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

    product = relationship("Product", lazy="selectin")
    current_store = relationship("Store", foreign_keys=[current_store_id], lazy="selectin")
    pending_target_store = relationship(
        "Store", foreign_keys=[pending_target_store_id], lazy="selectin"
    )
    created_by = relationship("User", foreign_keys=[created_by_operator_id], lazy="selectin")
    parent_passport = relationship(
        "Passport",
        remote_side=[id],
        foreign_keys=[parent_passport_id],
        back_populates="child_passports",
        lazy="selectin",
    )
    child_passports = relationship(
        "Passport",
        foreign_keys=[parent_passport_id],
        back_populates="parent_passport",
        lazy="selectin",
    )
    events: Mapped[list[PassportEvent]] = relationship(
        "PassportEvent",
        back_populates="passport",
        cascade="all, delete-orphan",
        order_by="PassportEvent.registered_at.asc()",
        lazy="selectin",
    )
    processing_act = relationship(
        "ProcessingAct",
        foreign_keys=[processing_act_id],
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_passports_custom_attr_gin", "custom_attributes", postgresql_using="gin"),
    )


class PassportEvent(Base):
    """Неизменяемая лента полных снимков всех 10 полей паспорта на КАЖДОЕ действие (GS1 EPCIS)."""

    __tablename__ = "passport_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    passport_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("passports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)

    # 10 ключевых полей снимка
    state_snapshot: Mapped[str] = mapped_column(String(100), nullable=False)  # Поле 1
    product_type_snapshot: Mapped[str] = mapped_column(String(100), nullable=False)  # Поле 2
    product_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)  # Поле 3
    barcode_qr_snapshot: Mapped[str] = mapped_column(String(128), nullable=False)
    qty_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)  # Поле 4
    qty_delta: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), default=Decimal("0.000"), nullable=False
    )
    batch_number_snapshot: Mapped[str] = mapped_column(String(100), nullable=False)  # Поле 5
    production_date_snapshot: Mapped[date] = mapped_column(Date, nullable=False)  # Поле 6
    storage_responsible_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)  # Поле 7
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )  # Поле 8 (время)
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )  # Поле 8 (оператор)
    operator_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)

    to_location_name: Mapped[str] = mapped_column(String(200), nullable=False)  # Поле 9 (Куда →)
    to_store_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    from_location_name: Mapped[str] = mapped_column(String(200), nullable=False)  # Поле 10 (→ Откуда)
    from_store_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    balance_before_store: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), default=Decimal("0.000"), nullable=False
    )
    balance_after_store: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), default=Decimal("0.000"), nullable=False
    )
    state_changed_from: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    custom_attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONBType, default=dict, nullable=False
    )

    passport: Mapped[Passport] = relationship("Passport", back_populates="events")
    operator = relationship("User", foreign_keys=[operator_id], lazy="selectin")

    __table_args__ = (
        Index("ix_passport_events_custom_attr_gin", "custom_attributes", postgresql_using="gin"),
        Index("ix_passport_events_registered_at", "registered_at"),
    )
