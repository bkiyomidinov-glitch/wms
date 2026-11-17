from fastapi import APIRouter

from app.api.v1 import audit, auth, constructor, products, stores, transactions, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(stores.router, prefix="/stores", tags=["Stores"])
api_router.include_router(products.router)
api_router.include_router(transactions.router)
api_router.include_router(constructor.router)
api_router.include_router(audit.router)
