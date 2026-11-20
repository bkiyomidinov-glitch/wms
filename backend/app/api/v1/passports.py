from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.passport import (
    BoningProcessCreate,
    InitialReceiptCreate,
    PassportAcceptReceiptCreate,
    PassportDispatchCreate,
    PassportDispatchResult,
    PassportGenealogyTree,
    PassportRead,
    StorePassportInventorySummary,
)
from app.services import passport_service

router = APIRouter(prefix="/passports", tags=["MES/WMS Cell Passports"])


@router.post("/initial-receipt", response_model=PassportRead, status_code=status.HTTP_201_CREATED)
async def create_initial_receipt(
    payload: InitialReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PassportRead:
    """ЭТАП ① — Первичная приемка сырья и создание паспорта № id X."""
    return await passport_service.create_initial_receipt(db, actor=current_user, data=payload)


@router.post("/{passport_id}/dispatch", response_model=PassportDispatchResult)
async def dispatch_passport(
    passport_id: uuid.UUID,
    payload: PassportDispatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PassportDispatchResult:
    """Отправка ячейки со склада / частичное дробление партии (Lot Splitting)."""
    return await passport_service.dispatch_passport(
        db, actor=current_user, passport_id=passport_id, data=payload
    )


@router.post("/{passport_id}/accept-receipt", response_model=PassportRead)
async def accept_passport_receipt(
    passport_id: uuid.UUID,
    payload: PassportAcceptReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PassportRead:
    """Приемка ячейки на целевом складе / цехе (Handshake confirmation)."""
    return await passport_service.accept_passport_receipt(
        db, actor=current_user, passport_id=passport_id, data=payload
    )


@router.post("/{passport_id}/boning", response_model=dict[str, Any])
async def process_boning(
    passport_id: uuid.UUID,
    payload: BoningProcessCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """ЭТАП ② — Обвалка / переработка сырья с расчетом материального баланса потерь (Mass Balance)."""
    return await passport_service.process_boning(
        db, actor=current_user, source_passport_id=passport_id, data=payload
    )


@router.get("/search", response_model=list[PassportRead])
async def search_passports(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PassportRead]:
    """Поиск паспорта по коду (1, 1.1-1), QR (PKZ:1) или штрихкоду товара."""
    passports = await passport_service.search_passport(db, query=q)
    return [passport_service.serialize_passport(p) for p in passports]


@router.get("/in-transit", response_model=list[PassportRead])
async def list_in_transit(
    store_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PassportRead]:
    """Список ячеек, находящихся в пути и ожидающих приемки на складе."""
    return await passport_service.list_in_transit_passports(db, store_id=store_id)


@router.get("/store/{store_id}/summary", response_model=StorePassportInventorySummary)
async def get_store_passport_summary(
    store_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StorePassportInventorySummary:
    """Агрегированные остатки склада по активным паспортам (например СГП 30 + 60 = 90 кг)."""
    return await passport_service.get_store_passport_inventory_summary(db, store_id=store_id)


@router.get("/{passport_id}/genealogy", response_model=PassportGenealogyTree)
async def get_genealogy(
    passport_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PassportGenealogyTree:
    """Двунаправленная HACCP-прослеживаемость (генеалогия ячейки: предки, акт обвалки, потомки)."""
    return await passport_service.get_genealogy_tree(db, passport_id=passport_id)


@router.get("/{passport_id}", response_model=PassportRead)
async def get_passport(
    passport_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PassportRead:
    """Получение полных данных паспорта ячейки со всеми 10 полями и хронологией событий."""
    p = await passport_service.get_passport_by_id(db, passport_id=passport_id)
    return passport_service.serialize_passport(p)
