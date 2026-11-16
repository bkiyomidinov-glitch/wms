from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def record_audit(
    db: AsyncSession,
    *,
    user_id: UUID | None,
    action: str,
    entity: str,
    entity_id: str | UUID | None = None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Persist an immutable audit log entry inside the current transaction."""
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        old_value=old_value,
        new_value=new_value,
        payload=payload or {},
        ip_address=ip_address,
    )
    db.add(log)
    return log
