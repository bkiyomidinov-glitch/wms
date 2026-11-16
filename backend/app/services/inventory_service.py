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

    if payload.tx_type == TransactionType.ADJUSTMENT and not can_perform_adjustment(actor_role):
        raise PermissionDeniedError("Корректировка остатков доступна только от роли MANAGER и выше")

    # Lock product row for atomic stock mutation
    stmt = select(Product).where(Product.id == payload.product_id).with_for_update()
    res = await db.execute(stmt)
    product = res.scalar_one_or_none()
    if not product or not product.is_active:
        raise NotFoundError("Товар не найден или деактивирован")

    # Resolve UoM multiplier
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

    qty_entered = payload.quantity_entered.quantize(Decimal("0.0001"))
    qty_base = (qty_entered * multiplier).quantize(Decimal("0.0001"))

    stock_before = product.current_stock_base
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
                    "available_base": str(stock_before),
                    "requested_base": str(qty_base),
                },
            )
    else:
        stock_after = stock_before + qty_base

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

    tx = InventoryTransaction(
        tx_type=payload.tx_type.value,
        product_id=product.id,
        quantity_entered=qty_entered,
        unit_id=payload.unit_id,
        quantity_base_calculated=qty_base,
        stock_before_base=stock_before,
        stock_after_base=stock_after,
        performed_by_user_id=actor.id,
        counterparty_name=payload.counterparty_name.strip(),
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
        old_value={"stock_base": str(stock_before)},
        new_value={"stock_base": str(stock_after)},
        payload={
            "product_id": str(product.id),
            "barcode": product.barcode,
            "quantity_entered": str(qty_entered),
            "quantity_base": str(qty_base),
            "counterparty": tx.counterparty_name,
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
    search: str | None = None,
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

    if not can_view_all_transactions(actor_role):
        stmt = stmt.where(InventoryTransaction.performed_by_user_id == actor.id)

    if tx_type is not None:
        stmt = stmt.where(InventoryTransaction.tx_type == tx_type.value)
    if product_id is not None:
        stmt = stmt.where(InventoryTransaction.product_id == product_id)
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
