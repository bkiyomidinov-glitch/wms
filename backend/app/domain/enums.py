from enum import StrEnum


class UserRole(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    DIRECTOR = "DIRECTOR"
    MANAGER = "MANAGER"
    OPERATOR = "OPERATOR"


class AttributeTargetType(StrEnum):
    PRODUCT = "PRODUCT"
    TX_INBOUND = "TX_INBOUND"
    TX_OUTBOUND = "TX_OUTBOUND"


class FieldType(StrEnum):
    TEXT = "TEXT"
    NUMBER = "NUMBER"
    SELECT = "SELECT"
    DATE = "DATE"
    BOOLEAN = "BOOLEAN"


class TransactionType(StrEnum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"
    ADJUSTMENT = "ADJUSTMENT"


class StoreType(StrEnum):
    RAW_WAREHOUSE = "RAW_WAREHOUSE"  # Склад сырья
    PRODUCTION = "PRODUCTION"        # Цех / Обвалка
    FGS_WAREHOUSE = "FGS_WAREHOUSE"  # СГП (Склад готовой продукции)
    OTHER = "OTHER"                  # Прочие склады


class PassportStatus(StrEnum):
    IN_STOCK = "IN_STOCK"            # На складе
    IN_TRANSIT = "IN_TRANSIT"        # В пути (между складами/цехами)
    IN_PRODUCTION = "IN_PRODUCTION"  # В цехе (на обвалке/переработке)
    PROCESSED = "PROCESSED"          # Переработан (терминальный статус)
    SHIPPED = "SHIPPED"              # Отгружен клиенту


class PassportEventType(StrEnum):
    INITIAL_RECEIPT = "INITIAL_RECEIPT"        # Первичная приемка сырья
    DISPATCH = "DISPATCH"                      # Отправка со склада
    ACCEPT_RECEIPT = "ACCEPT_RECEIPT"          # Приемка на складе/цехе
    PROCESSING_CONSUME = "PROCESSING_CONSUME"  # Списание сырья в переработку
    PROCESSING_PRODUCE = "PROCESSING_PRODUCE"  # Выпуск ГП из переработки
    SHIPMENT = "SHIPMENT"                      # Отгрузка клиенту

