from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth.rbac import require_manager_or_admin
from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.catalog import ExpenseCategory, SaleCategory, ServiceType
from app.models.enums import LedgerEntryType, LedgerRecordStream, RecordLifecycleState, UserRole
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.schemas.ledger import (
    LedgerEntryCreateExpense,
    LedgerEntryCreateSale,
    LedgerEntryCreateService,
)
from app.schemas.operations import (
    LedgerEntryUpdateBody,
    PaymentMethodCorrectionBody,
    ReconciliationMatchAllBody,
    ReconciliationMatchBody,
    ReconciliationMismatchResolveBody,
    VoidLedgerBody,
)
from app.services import catalog_service, inventory_service, ledger_service
from app.services.business_time import business_date_for_instant
from app.services.financial_month_util import require_financial_month_for_new_entry

router = APIRouter(prefix="/barbershop/ledger", tags=["barbershop"])


def _employee_label(db: Session, user_id: uuid.UUID | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    if u is None:
        return None
    if u.profile is not None and u.profile.full_name:
        return u.profile.full_name
    return f"@{u.username}"


def _enrich_row(
    db: Session,
    r: LedgerEntry,
    *,
    comparison_status: str | None = None,
    payment_method_adjustments: list[dict] | None = None,
) -> dict:
    service = db.get(ServiceType, r.service_type_id) if r.service_type_id else None
    sale = db.get(SaleCategory, r.sale_category_id) if r.sale_category_id else None
    expense = db.get(ExpenseCategory, r.expense_category_id) if r.expense_category_id else None
    display_amount = (
        ledger_service.official_service_amount(r)
        if r.entry_type == LedgerEntryType.SERVICE
        else r.amount
    )
    if comparison_status is None:
        comparison_status = ledger_service.comparison_status_for_service_row(db, r)
    if payment_method_adjustments is None and (
        r.entry_type == LedgerEntryType.SERVICE
        and r.record_stream == LedgerRecordStream.MANAGER
    ):
        payment_method_adjustments = ledger_service.payment_method_adjustments_for_entry(db, r.id)
    elif payment_method_adjustments is None:
        payment_method_adjustments = []
    return {
        "id": str(r.id),
        "entry_type": str(r.entry_type),
        "occurred_at": r.occurred_at.isoformat(),
        "business_date": r.business_date.isoformat() if r.business_date else None,
        "amount": str(display_amount),
        "record_stream": str(r.record_stream) if r.record_stream else None,
        "comparison_status": comparison_status,
        "payment_method": str(r.payment_method) if r.payment_method else None,
        "note": r.note,
        "employee_user_id": str(r.employee_user_id) if r.employee_user_id else None,
        "employee_label": _employee_label(db, r.employee_user_id),
        "created_by_user_id": str(r.created_by_user_id) if r.created_by_user_id else None,
        "created_by_label": inventory_service._recorder_label(db, r.created_by_user_id),
        "barber_sequence_index": r.barber_sequence_index,
        "index_label": ledger_service.index_label_for_entry(db, r),
        "reconciliation_status": str(r.reconciliation_status) if r.reconciliation_status else None,
        "approved_at": r.approved_at.isoformat() if r.approved_at else None,
        "reconciled_at": (
            r.approved_at.isoformat()
            if r.approved_at and comparison_status == "matched"
            else None
        ),
        "is_manager_created_without_barber": r.is_manager_created_without_barber,
        "service_type": {"id": str(service.id), "name": service.name} if service else None,
        "sale_category": {"id": str(sale.id), "name": sale.name} if sale else None,
        "expense_category": {"id": str(expense.id), "name": expense.name} if expense else None,
        "record_lifecycle": str(r.record_lifecycle),
        **ledger_service.ledger_entry_void_metadata(db, r),
        "product_sale": inventory_service.enrich_ledger_with_product_sale(db, r),
        "payment_method_adjustments": payment_method_adjustments,
    }


@router.get("")
def list_ledger(
    business_date: date | None = Query(
        None,
        description="Business day (YYYY-MM-DD). Defaults to today for managers.",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    if actor.user.role in (UserRole.BARBER, UserRole.STAFF):
        rows = (
            db.query(LedgerEntry)
            .filter(
                LedgerEntry.record_lifecycle.in_(
                    (RecordLifecycleState.ACTIVE, RecordLifecycleState.DELETED)
                ),
                LedgerEntry.entry_type == LedgerEntryType.SERVICE,
                LedgerEntry.employee_user_id == actor.user.id,
                LedgerEntry.record_stream == LedgerRecordStream.EMPLOYEE,
            )
            .order_by(
                LedgerEntry.business_date.desc(),
                LedgerEntry.barber_sequence_index.asc().nulls_last(),
            )
            .limit(200)
            .all()
        )
        total = len(rows)
        resolved_date = business_date
    else:
        if business_date is None:
            rows = ledger_service.list_manager_official_timeline(db, limit=200)
            total = len(rows)
            resolved_date = None
        else:
            resolved_date = business_date
            rows, total = ledger_service.list_manager_official_timeline_for_day(
                db,
                business_day=resolved_date,
                page=page,
                page_size=page_size,
            )

    comparison_by_id = ledger_service.comparison_status_map_for_rows(db, rows)
    manager_service_ids = [
        r.id
        for r in rows
        if r.entry_type == LedgerEntryType.SERVICE
        and r.record_stream == LedgerRecordStream.MANAGER
    ]
    adjustments_by_id = ledger_service.payment_method_adjustments_map_for_entries(
        db, manager_service_ids
    )
    return {
        "business_date": resolved_date.isoformat() if resolved_date else None,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            _enrich_row(
                db,
                r,
                comparison_status=comparison_by_id.get(r.id),
                payment_method_adjustments=adjustments_by_id.get(r.id, []),
            )
            for r in rows
        ],
    }


@router.post("")
def create_ledger_entry(
    body: dict,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    """
    Manager/admin operational entry point for the unified ledger timeline.

    - `service`: uses the manager "official line" service creation (index-based reconciliation).
    - `sale` / `expense`: written directly as house ledger lines.
    """
    require_manager_or_admin(actor.user)

    entry_type = body.get("entry_type")
    if entry_type not in {"service", "sale", "expense"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Invalid entry_type", "code": "INVALID_ENTRY_TYPE"},
        )

    if entry_type == "service":
        parsed = LedgerEntryCreateService.model_validate(body)
        row = ledger_service.create_manager_official_service_line(
            db,
            manager=actor.user,
            impersonator_id=actor.impersonator.id if actor.impersonator else None,
            ip_address=None,
            barber_user_id=parsed.employee_user_id,
            occurred_at=parsed.occurred_at,
            service_type_id=parsed.service_type_id,
            amount=parsed.amount,
            payment_method=parsed.payment_method,
            note=parsed.note,
        )
        db.commit()
        db.refresh(row)
        return _enrich_row(db, row)

    if entry_type == "sale":
        if body.get("product_id"):
            from app.schemas.inventory import ProductSaleCreate

            parsed_sale = ProductSaleCreate.model_validate(body)
            row, _sale = inventory_service.create_product_sale(
                db, actor=actor.user, body=parsed_sale
            )
            db.commit()
            db.refresh(row)
            return _enrich_row(db, row)

        parsed = LedgerEntryCreateSale.model_validate(body)
        catalog_service.assert_sale_category_selectable(db, parsed.sale_category_id)
        business_date = business_date_for_instant(parsed.occurred_at)
        fm = require_financial_month_for_new_entry(db, business_date, actor.user)
        sale_idx = ledger_service.allocate_shop_sequence_index(
            db, financial_month_id=fm.id, entry_type=LedgerEntryType.SALE
        )
        row = LedgerEntry(
            financial_month_id=fm.id,
            entry_type=LedgerEntryType.SALE,
            occurred_at=parsed.occurred_at,
            business_date=business_date,
            sale_category_id=parsed.sale_category_id,
            employee_user_id=None,
            amount=Decimal(parsed.amount),
            barber_sequence_index=sale_idx,
            payment_method=parsed.payment_method,
            note=parsed.note,
            created_by_user_id=actor.user.id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _enrich_row(db, row)

    parsed = LedgerEntryCreateExpense.model_validate(body)
    catalog_service.assert_expense_category_selectable(db, parsed.expense_category_id)
    business_date = business_date_for_instant(parsed.occurred_at)
    fm = require_financial_month_for_new_entry(db, business_date, actor.user)
    expense_idx = ledger_service.allocate_shop_sequence_index(
        db, financial_month_id=fm.id, entry_type=LedgerEntryType.EXPENSE
    )
    row = LedgerEntry(
        financial_month_id=fm.id,
        entry_type=LedgerEntryType.EXPENSE,
        occurred_at=parsed.occurred_at,
        business_date=business_date,
        expense_category_id=parsed.expense_category_id,
        employee_user_id=None,
        amount=Decimal(parsed.amount),
        barber_sequence_index=expense_idx,
        payment_method=parsed.payment_method,
        note=parsed.note,
        created_by_user_id=actor.user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _enrich_row(db, row)


@router.get("/reconciliation-inbox")
def reconciliation_inbox(
    filter: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    """Pending or mismatch service slots for the operational reconciliation inbox."""
    require_manager_or_admin(actor.user)
    normalized_filter = filter.split(":", 1)[0].strip()
    items, total = ledger_service.list_reconciliation_inbox(
        db,
        inbox_filter=normalized_filter,
        page=page,
        page_size=page_size,
    )
    return {
        "filter": normalized_filter,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": items,
    }


@router.get("/reconciliation-counts")
def reconciliation_counts(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    """Actionable pending/mismatch counts for manager navigation badges."""
    require_manager_or_admin(actor.user)
    return ledger_service.count_actionable_reconciliation(db, perspective="manager")


@router.post("/match/{employee_entry_id}")
def match_pending_entry(
    employee_entry_id: uuid.UUID,
    body: ReconciliationMatchBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_manager_or_admin(actor.user)
    row = ledger_service.match_pending_employee_entry(
        db,
        manager=actor.user,
        employee_entry_id=employee_entry_id,
        payment_method=body.payment_method,
    )
    db.commit()
    db.refresh(row)
    return _enrich_row(db, row)


@router.post("/match-all")
def match_all_pending(
    body: ReconciliationMatchAllBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_manager_or_admin(actor.user)
    matched = ledger_service.match_all_pending_employee_entries(
        db,
        manager=actor.user,
        payment_method=body.payment_method,
    )
    db.commit()
    return {"matched_count": len(matched), "items": [_enrich_row(db, r) for r in matched]}


@router.post("/mismatch/resolve")
def resolve_mismatch(
    body: ReconciliationMismatchResolveBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    """Set manager amount to employee amount and mark matched when aligned."""
    require_manager_or_admin(actor.user)
    employee_row, mgr_row = ledger_service.resolve_mismatch_use_employee_amount(
        db,
        manager=actor.user,
        employee_entry_id=body.employee_entry_id,
    )
    db.commit()
    return {
        "employee": _enrich_row(db, employee_row),
        "manager": _enrich_row(db, mgr_row),
    }


@router.post("/{entry_id}/correct-payment-method")
def correct_payment_method(
    entry_id: uuid.UUID,
    body: PaymentMethodCorrectionBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_manager_or_admin(actor.user)
    row = ledger_service.correct_matched_service_payment_method(
        db,
        actor=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        entry_id=entry_id,
        new_payment_method=body.new_payment_method,
        reason=body.reason,
    )
    db.commit()
    db.refresh(row)
    return _enrich_row(db, row)


@router.patch("/{entry_id}")
def update_ledger_entry(
    entry_id: uuid.UUID,
    body: LedgerEntryUpdateBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_manager_or_admin(actor.user)
    row = ledger_service.update_manager_ledger_entry(
        db,
        actor=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        entry_id=entry_id,
        amount=body.amount,
        service_type_id=body.service_type_id,
        sale_category_id=body.sale_category_id,
        expense_category_id=body.expense_category_id,
        note=body.note,
    )
    db.commit()
    db.refresh(row)
    return _enrich_row(db, row)


@router.post("/{entry_id}/void")
def void_ledger_entry(
    entry_id: uuid.UUID,
    body: VoidLedgerBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_manager_or_admin(actor.user)
    row = ledger_service.void_ledger_entry(
        db,
        actor=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        entry_id=entry_id,
        reason=body.reason,
    )
    db.commit()
    db.refresh(row)
    return _enrich_row(db, row)
