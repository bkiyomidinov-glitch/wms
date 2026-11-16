from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.domain.enums import UserRole
from app.models.product import Product, ProductAllowedUnit
from app.models.unit import UnitOfMeasure
from app.models.user import User


STANDARD_UNITS = [
    {"code": "pcs", "name": "шт", "plural_name": "штук"},
    {"code": "kg", "name": "кг", "plural_name": "килограммов"},
    {"code": "g", "name": "г", "plural_name": "граммов"},
    {"code": "l", "name": "л", "plural_name": "литров"},
    {"code": "ml", "name": "мл", "plural_name": "миллилитров"},
    {"code": "m", "name": "м", "plural_name": "метров"},
    {"code": "cm", "name": "см", "plural_name": "сантиметров"},
    {"code": "pack", "name": "упаковка", "plural_name": "упаковок"},
    {"code": "box", "name": "коробка", "plural_name": "коробок"},
    {"code": "pallet", "name": "паллета", "plural_name": "паллет"},
    {"code": "pack12", "name": "уп (12 шт)", "plural_name": "упаковок"},
]


async def ensure_standard_units(db: AsyncSession) -> dict[str, UnitOfMeasure]:
    """Ensure standard units of measure exist in the database."""
    unit_map: dict[str, UnitOfMeasure] = {}
    for item in STANDARD_UNITS:
        res = await db.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == item["code"]))
        unit = res.scalar_one_or_none()
        if not unit:
            unit = UnitOfMeasure(
                code=item["code"],
                name=item["name"],
                plural_name=item["plural_name"],
                is_active=True,
            )
            db.add(unit)
            await db.flush()
        unit_map[item["code"]] = unit
    return unit_map


async def seed_database(db: AsyncSession) -> None:
    """Idempotently seed corporate users, core units of measure, and clean product example."""
    unit_map = await ensure_standard_units(db)

    existing_admin = await db.execute(select(User).where(User.username == "admin"))
    if existing_admin.scalar_one_or_none():
        return

    # 1. Corporate Users (RBAC)
    admin = User(
        username="admin",
        full_name="Тимур Рахимов",
        password_hash=hash_password("Admin123!"),
        role=UserRole.SUPER_ADMIN.value,
        shift_name="IT-отдел",
        is_active=True,
    )
    db.add(admin)
    await db.flush()

    director = User(
        username="director",
        full_name="Фарход Каримов",
        password_hash=hash_password("Director123!"),
        role=UserRole.DIRECTOR.value,
        shift_name="Руководство",
        is_active=True,
        created_by=admin.id,
    )
    manager = User(
        username="manager",
        full_name="Рустам Назаров",
        password_hash=hash_password("Manager123!"),
        role=UserRole.MANAGER.value,
        shift_name="Смена А",
        is_active=True,
        created_by=admin.id,
    )
    operator = User(
        username="operator",
        full_name="Алишер Саидов",
        password_hash=hash_password("Operator123!"),
        role=UserRole.OPERATOR.value,
        shift_name="Смена А",
        is_active=True,
        created_by=manager.id,
    )
    db.add_all([director, manager, operator])
    await db.flush()

    # 2. Units of Measure
    unit_pcs = unit_map["pcs"]
    unit_l = unit_map["l"]
    unit_pack12 = unit_map["pack12"]

    # 3. Exactly ONE clean product example as requested by executive order:
    # "Вода Хаёт 0.5 литров", 4870001001, stock 110 шт / 55 л
    water_hayot = Product(
        barcode="4870001001",
        name="Вода Хаёт 0.5 литров",
        sku="PRD-4870001001",
        category_id=None,
        base_unit_id=unit_pcs.id,
        secondary_unit_id=unit_l.id,
        conversion_factor=Decimal("0.5000"),
        current_stock_base=Decimal("110.0000"),
        allow_negative_stock=False,
        enabled_attribute_ids=[],
        custom_attributes={},
    )
    db.add(water_hayot)
    await db.flush()

    db.add_all(
        [
            ProductAllowedUnit(
                product_id=water_hayot.id,
                unit_id=unit_pcs.id,
                multiplier_to_base=Decimal("1.0000"),
            ),
            ProductAllowedUnit(
                product_id=water_hayot.id,
                unit_id=unit_l.id,
                multiplier_to_base=Decimal("2.0000"),
            ),
            ProductAllowedUnit(
                product_id=water_hayot.id,
                unit_id=unit_pack12.id,
                multiplier_to_base=Decimal("12.0000"),
            ),
        ]
    )

    await db.commit()
