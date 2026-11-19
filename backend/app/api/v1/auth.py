from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserSummary
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await auth_service.authenticate_user(
        db,
        username=payload.username,
        password=payload.password,
        ip_address=get_client_ip(request),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await auth_service.refresh_user_tokens(db, refresh_token=payload.refresh_token)


@router.post("/logout")
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    await auth_service.record_logout(
        db,
        user=current_user,
        ip_address=get_client_ip(request),
    )
    return {"status": "ok"}


@router.get("/me", response_model=UserSummary)
async def me(current_user: User = Depends(get_current_user)) -> UserSummary:
    store_ids = [str(s.id) for s in (getattr(current_user, "stores", []) or [])]
    if not store_ids and current_user.store_id:
        store_ids = [str(current_user.store_id)]
    return UserSummary(
        id=str(current_user.id),
        username=current_user.username,
        full_name=current_user.full_name,
        role=current_user.role,
        shift_name=current_user.shift_name,
        store_id=str(current_user.store_id) if current_user.store_id else None,
        store_name=current_user.store.name if current_user.store else None,
        store_ids=store_ids,
        permissions=getattr(current_user, "permissions", {}) or {},
        is_active=current_user.is_active,
    )
