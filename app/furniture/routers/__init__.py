from fastapi import APIRouter

from app.furniture.routers import dashboard, orders, quotations

router = APIRouter()
router.include_router(dashboard.router)
router.include_router(orders.router)
router.include_router(quotations.router)


@router.get("/furniture/status")
def furniture_module_status() -> dict:
    return {
        "module": "furniture",
        "implemented": True,
        "message": "Furniture orders and quotations management is live.",
    }
