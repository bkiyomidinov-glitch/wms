"""
Seed script for Pokiza WMS:
- 10 test warehouses (Stores)
- 10 categories
- 100 products with realistic Pokiza & FMCG catalog items
- ~300 movements (Inventory Transactions) across the 10 warehouses
- Strict integer quantities and stock consistency
- Comprehensive Audit Log records
"""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import random
import uuid

from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal
from app.domain.enums import UserRole, TransactionType
from app.models.category import Category
from app.models.store import Store
from app.models.unit import UnitOfMeasure
from app.models.product import Product, ProductAllowedUnit
from app.models.transaction import InventoryTransaction
from app.models.user import User
from app.models.audit_log import AuditLog

# 10 Test Warehouses
STORES_DATA = [
    {"code": "WH-MAIN", "name": "Центральный склад", "address": "г. Душанбе, ул. Айни 48"},
    {"code": "WH-PROD", "name": "Склад готовой продукции", "address": "г. Душанбе, Промзона 12"},
    {"code": "WH-RAW", "name": "Склад сырья", "address": "г. Душанбе, Промзона 14"},
    {"code": "WH-COLD", "name": "Холодильный комплекс", "address": "г. Душанбе, ул. Джаббора Расулова 9"},
    {"code": "WH-KHD", "name": "Филиал Худжанд", "address": "г. Худжанд, ул. Ленина 182"},
    {"code": "WH-BOKH", "name": "Филиал Бохтар", "address": "г. Бохтар, ул. Вахдат 45"},
    {"code": "WH-KULOB", "name": "Филиал Куляб", "address": "г. Куляб, ул. Исмоили Сомони 22"},
    {"code": "WH-RESERVE", "name": "Резервный терминал", "address": "г. Душанбе, Терминал Западный"},
    {"code": "WH-PACK", "name": "Склад тары и упаковки", "address": "г. Душанбе, Промзона 16"},
    {"code": "WH-EXPR", "name": "Склад экспресс-доставки", "address": "г. Душанбе, пр. Рудаки 110"},
]

# Standard Categories
CATEGORIES_DATA = [
    {"slug": "sausages", "name": "Колбасные изделия", "description": "Вареные, полукопченые и варено-копченые колбасы"},
    {"slug": "wieners", "name": "Сосиски и сардельки", "description": "Сосиски, сардельки и шпикачки"},
    {"slug": "delicacies", "name": "Деликатесы и копчености", "description": "Ветчина, бастурма, казылык, карбонад"},
    {"slug": "semi-finished", "name": "Полуфабрикаты и заморозка", "description": "Пельмени, манты, хинкали, котлеты"},
    {"slug": "meat-poultry", "name": "Мясо и птица", "description": "Охлажденное и замороженное мясо, фарш, птица"},
    {"slug": "dairy", "name": "Молочная продукция", "description": "Молоко, кефир, творог, сметана, масло"},
    {"slug": "cheeses", "name": "Сыры", "description": "Твердые, полутвердые, рассольные и плавленые сыры"},
    {"slug": "beverages", "name": "Вода и напитки", "description": "Минеральная вода, соки, лимонады"},
    {"slug": "groceries", "name": "Бакалея и крупы", "description": "Рис, мука, макароны, крупы, сахар, масло"},
    {"slug": "confectionery", "name": "Кондитерские изделия и соусы", "description": "Шоколад, печенье, соусы, кетчуп, майонез"},
]

