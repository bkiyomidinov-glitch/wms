from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, DomainValidationError, NotFoundError
from app.domain.enums import AttributeTargetType, FieldType
from app.models.attribute import AttributeDefinition
from app.models.category import Category
from app.models.dictionary import CustomDictionary
from app.models.unit import UnitOfMeasure
from app.models.user import User
from app.schemas.attribute import AttributeCreate, AttributeUpdate
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.schemas.dictionary import DictionaryCreate, DictionaryUpdate
from app.schemas.unit import UnitCreate, UnitUpdate
from app.services.audit_service import record_audit


# --- Units of Measure ---
async def list_units(db: AsyncSession, *, include_inactive: bool = False) -> list[UnitOfMeasure]:
    stmt = select(UnitOfMeasure).order_by(UnitOfMeasure.name.asc())
    if not include_inactive:
        stmt = stmt.where(UnitOfMeasure.is_active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_unit(
    db: AsyncSession, *, actor: User, payload: UnitCreate, ip_address: str | None = None
) -> UnitOfMeasure:
    existing = await db.execute(
        select(UnitOfMeasure).where(UnitOfMeasure.code == payload.code.strip())
    )
    if existing.scalar_one_or_none():
        raise ConflictError(f"Единица измерения с кодом «{payload.code}» уже существует")

    unit = UnitOfMeasure(
        code=payload.code.strip(),
        name=payload.name.strip(),
        plural_name=payload.plural_name.strip() if payload.plural_name else None,
        is_active=payload.is_active,
    )
    db.add(unit)
    await db.flush()

    await record_audit(
        db,
        user_id=actor.id,
        action="UNIT_CREATE",
        entity="unit_of_measure",
        entity_id=unit.id,
        new_value={"code": unit.code, "name": unit.name, "plural_name": unit.plural_name},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(unit)
    return unit


async def update_unit(
    db: AsyncSession,
    *,
    actor: User,
    unit_id: UUID,
    payload: UnitUpdate,
    ip_address: str | None = None,
) -> UnitOfMeasure:
    result = await db.execute(select(UnitOfMeasure).where(UnitOfMeasure.id == unit_id))
    unit = result.scalar_one_or_none()
    if not unit:
        raise NotFoundError("Единица измерения не найдена")

    old_value = {
        "name": unit.name,
        "plural_name": unit.plural_name,
        "is_active": unit.is_active,
    }
    if payload.name is not None:
        unit.name = payload.name.strip()
    if payload.plural_name is not None:
        unit.plural_name = payload.plural_name.strip() or None
    if payload.is_active is not None:
        unit.is_active = payload.is_active

    await record_audit(
        db,
        user_id=actor.id,
        action="UNIT_UPDATE",
        entity="unit_of_measure",
        entity_id=unit.id,
        old_value=old_value,
        new_value={
            "name": unit.name,
            "plural_name": unit.plural_name,
            "is_active": unit.is_active,
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(unit)
    return unit


# --- Custom Dictionaries ---
async def list_dictionaries(
    db: AsyncSession, *, include_inactive: bool = False
) -> list[CustomDictionary]:
    stmt = select(CustomDictionary).order_by(CustomDictionary.name.asc())
    if not include_inactive:
        stmt = stmt.where(CustomDictionary.is_active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_dictionary(
    db: AsyncSession,
    *,
    actor: User,
    payload: DictionaryCreate,
    ip_address: str | None = None,
) -> CustomDictionary:
    existing = await db.execute(
        select(CustomDictionary).where(CustomDictionary.slug == payload.slug.strip())
    )
    if existing.scalar_one_or_none():
        raise ConflictError(f"Справочник со slug «{payload.slug}» уже существует")

    dictionary = CustomDictionary(
        name=payload.name.strip(),
        slug=payload.slug.strip(),
        items=payload.items,
        is_active=payload.is_active,
    )
    db.add(dictionary)
    await db.flush()

    await record_audit(
        db,
        user_id=actor.id,
        action="DICTIONARY_CREATE",
        entity="custom_dictionary",
        entity_id=dictionary.id,
        new_value={"name": dictionary.name, "slug": dictionary.slug, "items": dictionary.items},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(dictionary)
    return dictionary


async def update_dictionary(
    db: AsyncSession,
    *,
    actor: User,
    dictionary_id: UUID,
    payload: DictionaryUpdate,
    ip_address: str | None = None,
) -> CustomDictionary:
    result = await db.execute(
        select(CustomDictionary).where(CustomDictionary.id == dictionary_id)
    )
    dictionary = result.scalar_one_or_none()
    if not dictionary:
        raise NotFoundError("Пользовательский справочник не найден")

    old_value = {
        "name": dictionary.name,
        "items": dictionary.items,
        "is_active": dictionary.is_active,
    }
    if payload.name is not None:
        dictionary.name = payload.name.strip()
    if payload.items is not None:
        dictionary.items = payload.items
    if payload.is_active is not None:
        dictionary.is_active = payload.is_active

    await record_audit(
        db,
        user_id=actor.id,
        action="DICTIONARY_UPDATE",
        entity="custom_dictionary",
        entity_id=dictionary.id,
        old_value=old_value,
        new_value={
            "name": dictionary.name,
            "items": dictionary.items,
            "is_active": dictionary.is_active,
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(dictionary)
    return dictionary


# --- Attribute Definitions ---
async def list_attributes(
    db: AsyncSession,
    *,
    target_type: AttributeTargetType | None = None,
    include_inactive: bool = False,
) -> list[AttributeDefinition]:
    stmt = select(AttributeDefinition).order_by(
        AttributeDefinition.target_type.asc(),
        AttributeDefinition.sort_order.asc(),
        AttributeDefinition.label.asc(),
    )
    if target_type is not None:
        stmt = stmt.where(AttributeDefinition.target_type == target_type.value)
    if not include_inactive:
        stmt = stmt.where(AttributeDefinition.is_active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_attribute(
    db: AsyncSession,
    *,
    actor: User,
    payload: AttributeCreate,
    ip_address: str | None = None,
) -> AttributeDefinition:
    existing = await db.execute(
        select(AttributeDefinition).where(
            AttributeDefinition.target_type == payload.target_type.value,
            AttributeDefinition.key == payload.key,
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError(
            f"Атрибут с ключом «{payload.key}» уже существует для {payload.target_type.value}"
        )

    dict_id = payload.dictionary_id
    if payload.field_type == FieldType.SELECT:
        clean_opts = [
            opt.strip() for opt in (payload.options or []) if opt and opt.strip()
        ]
        if clean_opts and dict_id is None:
            slug = f"dict_{payload.key.replace('-', '_')}"
            dict_entity = CustomDictionary(
                name=f"Список: {payload.label.strip()}",
                slug=slug,
                items=[
                    {"value": opt, "label": opt, "is_active": True} for opt in clean_opts
                ],
                is_active=True,
            )
            db.add(dict_entity)
            await db.flush()
            dict_id = dict_entity.id
        elif dict_id is not None:
            dict_res = await db.execute(
                select(CustomDictionary).where(CustomDictionary.id == dict_id)
            )
            if not dict_res.scalar_one_or_none():
                raise NotFoundError("Указанный справочник для поля SELECT не найден")

    attr = AttributeDefinition(
        target_type=payload.target_type.value,
        key=payload.key,
        label=payload.label.strip(),
        field_type=payload.field_type.value,
        dictionary_id=dict_id,
        default_value=payload.default_value,
        is_required=payload.is_required,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(attr)
    await db.flush()

    await record_audit(
        db,
        user_id=actor.id,
        action="ATTRIBUTE_CREATE",
        entity="attribute_definition",
        entity_id=attr.id,
        new_value={
            "target_type": attr.target_type,
            "key": attr.key,
            "label": attr.label,
            "field_type": attr.field_type,
            "is_required": attr.is_required,
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(attr)
    return attr


async def update_attribute(
    db: AsyncSession,
    *,
    actor: User,
    attribute_id: UUID,
    payload: AttributeUpdate,
    ip_address: str | None = None,
) -> AttributeDefinition:
    result = await db.execute(
        select(AttributeDefinition).where(AttributeDefinition.id == attribute_id)
    )
    attr = result.scalar_one_or_none()
    if not attr:
        raise NotFoundError("Определение атрибута не найдено")

    old_value = {
        "label": attr.label,
        "field_type": attr.field_type,
        "dictionary_id": str(attr.dictionary_id) if attr.dictionary_id else None,
        "default_value": attr.default_value,
        "is_required": attr.is_required,
        "sort_order": attr.sort_order,
        "is_active": attr.is_active,
    }

    new_type = payload.field_type.value if payload.field_type else attr.field_type
    new_dict_id = (
        payload.dictionary_id if payload.dictionary_id is not None else attr.dictionary_id
    )

    if payload.options is not None:
        clean_opts = [
            opt.strip() for opt in payload.options if opt and opt.strip()
        ]
        if attr.dictionary_id:
            dict_res = await db.execute(
                select(CustomDictionary).where(CustomDictionary.id == attr.dictionary_id)
            )
            existing_dict = dict_res.scalar_one_or_none()
            if existing_dict:
                existing_dict.items = [
                    {"value": opt, "label": opt, "is_active": True} for opt in clean_opts
                ]
        elif clean_opts:
            slug = f"dict_{attr.key.replace('-', '_')}"
            dict_entity = CustomDictionary(
                name=f"Список: {attr.label.strip()}",
                slug=slug,
                items=[
                    {"value": opt, "label": opt, "is_active": True} for opt in clean_opts
                ],
                is_active=True,
            )
            db.add(dict_entity)
            await db.flush()
            new_dict_id = dict_entity.id

    if new_type == FieldType.SELECT.value and new_dict_id is None:
        raise DomainValidationError("Для поля типа SELECT необходимо указать варианты или справочник")

    if payload.dictionary_id is not None:
        dict_res = await db.execute(
            select(CustomDictionary).where(CustomDictionary.id == payload.dictionary_id)
        )
        if not dict_res.scalar_one_or_none():
            raise NotFoundError("Указанный справочник не найден")

    if payload.label is not None:
        attr.label = payload.label.strip()
    if payload.field_type is not None:
        attr.field_type = payload.field_type.value
    if new_dict_id != attr.dictionary_id:
        attr.dictionary_id = new_dict_id
    if payload.default_value is not None:
        attr.default_value = payload.default_value
    if payload.is_required is not None:
        attr.is_required = payload.is_required
    if payload.sort_order is not None:
        attr.sort_order = payload.sort_order
    if payload.is_active is not None:
        attr.is_active = payload.is_active

    await record_audit(
        db,
        user_id=actor.id,
        action="ATTRIBUTE_UPDATE",
        entity="attribute_definition",
        entity_id=attr.id,
        old_value=old_value,
        new_value={
            "label": attr.label,
            "field_type": attr.field_type,
            "dictionary_id": str(attr.dictionary_id) if attr.dictionary_id else None,
            "default_value": attr.default_value,
            "is_required": attr.is_required,
            "sort_order": attr.sort_order,
            "is_active": attr.is_active,
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(attr)
    return attr


async def delete_attribute(
    db: AsyncSession,
    *,
    actor: User,
    attribute_id: UUID,
    ip_address: str | None = None,
) -> None:
    result = await db.execute(
        select(AttributeDefinition).where(AttributeDefinition.id == attribute_id)
    )
    attr = result.scalar_one_or_none()
    if not attr:
        raise NotFoundError("Определение атрибута не найдено")

    await record_audit(
        db,
        user_id=actor.id,
        action="ATTRIBUTE_DELETE",
        entity="attribute_definition",
        entity_id=attr.id,
        old_value={"key": attr.key, "label": attr.label},
        ip_address=ip_address,
    )
    await db.delete(attr)
    await db.commit()


# --- Categories ---
async def list_categories(db: AsyncSession, *, include_inactive: bool = False) -> list[Category]:
    stmt = select(Category).order_by(Category.name.asc())
    if not include_inactive:
        stmt = stmt.where(Category.is_active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_category(
    db: AsyncSession,
    *,
    actor: User,
    payload: CategoryCreate,
    ip_address: str | None = None,
) -> Category:
    existing = await db.execute(
        select(Category).where(
            (Category.slug == payload.slug.strip()) | (Category.name == payload.name.strip())
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError("Категория с таким названием или slug уже существует")

    category = Category(
        name=payload.name.strip(),
        slug=payload.slug.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=payload.is_active,
    )
    db.add(category)
    await db.flush()

    await record_audit(
        db,
        user_id=actor.id,
        action="CATEGORY_CREATE",
        entity="category",
        entity_id=category.id,
        new_value={"name": category.name, "slug": category.slug},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(category)
    return category


async def update_category(
    db: AsyncSession,
    *,
    actor: User,
    category_id: UUID,
    payload: CategoryUpdate,
    ip_address: str | None = None,
) -> Category:
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise NotFoundError("Категория не найдена")

    old_value = {
        "name": category.name,
        "description": category.description,
        "is_active": category.is_active,
    }
    if payload.name is not None:
        category.name = payload.name.strip()
    if payload.description is not None:
        category.description = payload.description.strip() or None
    if payload.is_active is not None:
        category.is_active = payload.is_active

    await record_audit(
        db,
        user_id=actor.id,
        action="CATEGORY_UPDATE",
        entity="category",
        entity_id=category.id,
        old_value=old_value,
        new_value={
            "name": category.name,
            "description": category.description,
            "is_active": category.is_active,
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(category)
    return category
