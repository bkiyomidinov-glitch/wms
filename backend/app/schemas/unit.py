from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UnitCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=32, pattern=r"^[a-zA-Z0-9_\-]+$")
    name: str = Field(..., min_length=1, max_length=64)
    plural_name: str | None = Field(default=None, max_length=64)
    is_active: bool = True


class UnitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    plural_name: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


class UnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    plural_name: str | None
    is_active: bool
