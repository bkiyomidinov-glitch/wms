from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.category import CategoryRead
from app.schemas.unit import UnitRead


class AllowedUnitInput(BaseModel):
    unit_id: UUID
    multiplier_to_base: Decimal = Field(..., gt=Decimal("0"))


class AllowedUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unit_id: UUID
    multiplier_to_base: Decimal
    unit: UnitRead


class ProductCreate(BaseModel):
    barcode: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=2, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    category_id: UUID | None = None
    base_unit_id: UUID | None = None
    secondary_unit_id: UUID | None = None
    conversion_factor: Decimal | None = Field(default=None, gt=Decimal("0"))
    initial_stock_base: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    allow_negative_stock: bool = False
    allowed_units: list[AllowedUnitInput] = Field(default_factory=list)
    enabled_attribute_ids: list[UUID] = Field(default_factory=list)
    configured_attributes: list[dict[str, Any]] = Field(default_factory=list)
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True

    @field_validator("barcode", "name")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return v.strip()

    @field_validator("initial_stock_base")
    @classmethod
    def validate_integer_initial_stock(cls, v: Decimal) -> Decimal:
        if v < 0 or v != int(v):
            raise ValueError("Начальный остаток должен быть целым неотрицательным числом")
        return Decimal(int(v))


class ProductUpdate(BaseModel):
    barcode: str | None = Field(default=None, min_length=1, max_length=128)
    name: str | None = Field(default=None, min_length=2, max_length=255)
    sku: str | None = Field(default=None, min_length=2, max_length=100)
    category_id: UUID | None = None
    base_unit_id: UUID | None = None
    secondary_unit_id: UUID | None = None
    conversion_factor: Decimal | None = Field(default=None, gt=Decimal("0"))
    allow_negative_stock: bool | None = None
    allowed_units: list[AllowedUnitInput] | None = None
    enabled_attribute_ids: list[UUID] | None = None
    configured_attributes: list[dict[str, Any]] | None = None
    custom_attributes: dict[str, Any] | None = None
    is_active: bool | None = None


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    barcode: str
    name: str
    sku: str
    category_id: UUID | None
    base_unit_id: UUID
    secondary_unit_id: UUID | None
    conversion_factor: Decimal | None
    current_stock_base: Decimal
    secondary_stock_calculated: Decimal | None = None
    stock_display: str = ""
    allow_negative_stock: bool
    enabled_attribute_ids: list[str]
    configured_attributes: list[dict[str, Any]] = Field(default_factory=list)
    custom_attributes: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    category: CategoryRead | None = None
    base_unit: UnitRead
    secondary_unit: UnitRead | None = None
    allowed_units: list[AllowedUnitRead] = Field(default_factory=list)
