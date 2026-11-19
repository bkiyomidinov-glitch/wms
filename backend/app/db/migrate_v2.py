"""
Database migration script:
1. Adds balance_before_store, balance_after_store to inventory_transactions
2. Adds permissions (JSONB) to users
3. Creates user_stores table
4. Backfills historical balances for existing transactions
5. Links users to stores and initializes their permission matrices
"""
import asyncio
from sqlalchemy import text, select
from app.db.session import AsyncSessionLocal
from app.models.transaction import InventoryTransaction
from app.models.user import User
from app.models.store import Store

SUPER_ADMIN_PERMISSIONS = {
    "can_inbound": True,
    "can_outbound": True,
    "can_view_stock": True,
    "can_view_movements": True,
    "can_manage_products": True,
    "can_manage_stores": True,
    "can_manage_users": True,
}

DIRECTOR_PERMISSIONS = {
    "can_inbound": True,
    "can_outbound": True,
    "can_view_stock": True,
    "can_view_movements": True,
    "can_manage_products": True,
    "can_manage_stores": True,
    "can_manage_users": False,
}

MANAGER_PERMISSIONS = {
    "can_inbound": True,
    "can_outbound": True,
    "can_view_stock": True,
    "can_view_movements": True,
    "can_manage_products": True,
    "can_manage_stores": True,
    "can_manage_users": False,
}

OPERATOR_PERMISSIONS = {
    "can_inbound": True,
    "can_outbound": True,
    "can_view_stock": True,
    "can_view_movements": True,
    "can_manage_products": False,
    "can_manage_stores": False,
    "can_manage_users": False,
}

async def run_migration():
    print("Starting database schema migration...")
    async with AsyncSessionLocal() as session:
        # 1. Add columns to inventory_transactions
        await session.execute(text("""
            ALTER TABLE inventory_transactions
            ADD COLUMN IF NOT EXISTS balance_before_store INTEGER DEFAULT 0 NOT NULL,
            ADD COLUMN IF NOT EXISTS balance_after_store INTEGER DEFAULT 0 NOT NULL;
        """))

        # 2. Add permissions to users
        await session.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"can_inbound": true, "can_outbound": true, "can_view_stock": true, "can_view_movements": true, "can_manage_products": false, "can_manage_stores": false, "can_manage_users": false}'::jsonb NOT NULL;
        """))

        # 3. Create user_stores table
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS user_stores (
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, store_id)
            );
        """))
        await session.commit()
        print("Schema altered successfully.")

        # 4. Backfill transactions balance_before_store & balance_after_store
        print("Backfilling transaction balances...")
        # Get all transactions ordered chronologically
        tx_res = await session.execute(
            select(InventoryTransaction).order_by(
                InventoryTransaction.performed_at.asc(),
                InventoryTransaction.created_at.asc()
            )
        )
        all_txs = list(tx_res.scalars().all())

        # Track store balances per (store_id, product_id)
        store_running_balances: dict[tuple, int] = {}
        for tx in all_txs:
            key = (tx.store_id, tx.product_id)
            cur_bal = store_running_balances.get(key, 0)
            qty = int(round(tx.quantity_base_calculated))

            tx.balance_before_store = cur_bal
            if tx.tx_type == "INBOUND":
                new_bal = cur_bal + qty
            elif tx.tx_type == "OUTBOUND":
                new_bal = max(0, cur_bal - qty)
            else: # ADJUSTMENT
                new_bal = qty

            tx.balance_after_store = new_bal
            store_running_balances[key] = new_bal

            await session.execute(
                text("""
                    UPDATE inventory_transactions
                    SET balance_before_store = :before, balance_after_store = :after
                    WHERE id = :tx_id
                """),
                {"before": cur_bal, "after": new_bal, "tx_id": tx.id}
            )

        await session.commit()
        print(f"Backfilled {len(all_txs)} transactions with exact historical balances.")

        # 5. Populate user_stores and default permissions
        print("Setting up user permissions and store bindings...")
        stores = (await session.execute(select(Store))).scalars().all()
        users = (await session.execute(select(User))).scalars().all()

        for u in users:
            if u.role == "SUPER_ADMIN":
                u.permissions = SUPER_ADMIN_PERMISSIONS
                # Assign all stores
                for s in stores:
                    await session.execute(text("""
                        INSERT INTO user_stores (user_id, store_id)
                        VALUES (:uid, :sid)
                        ON CONFLICT DO NOTHING;
                    """), {"uid": u.id, "sid": s.id})
            elif u.role == "DIRECTOR":
                u.permissions = DIRECTOR_PERMISSIONS
                for s in stores:
                    await session.execute(text("""
                        INSERT INTO user_stores (user_id, store_id)
                        VALUES (:uid, :sid)
                        ON CONFLICT DO NOTHING;
                    """), {"uid": u.id, "sid": s.id})
            elif u.role == "MANAGER":
                u.permissions = MANAGER_PERMISSIONS
                # Assign primary store + first 3 stores
                target_stores = [s for s in stores if s.code in ("WH-MAIN", "WH-PROD", "WH-RAW", "WH-COLD")]
                for s in target_stores:
                    await session.execute(text("""
                        INSERT INTO user_stores (user_id, store_id)
                        VALUES (:uid, :sid)
                        ON CONFLICT DO NOTHING;
                    """), {"uid": u.id, "sid": s.id})
            else:  # OPERATOR
                u.permissions = OPERATOR_PERMISSIONS
                # Assign their current store or WH-MAIN
                target_stores = [s for s in stores if s.id == u.store_id] or [stores[0]]
                for s in target_stores:
                    await session.execute(text("""
                        INSERT INTO user_stores (user_id, store_id)
                        VALUES (:uid, :sid)
                        ON CONFLICT DO NOTHING;
                    """), {"uid": u.id, "sid": s.id})

        await session.commit()
        print("User permissions and multi-store bindings successfully configured.")

if __name__ == "__main__":
    import sys
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_migration())
