from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    DomainValidationError,
    InsufficientStockError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.timezone import now_dushanbe, to_dushanbe
from app.domain.enums import AttributeTargetType, TransactionType, UserRole
from app.domain.permissions import (
    can_override_timestamp,
    can_perform_adjustment,
    can_view_all_transactions,
)
from app.models.product import Product, ProductAllowedUnit
from app.models.store import Store
from app.models.transaction import InventoryTransaction
from app.models.unit import UnitOfMeasure
from app.models.user import User
from app.schemas.transaction import TransactionCreate
from app.services.audit_service import record_audit
from app.services.dynamic_validator import validate_dynamic_attributes
from app.services.product_service import format_quantity


async def execute_transaction(
    db: AsyncSession,
    *,
    actor: User,
    payload: TransactionCreate,
    ip_address: str | None = None,
) -> InventoryTransaction:
    """Atomically execute INBOUND, OUTBOUND, or ADJUSTMENT with SELECT ... FOR UPDATE row lock."""
    actor_role = UserRole(actor.role)

    # 1. Granular permission checks
    if payload.tx_type == TransactionType.INBOUND:
        if not actor.has_permission("can_inbound"):
            raise PermissionDeniedError("У вас нет прав на проведение прихода (can_inbound)")
    elif payload.tx_type == TransactionType.OUTBOUND:
        if not actor.has_permission("can_outbound"):
            raise PermissionDeniedError("У вас нет прав на проведение отправки (can_outbound)")
    elif payload.tx_type == TransactionType.ADJUSTMENT:
        if not can_perform_adjustment(actor_role):
            raise PermissionDeniedError("Корректировка остатков доступна только от роли MANAGER и выше")

    # 2. Lock product row for atomic stock mutation
    stmt = select(Product).where(Product.id == payload.product_id).with_for_update()
    res = await db.execute(stmt)
    product = res.scalar_one_or_none()
    if not product or not product.is_active:
        raise NotFoundError("Товар не найден или деактивирован")

    # 3. Resolve store & verify access
    effective_store_id = payload.store_id or actor.store_id
    if not effective_store_id and hasattr(actor, "stores") and actor.stores:
        effective_store_id = actor.stores[0].id
    if not effective_store_id:
        first_st = (await db.execute(select(Store).where(Store.is_active.is_(True)).order_by(Store.created_at.asc()).limit(1))).scalar_one_or_none()
        if first_st:
            effective_store_id = first_st.id

    if not actor.has_store_access(effective_store_id):
        raise PermissionDeniedError("У вас нет доступа к выбранному складу")

    effective_store_name: str | None = None
    if effective_store_id:
        st_res = await db.execute(select(Store).where(Store.id == effective_store_id))
        st_obj = st_res.scalar_one_or_none()
        if st_obj:
            effective_store_name = st_obj.name
    elif actor.store:
        effective_store_name = actor.store.name

    # 4. Resolve UoM multiplier
    if payload.unit_id == product.base_unit_id:
        multiplier = Decimal("1.0000")
    else:
        au_res = await db.execute(
            select(ProductAllowedUnit).where(
                ProductAllowedUnit.product_id == product.id,
                ProductAllowedUnit.unit_id == payload.unit_id,
            )
        )
        allowed_unit = au_res.scalar_one_or_none()
        if not allowed_unit:
            u_res = await db.execute(
                select(UnitOfMeasure).where(UnitOfMeasure.id == payload.unit_id)
            )
            unit_obj = u_res.scalar_one_or_none()
            if not unit_obj:
                raise DomainValidationError("Выбранная единица измерения не настроена для этого товара")

            mult = payload.unit_multiplier_to_base
            if mult is None or mult <= Decimal("0"):
                if product.secondary_unit_id == payload.unit_id and product.conversion_factor:
                    mult = product.conversion_factor
                else:
                    mult = Decimal("1.0000")

            allowed_unit = ProductAllowedUnit(
                product_id=product.id,
                unit_id=payload.unit_id,
                multiplier_to_base=mult,
            )
            db.add(allowed_unit)
            await db.flush()
            multiplier = mult
        else:
            if payload.unit_multiplier_to_base and payload.unit_multiplier_to_base > Decimal("0"):
                allowed_unit.multiplier_to_base = payload.unit_multiplier_to_base
                multiplier = payload.unit_multiplier_to_base
            else:
                multiplier = allowed_unit.multiplier_to_base

    qty_entered = Decimal(int(payload.quantity_entered))
    qty_base = Decimal(int(round(qty_entered * multiplier)))
    if qty_base < Decimal("1"):
        qty_base = Decimal("1")

    # Global product stock before/after
    stock_before = Decimal(int(round(product.current_stock_base)))
    is_decrease = payload.tx_type == TransactionType.OUTBOUND or (
        payload.tx_type == TransactionType.ADJUSTMENT
        and payload.adjustment_direction == "DECREASE"
    )

    if is_decrease:
        stock_after = stock_before - qty_base
        if stock_after < Decimal("0") and not product.allow_negative_stock:
            base_name = product.base_unit.plural_name or product.base_unit.name
            raise InsufficientStockError(
                f"Недостаточно остатка по товару «{product.name}»: "
                f"доступно {format_quantity(stock_before)} {base_name}, "
                f"запрошено {format_quantity(qty_base)} {base_name}",
                details={
                    "available_base": str(int(stock_before)),
                    "requested_base": str(int(qty_base)),
                },
            )
    else:
        stock_after = stock_before + qty_base

    # 5. Calculate store historical snapshot balance (balance_before_store and balance_after_store)
    last_tx_stmt = (
        select(InventoryTransaction)
        .where(
            InventoryTransaction.store_id == effective_store_id,
            InventoryTransaction.product_id == product.id,
        )
        .order_by(
            InventoryTransaction.performed_at.desc(),
            InventoryTransaction.created_at.desc(),
        )
        .limit(1)
    )
    last_tx = (await db.execute(last_tx_stmt)).scalar_one_or_none()
    bal_before_store = int(last_tx.balance_after_store) if last_tx else 0

    if payload.tx_type == TransactionType.INBOUND:
        bal_after_store = bal_before_store + int(qty_base)
    elif payload.tx_type == TransactionType.OUTBOUND:
        bal_after_store = bal_before_store - int(qty_base)
        if bal_after_store < 0 and not product.allow_negative_stock:
            base_name = product.base_unit.plural_name or product.base_unit.name
            raise InsufficientStockError(
                f"Недостаточно остатка на складе «{effective_store_name or 'склад'}»: "
                f"доступно {bal_before_store} {base_name}, "
                f"запрошено {int(qty_base)} {base_name}",
                details={"available_store": bal_before_store, "requested": int(qty_base)},
            )
    else:  # ADJUSTMENT
        if payload.adjustment_direction == "DECREASE":
            bal_after_store = max(0, bal_before_store - int(qty_base))
        else:
            bal_after_store = bal_before_store + int(qty_base)

    # Validate dynamic operation attributes
    target_attr_type: AttributeTargetType | None = None
    if payload.tx_type == TransactionType.INBOUND:
        target_attr_type = AttributeTargetType.TX_INBOUND
    elif payload.tx_type == TransactionType.OUTBOUND:
        target_attr_type = AttributeTargetType.TX_OUTBOUND

    normalized_attrs: dict = {}
    if target_attr_type is not None:
        normalized_attrs = await validate_dynamic_attributes(
            db,
            target_type=target_attr_type,
            submitted_values=payload.custom_attributes,
        )
    elif payload.custom_attributes:
        normalized_attrs = payload.custom_attributes

    # Timestamp control: operators get exact server Dushanbe time; managers+ may override
    if payload.performed_at is not None and can_override_timestamp(actor_role):
        performed_at = to_dushanbe(payload.performed_at)
    else:
        performed_at = now_dushanbe()

    product.current_stock_base = stock_after

    unit_name = product.base_unit.name
    if payload.unit_id != product.base_unit_id:
        u_res2 = await db.execute(
            select(UnitOfMeasure).where(UnitOfMeasure.id == payload.unit_id)
        )
        u_obj2 = u_res2.scalar_one_or_none()
        if u_obj2:
            unit_name = u_obj2.name

    effective_counterparty = (
        payload.counterparty_name.strip()
        if payload.counterparty_name and payload.counterparty_name.strip()
        else (effective_store_name or "Основной склад")
    )

    tx = InventoryTransaction(
        tx_type=payload.tx_type.value,
        product_id=product.id,
        quantity_entered=qty_entered,
        unit_id=payload.unit_id,
        quantity_base_calculated=qty_base,
        stock_before_base=stock_before,
        stock_after_base=stock_after,
        balance_before_store=bal_before_store,
        balance_after_store=bal_after_store,
        performed_by_user_id=actor.id,
        store_id=effective_store_id,
        counterparty_name=effective_counterparty,
        performed_at=performed_at,
        custom_attributes=normalized_attrs,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(tx)
    await db.flush()

    await record_audit(
        db,
        user_id=actor.id,
        action=f"TRANSACTION_{payload.tx_type.value}",
        entity="inventory_transaction",
        entity_id=tx.id,
        old_value={"stock_base": int(stock_before), "balance_store": bal_before_store},
        new_value={"stock_base": int(stock_after), "balance_store": bal_after_store},
        payload={
            "product_id": str(product.id),
            "product_name": product.name,
            "barcode": product.barcode,
            "quantity_entered": int(qty_entered),
            "unit_name": unit_name,
            "quantity_base": int(qty_base),
            "base_unit_name": product.base_unit.name,
            "store_id": str(effective_store_id) if effective_store_id else None,
            "store_name": effective_store_name or effective_counterparty,
            "balance_before_store": bal_before_store,
            "balance_after_store": bal_after_store,
            "counterparty": tx.counterparty_name,
            "custom_attributes": normalized_attrs,
            "notes": tx.notes,
            "performed_at": performed_at.isoformat(),
        },
        ip_address=ip_address,
    )

    await db.commit()

    # Reload with relationships
    res_tx = await db.execute(
        select(InventoryTransaction).where(InventoryTransaction.id == tx.id)
    )
    return res_tx.scalar_one()


async def list_transactions(
    db: AsyncSession,
    *,
    actor: User,
    tx_type: TransactionType | None = None,
    product_id: UUID | None = None,
    store_id: UUID | None = None,
    search: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[InventoryTransaction]:
    actor_role = UserRole(actor.role)
    stmt = (
        select(InventoryTransaction)
        .join(InventoryTransaction.product)
        .order_by(InventoryTransaction.performed_at.desc(), InventoryTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    # Restrict to accessible stores for operators / managers
    if actor.role not in ("SUPER_ADMIN", "DIRECTOR"):
        accessible_ids: list[UUID] = []
        if hasattr(actor, "stores") and actor.stores:
            accessible_ids.extend([s.id for s in actor.stores])
        if actor.store_id and actor.store_id not in accessible_ids:
            accessible_ids.append(actor.store_id)

        if accessible_ids:
            stmt = stmt.where(InventoryTransaction.store_id.in_(accessible_ids))
        elif not can_view_all_transactions(actor_role):
            stmt = stmt.where(InventoryTransaction.performed_by_user_id == actor.id)

    if tx_type is not None:
        stmt = stmt.where(InventoryTransaction.tx_type == tx_type.value)
    if product_id is not None:
        stmt = stmt.where(InventoryTransaction.product_id == product_id)
    if store_id is not None:
        stmt = stmt.where(InventoryTransaction.store_id == store_id)
    if date_from is not None:
        stmt = stmt.where(InventoryTransaction.performed_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(InventoryTransaction.performed_at <= date_to)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(q),
                Product.barcode.ilike(q),
                InventoryTransaction.counterparty_name.ilike(q),
            )
        )

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_product_movement_summary(
    db: AsyncSession,
    *,
    product_id: UUID,
    actor: User,
) -> dict:
    """Returns product KPI summary (total in, total out, total stock) and all movements."""
    prod_res = await db.execute(select(Product).where(Product.id == product_id))
    product = prod_res.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")

    # Inbound total
    in_sum_res = await db.execute(
        select(func.coalesce(func.sum(InventoryTransaction.quantity_base_calculated), Decimal("0"))).where(
            InventoryTransaction.product_id == product_id,
            InventoryTransaction.tx_type == TransactionType.INBOUND.value,
        )
    )
    total_in = int(round(in_sum_res.scalar_one()))

    # Outbound total
    out_sum_res = await db.execute(
        select(func.coalesce(func.sum(InventoryTransaction.quantity_base_calculated), Decimal("0"))).where(
            InventoryTransaction.product_id == product_id,
            InventoryTransaction.tx_type == TransactionType.OUTBOUND.value,
        )
    )
    total_out = int(round(out_sum_res.scalar_one()))

    total_stock = int(round(product.current_stock_base))

    # All transactions for product
    txs = await list_transactions(db, actor=actor, product_id=product_id, limit=300)

    return {
        "product_id": str(product.id),
        "product_name": product.name,
        "barcode": product.barcode,
        "sku": product.sku,
        "unit_name": product.base_unit.name,
        "total_inbound": total_in,
        "total_outbound": total_out,
        "total_stock_all_stores": total_stock,
        "transactions_count": len(txs),
        "transactions": txs,
    }


async def get_analytics_summary(db: AsyncSession) -> dict:
    """Real-time warehouse KPIs for management/director views."""
    now = now_dushanbe()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    last_24h = now - timedelta(hours=24)

    total_products = (
        await db.execute(select(func.count(Product.id)).where(Product.is_active.is_(True)))
    ).scalar_one()

    zero_stock_count = (
        await db.execute(
            select(func.count(Product.id)).where(
                Product.is_active.is_(True), Product.current_stock_base <= Decimal("0")
            )
        )
    ).scalar_one()

    inbound_today = (
        await db.execute(
            select(func.count(InventoryTransaction.id)).where(
                InventoryTransaction.tx_type == TransactionType.INBOUND.value,
                InventoryTransaction.performed_at >= start_of_day,
            )
        )
    ).scalar_one()

    outbound_today = (
        await db.execute(
            select(func.count(InventoryTransaction.id)).where(
                InventoryTransaction.tx_type == TransactionType.OUTBOUND.value,
                InventoryTransaction.performed_at >= start_of_day,
            )
        )
    ).scalar_one()

    tx_24h = (
        await db.execute(
            select(func.count(InventoryTransaction.id)).where(
                InventoryTransaction.performed_at >= last_24h
            )
        )
    ).scalar_one()

    return {
        "total_active_products": total_products,
        "zero_stock_products": zero_stock_count,
        "inbound_today_count": inbound_today,
        "outbound_today_count": outbound_today,
        "transactions_last_24h": tx_24h,
        "server_time_dushanbe": now.isoformat(),
    }
