from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    full_name: str
    role: str


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None
    action: str
    entity: str
    entity_id: str | None
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    payload: dict[str, Any]
    ip_address: str | None
    created_at: datetime
    user: AuditUserSummary | None = None
