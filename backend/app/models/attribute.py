import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONBType


class AttributeDefinition(Base):
    __tablename__ = "attribute_definitions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(150), nullable=False)
    field_type: Mapped[str] = mapped_column(String(32), nullable=False)
    dictionary_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("custom_dictionaries.id", ondelete="SET NULL"), nullable=True
    )
    default_value: Mapped[Any | None] = mapped_column(JSONBType, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    dictionary = relationship("CustomDictionary", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("target_type", "key", name="uq_attribute_target_key"),
    )
