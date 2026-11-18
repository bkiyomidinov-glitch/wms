import pytest
from httpx import AsyncClient
from tests.conftest import login_as


@pytest.mark.asyncio
async def test_stores_crud_and_user_binding(client: AsyncClient):
    auth_headers = await login_as(client, "admin", "Admin123!")

    # 1. List stores (seeded)
    resp = await client.get("/api/v1/stores", headers=auth_headers)
    assert resp.status_code == 200
    stores = resp.json()
    assert len(stores) >= 3
    store_names = [s["name"] for s in stores]
    assert "Центральный склад" in store_names

    # 2. Check /auth/me has store_name
    me_resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert me_resp.status_code == 200
    me = me_resp.json()
    assert me["store_name"] == "Центральный склад"
    assert me["store_id"] is not None

    # 3. Create a new store
    new_store_payload = {
        "name": "Склад тары и упаковки",
        "code": "WH-PACK",
        "address": "г. Душанбе, ул. Борбад 10",
        "is_active": True,
    }
    create_resp = await client.post("/api/v1/stores", json=new_store_payload, headers=auth_headers)
    assert create_resp.status_code == 201
    created_store = create_resp.json()
    assert created_store["name"] == "Склад тары и упаковки"

    # 4. Create user with store_id
    user_payload = {
        "username": "pack_operator",
        "full_name": "Хуршед Давлатов",
        "password": "Password123!",
        "role": "OPERATOR",
        "shift_name": "Смена Б",
        "store_id": created_store["id"],
    }
    u_resp = await client.post("/api/v1/users", json=user_payload, headers=auth_headers)
    assert u_resp.status_code == 201
    created_user = u_resp.json()
    assert created_user["store_id"] == created_store["id"]
