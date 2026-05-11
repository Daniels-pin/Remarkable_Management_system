from fastapi import APIRouter, status

router = APIRouter(prefix="/furniture", tags=["furniture"])


@router.get("/status")
def furniture_module_status() -> dict:
    return {
        "module": "furniture",
        "implemented": False,
        "message": "Placeholder module — routes return 501 until implemented.",
    }


@router.get("/items", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def furniture_items_stub() -> dict:
    return {"detail": "Furniture module not implemented yet."}
