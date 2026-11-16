from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, require_roles
from app.db.session import get_db
from app.domain.enums import AttributeTargetType, UserRole
from app.models.attribute import AttributeDefinition
from app.models.category import Category
from app.models.dictionary import CustomDictionary
from app.models.unit import UnitOfMeasure
from app.models.user import User
from app.schemas.attribute import AttributeCreate, AttributeRead, AttributeUpdate
from app.schemas.category import CategoryCreate, CategoryRead, CategoryUpdate
from app.schemas.dictionary import DictionaryCreate, DictionaryRead, DictionaryUpdate
from app.schemas.unit import UnitCreate, UnitRead, UnitUpdate
from app.services import constructor_service

router = APIRouter(prefix="/constructor", tags=["Dynamic Constructor & Dictionaries"])


# --- Units of Measure ---
@router.get("/units", response_model=list[UnitRead])
async def list_units(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UnitOfMeasure]:
    return await constructor_service.list_units(db, include_inactive=include_inactive)


@router.post("/units", response_model=UnitRead, status_code=status.HTTP_201_CREATED)
async def create_unit(
    payload: UnitCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> UnitOfMeasure:
    return await constructor_service.create_unit(
        db, actor=actor, payload=payload, ip_address=get_client_ip(request)
    )


@router.patch("/units/{unit_id}", response_model=UnitRead)
async def update_unit(
    unit_id: UUID,
    payload: UnitUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> UnitOfMeasure:
    return await constructor_service.update_unit(
        db, actor=actor, unit_id=unit_id, payload=payload, ip_address=get_client_ip(request)
    )


# --- Custom Dictionaries ---
@router.get("/dictionaries", response_model=list[DictionaryRead])
async def list_dictionaries(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CustomDictionary]:
    return await constructor_service.list_dictionaries(
        db, include_inactive=include_inactive
    )


@router.post("/dictionaries", response_model=DictionaryRead, status_code=status.HTTP_201_CREATED)
async def create_dictionary(
    payload: DictionaryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> CustomDictionary:
    return await constructor_service.create_dictionary(
        db, actor=actor, payload=payload, ip_address=get_client_ip(request)
    )


@router.patch("/dictionaries/{dictionary_id}", response_model=DictionaryRead)
async def update_dictionary(
    dictionary_id: UUID,
    payload: DictionaryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> CustomDictionary:
    return await constructor_service.update_dictionary(
        db,
        actor=actor,
        dictionary_id=dictionary_id,
        payload=payload,
        ip_address=get_client_ip(request),
    )


# --- Attribute Definitions ---
@router.get("/attributes", response_model=list[AttributeRead])
async def list_attributes(
    target_type: AttributeTargetType | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AttributeDefinition]:
    return await constructor_service.list_attributes(
        db, target_type=target_type, include_inactive=include_inactive
    )


@router.post("/attributes", response_model=AttributeRead, status_code=status.HTTP_201_CREATED)
async def create_attribute(
    payload: AttributeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> AttributeDefinition:
    return await constructor_service.create_attribute(
        db, actor=actor, payload=payload, ip_address=get_client_ip(request)
    )


@router.patch("/attributes/{attribute_id}", response_model=AttributeRead)
async def update_attribute(
    attribute_id: UUID,
    payload: AttributeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> AttributeDefinition:
    return await constructor_service.update_attribute(
        db,
        actor=actor,
        attribute_id=attribute_id,
        payload=payload,
        ip_address=get_client_ip(request),
    )


@router.delete("/attributes/{attribute_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attribute(
    attribute_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> None:
    await constructor_service.delete_attribute(
        db, actor=actor, attribute_id=attribute_id, ip_address=get_client_ip(request)
    )


# --- Categories ---
@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Category]:
    return await constructor_service.list_categories(db, include_inactive=include_inactive)


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> Category:
    return await constructor_service.create_category(
        db, actor=actor, payload=payload, ip_address=get_client_ip(request)
    )


@router.patch("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: UUID,
    payload: CategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)),
) -> Category:
    return await constructor_service.update_category(
        db,
        actor=actor,
        category_id=category_id,
        payload=payload,
        ip_address=get_client_ip(request),
    )
