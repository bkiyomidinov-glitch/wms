from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models.user import User
from app.schemas.store import StoreCreate, StoreRead, StoreUpdate
from app.services import store_service

router = APIRouter()


@router.get("", response_model=list[StoreRead], summary="List all stores")
async def list_stores(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[StoreRead]:
    stores = await store_service.list_stores(db, include_inactive=include_inactive, actor=current_user)
    return [StoreRead.model_validate(s) for s in stores]


@router.get("/inventory-summary", response_model=list[dict[str, Any]], summary="Stores inventory summary with products")
async def get_stores_inventory_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return await store_service.get_stores_inventory_summary(db, actor=current_user)


@router.get("/movements", response_model=list[dict[str, Any]], summary="List store stock & movements table")
async def list_store_movements(
    limit: int = Query(default=500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return await store_service.list_store_movements(db, limit=limit)


@router.get("/{store_id}", response_model=StoreRead, summary="Get store by ID")
async def get_store(
    store_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> StoreRead:
    store = await store_service.get_store(db, store_id)
    return StoreRead.model_validate(store)


@router.post(
    "",
    response_model=StoreRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new store",
)
async def create_store(
    payload: StoreCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> StoreRead:
    store = await store_service.create_store(
        db, actor=current_user, payload=payload, ip_address=request.client.host if request.client else None
    )
    return StoreRead.model_validate(store)


@router.put("/{store_id}", response_model=StoreRead, summary="Update store")
async def update_store(
    store_id: UUID,
    payload: StoreUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> StoreRead:
    store = await store_service.update_store(
        db,
        actor=current_user,
        store_id=store_id,
        payload=payload,
        ip_address=request.client.host if request.client else None,
    )
    return StoreRead.model_validate(store)


@router.delete("/{store_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deactivate store")
async def delete_store(
    store_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> None:
    await store_service.delete_store(
        db,
        actor=current_user,
        store_id=store_id,
        ip_address=request.client.host if request.client else None,
    )
