from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, DomainValidationError, NotFoundError
from app.domain.enums import AttributeTargetType
from app.models.category import Category
from app.models.product import Product, ProductAllowedUnit
from app.models.store import Store
from app.models.transaction import InventoryTransaction
from app.models.unit import UnitOfMeasure
from app.models.user import User
from app.schemas.product import AllowedUnitInput, ProductCreate, ProductRead, ProductUpdate
from app.services.audit_service import record_audit
from app.services.dynamic_validator import validate_dynamic_attributes


def format_quantity(value: Decimal) -> str:
    """Format Decimal without trailing insignificant zeros (e.g. 110.0000 -> 110, 55.5000 -> 55.5)."""
    normalized = value.normalize()
    text = format(normalized, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def serialize_product(product: Product) -> ProductRead:
    """Serialize Product ORM instance with dual-unit stock representation."""
    base_label = product.base_unit.plural_name or product.base_unit.name
    base_str = f"{format_quantity(product.current_stock_base)} {base_label}"

    secondary_calc: Decimal | None = None
    if product.secondary_unit and product.conversion_factor:
        secondary_calc = (product.current_stock_base * product.conversion_factor).quantize(
            Decimal("0.0001")
        )
        sec_label = product.secondary_unit.plural_name or product.secondary_unit.name
        stock_display = f"{base_str} / {format_quantity(secondary_calc)} {sec_label}"
    else:
        stock_display = base_str

    data = ProductRead.model_validate(product)
    data.secondary_stock_calculated = secondary_calc
    data.stock_display = stock_display
    return data


async def _verify_units_and_category(
    db: AsyncSession,
    *,
    base_unit_id: UUID,
    secondary_unit_id: UUID | None,
    category_id: UUID | None,
    allowed_units: list[AllowedUnitInput],
) -> None:
    unit_ids = {base_unit_id, *(u.unit_id for u in allowed_units)}
    if secondary_unit_id:
        unit_ids.add(secondary_unit_id)

    res = await db.execute(select(UnitOfMeasure.id).where(UnitOfMeasure.id.in_(unit_ids)))
    found_ids = set(res.scalars().all())
    missing = unit_ids - found_ids
    if missing:
        raise NotFoundError("Одна или несколько указанных единиц измерения не найдены")

    if category_id is not None:
        cat_res = await db.execute(select(Category.id).where(Category.id == category_id))
        if not cat_res.scalar_one_or_none():
            raise NotFoundError("Указанная категория товара не найдена")


def _build_allowed_units(
    product_id: UUID,
    base_unit_id: UUID,
    allowed_inputs: list[AllowedUnitInput],
) -> list[ProductAllowedUnit]:
    by_unit: dict[UUID, Decimal] = {base_unit_id: Decimal("1.0000")}
    for item in allowed_inputs:
        if item.unit_id == base_unit_id:
            by_unit[base_unit_id] = Decimal("1.0000")
        else:
            by_unit[item.unit_id] = item.multiplier_to_base.quantize(Decimal("0.0001"))

    return [
        ProductAllowedUnit(
            product_id=product_id,
            unit_id=uid,
            multiplier_to_base=mult,
        )
        for uid, mult in by_unit.items()
    ]


async def list_products(
    db: AsyncSession,
    *,
    search: str | None = None,
    include_inactive: bool = False,
    limit: int = 100,
) -> list[ProductRead]:
    stmt = select(Product).order_by(Product.name.asc()).limit(limit)
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.barcode.ilike(q),
                Product.name.ilike(q),
                Product.sku.ilike(q),
            )
        )
    result = await db.execute(stmt)
    return [serialize_product(p) for p in result.scalars().all()]


