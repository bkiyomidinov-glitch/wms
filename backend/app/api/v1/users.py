from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, require_roles
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users & RBAC"])


@router.get("", response_model=list[UserRead])
async def get_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> list[User]:
    return await user_service.list_users(db)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> User:
    return await user_service.create_user(
        db, actor=actor, payload=payload, ip_address=get_client_ip(request)
    )


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> User:
    return await user_service.update_user(
        db, actor=actor, user_id=user_id, payload=payload, ip_address=get_client_ip(request)
    )
