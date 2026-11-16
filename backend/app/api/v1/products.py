from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, require_roles
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models.product import Product, ProductAllowedUnit
from app.models.unit import UnitOfMeasure
from app.models.user import User
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.schemas.unit import UnitRead
from app.services import product_service

router = APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=list[ProductRead])
async def list_products(
    search: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ProductRead]:
    return await product_service.list_products(
        db, search=search, include_inactive=include_inactive, limit=limit
    )


@router.get("/barcode/{barcode}", response_model=ProductRead)
async def lookup_by_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProductRead:
    return await product_service.get_product_by_barcode(db, barcode=barcode)


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProductRead:
    return await product_service.get_product_by_id(db, product_id=product_id)


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> ProductRead:
    return await product_service.create_product(
        db, actor=actor, payload=payload, ip_address=get_client_ip(request)
    )


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> ProductRead:
    return await product_service.update_product(
        db, actor=actor, product_id=product_id, payload=payload, ip_address=get_client_ip(request)
    )


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.MANAGER)
    ),
) -> None:
    await product_service.delete_product(
        db, actor=actor, product_id=product_id, ip_address=get_client_ip(request)
    )


class QuickUnitLinkInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50)
    plural_name: str | None = Field(default=None, max_length=100)
    multiplier_to_base: Decimal = Field(default=Decimal("1.0000"), gt=Decimal("0"))


class QuickUnitLinkResponse(BaseModel):
    unit: UnitRead
    multiplier_to_base: Decimal


@router.post("/{product_id}/units", response_model=QuickUnitLinkResponse, status_code=status.HTTP_201_CREATED)
async def add_unit_to_product(
    product_id: UUID,
    payload: QuickUnitLinkInput,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> QuickUnitLinkResponse:
    prod_res = await db.execute(select(Product).where(Product.id == product_id))
    product = prod_res.scalar_one_or_none()
    if not product or not product.is_active:
        raise NotFoundError("Товар не найден или деактивирован")

    code_clean = payload.code.strip().lower()
    name_clean = payload.name.strip()

    # Find or create UnitOfMeasure
    unit_res = await db.execute(
        select(UnitOfMeasure).where(
            (UnitOfMeasure.code == code_clean) | (UnitOfMeasure.name == name_clean)
        )
    )
    unit = unit_res.scalar_one_or_none()
    if not unit:
        unit = UnitOfMeasure(
            code=code_clean,
            name=name_clean,
            plural_name=payload.plural_name.strip() if payload.plural_name else f"{name_clean}ов",
            is_active=True,
        )
        db.add(unit)
        await db.flush()

    # Link to ProductAllowedUnit
    mult = payload.multiplier_to_base.quantize(Decimal("0.0001"))
    au_res = await db.execute(
        select(ProductAllowedUnit).where(
            ProductAllowedUnit.product_id == product.id,
            ProductAllowedUnit.unit_id == unit.id,
        )
    )
    allowed_unit = au_res.scalar_one_or_none()
    if not allowed_unit:
        allowed_unit = ProductAllowedUnit(
            product_id=product.id,
            unit_id=unit.id,
            multiplier_to_base=mult,
        )
        db.add(allowed_unit)
    else:
        allowed_unit.multiplier_to_base = mult

    await db.commit()
    await db.refresh(unit)

    return QuickUnitLinkResponse(
        unit=UnitRead.model_validate(unit),
        multiplier_to_base=mult,
    )
