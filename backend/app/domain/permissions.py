from app.domain.enums import UserRole

ROLE_HIERARCHY_RANK: dict[UserRole, int] = {
    UserRole.SUPER_ADMIN: 4,
    UserRole.DIRECTOR: 3,
    UserRole.MANAGER: 2,
    UserRole.OPERATOR: 1,
}

ROLE_LABELS: dict[UserRole, str] = {
    UserRole.SUPER_ADMIN: "Главный администратор (IT)",
    UserRole.DIRECTOR: "Директор / Руководство",
    UserRole.MANAGER: "Начальник склада / Старший смены",
    UserRole.OPERATOR: "Оператор склада",
}

# Which roles each actor can create/manage
MANAGEABLE_ROLES: dict[UserRole, set[UserRole]] = {
    UserRole.SUPER_ADMIN: {
        UserRole.SUPER_ADMIN,
        UserRole.DIRECTOR,
        UserRole.MANAGER,
        UserRole.OPERATOR,
    },
    UserRole.DIRECTOR: {
        UserRole.MANAGER,
        UserRole.OPERATOR,
    },
    UserRole.MANAGER: {
        UserRole.OPERATOR,
    },
    UserRole.OPERATOR: set(),
}


def can_manage_role(actor_role: UserRole, target_role: UserRole) -> bool:
    """Return True if actor_role is allowed to create/modify target_role."""
    return target_role in MANAGEABLE_ROLES.get(actor_role, set())


def can_override_timestamp(role: UserRole) -> bool:
    """Operators cannot backdate operations; managers and above can."""
    return role in {UserRole.MANAGER, UserRole.DIRECTOR, UserRole.SUPER_ADMIN}


def can_perform_adjustment(role: UserRole) -> bool:
    """Stock adjustments require MANAGER or higher."""
    return role in {UserRole.MANAGER, UserRole.DIRECTOR, UserRole.SUPER_ADMIN}


def can_manage_products(role: UserRole) -> bool:
    """Creating/editing product cards requires MANAGER or higher."""
    return role in {UserRole.MANAGER, UserRole.DIRECTOR, UserRole.SUPER_ADMIN}


def can_manage_constructor(role: UserRole) -> bool:
    """Dynamic constructor management requires DIRECTOR or SUPER_ADMIN."""
    return role in {UserRole.DIRECTOR, UserRole.SUPER_ADMIN}


def can_view_all_transactions(role: UserRole) -> bool:
    """Operators only see their own operations; managers+ see all."""
    return role in {UserRole.MANAGER, UserRole.DIRECTOR, UserRole.SUPER_ADMIN}


def can_view_audit_logs(role: UserRole) -> bool:
    """Audit logs are restricted to DIRECTOR and SUPER_ADMIN."""
    return role in {UserRole.DIRECTOR, UserRole.SUPER_ADMIN}
