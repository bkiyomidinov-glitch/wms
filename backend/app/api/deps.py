from collections.abc import Callable
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials or not credentials.credentials:
        raise AuthenticationError("Требуется авторизация (Bearer token)")

    payload = decode_access_token(credentials.credentials)
    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise AuthenticationError("Некорректный идентификатор пользователя в токене") from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise AuthenticationError("Учетная запись не найдена или отключена")
    return user


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    allowed = {r.value for r in roles}

    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise PermissionDeniedError(
                f"Доступ запрещен для роли {current_user.role}"
            )
        return current_user

    return _guard
