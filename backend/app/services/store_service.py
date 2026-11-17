from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.store import Store
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
