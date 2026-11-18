from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.domain.enums import UserRole
from app.models.product import Product, ProductAllowedUnit
from app.models.store import Store
from app.models.unit import UnitOfMeasure
from app.models.user import User


STANDARD_STORES = [
    {"name": "Центральный склад", "code": "WH-MAIN", "address": "г. Душанбе, ул. Айни 48"},
    {"name": "Склад готовой продукции", "code": "WH-PROD", "address": "г. Душанбе, Промзона 12"},
    {"name": "Склад сырья", "code": "WH-RAW", "address": "г. Душанбе, Промзона 14"},
]


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


async def ensure_standard_stores(db: AsyncSession) -> dict[str, Store]:
    """Ensure standard warehouses exist in the database."""
    store_map: dict[str, Store] = {}
    for item in STANDARD_STORES:
        res = await db.execute(select(Store).where(Store.name == item["name"]))
        store = res.scalar_one_or_none()
        if not store:
            store = Store(
                name=item["name"],
                code=item["code"],
                address=item["address"],
                is_active=True,
            )
            db.add(store)
            await db.flush()
        store_map[item["code"]] = store
    return store_map


async def seed_database(db: AsyncSession) -> None:
    """Idempotently seed corporate users, core units of measure, stores, and clean product example."""
    unit_map = await ensure_standard_units(db)
    store_map = await ensure_standard_stores(db)

    main_store = store_map["WH-MAIN"]
    prod_store = store_map["WH-PROD"]

    existing_admin = await db.execute(select(User).where(User.username == "admin"))
    admin_user = existing_admin.scalar_one_or_none()

    if admin_user:
        # Link any existing users without stores
        all_users = (await db.execute(select(User))).scalars().all()
        for u in all_users:
            if u.store_id is None:
                if u.role == UserRole.MANAGER.value:
                    u.store_id = prod_store.id
                else:
                    u.store_id = main_store.id
        await db.commit()
        return

    # 1. Corporate Users (RBAC) with Store binding
    admin = User(
        username="admin",
        full_name="Тимур Рахимов",
        password_hash=hash_password("Admin123!"),
        role=UserRole.SUPER_ADMIN.value,
        shift_name="IT-отдел",
        store_id=main_store.id,
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
        store_id=main_store.id,
        is_active=True,
        created_by=admin.id,
    )
    manager = User(
        username="manager",
        full_name="Рустам Назаров",
        password_hash=hash_password("Manager123!"),
        role=UserRole.MANAGER.value,
        shift_name="Смена А",
        store_id=prod_store.id,
        is_active=True,
        created_by=admin.id,
    )
    operator = User(
        username="operator",
        full_name="Алишер Саидов",
        password_hash=hash_password("Operator123!"),
        role=UserRole.OPERATOR.value,
        shift_name="Смена А",
        store_id=main_store.id,
        is_active=True,
        created_by=manager.id,
    )
    db.add_all([director, manager, operator])
    await db.flush()

    # 2. Units of Measure
    unit_pcs = unit_map["pcs"]
    unit_l = unit_map["l"]
    unit_pack12 = unit_map["pack12"]

    # 3. Clean product example with preconfigured attributes
    sample_attrs = [
        {
            "id": "attr-batch",
            "key": "batch_number",
            "label": "Номер партии",
            "field_type": "TEXT",
            "applies_to": "BOTH",
            "is_required": False,
        },
        {
            "id": "attr-shift",
            "key": "shift",
            "label": "Рабочая смена",
            "field_type": "SELECT",
            "options": ["Смена 1 (Утро)", "Смена 2 (Вечер)", "Смена 3 (Ночь)"],
            "applies_to": "INBOUND",
            "is_required": False,
        },
        {
            "id": "attr-expiry",
            "key": "expiry_date",
            "label": "Срок годности",
            "field_type": "DATE",
            "applies_to": "INBOUND",
            "is_required": False,
        },
        {
            "id": "attr-vehicle",
            "key": "vehicle_number",
            "label": "Номер машины / ТС",
            "field_type": "TEXT",
            "applies_to": "BOTH",
            "is_required": False,
        },
    ]

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
        configured_attributes=sample_attrs,
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
