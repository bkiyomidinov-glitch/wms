import pytest
from httpx import AsyncClient

from tests.conftest import login_as


@pytest.mark.asyncio
async def test_login_all_seeded_roles_and_refresh(client: AsyncClient) -> None:
    for username, password, expected_role in [
        ("admin", "Admin123!", "SUPER_ADMIN"),
        ("director", "Director123!", "DIRECTOR"),
        ("manager", "Manager123!", "MANAGER"),
        ("operator", "Operator123!", "OPERATOR"),
    ]:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": password},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["role"] == expected_role
        assert body["access_token"]
        assert body["refresh_token"]

        refresh_resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": body["refresh_token"]},
        )
        assert refresh_resp.status_code == 200
        assert refresh_resp.json()["access_token"]


@pytest.mark.asyncio
async def test_rbac_hierarchy_user_creation_and_audit_access(client: AsyncClient) -> None:
    op_headers = await login_as(client, "operator", "Operator123!")
    mgr_headers = await login_as(client, "manager", "Manager123!")
    admin_headers = await login_as(client, "admin", "Admin123!")

    # Operator cannot list users or audit logs or create constructor units
    assert (await client.get("/api/v1/users", headers=op_headers)).status_code == 403
    assert (await client.get("/api/v1/audit-logs", headers=op_headers)).status_code == 403
    assert (
        await client.post(
            "/api/v1/constructor/units",
            headers=op_headers,
            json={"code": "box", "name": "короб"},
        )
    ).status_code == 403

    # Manager can create OPERATOR, but CANNOT create DIRECTOR or MANAGER
    r_ok = await client.post(
        "/api/v1/users",
        headers=mgr_headers,
        json={
            "username": "op_shift_b",
            "full_name": "Бахтиер Умаров",
            "password": "Password123!",
            "role": "OPERATOR",
            "shift_name": "Смена Б",
        },
    )
    assert r_ok.status_code == 201, r_ok.text

    r_forbidden = await client.post(
        "/api/v1/users",
        headers=mgr_headers,
        json={
            "username": "mgr2",
            "full_name": "Unauthorized Manager",
            "password": "Password123!",
            "role": "MANAGER",
        },
    )
    assert r_forbidden.status_code == 403

    # Admin can view audit logs
    audit_resp = await client.get("/api/v1/audit-logs", headers=admin_headers)
    assert audit_resp.status_code == 200
    assert len(audit_resp.json()) >= 1
