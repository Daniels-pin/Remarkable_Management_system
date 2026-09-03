from fastapi import APIRouter

from app.furniture.routers import dashboard, invoices, orders, quotations

router = APIRouter()
router.include_router(dashboard.router)
router.include_router(orders.router)
router.include_router(quotations.router)
router.include_router(invoices.router)


@router.get("/furniture/status")
def furniture_module_status() -> dict:
    return {
        "module": "furniture",
        "implemented": True,
        "message": "Furniture orders, quotations, and invoices management is live.",
    }
