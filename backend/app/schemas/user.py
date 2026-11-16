from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import UserRole


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.\-+@]+$")
    full_name: str = Field(..., min_length=2, max_length=200)
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole
    shift_name: str | None = Field(default=None, max_length=100)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    role: UserRole | None = None
    shift_name: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    full_name: str
    role: UserRole
    shift_name: str | None
    is_active: bool
    created_by: UUID | None
    created_at: datetime
