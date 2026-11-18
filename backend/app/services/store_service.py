from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.product import Product
from app.models.store import Store
from app.models.transaction import InventoryTransaction
from app.models.user import User
from app.schemas.store import StoreCreate, StoreUpdate
from app.services.audit_service import record_audit


async def list_stores(db: AsyncSession, *, include_inactive: bool = False) -> list[Store]:
    stmt = select(Store).order_by(Store.name.asc())
    if not include_inactive:
        stmt = stmt.where(Store.is_active.is_(True))
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
    store = await get_store(db, store_id)
    store.is_active = False
    await record_audit(
        db,
        user_id=actor.id,
        action="STORE_DEACTIVATE",
        entity="store",
        entity_id=store.id,
        old_value={"is_active": True},
        new_value={"is_active": False},
        ip_address=ip_address,
    )
    await db.commit()


async def list_store_movements(db: AsyncSession, *, limit: int = 500) -> list[dict[str, Any]]:
    stores_res = await db.execute(select(Store).order_by(Store.name.asc()))
    stores = list(stores_res.scalars().all())
    store_by_id = {s.id: s for s in stores}

    active_stores = [s for s in stores if s.is_active]
    primary_store = next(
        (s for s in active_stores if s.code == "WH-MAIN" or "центр" in s.name.lower()),
        active_stores[0] if active_stores else (stores[0] if stores else None),
    )

    products_res = await db.execute(
        select(Product).where(Product.is_active.is_(True)).order_by(Product.name.asc())
    )
    products = list(products_res.scalars().all())

    tx_res = await db.execute(
        select(InventoryTransaction)
        .order_by(InventoryTransaction.performed_at.desc(), InventoryTransaction.created_at.desc())
        .limit(limit)
    )
    txs = list(tx_res.scalars().all())

    # Compute exact integer stock per (store_id, product_id)
    net_by_pair: dict[tuple[UUID, UUID], Decimal] = {}
    for tx in txs:
        sid = tx.store_id or (primary_store.id if primary_store else None)
        if not sid:
            continue
        key = (sid, tx.product_id)
        cur = net_by_pair.get(key, Decimal("0"))
        if tx.tx_type == "INBOUND":
            cur += tx.quantity_base_calculated
        elif tx.tx_type == "OUTBOUND":
            cur -= tx.quantity_base_calculated
        net_by_pair[key] = cur

    stock_by_pair: dict[tuple[UUID, UUID], int] = {}
    for prod in products:
        prod_total = int(round(prod.current_stock_base))
        other_sum = 0
        for st in stores:
            if primary_store and st.id == primary_store.id:
                continue
            val = max(0, int(round(net_by_pair.get((st.id, prod.id), Decimal("0")))))
            stock_by_pair[(st.id, prod.id)] = val
            other_sum += val
        if primary_store:
            stock_by_pair[(primary_store.id, prod.id)] = max(0, prod_total - other_sum)

    rows: list[dict[str, Any]] = []
    seen_pairs: set[tuple[UUID, UUID]] = set()

    for tx in txs:
        resolved_store = (
            store_by_id.get(tx.store_id)
            if tx.store_id
            else primary_store
        )
        sid = resolved_store.id if resolved_store else None
        if sid:
            seen_pairs.add((sid, tx.product_id))

        current_stock = (
            stock_by_pair.get((sid, tx.product_id), int(round(tx.product.current_stock_base)))
            if sid
            else int(round(tx.product.current_stock_base))
        )

        rows.append(
            {
                "id": str(tx.id),
                "store_id": str(sid) if sid else None,
                "store_name": resolved_store.name if resolved_store else "Основной склад",
                "store_code": resolved_store.code if resolved_store else None,
                "product_id": str(tx.product_id),
                "barcode": tx.product.barcode,
                "product_name": tx.product.name,
                "tx_type": tx.tx_type,
                "counterparty_name": tx.counterparty_name,
                "quantity_entered": int(round(tx.quantity_entered)),
                "unit_name": tx.unit.name,
                "current_store_stock": int(current_stock),
                "base_unit_name": tx.product.base_unit.name,
                "performed_at": tx.performed_at.isoformat(),
                "performed_by_name": tx.performed_by.full_name,
                "performed_by_role": tx.performed_by.role,
                "custom_attributes": tx.custom_attributes or {},
                "notes": tx.notes,
            }
        )

    # Also include active products that hold stock on a store without recorded transactions yet
    for prod in products:
        for st in active_stores:
            pair = (st.id, prod.id)
            st_stock = stock_by_pair.get(pair, 0)
            if st_stock > 0 and pair not in seen_pairs:
                rows.append(
                    {
                        "id": f"init-{st.id}-{prod.id}",
                        "store_id": str(st.id),
                        "store_name": st.name,
                        "store_code": st.code,
                        "product_id": str(prod.id),
                        "barcode": prod.barcode,
                        "product_name": prod.name,
                        "tx_type": "INITIAL_STOCK",
                        "counterparty_name": "Начальный остаток",
                        "quantity_entered": int(st_stock),
                        "unit_name": prod.base_unit.name,
                        "current_store_stock": int(st_stock),
                        "base_unit_name": prod.base_unit.name,
                        "performed_at": prod.created_at.isoformat(),
                        "performed_by_name": "Система",
                        "performed_by_role": "SUPER_ADMIN",
                        "custom_attributes": {},
                        "notes": None,
                    }
                )

    return rows

