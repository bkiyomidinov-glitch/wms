import re
import uuid
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import AttributeTargetType, FieldType
from app.schemas.dictionary import DictionaryRead


def generate_attr_key(label: str) -> str:
    """Generate a valid SQL-safe identifier key from a Russian or English label."""
    translit_map = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
        "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
        "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
        "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
        "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    }
    cleaned = []
    for ch in label.lower():
        if ch in translit_map:
            cleaned.append(translit_map[ch])
        elif ch.isalnum() and ch.isascii():
            cleaned.append(ch)
        elif ch in {" ", "_", "-"}:
            cleaned.append("_")
    slug = re.sub(r"[^a-z0-9_]", "", "".join(cleaned)).strip("_")
    if not slug or not slug[0].isalpha():
        slug = f"attr_{slug}"
    short_uid = uuid.uuid4().hex[:6]
    return f"{slug[:25]}_{short_uid}"


class AttributeCreate(BaseModel):
    target_type: AttributeTargetType
    label: str = Field(..., min_length=1, max_length=150)
    field_type: FieldType
    key: str | None = Field(default=None, max_length=100)
    dictionary_id: UUID | None = None
    options: list[str] | None = None
    default_value: Any | None = None
    is_required: bool = False
    sort_order: int = 0
    is_active: bool = True

    @model_validator(mode="after")
    def validate_keys_and_options(self) -> "AttributeCreate":
        if not self.key or not self.key.strip():
            self.key = generate_attr_key(self.label)
        else:
            self.key = re.sub(r"[^a-z0-9_]", "_", self.key.strip().lower())
            if not self.key[0].isalpha():
                self.key = f"f_{self.key}"

        if self.field_type == FieldType.SELECT and self.dictionary_id is None and not self.options:
            raise ValueError("Для поля типа «Выпадающий список» укажите варианты значений")
        return self


class AttributeUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=150)
    field_type: FieldType | None = None
    dictionary_id: UUID | None = None
    options: list[str] | None = None
    default_value: Any | None = None
    is_required: bool | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class AttributeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    target_type: AttributeTargetType
    key: str
    label: str
    field_type: FieldType
    dictionary_id: UUID | None
    default_value: Any | None
    is_required: bool
    sort_order: int
    is_active: bool
    dictionary: DictionaryRead | None = None
