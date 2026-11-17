from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError
from app.core.security import hash_password
from app.domain.enums import UserRole
from app.domain.permissions import can_manage_role
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.services.audit_service import record_audit


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


async def create_user(
    db: AsyncSession,
    *,
    actor: User,
    payload: UserCreate,
    ip_address: str | None = None,
) -> User:
    actor_role = UserRole(actor.role)
    if not can_manage_role(actor_role, payload.role):
        raise PermissionDeniedError(
            f"Роль {actor.role} не может создавать пользователей с ролью {payload.role.value}"
        )

    existing = await db.execute(select(User).where(User.username == payload.username))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Пользователь с логином «{payload.username}» уже существует")

    user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role.value,
        shift_name=payload.shift_name.strip() if payload.shift_name else None,
        store_id=payload.store_id,
        is_active=True,
        created_by=actor.id,
    )
    db.add(user)
    await db.flush()

    await record_audit(
        db,
        user_id=actor.id,
        action="USER_CREATE",
        entity="user",
        entity_id=user.id,
        new_value={
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "shift_name": user.shift_name,
            "store_id": str(user.store_id) if user.store_id else None,
        },
        payload={"created_by": actor.username},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession,
    *,
    actor: User,
    user_id: UUID,
    payload: UserUpdate,
    ip_address: str | None = None,
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise NotFoundError("Пользователь не найден")

    actor_role = UserRole(actor.role)
    target_current_role = UserRole(target.role)

    if not can_manage_role(actor_role, target_current_role) and actor.id != target.id:
        raise PermissionDeniedError("Недостаточно прав для изменения этого пользователя")

    if payload.role is not None and not can_manage_role(actor_role, payload.role):
        raise PermissionDeniedError(
            f"Недостаточно прав для назначения роли {payload.role.value}"
        )

    old_value = {
        "full_name": target.full_name,
        "role": target.role,
        "shift_name": target.shift_name,
        "store_id": str(target.store_id) if target.store_id else None,
        "is_active": target.is_active,
    }

    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
    if payload.role is not None:
        target.role = payload.role.value
    if payload.shift_name is not None:
        target.shift_name = payload.shift_name.strip() or None
    if payload.store_id is not None:
        target.store_id = payload.store_id
    if payload.is_active is not None:
        if target.id == actor.id and not payload.is_active:
            raise PermissionDeniedError("Нельзя заблокировать собственную учетную запись")
        target.is_active = payload.is_active
    if payload.password is not None:
        target.password_hash = hash_password(payload.password)

    new_value = {
        "full_name": target.full_name,
        "role": target.role,
        "shift_name": target.shift_name,
        "store_id": str(target.store_id) if target.store_id else None,
        "is_active": target.is_active,
    }

    await record_audit(
        db,
        user_id=actor.id,
        action="USER_UPDATE",
        entity="user",
        entity_id=target.id,
        old_value=old_value,
        new_value=new_value,
        payload={"updated_by": actor.username},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(target)
    return target
