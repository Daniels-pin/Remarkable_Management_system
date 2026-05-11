from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.exceptions import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationAppError,
)
from app.middleware.request_id import RequestIdMiddleware
from app.routers import (
    admin,
    auth,
    barber_ops,
    barbershop_catalog,
    barbershop_directory,
    barbershop_ledger,
    dashboard,
    finance,
    furniture,
    health,
    manager_reconciliation,
    me,
    notifications,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    status_code = 400
    if isinstance(exc, NotFoundError):
        status_code = 404
    elif isinstance(exc, ForbiddenError):
        status_code = 403
    elif isinstance(exc, ConflictError):
        status_code = 409
    elif isinstance(exc, ValidationAppError):
        status_code = 422
    body: dict = {"message": exc.message}
    if exc.code:
        body["code"] = exc.code
    return JSONResponse(status_code=status_code, content=body)


app.include_router(health.router)

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth.router)
api_v1.include_router(admin.router)
api_v1.include_router(me.router)
api_v1.include_router(dashboard.router)
api_v1.include_router(finance.router)
api_v1.include_router(barber_ops.router)
api_v1.include_router(manager_reconciliation.router)
api_v1.include_router(notifications.router)
api_v1.include_router(barbershop_catalog.router)
api_v1.include_router(barbershop_directory.router)
api_v1.include_router(barbershop_ledger.router)
api_v1.include_router(furniture.router)
app.include_router(api_v1)
