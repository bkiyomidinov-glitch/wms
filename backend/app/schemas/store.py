from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StoreCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    code: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    is_active: bool = True


class StoreUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    code: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class StoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str | None = None
    address: str | None = None
    is_active: bool
    created_at: datetime
