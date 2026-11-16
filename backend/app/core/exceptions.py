from typing import Any


class DomainError(Exception):
    """Base domain exception mapped to HTTP status codes."""

    status_code: int = 400
    code: str = "DOMAIN_ERROR"

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class AuthenticationError(DomainError):
    status_code = 401
    code = "AUTHENTICATION_ERROR"


class PermissionDeniedError(DomainError):
    status_code = 403
    code = "PERMISSION_DENIED"


class NotFoundError(DomainError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(DomainError):
    status_code = 409
    code = "CONFLICT"


class DomainValidationError(DomainError):
    status_code = 422
    code = "VALIDATION_ERROR"


class InsufficientStockError(DomainError):
    status_code = 400
    code = "INSUFFICIENT_STOCK"
