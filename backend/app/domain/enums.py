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
