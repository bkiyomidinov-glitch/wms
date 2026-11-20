from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.domain.enums import PassportEventType, PassportStatus, StoreType, UserRole
from app.models.dictionary import CustomDictionary
from app.models.passport import Passport, PassportEvent, ProcessingAct
from app.models.product import Product, ProductAllowedUnit
from app.models.store import Store
from app.models.unit import UnitOfMeasure
from app.models.user import User, UserStore


STANDARD_UNITS = [
    {"code": "kg", "name": "кг", "plural_name": "килограммов"},
    {"code": "pcs", "name": "шт", "plural_name": "штук"},
    {"code": "g", "name": "г", "plural_name": "граммов"},
    {"code": "l", "name": "л", "plural_name": "литров"},
    {"code": "box", "name": "коробка", "plural_name": "коробок"},
]


async def ensure_standard_units(db: AsyncSession) -> dict[str, UnitOfMeasure]:
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


async def ensure_custom_dictionaries(db: AsyncSession) -> None:
    """Создает динамические справочники Состояний и Видов продукции."""
    # 1. passport_states
    res = await db.execute(select(CustomDictionary).where(CustomDictionary.slug == "passport_states"))
    if not res.scalar_one_or_none():
        db.add(
            CustomDictionary(
                name="Состояние продукции",
                slug="passport_states",
                items=[
                    {"value": "Охлажденное", "label": "Охлажденное", "color": "#0284C7"},
                    {"value": "Заморозка", "label": "Заморозка", "color": "#2563EB"},
                ],
                is_active=True,
            )
        )

    # 2. product_types
    res = await db.execute(select(CustomDictionary).where(CustomDictionary.slug == "product_types"))
    if not res.scalar_one_or_none():
        db.add(
            CustomDictionary(
                name="Вид продукции",
                slug="product_types",
                items=[
                    {"value": "Сырье пром.", "label": "Сырье промышленное"},
                    {"value": "Субпродукты", "label": "Субпродукты"},
                    {"value": "Г.П.", "label": "Готовая продукция"},
                ],
                is_active=True,
            )
        )
    await db.flush()


