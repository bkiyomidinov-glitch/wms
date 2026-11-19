from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, require_roles
from app.db.session import get_db
from app.domain.enums import TransactionType, UserRole
from app.models.transaction import InventoryTransaction
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionRead
from app.services import inventory_service

router = APIRouter(prefix="/transactions", tags=["Inventory Operations"])


@router.get("", response_model=list[TransactionRead])
async def list_transactions(
    tx_type: TransactionType | None = Query(default=None),
    product_id: UUID | None = Query(default=None),
    store_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InventoryTransaction]:
    return await inventory_service.list_transactions(
        db,
        actor=current_user,
        tx_type=tx_type,
        product_id=product_id,
        store_id=store_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/product/{product_id}/summary", response_model=dict[str, Any])
async def product_movement_summary(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    summary = await inventory_service.get_product_movement_summary(
        db, product_id=product_id, actor=current_user
    )
    # Serialize transactions in summary
    summary["transactions"] = [TransactionRead.model_validate(t) for t in summary["transactions"]]
    return summary


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InventoryTransaction:
    return await inventory_service.execute_transaction(
        db,
        actor=current_user,
        payload=payload,
        ip_address=get_client_ip(request),
    )


@router.get("/analytics/summary")
async def analytics_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> dict:
    return await inventory_service.get_analytics_summary(db)
