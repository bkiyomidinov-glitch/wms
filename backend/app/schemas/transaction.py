from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import TransactionType
from app.schemas.store import StoreRead
from app.schemas.unit import UnitRead


class TransactionCreate(BaseModel):
    tx_type: TransactionType
    product_id: UUID
    quantity_entered: Decimal = Field(..., gt=Decimal("0"))
    unit_id: UUID
    store_id: UUID | None = None
    counterparty_name: str | None = Field(default=None, max_length=200)
    performed_at: datetime | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=1000)
    adjustment_direction: str | None = Field(
        default=None, description="For ADJUSTMENT only: 'INCREASE' or 'DECREASE'"
    )
    unit_multiplier_to_base: Decimal | None = Field(
        default=None, description="Optional multiplier to product base unit"
    )

    @model_validator(mode="after")
    def validate_adjustment_fields(self) -> "TransactionCreate":
        if self.tx_type == TransactionType.ADJUSTMENT:
            if not self.notes or not self.notes.strip():
                raise ValueError("Для корректировки остатка обязательно укажите причину (notes)")
            if self.adjustment_direction not in {"INCREASE", "DECREASE"}:
                raise ValueError(
                    "Для корректировки необходимо указать направление: INCREASE или DECREASE"
                )
        return self


class TransactionProductSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    barcode: str
    name: str
    sku: str
    base_unit: UnitRead
    secondary_unit: UnitRead | None = None
    conversion_factor: Decimal | None = None


class TransactionUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    full_name: str
    role: str
    shift_name: str | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tx_type: TransactionType
    product_id: UUID
    quantity_entered: Decimal
    unit_id: UUID
    quantity_base_calculated: Decimal
    stock_before_base: Decimal
    stock_after_base: Decimal
    performed_by_user_id: UUID
    store_id: UUID | None = None
    counterparty_name: str
    performed_at: datetime
    custom_attributes: dict[str, Any]
    notes: str | None
    created_at: datetime
    product: TransactionProductSummary
    unit: UnitRead
    performed_by: TransactionUserSummary
    store: StoreRead | None = None