async def seed_mes_wms_data(db: AsyncSession) -> None:
    """Чистые демо-данные (Seed Data) строго по производственной схеме MES/WMS Pokiza."""
    units = await ensure_standard_units(db)
    await ensure_custom_dictionaries(db)
    unit_kg = units["kg"]

    # 1. Production & Warehouse Stores
    store_configs = [
        {
            "name": "Склад сырья",
            "code": "RAW-01",
            "store_type": StoreType.RAW_WAREHOUSE.value,
            "address": "г. Душанбе, Промзона 14",
        },
        {
            "name": "Обвалка",
            "code": "PROD-01",
            "store_type": StoreType.PRODUCTION.value,
            "address": "г. Душанбе, Цех разделки и обвалки",
        },
        {
            "name": "СГП",
            "code": "FGS-01",
            "store_type": StoreType.FGS_WAREHOUSE.value,
            "address": "г. Душанбе, Склад готовой продукции",
        },
    ]

    stores: dict[str, Store] = {}
    for cfg in store_configs:
        res = await db.execute(select(Store).where(Store.name == cfg["name"]))
        st = res.scalar_one_or_none()
        if not st:
            st = Store(
                name=cfg["name"],
                code=cfg["code"],
                store_type=cfg["store_type"],
                address=cfg["address"],
                is_active=True,
            )
            db.add(st)
            await db.flush()
        else:
            st.store_type = cfg["store_type"]
            st.code = cfg["code"]
            st.address = cfg["address"]
            await db.flush()
        stores[cfg["name"]] = st

    raw_store = stores["Склад сырья"]
    prod_store = stores["Обвалка"]
    fgs_store = stores["СГП"]

    # 2. Corporate Users & Matrix of Permissions
    all_store_ids = [raw_store.id, prod_store.id, fgs_store.id]
    default_permissions = {
        "can_inbound": True,
        "can_outbound": True,
        "can_process": True,
        "can_view_stock": True,
        "can_view_movements": True,
        "can_manage_products": True,
        "can_manage_stores": True,
        "can_manage_users": True,
    }

    # Ensure admin
    admin_res = await db.execute(select(User).where(User.username == "admin"))
    admin = admin_res.scalar_one_or_none()
    if not admin:
        admin = User(
            username="admin",
            full_name="Тимур Рахимов",
            password_hash=hash_password("Admin123!"),
            role=UserRole.SUPER_ADMIN.value,
            shift_name="IT-отдел",
            store_id=raw_store.id,
            permissions=default_permissions,
            is_active=True,
        )
        db.add(admin)
        await db.flush()
    else:
        admin.permissions = default_permissions
        await db.flush()

    # Link admin to all stores
    for sid in all_store_ids:
        us_res = await db.execute(
            select(UserStore).where(UserStore.user_id == admin.id, UserStore.store_id == sid)
        )
        if not us_res.scalar_one_or_none():
            db.add(UserStore(user_id=admin.id, store_id=sid))
    await db.flush()

    # Ensure operator & manager
    op_res = await db.execute(select(User).where(User.username == "operator"))
    op = op_res.scalar_one_or_none()
    if not op:
        op = User(
            username="operator",
            full_name="Алишер Саидов",
            password_hash=hash_password("Operator123!"),
            role=UserRole.OPERATOR.value,
            shift_name="Смена А",
            store_id=raw_store.id,
            permissions={
                "can_inbound": True,
                "can_outbound": True,
                "can_process": True,
                "can_view_stock": True,
                "can_view_movements": True,
                "can_manage_products": False,
                "can_manage_stores": False,
                "can_manage_users": False,
            },
            is_active=True,
        )
        db.add(op)
        await db.flush()
        for sid in all_store_ids:
            db.add(UserStore(user_id=op.id, store_id=sid))
        await db.flush()

    # 3. Products
    product_specs = [
        {"name": "Тушка", "barcode": "4870001001", "sku": "RAW-TUSHKA-01"},
        {"name": "Филе", "barcode": "4870001002", "sku": "FGS-FILE-01"},
        {"name": "Голень", "barcode": "4870001003", "sku": "FGS-GOLEN-01"},
        {"name": "Крыло", "barcode": "4870001004", "sku": "FGS-KRYLO-01"},
    ]

    products: dict[str, Product] = {}
    for spec in product_specs:
        res = await db.execute(select(Product).where(Product.barcode == spec["barcode"]))
        p = res.scalar_one_or_none()
        if not p:
            p = Product(
                name=spec["name"],
                barcode=spec["barcode"],
                sku=spec["sku"],
                base_unit_id=unit_kg.id,
                current_stock_base=Decimal("0.0000"),
                allow_negative_stock=False,
                is_active=True,
            )
            db.add(p)
            await db.flush()
            db.add(
                ProductAllowedUnit(
                    product_id=p.id,
                    unit_id=unit_kg.id,
                    multiplier_to_base=Decimal("1.0000"),
                )
            )
            await db.flush()
        products[spec["name"]] = p

    prod_tushka = products["Тушка"]
    prod_file = products["Филе"]
    prod_golen = products["Голень"]
    prod_krylo = products["Крыло"]

    # 4. Check if demo passports already exist
    existing_p1 = await db.execute(select(Passport).where(Passport.passport_code == "1"))
    if existing_p1.scalar_one_or_none():
        await db.commit()
        return

    now_utc = datetime.now(timezone.utc)
    today = date.today()

    # 5. Pre-existing passports at СГП (30 кг each for Филе, Голень, Крыло)
    sgp_items = [
        {"prod": prod_file, "code": "SGP-F-01", "qr": "PKZ:SGP-F-01", "name": "Филе"},
        {"prod": prod_golen, "code": "SGP-G-01", "qr": "PKZ:SGP-G-01", "name": "Голень"},
        {"prod": prod_krylo, "code": "SGP-K-01", "qr": "PKZ:SGP-K-01", "name": "Крыло"},
    ]

    for item in sgp_items:
        p_obj = Passport(
            passport_code=item["code"],
            qr_payload=item["qr"],
            parent_passport_id=None,
            processing_act_id=None,
            product_id=item["prod"].id,
            batch_number="ПАРТИЯ-СГП-001",
            production_date=today,
            current_state="Охлажденное",
            current_product_type="Г.П.",
            current_qty=Decimal("30.000"),
            current_store_id=fgs_store.id,
            pending_target_store_id=None,
            current_storage_responsible="Каримов Ф.Х.",
            status=PassportStatus.IN_STOCK.value,
            custom_attributes={},
            created_by_operator_id=admin.id,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(p_obj)
        await db.flush()

        db.add(
            PassportEvent(
                passport_id=p_obj.id,
                event_type=PassportEventType.INITIAL_RECEIPT.value,
                state_snapshot="Охлажденное",
                product_type_snapshot="Г.П.",
                product_name_snapshot=item["name"],
                barcode_qr_snapshot=f"{item['prod'].barcode} / {item['qr']}",
                qty_snapshot=Decimal("30.000"),
                qty_delta=Decimal("0.000"),
                batch_number_snapshot="ПАРТИЯ-СГП-001",
                production_date_snapshot=today,
                storage_responsible_snapshot="Каримов Ф.Х.",
                registered_at=now_utc,
                operator_id=admin.id,
                operator_name_snapshot=admin.full_name,
                to_location_name=fgs_store.name,
                to_store_id=fgs_store.id,
                from_location_name="Начальный остаток склада",
                from_store_id=None,
                balance_before_store=Decimal("0.000"),
                balance_after_store=Decimal("30.000"),
                state_changed_from=None,
                notes="Стартовый баланс ячейки СГП",
                custom_attributes={},
            )
        )

    # 6. Passport № id 1 at Склад сырья — Тушка 200 кг (Охлажденное, Сырье пром.)
    p1 = Passport(
        passport_code="1",
        qr_payload="PKZ:1",
        parent_passport_id=None,
        processing_act_id=None,
        product_id=prod_tushka.id,
        batch_number="ПАРТИЯ-2026-001",
        production_date=today,
        current_state="Охлажденное",
        current_product_type="Сырье пром.",
        current_qty=Decimal("200.000"),
        current_store_id=raw_store.id,
        pending_target_store_id=None,
        current_storage_responsible="Иванов А.И.",
        status=PassportStatus.IN_STOCK.value,
        custom_attributes={},
        created_by_operator_id=admin.id,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(p1)
    await db.flush()

    db.add(
        PassportEvent(
            passport_id=p1.id,
            event_type=PassportEventType.INITIAL_RECEIPT.value,
            state_snapshot="Охлажденное",
            product_type_snapshot="Сырье пром.",
            product_name_snapshot=prod_tushka.name,
            barcode_qr_snapshot=f"{prod_tushka.barcode} / PKZ:1",
            qty_snapshot=Decimal("200.000"),
            qty_delta=Decimal("0.000"),
            batch_number_snapshot="ПАРТИЯ-2026-001",
            production_date_snapshot=today,
            storage_responsible_snapshot="Иванов А.И.",
            registered_at=now_utc,
            operator_id=admin.id,
            operator_name_snapshot=admin.full_name,
            to_location_name=raw_store.name,
            to_store_id=raw_store.id,
            from_location_name="Птицефабрика №1 (Поставщик)",
            from_store_id=None,
            balance_before_store=Decimal("0.000"),
            balance_after_store=Decimal("200.000"),
            state_changed_from=None,
            notes="Первичная приемка партии сырья по накладной № 104",
            custom_attributes={},
        )
    )

    await db.commit()


async def seed_database(db: AsyncSession) -> None:
    await seed_mes_wms_data(db)
