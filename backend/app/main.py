from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.core.timezone import now_dushanbe
from app.db.seed import seed_database
from app.db.session import AsyncSessionLocal

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.AUTO_SEED:
        async with AsyncSessionLocal() as session:
            await seed_database(session)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.code,
            "message": exc.message,
            "details": exc.details,
        },
    )


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "timezone": settings.TIMEZONE,
        "server_time_dushanbe": now_dushanbe().isoformat(),
    }


app.include_router(api_router)
