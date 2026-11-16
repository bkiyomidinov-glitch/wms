import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONBType


class CustomDictionary(Base):
    __tablename__ = "custom_dictionaries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    items: Mapped[list[dict[str, Any]] | list[str]] = mapped_column(
        JSONBType, default=list, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_custom_dictionaries_items_gin", "items", postgresql_using="gin"),
    )
