from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PassportEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    passport_id: uuid.UUID
    event_type: str
    state_snapshot: str
    product_type_snapshot: str
    product_name_snapshot: str
    barcode_qr_snapshot: str
    qty_snapshot: Decimal
    qty_delta: Decimal
    batch_number_snapshot: str
    production_date_snapshot: date
    storage_responsible_snapshot: str
    registered_at: datetime
    operator_id: uuid.UUID | None = None
    operator_name_snapshot: str
    to_location_name: str
    to_store_id: uuid.UUID | None = None
    from_location_name: str
    from_store_id: uuid.UUID | None = None
    balance_before_store: Decimal
    balance_after_store: Decimal
    state_changed_from: str | None = None
    notes: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class ProcessingActRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    act_code: str
    source_passport_id: uuid.UUID
    store_id: uuid.UUID
    store_name: str | None = None
    target_store_id: uuid.UUID
    target_store_name: str | None = None
    performed_by_id: uuid.UUID
    performed_by_name: str | None = None
    performed_at: datetime
    input_qty: Decimal
    output_qty: Decimal
    loss_qty: Decimal
    loss_percent: Decimal
    notes: str | None = None
    created_at: datetime


class PassportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    passport_code: str
    qr_payload: str
    parent_passport_id: uuid.UUID | None = None
    parent_passport_code: str | None = None
    processing_act_id: uuid.UUID | None = None
    product_id: uuid.UUID
    product_name: str
    product_barcode: str
    product_sku: str
    unit_name: str
    batch_number: str
    production_date: date
    current_state: str
    current_product_type: str
    current_qty: Decimal
    current_store_id: uuid.UUID
    current_store_name: str
    current_store_type: str
    pending_target_store_id: uuid.UUID | None = None
    pending_target_store_name: str | None = None
    current_storage_responsible: str
    status: str
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    created_by_operator_id: uuid.UUID | None = None
    created_by_operator_name: str | None = None
    created_at: datetime
    updated_at: datetime
    events: list[PassportEventRead] = Field(default_factory=list)
    processing_act: ProcessingActRead | None = None


class InitialReceiptCreate(BaseModel):
    product_id: uuid.UUID
    store_id: uuid.UUID
    qty: Decimal = Field(..., gt=0)
    state: str = Field(..., min_length=1)
    product_type: str = Field(..., min_length=1)
    batch_number: str = Field(..., min_length=1)
    production_date: date
    storage_responsible: str = Field(..., min_length=1)
    from_location_name: str = Field(..., min_length=1)
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None


class PassportDispatchCreate(BaseModel):
    target_store_id: uuid.UUID
    state_at_dispatch: str = Field(..., min_length=1)
    actual_qty_at_dispatch: Decimal = Field(..., gt=0)
    storage_responsible: str = Field(..., min_length=1)
    notes: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class PassportAcceptReceiptCreate(BaseModel):
    state_at_receipt: str = Field(..., min_length=1)
    actual_qty_at_receipt: Decimal = Field(..., gt=0)
    storage_responsible: str = Field(..., min_length=1)
    notes: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class BoningOutputItem(BaseModel):
    product_id: uuid.UUID
    product_type: str = Field(default="Г.П.")
    state: str = Field(..., min_length=1)
    qty: Decimal = Field(..., gt=0)
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class BoningProcessCreate(BaseModel):
    target_store_id: uuid.UUID
    output_items: list[BoningOutputItem] = Field(..., min_length=1)
    production_date: date | None = None
    batch_number: str | None = None
    storage_responsible: str = Field(..., min_length=1)
    direct_receive: bool = False
    notes: str | None = None


class PassportGenealogyTree(BaseModel):
    current: PassportRead
    processing_act: ProcessingActRead | None = None
    ancestors: list[PassportRead] = Field(default_factory=list)
    descendants: list[PassportRead] = Field(default_factory=list)


class StorePassportAggregatedProduct(BaseModel):
    product_id: uuid.UUID
    product_name: str
    barcode: str
    sku: str
    unit_name: str
    total_qty: Decimal
    passports_count: int
    by_state: dict[str, Decimal] = Field(default_factory=dict)
    by_product_type: dict[str, Decimal] = Field(default_factory=dict)
    passports: list[PassportRead] = Field(default_factory=list)


class StorePassportInventorySummary(BaseModel):
    store_id: uuid.UUID
    store_name: str
    store_code: str | None = None
    store_type: str
    total_stock: Decimal
    products_count: int
    passports_count: int
    in_transit_incoming_count: int
    products: list[StorePassportAggregatedProduct] = Field(default_factory=list)
