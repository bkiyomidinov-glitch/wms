from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainValidationError
from app.domain.enums import AttributeTargetType, FieldType
from app.models.attribute import AttributeDefinition


def _extract_active_dict_values(attr: AttributeDefinition) -> set[str]:
    if not attr.dictionary or not attr.dictionary.is_active:
        return set()
    values: set[str] = set()
    for item in attr.dictionary.items:
        if isinstance(item, dict):
            if item.get("is_active", True):
                values.add(str(item["value"]))
        else:
            values.add(str(item))
    return values


def _coerce_field_value(attr: AttributeDefinition, raw_value: Any) -> Any:
    if raw_value is None or raw_value == "":
        return None

    ftype = FieldType(attr.field_type)
    if ftype == FieldType.TEXT:
        return str(raw_value).strip()

    if ftype == FieldType.NUMBER:
        try:
            num = Decimal(str(raw_value))
            return float(num) if "." in str(raw_value) else int(num)
        except (InvalidOperation, ValueError) as exc:
            raise DomainValidationError(
                f"Поле «{attr.label}» должно быть числом",
                details={"field": attr.key},
            ) from exc

    if ftype == FieldType.BOOLEAN:
        if isinstance(raw_value, bool):
            return raw_value
        if isinstance(raw_value, str):
            lowered = raw_value.strip().lower()
            if lowered in {"true", "1", "yes", "да"}:
                return True
            if lowered in {"false", "0", "no", "нет"}:
                return False
        raise DomainValidationError(
            f"Поле «{attr.label}» должно иметь логическое значение (Да/Нет)",
            details={"field": attr.key},
        )

    if ftype == FieldType.DATE:
        if isinstance(raw_value, (date, datetime)):
            return raw_value.isoformat()
        if isinstance(raw_value, str):
            try:
                datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
                return raw_value
            except ValueError:
                try:
                    date.fromisoformat(raw_value)
                    return raw_value
                except ValueError as exc:
                    raise DomainValidationError(
                        f"Поле «{attr.label}» должно быть датой в формате ISO",
                        details={"field": attr.key},
                    ) from exc
        raise DomainValidationError(
            f"Поле «{attr.label}» должно быть корректной датой",
            details={"field": attr.key},
        )

    if ftype == FieldType.SELECT:
        allowed_values = _extract_active_dict_values(attr)
        str_val = str(raw_value)
        if allowed_values and str_val not in allowed_values:
            raise DomainValidationError(
                f"Недопустимое значение «{str_val}» для поля «{attr.label}»",
                details={"field": attr.key, "allowed": sorted(allowed_values)},
            )
        return str_val

    return raw_value


async def validate_dynamic_attributes(
    db: AsyncSession,
    *,
    target_type: AttributeTargetType,
    submitted_values: dict[str, Any] | None,
    enabled_attribute_ids: list[UUID | str] | None = None,
) -> dict[str, Any]:
    """Validate and normalize dynamic JSONB attributes against active AttributeDefinitions."""
    stmt = (
        select(AttributeDefinition)
        .where(
            AttributeDefinition.target_type == target_type.value,
            AttributeDefinition.is_active.is_(True),
        )
        .order_by(AttributeDefinition.sort_order.asc())
    )
    result = await db.execute(stmt)
    definitions = list(result.scalars().all())

    if enabled_attribute_ids is not None:
        enabled_set = {str(uid) for uid in enabled_attribute_ids}
        definitions = [d for d in definitions if str(d.id) in enabled_set]

    submitted = submitted_values or {}
    normalized: dict[str, Any] = {}

    for attr in definitions:
        raw_val = submitted.get(attr.key)
        if (raw_val is None or raw_val == "") and attr.default_value is not None:
            raw_val = attr.default_value

        coerced = _coerce_field_value(attr, raw_val)
        if attr.is_required and (coerced is None or coerced == ""):
            raise DomainValidationError(
                f"Обязательное поле «{attr.label}» не заполнено",
                details={"field": attr.key},
            )
        if coerced is not None:
            normalized[attr.key] = coerced

    # Also preserve any dynamic / ad-hoc attributes submitted directly in operation
    for k, v in submitted.items():
        if k not in normalized and v is not None and v != "":
            normalized[k] = v

    return normalized