# 100 Curated Products
PRODUCTS_DATA = [
    # 1. Колбасные изделия (10)
    {"name": "Колбаса вареная «Докторская Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Молочная Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Любительская Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Русская Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Телячья Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Останкинская Халяль»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Нежная с индейкой Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Столичная Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Сливочная Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса вареная «Для завтрака Покиза»", "category": "sausages", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},

    # 2. Сосиски и сардельки (10)
    {"name": "Сосиски «Сливочные Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сосиски «Говяжьи Халяль Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сосиски «Молочные Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сосиски «Венские Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сосиски «Детские витаминизированные»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сосиски «С сыром Моцарелла Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сосиски «Мини-гриль Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сардельки «Аппетитные Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сардельки «Говяжьи традиционные»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Сардельки «Шпикачки элитные Покиза»", "category": "wieners", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},

    # 3. Деликатесы и копчености (10)
    {"name": "Колбаса п/к «Краковская Традиционная»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса п/к «Одесская Покиза»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса п/к «Сервелат Финский Покиза»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаса п/к «Сервелат Мусульманский Халяль»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Колбаски п/к «Охотничьи Покиза»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Ветчина «Нежная из индейки Покиза»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Ветчина «Столичная говяжья Покиза»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Бастурма говяжья пряная «Покиза»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Казылык традиционный сыровяленый", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Карбонад запеченный «Юбилейный Покиза»", "category": "delicacies", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},

    # 4. Полуфабрикаты и заморозка (10)
    {"name": "Пельмени «Сибирские Покиза» 900г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Пельмени «Мусульманские Халяль Покиза» 900г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Пельмени «Домашние из говядины» 1кг", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Манты «По-восточному с говядиной» 1кг", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Хинкали «Кавказские сочные Покиза» 800г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Вареники «С картофелем и луком Покиза» 800г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Вареники «С творогом сладкие Покиза» 800г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Котлеты «Домашние мясные Покиза» 450г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Котлеты «Пожарские куриные Покиза» 500г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Наггетсы куриные хрустящие «Покиза» 500г", "category": "semi-finished", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},

    # 5. Мясо и птица (10)
    {"name": "Говядина вырезка охлажденная 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Говядина тазобедренная мякоть 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Фарш говяжий «Особый Покиза» 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Фарш куриный натуральный «Покиза» 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Тушка цыпленка-бройлера 1 сорт (шт)", "category": "meat-poultry", "unit": "pcs", "sec_unit": "kg", "conv": 1.0},
    {"name": "Филе куриной грудки охлажденное 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Окорочка куриные замороженные 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Крылышки куриные охлажденные 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Мякоть баранины для плова 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Ребрышки бараньи отборные 1кг", "category": "meat-poultry", "unit": "kg", "sec_unit": "g", "conv": 1000.0},

    # 6. Молочная продукция (10)
    {"name": "Молоко пастеризованное 3.2% «Покиза» 1л", "category": "dairy", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Молоко отборное 2.5% «Покиза» 1л", "category": "dairy", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Кефир 2.5% «Покиза» 900мл", "category": "dairy", "unit": "pcs", "sec_unit": "ml", "conv": 900.0},
    {"name": "Сметана 20% «Покиза» 350г", "category": "dairy", "unit": "pcs", "sec_unit": "g", "conv": 350.0},
    {"name": "Творог 5% натуральный «Покиза» 400г", "category": "dairy", "unit": "pcs", "sec_unit": "g", "conv": 400.0},
    {"name": "Масло сливочное «Крестьянское» 72.5% 200г", "category": "dairy", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Масло сливочное «Традиционное» 82.5% 200г", "category": "dairy", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Ряженка 3.2% «Покиза» 450г", "category": "dairy", "unit": "pcs", "sec_unit": "g", "conv": 450.0},
    {"name": "Сливки 10% питьевые 500мл", "category": "dairy", "unit": "pcs", "sec_unit": "ml", "conv": 500.0},
    {"name": "Йогурт клубничный «Покиза» 250г", "category": "dairy", "unit": "pcs", "sec_unit": "g", "conv": 250.0},

    # 7. Сыры (10)
    {"name": "Сыр полутвердый «Голландский» 45% (кг)", "category": "cheeses", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Сыр полутвердый «Российский» 50% (кг)", "category": "cheeses", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Сыр «Моцарелла» для пиццы 300г", "category": "cheeses", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Сыр «Сулугуни» кавказский 400г", "category": "cheeses", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Сыр плавленый «Дружба» 90г", "category": "cheeses", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Сыр плавленый «Янтарь» 200г", "category": "cheeses", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Сыр «Брынза» рассольный 350г", "category": "cheeses", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Сыр «Гауда» европейский 48% (кг)", "category": "cheeses", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Сыр «Пармезан» тертый 150г", "category": "cheeses", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Сыр творожный сливочный 220г", "category": "cheeses", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},

    # 8. Вода и напитки (10)
    {"name": "Вода минеральная «Хаёт» 1.5л газ", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Вода питьевая «Хаёт» 5л негаз", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 5.0},
    {"name": "Вода питьевая «Хаёт» 1л газ", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Вода артезианская «Оби Зулол» 0.5л", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Сок натуральный «Зулол» Яблоко 1л", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Сок натуральный «Зулол» Персик 1л", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Сок натуральный «Зулол» Вишня 1л", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Сок прямого отжима «Grante» Гранат 750мл", "category": "beverages", "unit": "pcs", "sec_unit": "ml", "conv": 750.0},
    {"name": "Лимонад «Тархун» 1л стекло", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},
    {"name": "Лимонад «Дюшес» 1л стекло", "category": "beverages", "unit": "pcs", "sec_unit": "l", "conv": 1.0},

    # 9. Бакалея и крупы (10)
    {"name": "Рис «Девзира» для таджикского плова 1кг", "category": "groceries", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Рис «Аланга» высший сорт 1кг", "category": "groceries", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Рис «Лазер» отборный 1кг", "category": "groceries", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Гречневая крупа ядрица «Увелка» 800г", "category": "groceries", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Горох колотый шлифованный 800г", "category": "groceries", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Фасоль красная отборная 800г", "category": "groceries", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Маш отборный таджикский 1кг", "category": "groceries", "unit": "kg", "sec_unit": "g", "conv": 1000.0},
    {"name": "Мука пшеничная в/с «Фатима» 2кг", "category": "groceries", "unit": "pcs", "sec_unit": "kg", "conv": 2.0},
    {"name": "Макароны «Макфа» Спагетти 450г", "category": "groceries", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Макароны «Макфа» Рожки 450г", "category": "groceries", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},

    # 10. Кондитерские изделия и соусы (10)
    {"name": "Шоколад «Alpen Gold» молочный 85г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Шоколад «Бабаевский» темный 100г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Печенье сахарное «Юбилейное» 112г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Вафли «Артек» хрустящие 200г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Зефир ванильный в шоколаде 250г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Халва тахинная с арахисом 350г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Томатная паста «Помидорка» 380г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Майонез «Провансаль» 67% 400мл", "category": "confectionery", "unit": "pcs", "sec_unit": "ml", "conv": 400.0},
    {"name": "Кетчуп «Шашлычный томатный» 300г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
    {"name": "Аджика острая традиционная 250г", "category": "confectionery", "unit": "pcs", "sec_unit": "pack", "conv": 1.0},
]

# Counterparties
INBOUND_COUNTERPARTIES = [
    "Фабрика «Покиза» г. Душанбе (Цех №1)",
    "Фабрика «Покиза» г. Душанбе (Цех №2)",
    "Комбинат «Покиза» Колбасный цех",
    "ООО «Таджик Агро Пром»",
    "Птицефабрика «Мурги Хисор»",
    "Молочный комбинат «Шири Душанбе»",
    "ООО «Оби Зулол» Завод",
    "Импортёр «Eurasia Food Trading»",
    "Поставщик упаковки «Таджик-Пак»",
    "Агрохолдинг «Сугд-Агро»",
]

OUTBOUND_COUNTERPARTIES = [
    "Супермаркет «Пайкар» (ул. Айни)",
    "Супермаркет «Пайкар» (пр. Рудаки)",
    "Супермаркет «Пайкар» (Бохтар)",
    "Сеть супермаркетов «Ёвар» (Филиал №7)",
    "Сеть супермаркетов «Ёвар» (Филиал №12)",
    "Сеть супермаркетов «Ёвар» (Филиал №15)",
    "Гипермаркет «Ашан Душанбе»",
    "ТЦ «Душанбе Молл» Food Court",
    "Ресторанный комплекс «Рохат»",
    "Отель «Hyatt Regency Dushanbe»",
    "Отель «Serena Dushanbe»",
    "Фирменный магазин «Покиза №1» (Шота Руставели)",
    "Фирменный магазин «Покиза №2» (Сомони)",
    "Фирменный магазин «Покиза №3» (Садбарг)",
    "Сеть маркетов «Фаровон» Худжанд",
    "Оптовый дистрибьютор ИП Раджабов",
]

SAMPLE_ATTRS = [
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
        "options": ["Смена 1 (Утро)", "Смена 2 (Вечер)", "Ночная смена"],
        "applies_to": "BOTH",
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

VEHICLE_NUMBERS = [
    "01 789 TJ", "01 452 TJ", "02 114 TJ", "03 998 TJ", "01 555 TJ",
    "01 334 TJ", "02 881 TJ", "03 105 TJ", "01 920 TJ", "02 707 TJ"
]


async def run_seed():
    print("Starting generation of 10 warehouses, 100 products, and ~300 transactions...")
    async with AsyncSessionLocal() as session:
        # 1. Ensure 10 stores
        store_map: dict[str, Store] = {}
        for s_data in STORES_DATA:
            res = await session.execute(select(Store).where(Store.code == s_data["code"]))
            st = res.scalar_one_or_none()
            if not st:
                st = Store(
                    name=s_data["name"],
                    code=s_data["code"],
                    address=s_data["address"],
                    is_active=True,
                )
                session.add(st)
                await session.flush()
            store_map[s_data["code"]] = st
        all_stores = list(store_map.values())
        print(f"Ensured {len(all_stores)} stores.")

        # 2. Ensure units
        units_res = await session.execute(select(UnitOfMeasure))
        unit_map = {u.code: u for u in units_res.scalars().all()}
        # Add 'pack' if not present
        if "pack" not in unit_map:
            u_pack = UnitOfMeasure(code="pack", name="упак", plural_name="упаковок", is_active=True)
            session.add(u_pack)
            await session.flush()
            unit_map["pack"] = u_pack

        # 3. Ensure categories
        cat_map: dict[str, Category] = {}
        for c_data in CATEGORIES_DATA:
            res = await session.execute(select(Category).where(Category.slug == c_data["slug"]))
            cat = res.scalar_one_or_none()
            if not cat:
                cat = Category(
                    slug=c_data["slug"],
                    name=c_data["name"],
                    description=c_data["description"],
                    is_active=True,
                )
                session.add(cat)
                await session.flush()
            cat_map[c_data["slug"]] = cat
        print(f"Ensured {len(cat_map)} categories.")

        # 4. Users
        users_res = await session.execute(select(User))
        users = list(users_res.scalars().all())
        user_admin = next((u for u in users if u.username == "admin"), users[0])
        user_operator = next((u for u in users if u.username == "operator"), user_admin)
        user_manager = next((u for u in users if u.username == "manager"), user_admin)
        user_director = next((u for u in users if u.username == "director"), user_admin)
        user_pool = [user_admin, user_manager, user_operator, user_director]

        # 5. Insert 100 products
        products_created: list[Product] = []
        barcode_start = 4870001003
        sku_start = 3

        for i, p_info in enumerate(PRODUCTS_DATA):
            barcode = str(barcode_start + i)
            sku = f"POK-{sku_start + i:03d}"
            res = await session.execute(select(Product).where(Product.barcode == barcode))
            prod = res.scalar_one_or_none()

            base_u = unit_map.get(p_info["unit"], unit_map["pcs"])
            sec_u = unit_map.get(p_info["sec_unit"])
            category = cat_map.get(p_info["category"])

            if not prod:
                prod = Product(
                    barcode=barcode,
                    name=p_info["name"],
                    sku=sku,
                    category_id=category.id if category else None,
                    base_unit_id=base_u.id,
                    secondary_unit_id=sec_u.id if sec_u else None,
                    conversion_factor=Decimal(str(p_info.get("conv", 1.0))),
                    current_stock_base=Decimal("0.0000"),  # Will be calculated cleanly from transactions
                    allow_negative_stock=False,
                    enabled_attribute_ids=[],
                    configured_attributes=SAMPLE_ATTRS,
                    custom_attributes={},
                    is_active=True,
                )
                session.add(prod)
                await session.flush()

                # Add allowed unit
                pau = ProductAllowedUnit(
                    product_id=prod.id,
                    unit_id=base_u.id,
                    multiplier_to_base=Decimal("1.0000"),
                )
                session.add(pau)
                if sec_u and sec_u.id != base_u.id:
                    pau_sec = ProductAllowedUnit(
                        product_id=prod.id,
                        unit_id=sec_u.id,
                        multiplier_to_base=Decimal(str(int(p_info.get("conv", 1.0)))),
                    )
                    session.add(pau_sec)
                await session.flush()

            products_created.append(prod)

        await session.commit()
        print(f"Products ready: {len(products_created)} products in dataset.")

        # Re-fetch products with session
        all_prods_res = await session.execute(select(Product).where(Product.is_active.is_(True)))
        all_prods = list(all_prods_res.scalars().all())

        # 6. Generate 300 transactions
        # We want around 300 transactions distributed across the 10 stores.
        # Exactly 30 transactions per store = 300 transactions total.
        #
        # To maintain strict physical consistency:
        # We track running stock per product globally AND per store:
        # running_global_stock[product_id] = Decimal
        # running_store_stock[(store_id, product_id)] = Decimal
        #
        # For each store:
        # 30 transactions over the past 30 days.
        # Days: 30 days ago to today.
        # ~18 INBOUND and ~12 OUTBOUND transactions per store.
        # All quantities strictly integers!

        random.seed(42)  # Deterministic generation for perfect reproducibility

        now_utc = datetime.now(timezone.utc)
        start_date = now_utc - timedelta(days=32)

        # Pre-initialize stock tracking
        store_stock: dict[tuple[uuid.UUID, uuid.UUID], int] = {}
        product_global_stock: dict[uuid.UUID, int] = {}
        for p in all_prods:
            product_global_stock[p.id] = int(round(p.current_stock_base))

        total_tx_to_generate = 300
        tx_per_store = 30  # 10 stores * 30 = 300

        created_tx_list = []
        created_audit_list = []

        # We will generate timeline events per store
        all_events = []
        for store in all_stores:
            # We plan 19 INBOUND and 11 OUTBOUND for each store (= 30 tx)
            # Generating sorted timestamps for this store
            timestamps = []
            for _ in range(tx_per_store):
                days_offset = random.uniform(0.5, 31.0)
                hour = random.randint(8, 19)
                minute = random.randint(0, 59)
                second = random.randint(0, 59)
                dt = start_date + timedelta(days=days_offset, hours=hour, minutes=minute, seconds=second)
                timestamps.append(dt)
            timestamps.sort()

            # First 5 transactions are ALWAYS inbound to build stock
            # Rest are a mix of INBOUND (60%) and OUTBOUND (40%)
            for idx, event_time in enumerate(timestamps):
                all_events.append({
                    "store": store,
                    "time": event_time,
                    "index_in_store": idx,
                })

        # Sort all 300 events globally by timestamp so running stock progresses chronologically!
        all_events.sort(key=lambda x: x["time"])

        print(f"Generating {len(all_events)} chronological transactions...")

        for ev in all_events:
            store = ev["store"]
            event_time = ev["time"]
            idx_in_store = ev["index_in_store"]

            # Pick a product
            # For INBOUND or early store transactions, pick from any product
            # For OUTBOUND, pick a product that actually has stock in this store!
            available_in_store = [
                p for p in all_prods if store_stock.get((store.id, p.id), 0) >= 10
            ]

            is_outbound = False
            if idx_in_store >= 3 and available_in_store and random.random() < 0.38:
                is_outbound = True
                prod = random.choice(available_in_store)
            else:
                prod = random.choice(all_prods)

            actor = random.choice(user_pool)
            tx_type = TransactionType.OUTBOUND if is_outbound else TransactionType.INBOUND

            current_store_qty = store_stock.get((store.id, prod.id), 0)
            current_global_qty = product_global_stock.get(prod.id, 0)

            if is_outbound:
                # Safe integer decrement
                max_take = min(current_store_qty, current_global_qty)
                if max_take <= 5:
                    take_qty = max_take
                else:
                    possible_qtys = [5, 10, 15, 20, 25, 30, 40, 50]
                    valid = [q for q in possible_qtys if q <= max_take]
                    take_qty = random.choice(valid) if valid else max_take
                if take_qty <= 0:
                    take_qty = 1
                qty = take_qty
                stock_before = current_global_qty
                stock_after = stock_before - qty
                counterparty = random.choice(OUTBOUND_COUNTERPARTIES)
                notes_choices = [
                    "Отгрузка по накладной №ТТН-" + str(random.randint(1000, 9999)),
                    "Плановая поставка в торговую сеть",
                    "Самовывоз со склада экспедитором",
                    "Срочная отгрузка под заказ",
                    "Отгрузка в супермаркет",
                ]
            else:
                # Inbound replenishment
                possible_qtys = [20, 30, 50, 60, 75, 100, 120, 150, 200, 250, 300]
                qty = random.choice(possible_qtys)
                stock_before = current_global_qty
                stock_after = stock_before + qty
                counterparty = random.choice(INBOUND_COUNTERPARTIES)
                notes_choices = [
                    "Поступление готовой продукции с производства",
                    "Приемка партии сырья по договору №" + str(random.randint(100, 500)),
                    "Централизованный привоз со склада фабрики",
                    "Плановый приход по спецификации",
                    "Приемка утренней смены",
                ]

            # Update running stock balances
            if is_outbound:
                store_stock[(store.id, prod.id)] = current_store_qty - qty
                product_global_stock[prod.id] = stock_after
            else:
                store_stock[(store.id, prod.id)] = current_store_qty + qty
                product_global_stock[prod.id] = stock_after

            batch_date = (event_time - timedelta(days=random.randint(1, 5))).strftime("%Y-%m-%d")
            custom_attrs = {
                "batch_number": f"П-{batch_date}-{random.randint(10, 99)}",
                "shift": random.choice(["Смена 1 (Утро)", "Смена 2 (Вечер)", "Ночная смена"]),
                "vehicle_number": random.choice(VEHICLE_NUMBERS),
            }

            notes = random.choice(notes_choices)

            tx = InventoryTransaction(
                tx_type=tx_type.value,
                product_id=prod.id,
                quantity_entered=Decimal(str(qty)),
                unit_id=prod.base_unit_id,
                quantity_base_calculated=Decimal(str(qty)),
                stock_before_base=Decimal(str(stock_before)),
                stock_after_base=Decimal(str(stock_after)),
                performed_by_user_id=actor.id,
                store_id=store.id,
                counterparty_name=counterparty,
                performed_at=event_time,
                custom_attributes=custom_attrs,
                notes=notes,
                created_at=event_time,
            )
            session.add(tx)
            created_tx_list.append(tx)

            # Also create rich audit log
            audit = AuditLog(
                user_id=actor.id,
                action=f"TRANSACTION_{tx_type.value}",
                entity="inventory_transaction",
                entity_id=str(tx.id),
                old_value={"stock_base": int(stock_before)},
                new_value={"stock_base": int(stock_after)},
                payload={
                    "product_id": str(prod.id),
                    "product_name": prod.name,
                    "barcode": prod.barcode,
                    "quantity_entered": int(qty),
                    "unit_name": prod.base_unit.name if prod.base_unit else "шт",
                    "quantity_base": int(qty),
                    "base_unit_name": prod.base_unit.name if prod.base_unit else "шт",
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "counterparty": counterparty,
                    "custom_attributes": custom_attrs,
                    "notes": notes,
                    "performed_at": event_time.isoformat(),
                },
                ip_address=f"192.168.1.{random.randint(10, 250)}",
                created_at=event_time,
            )
            session.add(audit)
            created_audit_list.append(audit)

        # 7. Update products' current_stock_base to match final running stock
        for prod in all_prods:
            final_stock = Decimal(str(product_global_stock.get(prod.id, 0)))
            prod.current_stock_base = final_stock

        await session.commit()
        print(f"Successfully committed {len(created_tx_list)} transactions and {len(created_audit_list)} audit logs.")

        # 8. Verification queries
        final_stores_count = (await session.execute(select(func.count(Store.id)))).scalar_one()
        final_prods_count = (await session.execute(select(func.count(Product.id)))).scalar_one()
        final_tx_count = (await session.execute(select(func.count(InventoryTransaction.id)))).scalar_one()
        final_audit_count = (await session.execute(select(func.count(AuditLog.id)))).scalar_one()

        print("\n=== VERIFICATION RESULTS ===")
        print(f"Total Stores: {final_stores_count} (Expected: 10)")
        print(f"Total Products: {final_prods_count} (Expected >= 100)")
        print(f"Total Transactions: {final_tx_count} (Expected >= 300)")
        print(f"Total Audit Logs: {final_audit_count}")


if __name__ == "__main__":
    import sys
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_seed())
