import pytest
from httpx import AsyncClient

from tests.conftest import login_as


@pytest.mark.asyncio
async def test_dynamic_constructor_dictionary_attribute_and_validation(
    client: AsyncClient,
) -> None:
    admin_headers = await login_as(client, "admin", "Admin123!")
    op_headers = await login_as(client, "operator", "Operator123!")

    # 1. Admin creates a custom dictionary for storage temperature zones
    dict_resp = await client.post(
        "/api/v1/constructor/dictionaries",
        headers=admin_headers,
        json={
            "name": "Температурные зоны",
            "slug": "temp_zones",
            "items": ["+2°C..+6°C", "+15°C..+22°C"],
        },
    )
    assert dict_resp.status_code == 201, dict_resp.text
    temp_dict = dict_resp.json()

    # 2. Admin adds a dynamic required SELECT attribute on TX_OUTBOUND
    attr_resp = await client.post(
        "/api/v1/constructor/attributes",
        headers=admin_headers,
        json={
            "target_type": "TX_OUTBOUND",
            "key": "temp_zone",
            "label": "Температурный режим",
            "field_type": "SELECT",
            "dictionary_id": temp_dict["id"],
            "is_required": True,
            "sort_order": 10,
        },
    )
    assert attr_resp.status_code == 201, attr_resp.text

    product = (await client.get("/api/v1/products/barcode/4870001001", headers=op_headers)).json()

    # 3. Operator submits outbound with invalid dictionary value -> rejected 422
    bad_val = await client.post(
        "/api/v1/transactions",
        headers=op_headers,
        json={
            "tx_type": "OUTBOUND",
            "product_id": product["id"],
            "quantity_entered": 2,
            "unit_id": product["base_unit_id"],
            "counterparty_name": "Дистрибьютор Согд-Трейд",
            "custom_attributes": {
                "waybill_number": "ТТН-777",
                "temp_zone": "-18°C",
            },
        },
    )
    assert bad_val.status_code == 422

    # 4. Operator submits outbound with valid dictionary value -> accepted 201
    ok_val = await client.post(
        "/api/v1/transactions",
        headers=op_headers,
        json={
            "tx_type": "OUTBOUND",
            "product_id": product["id"],
            "quantity_entered": 2,
            "unit_id": product["base_unit_id"],
            "counterparty_name": "Дистрибьютор Согд-Трейд",
            "custom_attributes": {
                "waybill_number": "ТТН-777",
                "temp_zone": "+2°C..+6°C",
            },
        },
    )
    assert ok_val.status_code == 201
    assert ok_val.json()["custom_attributes"]["temp_zone"] == "+2°C..+6°C"
