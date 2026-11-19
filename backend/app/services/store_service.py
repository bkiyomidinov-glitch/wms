from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError
from app.models.category import Category
from app.models.product import Product
from app.models.store import Store
from app.models.transaction import InventoryTransaction
from app.models.user import User
from app.schemas.store import StoreCreate, StoreUpdate
from app.services.audit_service import record_audit


async def list_stores(db: AsyncSession, *, include_inactive: bool = False, actor: User | None = None) -> list[Store]:
    stmt = select(Store).order_by(Store.name.asc())
    if not include_inactive:
        stmt = stmt.where(Store.is_active.is_(True))

    if actor and actor.role not in ("SUPER_ADMIN", "DIRECTOR"):
        accessible_ids: list[UUID] = []
        if hasattr(actor, "stores") and actor.stores:
            accessible_ids.extend([s.id for s in actor.stores])
        if actor.store_id and actor.store_id not in accessible_ids:
            accessible_ids.append(actor.store_id)
        if accessible_ids:
            stmt = stmt.where(Store.id.in_(accessible_ids))

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_store(db: AsyncSession, store_id: UUID) -> Store:
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise NotFoundError("Склад не найден")
    return store


async def create_store(
    db: AsyncSession, *, actor: User, payload: StoreCreate, ip_address: str | None = None
) -> Store:
    if not actor.has_permission("can_manage_stores"):
        raise PermissionDeniedError("Недостаточно прав для создания склада (can_manage_stores)")

    existing = await db.execute(select(Store).where(Store.name == payload.name.strip()))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Склад с названием «{payload.name}» уже существует")

    if payload.code and payload.code.strip():
        existing_code = await db.execute(select(Store).where(Store.code == payload.code.strip()))
        if existing_code.scalar_one_or_none():
            raise ConflictError(f"Склад с кодом «{payload.code}» уже существует")

    store = Store(
        name=payload.name.strip(),
        code=payload.code.strip() if payload.code else None,
        address=payload.address.strip() if payload.address else None,
        is_active=payload.is_active,
    )
    db.add(store)
    await db.flush()

    await record_audit(
        db,
        user_id=actor.id,
        action="STORE_CREATE",
        entity="store",
        entity_id=store.id,
        new_value={"name": store.name, "code": store.code, "address": store.address},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(store)
    return store


async def update_store(
    db: AsyncSession,
    *,
    actor: User,
    store_id: UUID,
    payload: StoreUpdate,
    ip_address: str | None = None,
) -> Store:
    if not actor.has_permission("can_manage_stores"):
        raise PermissionDeniedError("Недостаточно прав для изменения склада (can_manage_stores)")

    store = await get_store(db, store_id)
    old_value = {
        "name": store.name,
        "code": store.code,
        "address": store.address,
        "is_active": store.is_active,
    }

    if payload.name is not None and payload.name.strip() != store.name:
        existing = await db.execute(select(Store).where(Store.name == payload.name.strip()))
        if existing.scalar_one_or_none():
            raise ConflictError(f"Склад с названием «{payload.name}» уже существует")
        store.name = payload.name.strip()

    if payload.code is not None:
        clean_code = payload.code.strip() or None
        if clean_code and clean_code != store.code:
            existing_code = await db.execute(select(Store).where(Store.code == clean_code))
            if existing_code.scalar_one_or_none():
                raise ConflictError(f"Склад с кодом «{payload.code}» уже существует")
        store.code = clean_code

    if payload.address is not None:
        store.address = payload.address.strip() or None

    if payload.is_active is not None:
        store.is_active = payload.is_active

    await record_audit(
        db,
        user_id=actor.id,
        action="STORE_UPDATE",
        entity="store",
        entity_id=store.id,
        old_value=old_value,
        new_value={
            "name": store.name,
            "code": store.code,
            "address": store.address,
            "is_active": store.is_active,
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(store)
    return store


async def delete_store(
    db: AsyncSession, *, actor: User, store_id: UUID, ip_address: str | None = None
) -> None:
    if not actor.has_permission("can_manage_stores"):
        raise PermissionDeniedError("Недостаточно прав для деактивации склада (can_manage_stores)")

    store = await get_store(db, store_id)
    store.is_active = False
    await record_audit(
        db,
        user_id=actor.id,
        action="STORE_DEACTIVATE",
        entity="store",
        entity_id=store.id,
        old_value={"name": store.name, "is_active": True},
        new_value={"name": store.name, "is_active": False},
        ip_address=ip_address,
    )
    await db.commit()


async def get_stores_inventory_summary(db: AsyncSession, *, actor: User) -> list[dict[str, Any]]:
    """Returns accessible stores with product counts, total stock, and items breakdown."""
    stores = await list_stores(db, include_inactive=False, actor=actor)
    if not stores:
        return []

    store_ids = [s.id for s in stores]

    # 1. Fetch latest balance for each (store_id, product_id)
    balance_query = text("""
        SELECT DISTINCT ON (store_id, product_id)
            store_id,
            product_id,
            balance_after_store,
            performed_at
        FROM inventory_transactions
        WHERE store_id = ANY(:sids)
        ORDER BY store_id, product_id, performed_at DESC, created_at DESC;
    """)
    balances = (await db.execute(balance_query, {"sids": store_ids})).mappings().all()

    # Map of (store_id, product_id) -> {balance, last_at}
    latest_balances: dict[tuple[UUID, UUID], dict[str, Any]] = {
        (b["store_id"], b["product_id"]): {
            "balance": int(b["balance_after_store"]),
            "last_at": b["performed_at"].isoformat() if b["performed_at"] else None,
        }
        for b in balances
    }

    # Count operations per (store_id, product_id)
    ops_query = text("""
        SELECT store_id, product_id, count(*) as op_count
        FROM inventory_transactions
        WHERE store_id = ANY(:sids)
        GROUP BY store_id, product_id;
    """)
    ops_counts = {
        (o["store_id"], o["product_id"]): int(o["op_count"])
        for o in (await db.execute(ops_query, {"sids": store_ids})).mappings().all()
    }

    # 2. Fetch all products
    prods_res = await db.execute(select(Product).where(Product.is_active.is_(True)).order_by(Product.name.asc()))
    products = list(prods_res.scalars().all())
    prod_map = {p.id: p for p in products}

    # 3. Build per-store summary
    summary_list = []
    for store in stores:
        store_products = []
        total_store_stock = 0

        for prod_id, prod in prod_map.items():
            info = latest_balances.get((store.id, prod_id))
            bal = info["balance"] if info else 0
            if bal > 0 or info is not None:
                op_count = ops_counts.get((store.id, prod_id), 0)
                store_products.append({
                    "product_id": str(prod.id),
                    "barcode": prod.barcode,
                    "name": prod.name,
                    "sku": prod.sku,
                    "category_name": prod.category.name if prod.category else "Без категории",
                    "base_unit_name": prod.base_unit.name,
                    "current_store_stock": bal,
                    "configured_attributes": prod.configured_attributes or [],
                    "last_operation_at": info["last_at"] if info else None,
                    "operations_count": op_count,
                })
                total_store_stock += bal

        # Sort store products by stock desc, then name asc
        store_products.sort(key=lambda x: (-x["current_store_stock"], x["name"]))

        summary_list.append({
            "id": str(store.id),
            "name": store.name,
            "code": store.code,
            "address": store.address,
            "is_active": store.is_active,
            "products_count": len([p for p in store_products if p["current_store_stock"] > 0]),
            "total_stock": total_store_stock,
            "products": store_products,
        })

    return summary_list


async def list_store_movements(db: AsyncSession, *, limit: int = 500) -> list[dict[str, Any]]:
    """Legacy helper for flat overview; provides historical snapshot balances."""
    tx_res = await db.execute(
        select(InventoryTransaction)
        .order_by(InventoryTransaction.performed_at.desc(), InventoryTransaction.created_at.desc())
        .limit(limit)
    )
    txs = list(tx_res.scalars().all())

    rows: list[dict[str, Any]] = []
    for tx in txs:
        rows.append(
            {
                "id": str(tx.id),
                "store_id": str(tx.store_id) if tx.store_id else None,
                "store_name": tx.store.name if tx.store else "Основной склад",
                "store_code": tx.store.code if tx.store else None,
                "product_id": str(tx.product_id),
                "barcode": tx.product.barcode,
                "product_name": tx.product.name,
                "tx_type": tx.tx_type,
                "counterparty_name": tx.counterparty_name,
                "quantity_entered": int(round(tx.quantity_entered)),
                "unit_name": tx.unit.name,
                "balance_before_store": int(tx.balance_before_store),
                "balance_after_store": int(tx.balance_after_store),
                "current_store_stock": int(tx.balance_after_store),
                "base_unit_name": tx.product.base_unit.name,
                "performed_at": tx.performed_at.isoformat(),
                "performed_by_name": tx.performed_by.full_name,
                "performed_by_role": tx.performed_by.role,
                "custom_attributes": tx.custom_attributes or {},
                "notes": tx.notes,
            }
        )

    return rows
