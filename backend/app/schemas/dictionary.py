from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DictionaryItem(BaseModel):
    value: str = Field(..., min_length=1, max_length=150)
    label: str = Field(..., min_length=1, max_length=200)
    is_active: bool = True


class DictionaryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_\-]+$")
    items: list[DictionaryItem | str] = Field(default_factory=list)
    is_active: bool = True

    @field_validator("items")
    @classmethod
    def normalize_items(cls, v: list[DictionaryItem | str]) -> list[dict]:
        normalized: list[dict] = []
        for item in v:
            if isinstance(item, str):
                stripped = item.strip()
                if stripped:
                    normalized.append(
                        {"value": stripped, "label": stripped, "is_active": True}
                    )
            else:
                normalized.append(item.model_dump())
        return normalized


class DictionaryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    items: list[DictionaryItem | str] | None = None
    is_active: bool | None = None

    @field_validator("items")
    @classmethod
    def normalize_items(cls, v: list[DictionaryItem | str] | None) -> list[dict] | None:
        if v is None:
            return None
        normalized: list[dict] = []
        for item in v:
            if isinstance(item, str):
                stripped = item.strip()
                if stripped:
                    normalized.append(
                        {"value": stripped, "label": stripped, "is_active": True}
                    )
            else:
                normalized.append(item.model_dump())
        return normalized


class DictionaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    items: list[DictionaryItem]
    is_active: bool
    created_at: datetime
