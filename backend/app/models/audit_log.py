import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONBType


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    entity: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    old_value: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    new_value: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )

    user = relationship("User", lazy="selectin")

    __table_args__ = (
        Index("ix_audit_logs_payload_gin", "payload", postgresql_using="gin"),
    )
