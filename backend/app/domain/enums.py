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
    SSP_RAW = "SSP_RAW"                              # ССП (Склад сырой продукции) — Этап 0
    INTERMEDIATE_WAREHOUSE = "INTERMEDIATE_WAREHOUSE"  # Склад сырья (Буферный склад) — Этап 1
    PRODUCTION = "PRODUCTION"                        # Обвалка / Цех переработки — Этап 2
    FGS_WAREHOUSE = "FGS_WAREHOUSE"                  # СГП (Склад готовой продукции) — Этап 3
    RAW_WAREHOUSE = "INTERMEDIATE_WAREHOUSE"         # Алиас совместимости
    OTHER = "OTHER"                                  # Прочие склады


class PassportStatus(StrEnum):
    IN_STOCK = "IN_STOCK"            # На складе
    IN_TRANSIT = "IN_TRANSIT"        # В пути (между складами/цехами)
    IN_PRODUCTION = "IN_PRODUCTION"  # В цехе (на обвалке/переработке)
    DEPLETED = "DEPLETED"            # Исчерпан — весь вес роздан в дочерние паспорта
    PROCESSED = "PROCESSED"          # Переработан (терминальный статус обвалки)
    SHIPPED = "SHIPPED"              # Отгружен клиенту


class PassportEventType(StrEnum):
    INITIAL_RECEIPT = "INITIAL_RECEIPT"        # Первичная приемка сырья
    SPLIT_OUT = "SPLIT_OUT"                    # Отделение дочерней партии из родителя
    DISPATCH = "DISPATCH"                      # Отправка со склада
    ACCEPT_RECEIPT = "ACCEPT_RECEIPT"          # Приемка на складе/цехе
    PROCESSING_CONSUME = "PROCESSING_CONSUME"  # Списание сырья в переработку
    PROCESSING_PRODUCE = "PROCESSING_PRODUCE"  # Выпуск ГП из переработки
    SHIPMENT = "SHIPMENT"                      # Отгрузка клиенту

