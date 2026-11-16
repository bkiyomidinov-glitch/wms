import pytest
from httpx import AsyncClient

from tests.conftest import login_as


@pytest.mark.asyncio
async def test_barcode_lookup_and_dual_stock_display(client: AsyncClient) -> None:
    op_headers = await login_as(client, "operator", "Operator123!")

    resp = await client.get("/api/v1/products/barcode/4870001001", headers=op_headers)
    assert resp.status_code == 200, resp.text
    product = resp.json()
    assert product["name"] == "Вода Хаёт 0.5 литров"
    assert float(product["current_stock_base"]) == 110.0
    assert float(product["secondary_stock_calculated"]) == 55.0
    assert product["stock_display"] == "110 штук / 55 литров"


@pytest.mark.asyncio
async def test_inbound_outbound_unit_conversion_and_negative_stock_guard(
    client: AsyncClient,
) -> None:
    op_headers = await login_as(client, "operator", "Operator123!")

    prod_resp = await client.get("/api/v1/products/barcode/4870001001", headers=op_headers)
    product = prod_resp.json()
    unit_pack = next(u["unit_id"] for u in product["allowed_units"] if u["unit"]["code"] == "pack12")
    unit_pcs = product["base_unit_id"]

    # 1. Inbound 5 packs (5 * 12 = 60 pcs) -> stock becomes 170 pcs / 85 l
    in_resp = await client.post(
        "/api/v1/transactions",
        headers=op_headers,
        json={
            "tx_type": "INBOUND",
            "product_id": product["id"],
            "quantity_entered": 5,
            "unit_id": unit_pack,
            "counterparty_name": "Линия розлива №1",
            "custom_attributes": {
                "batch_number": "HYT-TEST-01",
                "qc_passed": True,
            },
        },
    )
    assert in_resp.status_code == 201, in_resp.text
    in_tx = in_resp.json()
    assert float(in_tx["quantity_base_calculated"]) == 60.0
    assert float(in_tx["stock_after_base"]) == 170.0

    # Verify updated dual display
    updated = (await client.get("/api/v1/products/barcode/4870001001", headers=op_headers)).json()
    assert updated["stock_display"] == "170 штук / 85 литров"

    # 2. Outbound exceeding stock (200 pcs > 170 pcs) must fail with INSUFFICIENT_STOCK
    bad_out = await client.post(
        "/api/v1/transactions",
        headers=op_headers,
        json={
            "tx_type": "OUTBOUND",
            "product_id": product["id"],
            "quantity_entered": 200,
            "unit_id": unit_pcs,
            "counterparty_name": "Сеть маркетов Пайкар",
            "custom_attributes": {"waybill_number": "ТТН-999"},
        },
    )
    assert bad_out.status_code == 400
    assert bad_out.json()["error"] == "INSUFFICIENT_STOCK"

    # 3. Valid outbound 20 pcs -> stock returns to 150 pcs / 75 l
    ok_out = await client.post(
        "/api/v1/transactions",
        headers=op_headers,
        json={
            "tx_type": "OUTBOUND",
            "product_id": product["id"],
            "quantity_entered": 20,
            "unit_id": unit_pcs,
            "counterparty_name": "Сеть маркетов Пайкар",
            "custom_attributes": {"waybill_number": "ТТН-100"},
        },
    )
    assert ok_out.status_code == 201
    assert float(ok_out.json()["stock_after_base"]) == 150.0


@pytest.mark.asyncio
async def test_operator_cannot_do_adjustment_and_missing_required_attr_fails(
    client: AsyncClient,
) -> None:
    admin_headers = await login_as(client, "admin", "Admin123!")
    op_headers = await login_as(client, "operator", "Operator123!")
    mgr_headers = await login_as(client, "manager", "Manager123!")

    # Admin dynamically creates a required attribute on INBOUND
    attr_resp = await client.post(
        "/api/v1/constructor/attributes",
        headers=admin_headers,
        json={
            "target_type": "TX_INBOUND",
            "label": "Номер партии",
            "field_type": "TEXT",
            "is_required": True,
        },
    )
    assert attr_resp.status_code == 201
    created_attr = attr_resp.json()
    attr_key = created_attr["key"]

    product = (await client.get("/api/v1/products/barcode/4870001001", headers=op_headers)).json()

    # Missing required attribute on INBOUND
    missing_attr = await client.post(
        "/api/v1/transactions",
        headers=op_headers,
        json={
            "tx_type": "INBOUND",
            "product_id": product["id"],
            "quantity_entered": 10,
            "unit_id": product["base_unit_id"],
            "counterparty_name": "Линия розлива №1",
            "custom_attributes": {},
        },
    )
    assert missing_attr.status_code == 422

    # Operator cannot perform ADJUSTMENT
    op_adj = await client.post(
        "/api/v1/transactions",
        headers=op_headers,
        json={
            "tx_type": "ADJUSTMENT",
            "product_id": product["id"],
            "quantity_entered": 5,
            "unit_id": product["base_unit_id"],
            "counterparty_name": "Инвентаризация",
            "adjustment_direction": "DECREASE",
            "notes": "Бой при погрузке",
        },
    )
    assert op_adj.status_code == 403

    # Manager CAN perform ADJUSTMENT
    mgr_adj = await client.post(
        "/api/v1/transactions",
        headers=mgr_headers,
        json={
            "tx_type": "ADJUSTMENT",
            "product_id": product["id"],
            "quantity_entered": 5,
            "unit_id": product["base_unit_id"],
            "counterparty_name": "Инвентаризация",
            "adjustment_direction": "DECREASE",
            "notes": "Бой при погрузке",
        },
    )
    assert mgr_adj.status_code == 201
    assert float(mgr_adj.json()["stock_after_base"]) == 105.0