async def get_product_by_barcode(db: AsyncSession, *, barcode: str) -> ProductRead:
    cleaned = barcode.strip()
    result = await db.execute(
        select(Product).where(Product.barcode == cleaned, Product.is_active.is_(True))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError(f"Товар со штрихкодом «{cleaned}» не найден в справочнике")
    return serialize_product(product)


async def get_product_by_id(db: AsyncSession, *, product_id: UUID) -> ProductRead:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")
    return serialize_product(product)


async def create_product(
    db: AsyncSession,
    *,
    actor: User,
    payload: ProductCreate,
    ip_address: str | None = None,
) -> ProductRead:
    effective_sku = (
        payload.sku.strip()
        if payload.sku and payload.sku.strip()
        else f"PRD-{payload.barcode.strip()}"
    )

    dup = await db.execute(
        select(Product).where(
            (Product.barcode == payload.barcode) | (Product.sku == effective_sku)
        )
    )
    if dup.scalar_one_or_none():
        raise ConflictError("Товар с таким штрихкодом или артикулом уже существует")

    effective_base_unit_id = payload.base_unit_id
    if effective_base_unit_id is None:
        unit_res = await db.execute(
            select(UnitOfMeasure).where(UnitOfMeasure.is_active.is_(True))
        )
        first_unit = unit_res.scalars().first()
        if not first_unit:
            raise DomainValidationError("В системе нет доступных единиц измерения")
        effective_base_unit_id = first_unit.id

    effective_conversion = payload.conversion_factor
    if payload.secondary_unit_id and not effective_conversion:
        effective_conversion = Decimal("1.0000")

    await _verify_units_and_category(
        db,
        base_unit_id=effective_base_unit_id,
        secondary_unit_id=payload.secondary_unit_id,
        category_id=payload.category_id,
        allowed_units=payload.allowed_units,
    )

    normalized_attrs = await validate_dynamic_attributes(
        db,
        target_type=AttributeTargetType.PRODUCT,
        submitted_values=payload.custom_attributes,
        enabled_attribute_ids=payload.enabled_attribute_ids,
    )

    product = Product(
        barcode=payload.barcode,
        name=payload.name,
        sku=effective_sku,
        category_id=payload.category_id,
        base_unit_id=effective_base_unit_id,
        secondary_unit_id=payload.secondary_unit_id,
        conversion_factor=effective_conversion,
        current_stock_base=payload.initial_stock_base.quantize(Decimal("0.0001")),
        allow_negative_stock=payload.allow_negative_stock,
        enabled_attribute_ids=[str(uid) for uid in payload.enabled_attribute_ids],
        configured_attributes=payload.configured_attributes,
        custom_attributes=normalized_attrs,
        is_active=payload.is_active,
    )
    db.add(product)
    await db.flush()

    allowed_rows = _build_allowed_units(
        product.id, effective_base_unit_id, payload.allowed_units
    )
    for row in allowed_rows:
        db.add(row)

    await record_audit(
        db,
        user_id=actor.id,
        action="PRODUCT_CREATE",
        entity="product",
        entity_id=product.id,
        new_value={
            "barcode": product.barcode,
            "name": product.name,
            "sku": product.sku,
            "initial_stock_base": str(product.current_stock_base),
        },
        ip_address=ip_address,
    )
    await db.commit()


async def get_product_stock_by_store(
    db: AsyncSession, product_id: UUID
) -> list[dict[str, Any]]:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")

    stores_res = await db.execute(
        select(Store).where(Store.is_active.is_(True)).order_by(Store.name.asc())
    )
    stores = list(stores_res.scalars().all())

    tx_res = await db.execute(
        select(InventoryTransaction).where(InventoryTransaction.product_id == product_id)
    )
    all_txs = list(tx_res.scalars().all())

    # Group transactions by store_id
    store_tx_map: dict[UUID | None, list[InventoryTransaction]] = {}
    for tx in all_txs:
        store_tx_map.setdefault(tx.store_id, []).append(tx)

    base_label = product.base_unit.plural_name or product.base_unit.name
    sec_label = (
        (product.secondary_unit.plural_name or product.secondary_unit.name)
        if product.secondary_unit
        else None
    )

    primary_store = next(
        (s for s in stores if s.code == "WH-MAIN" or "центр" in s.name.lower()),
        stores[0] if stores else None,
    )

    store_nets: dict[UUID, Decimal] = {}
    for store in stores:
        txs = store_tx_map.get(store.id, [])
        net = Decimal("0.0000")
        for tx in txs:
            if tx.tx_type == "INBOUND":
                net += tx.quantity_base_calculated
            elif tx.tx_type == "OUTBOUND":
                net -= tx.quantity_base_calculated
        store_nets[store.id] = net

    breakdown = []
    for store in stores:
        txs = store_tx_map.get(store.id, [])
        if primary_store and store.id == primary_store.id:
            other_nets = sum(
                (net for sid, net in store_nets.items() if sid != store.id),
                Decimal("0.0000"),
            )
            stock_base = (product.current_stock_base - other_nets).quantize(Decimal("0.0001"))
        else:
            stock_base = max(Decimal("0.0000"), store_nets[store.id]).quantize(Decimal("0.0001"))

        secondary_calc: Decimal | None = None
        if product.secondary_unit and product.conversion_factor:
            secondary_calc = (stock_base * product.conversion_factor).quantize(Decimal("0.0001"))
            stock_display = f"{format_quantity(stock_base)} {base_label} / {format_quantity(secondary_calc)} {sec_label}"
        else:
            stock_display = f"{format_quantity(stock_base)} {base_label}"

        last_tx = max((tx.performed_at for tx in txs), default=None) if txs else None

        breakdown.append(
            {
                "store_id": str(store.id),
                "store_name": store.name,
                "store_code": store.code,
                "store_address": store.address,
                "stock_base": float(stock_base),
                "stock_secondary": float(secondary_calc) if secondary_calc is not None else None,
                "stock_display": stock_display,
                "operations_count": len(txs),
                "last_operation_at": last_tx.isoformat() if last_tx else None,
            }
        )

    return breakdown

    await db.refresh(product)
    return await get_product_by_id(db, product_id=product.id)


async def update_product(
    db: AsyncSession,
    *,
    actor: User,
    product_id: UUID,
    payload: ProductUpdate,
    ip_address: str | None = None,
) -> ProductRead:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")

    old_value = {
        "barcode": product.barcode,
        "name": product.name,
        "sku": product.sku,
        "is_active": product.is_active,
        "custom_attributes": product.custom_attributes,
    }

    if payload.barcode and payload.barcode != product.barcode:
        dup = await db.execute(
            select(Product).where(Product.barcode == payload.barcode, Product.id != product_id)
        )
        if dup.scalar_one_or_none():
            raise ConflictError("Товар с таким штрихкодом уже существует")
        product.barcode = payload.barcode.strip()

    if payload.sku and payload.sku != product.sku:
        dup_sku = await db.execute(
            select(Product).where(Product.sku == payload.sku, Product.id != product_id)
        )
        if dup_sku.scalar_one_or_none():
            raise ConflictError("Товар с таким SKU уже существует")
        product.sku = payload.sku.strip()

    new_base_unit = payload.base_unit_id or product.base_unit_id
    new_sec_unit = (
        payload.secondary_unit_id
        if payload.secondary_unit_id is not None
        else product.secondary_unit_id
    )
    new_cat = payload.category_id if payload.category_id is not None else product.category_id

    await _verify_units_and_category(
        db,
        base_unit_id=new_base_unit,
        secondary_unit_id=new_sec_unit,
        category_id=new_cat,
        allowed_units=payload.allowed_units or [],
    )

    if payload.name is not None:
        product.name = payload.name.strip()
    if payload.category_id is not None:
        product.category_id = payload.category_id
    if payload.base_unit_id is not None:
        product.base_unit_id = payload.base_unit_id
    if payload.secondary_unit_id is not None:
        product.secondary_unit_id = payload.secondary_unit_id
    if payload.conversion_factor is not None:
        product.conversion_factor = payload.conversion_factor
    if payload.allow_negative_stock is not None:
        product.allow_negative_stock = payload.allow_negative_stock
    if payload.is_active is not None:
        product.is_active = payload.is_active

    if payload.configured_attributes is not None:
        product.configured_attributes = payload.configured_attributes

    enabled_ids = (
        [str(uid) for uid in payload.enabled_attribute_ids]
        if payload.enabled_attribute_ids is not None
        else product.enabled_attribute_ids
    )
    product.enabled_attribute_ids = enabled_ids

    if payload.custom_attributes is not None or payload.enabled_attribute_ids is not None:
        attrs_input = (
            payload.custom_attributes
            if payload.custom_attributes is not None
            else product.custom_attributes
        )
        product.custom_attributes = await validate_dynamic_attributes(
            db,
            target_type=AttributeTargetType.PRODUCT,
            submitted_values=attrs_input,
            enabled_attribute_ids=enabled_ids,
        )

    if payload.allowed_units is not None:
        product.allowed_units.clear()
        await db.flush()
        for row in _build_allowed_units(product.id, new_base_unit, payload.allowed_units):
            db.add(row)

    await record_audit(
        db,
        user_id=actor.id,
        action="PRODUCT_UPDATE",
        entity="product",
        entity_id=product.id,
        old_value=old_value,
        new_value={
            "barcode": product.barcode,
            "name": product.name,
            "sku": product.sku,
            "is_active": product.is_active,
            "custom_attributes": product.custom_attributes,
        },
        ip_address=ip_address,
    )
    await db.commit()


async def get_product_stock_by_store(
    db: AsyncSession, product_id: UUID
) -> list[dict[str, Any]]:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")

    stores_res = await db.execute(
        select(Store).where(Store.is_active.is_(True)).order_by(Store.name.asc())
    )
    stores = list(stores_res.scalars().all())

    tx_res = await db.execute(
        select(InventoryTransaction).where(InventoryTransaction.product_id == product_id)
    )
    all_txs = list(tx_res.scalars().all())

    # Group transactions by store_id
    store_tx_map: dict[UUID | None, list[InventoryTransaction]] = {}
    for tx in all_txs:
        store_tx_map.setdefault(tx.store_id, []).append(tx)

    base_label = product.base_unit.plural_name or product.base_unit.name
    sec_label = (
        (product.secondary_unit.plural_name or product.secondary_unit.name)
        if product.secondary_unit
        else None
    )

    primary_store = next(
        (s for s in stores if s.code == "WH-MAIN" or "центр" in s.name.lower()),
        stores[0] if stores else None,
    )

    store_nets: dict[UUID, Decimal] = {}
    for store in stores:
        txs = store_tx_map.get(store.id, [])
        net = Decimal("0.0000")
        for tx in txs:
            if tx.tx_type == "INBOUND":
                net += tx.quantity_base_calculated
            elif tx.tx_type == "OUTBOUND":
                net -= tx.quantity_base_calculated
        store_nets[store.id] = net

    breakdown = []
    for store in stores:
        txs = store_tx_map.get(store.id, [])
        if primary_store and store.id == primary_store.id:
            other_nets = sum(
                (net for sid, net in store_nets.items() if sid != store.id),
                Decimal("0.0000"),
            )
            stock_base = (product.current_stock_base - other_nets).quantize(Decimal("0.0001"))
        else:
            stock_base = max(Decimal("0.0000"), store_nets[store.id]).quantize(Decimal("0.0001"))

        secondary_calc: Decimal | None = None
        if product.secondary_unit and product.conversion_factor:
            secondary_calc = (stock_base * product.conversion_factor).quantize(Decimal("0.0001"))
            stock_display = f"{format_quantity(stock_base)} {base_label} / {format_quantity(secondary_calc)} {sec_label}"
        else:
            stock_display = f"{format_quantity(stock_base)} {base_label}"

        last_tx = max((tx.performed_at for tx in txs), default=None) if txs else None

        breakdown.append(
            {
                "store_id": str(store.id),
                "store_name": store.name,
                "store_code": store.code,
                "store_address": store.address,
                "stock_base": float(stock_base),
                "stock_secondary": float(secondary_calc) if secondary_calc is not None else None,
                "stock_display": stock_display,
                "operations_count": len(txs),
                "last_operation_at": last_tx.isoformat() if last_tx else None,
            }
        )

    return breakdown


async def delete_product(
    db: AsyncSession,
    *,
    actor: User,
    product_id: UUID,
    ip_address: str | None = None,
) -> None:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")
    product.is_active = False
    await record_audit(
        db,
        user_id=actor.id,
        action="PRODUCT_DELETE",
        entity="product",
        entity_id=product.id,
        new_value={"is_active": False},
        ip_address=ip_address,
    )
    await db.commit()


async def get_product_stock_by_store(
    db: AsyncSession, product_id: UUID
) -> list[dict[str, Any]]:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")

    stores_res = await db.execute(
        select(Store).where(Store.is_active.is_(True)).order_by(Store.name.asc())
    )
    stores = list(stores_res.scalars().all())

    tx_res = await db.execute(
        select(InventoryTransaction).where(InventoryTransaction.product_id == product_id)
    )
    all_txs = list(tx_res.scalars().all())

    # Group transactions by store_id
    store_tx_map: dict[UUID | None, list[InventoryTransaction]] = {}
    for tx in all_txs:
        store_tx_map.setdefault(tx.store_id, []).append(tx)

    base_label = product.base_unit.plural_name or product.base_unit.name
    sec_label = (
        (product.secondary_unit.plural_name or product.secondary_unit.name)
        if product.secondary_unit
        else None
    )

    primary_store = next(
        (s for s in stores if s.code == "WH-MAIN" or "центр" in s.name.lower()),
        stores[0] if stores else None,
    )

    store_nets: dict[UUID, Decimal] = {}
    for store in stores:
        txs = store_tx_map.get(store.id, [])
        net = Decimal("0.0000")
        for tx in txs:
            if tx.tx_type == "INBOUND":
                net += tx.quantity_base_calculated
            elif tx.tx_type == "OUTBOUND":
                net -= tx.quantity_base_calculated
        store_nets[store.id] = net

    breakdown = []
    for store in stores:
        txs = store_tx_map.get(store.id, [])
        if primary_store and store.id == primary_store.id:
            other_nets = sum(
                (net for sid, net in store_nets.items() if sid != store.id),
                Decimal("0.0000"),
            )
            stock_base = (product.current_stock_base - other_nets).quantize(Decimal("0.0001"))
        else:
            stock_base = max(Decimal("0.0000"), store_nets[store.id]).quantize(Decimal("0.0001"))

        secondary_calc: Decimal | None = None
        if product.secondary_unit and product.conversion_factor:
            secondary_calc = (stock_base * product.conversion_factor).quantize(Decimal("0.0001"))
            stock_display = f"{format_quantity(stock_base)} {base_label} / {format_quantity(secondary_calc)} {sec_label}"
        else:
            stock_display = f"{format_quantity(stock_base)} {base_label}"

        last_tx = max((tx.performed_at for tx in txs), default=None) if txs else None

        breakdown.append(
            {
                "store_id": str(store.id),
                "store_name": store.name,
                "store_code": store.code,
                "store_address": store.address,
                "stock_base": float(stock_base),
                "stock_secondary": float(secondary_calc) if secondary_calc is not None else None,
                "stock_display": stock_display,
                "operations_count": len(txs),
                "last_operation_at": last_tx.isoformat() if last_tx else None,
            }
        )

    return breakdown

