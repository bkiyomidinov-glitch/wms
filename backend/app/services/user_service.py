from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError
from app.core.security import hash_password
from app.domain.enums import UserRole
from app.domain.permissions import can_manage_role
from app.models.store import Store
from app.models.user import User, UserStore
from app.schemas.user import UserCreate, UserUpdate
from app.services.audit_service import record_audit

DEFAULT_PERMISSIONS_BY_ROLE: dict[UserRole, dict[str, bool]] = {
    UserRole.SUPER_ADMIN: {
        "can_inbound": True,
        "can_outbound": True,
        "can_view_stock": True,
        "can_view_movements": True,
        "can_manage_products": True,
        "can_manage_stores": True,
        "can_manage_users": True,
    },
    UserRole.DIRECTOR: {
        "can_inbound": True,
        "can_outbound": True,
        "can_view_stock": True,
        "can_view_movements": True,
        "can_manage_products": True,
        "can_manage_stores": True,
        "can_manage_users": False,
    },
    UserRole.MANAGER: {
        "can_inbound": True,
        "can_outbound": True,
        "can_view_stock": True,
        "can_view_movements": True,
        "can_manage_products": True,
        "can_manage_stores": True,
        "can_manage_users": False,
    },
    UserRole.OPERATOR: {
        "can_inbound": True,
        "can_outbound": True,
        "can_view_stock": True,
        "can_view_movements": True,
        "can_manage_products": False,
        "can_manage_stores": False,
        "can_manage_users": False,
    },
}


def _prepare_user_read(user: User) -> User:
    """Ensure user.store_ids is populated for schema serialization."""
    if hasattr(user, "stores") and user.stores:
        user.store_ids = [s.id for s in user.stores]
    elif user.store_id:
        user.store_ids = [user.store_id]
    else:
        user.store_ids = []
    return user


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = list(result.scalars().all())
    for u in users:
        _prepare_user_read(u)
    return users


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

    perms = payload.permissions or DEFAULT_PERMISSIONS_BY_ROLE.get(payload.role, {})
    effective_store_ids = list(payload.store_ids or [])
    if payload.store_id and payload.store_id not in effective_store_ids:
        effective_store_ids.append(payload.store_id)
    primary_store_id = effective_store_ids[0] if effective_store_ids else payload.store_id

    user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role.value,
        shift_name=payload.shift_name.strip() if payload.shift_name else None,
        store_id=primary_store_id,
        permissions=perms,
        is_active=True,
        created_by=actor.id,
    )
    db.add(user)
    await db.flush()

    # Link user_stores
    for sid in effective_store_ids:
        await db.execute(
            text("INSERT INTO user_stores (user_id, store_id) VALUES (:uid, :sid) ON CONFLICT DO NOTHING"),
            {"uid": user.id, "sid": sid},
        )

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
            "store_ids": [str(s) for s in effective_store_ids],
            "permissions": perms,
        },
        payload={"created_by": actor.username},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(user)
    return _prepare_user_read(user)


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
        "permissions": target.permissions,
        "is_active": target.is_active,
    }

    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
    if payload.role is not None:
        target.role = payload.role.value
    if payload.shift_name is not None:
        target.shift_name = payload.shift_name.strip() or None
    if payload.permissions is not None:
        target.permissions = payload.permissions

    if payload.store_ids is not None:
        target_store_ids = list(payload.store_ids)
        target.store_id = target_store_ids[0] if target_store_ids else None
        await db.execute(text("DELETE FROM user_stores WHERE user_id = :uid"), {"uid": target.id})
        for sid in target_store_ids:
            await db.execute(
                text("INSERT INTO user_stores (user_id, store_id) VALUES (:uid, :sid) ON CONFLICT DO NOTHING"),
                {"uid": target.id, "sid": sid},
            )
    elif payload.store_id is not None:
        target.store_id = payload.store_id
        await db.execute(
            text("INSERT INTO user_stores (user_id, store_id) VALUES (:uid, :sid) ON CONFLICT DO NOTHING"),
            {"uid": target.id, "sid": payload.store_id},
        )

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
        "permissions": target.permissions,
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
    return _prepare_user_read(target)
