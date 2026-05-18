from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.rbac import require_manager_or_admin
from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.catalog import ExpenseCategory, SaleCategory, ServiceType
from app.models.enums import LedgerEntryType, RecordLifecycleState, UserRole
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.schemas.ledger import (
    LedgerEntryCreateExpense,
    LedgerEntryCreateSale,
    LedgerEntryCreateService,
)
from app.services import catalog_service, ledger_service
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


def _enrich_row(db: Session, r: LedgerEntry) -> dict:
    service = db.get(ServiceType, r.service_type_id) if r.service_type_id else None
    sale = db.get(SaleCategory, r.sale_category_id) if r.sale_category_id else None
    expense = db.get(ExpenseCategory, r.expense_category_id) if r.expense_category_id else None
    return {
        "id": str(r.id),
        "entry_type": str(r.entry_type),
        "occurred_at": r.occurred_at.isoformat(),
        "business_date": r.business_date.isoformat() if r.business_date else None,
        "amount": str(r.amount),
        "payment_method": str(r.payment_method) if r.payment_method else None,
        "note": r.note,
        "employee_user_id": str(r.employee_user_id) if r.employee_user_id else None,
        "employee_label": _employee_label(db, r.employee_user_id),
        "barber_sequence_index": r.barber_sequence_index,
        "reconciliation_status": str(r.reconciliation_status) if r.reconciliation_status else None,
        "service_type": {"id": str(service.id), "name": service.name} if service else None,
        "sale_category": {"id": str(sale.id), "name": sale.name} if sale else None,
        "expense_category": {"id": str(expense.id), "name": expense.name} if expense else None,
        "record_lifecycle": str(r.record_lifecycle),
    }


@router.get("")
def list_ledger(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    q = db.query(LedgerEntry).filter(LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE)
    if actor.user.role in (UserRole.BARBER, UserRole.STAFF):
        q = q.filter(
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.employee_user_id == actor.user.id,
        )
    rows = q.order_by(LedgerEntry.occurred_at.desc()).limit(200).all()
    return {"items": [_enrich_row(db, r) for r in rows]}


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
        parsed = LedgerEntryCreateSale.model_validate(body)
        catalog_service.assert_sale_category_selectable(db, parsed.sale_category_id)
        business_date = business_date_for_instant(parsed.occurred_at)
        fm = require_financial_month_for_new_entry(db, business_date, actor.user)
        row = LedgerEntry(
            financial_month_id=fm.id,
            entry_type=LedgerEntryType.SALE,
            occurred_at=parsed.occurred_at,
            business_date=business_date,
            sale_category_id=parsed.sale_category_id,
            employee_user_id=None,
            amount=Decimal(parsed.amount),
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
    row = LedgerEntry(
        financial_month_id=fm.id,
        entry_type=LedgerEntryType.EXPENSE,
        occurred_at=parsed.occurred_at,
        business_date=business_date,
        expense_category_id=parsed.expense_category_id,
        employee_user_id=None,
        amount=Decimal(parsed.amount),
        payment_method=parsed.payment_method,
        note=parsed.note,
        created_by_user_id=actor.user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _enrich_row(db, row)
