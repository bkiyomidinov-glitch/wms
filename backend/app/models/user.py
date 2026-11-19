import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONBType


class UserStore(Base):
    __tablename__ = "user_stores"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("stores.id", ondelete="CASCADE"), primary_key=True
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    shift_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    store_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    permissions: Mapped[dict[str, Any]] = mapped_column(
        JSONBType,
        default=lambda: {
            "can_inbound": True,
            "can_outbound": True,
            "can_view_stock": True,
            "can_view_movements": True,
            "can_manage_products": False,
            "can_manage_stores": False,
            "can_manage_users": False,
        },
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    creator: Mapped["User | None"] = relationship("User", remote_side=[id], lazy="selectin")
    store = relationship("Store", lazy="selectin")
    stores: Mapped[list["Store"]] = relationship(
        "Store",
        secondary="user_stores",
        lazy="selectin",
    )

    def has_permission(self, perm: str) -> bool:
        if self.role == "SUPER_ADMIN":
            return True
        return bool(self.permissions.get(perm, False))

    def has_store_access(self, store_id: uuid.UUID | str | None) -> bool:
        if self.role in ("SUPER_ADMIN", "DIRECTOR"):
            return True
        if not store_id:
            return True
        store_id_str = str(store_id)
        accessible = {str(s.id) for s in (self.stores or [])}
        if self.store_id:
            accessible.add(str(self.store_id))
        return store_id_str in accessible

