from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import TokenResponse, UserSummary
from app.services.audit_service import record_audit


def _build_token_response(user: User) -> TokenResponse:
    store_ids = [str(s.id) for s in (getattr(user, "stores", []) or [])]
    if not store_ids and user.store_id:
        store_ids = [str(user.store_id)]
    return TokenResponse(
        access_token=create_access_token(user.id, user.role, user.username),
        refresh_token=create_refresh_token(user.id),
        user=UserSummary(
            id=str(user.id),
            username=user.username,
            full_name=user.full_name,
            role=user.role,
            shift_name=user.shift_name,
            store_id=str(user.store_id) if user.store_id else None,
            store_name=user.store.name if user.store else None,
            store_ids=store_ids,
            permissions=getattr(user, "permissions", {}) or {},
            is_active=user.is_active,
        ),
    )


async def authenticate_user(
    db: AsyncSession,
    *,
    username: str,
    password: str,
    ip_address: str | None = None,
) -> TokenResponse:
    stmt = select(User).where(User.username == username.strip())
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise AuthenticationError("Неверный логин или пароль")

    if not user.is_active:
        raise AuthenticationError("Учетная запись заблокирована. Обратитесь к администратору")

    await record_audit(
        db,
        user_id=user.id,
        action="USER_LOGIN",
        entity="user",
        entity_id=user.id,
        payload={
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "store_name": user.store.name if user.store else None,
        },
        ip_address=ip_address,
    )
    await db.commit()
    return _build_token_response(user)


async def record_logout(
    db: AsyncSession,
    *,
    user: User,
    ip_address: str | None = None,
) -> None:
    await record_audit(
        db,
        user_id=user.id,
        action="USER_LOGOUT",
        entity="user",
        entity_id=user.id,
        payload={
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "store_name": user.store.name if user.store else None,
        },
        ip_address=ip_address,
    )
    await db.commit()


async def refresh_user_tokens(db: AsyncSession, *, refresh_token: str) -> TokenResponse:
    payload = decode_refresh_token(refresh_token)
    user_id = UUID(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise AuthenticationError("Пользователь не найден или деактивирован")
    return _build_token_response(user)
