from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import joinedload
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_db, get_manager_or_admin_actor
from app.models.barber_daily_summary import BarberDailySummary
from app.models.reconciliation_timeline import ReconciliationTimelineEvent
from app.models.user import User
from app.schemas.operations import (
    ManagerOfficialLineBody,
    ManagerProposeSummaryBody,
    ManagerReviseSummaryBody,
)
from app.services import ledger_service, reconciliation_service

router = APIRouter(prefix="/manager/reconciliation", tags=["manager-reconciliation"])


def _ledger_row(e) -> dict:
    orig = e.original_barber_amount
    mgr = e.manager_approved_amount
    return {
        "id": str(e.id),
        "barber_sequence_index": e.barber_sequence_index,
        "occurred_at": e.occurred_at.isoformat(),
        "business_date": e.business_date.isoformat() if e.business_date else None,
        "amount": str(e.amount),
        "original_barber_amount": str(orig) if orig is not None else None,
        "manager_approved_amount": str(mgr) if mgr is not None else None,
        "reconciliation_status": str(e.reconciliation_status) if e.reconciliation_status else None,
        "is_manager_created_without_barber": e.is_manager_created_without_barber,
    }


@router.get("/day/{barber_user_id}/{business_day}/diff")
def manager_diff(
    barber_user_id: UUID,
    business_day: date,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    issues = ledger_service.compute_index_reconciliation_issues(
        db, barber_user_id=barber_user_id, business_day=business_day
    )
    rows, total = ledger_service.list_barber_day_entries(
        db, barber_user_id=barber_user_id, business_day=business_day, page=1, page_size=500
    )
    return {"issues": issues, "total_entries": total, "items": [_ledger_row(r) for r in rows]}


@router.post("/day/{barber_user_id}/{business_day}/propose")
def manager_propose(
    barber_user_id: UUID,
    business_day: date,
    body: ManagerProposeSummaryBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    s = reconciliation_service.manager_propose_daily_summary(
        db,
        manager=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        barber_user_id=barber_user_id,
        business_day=business_day,
        entry_amounts=body.entry_amounts,
        mark_missing_barber_submission=body.mark_missing_barber_submission,
    )
    db.commit()
    return {"summary_id": str(s.id), "status": str(s.status), "version": s.manager_proposal_version}


@router.post("/day/{barber_user_id}/{business_day}/revise")
def manager_revise(
    barber_user_id: UUID,
    business_day: date,
    body: ManagerReviseSummaryBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    s = reconciliation_service.manager_revise_after_dispute(
        db,
        manager=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        barber_user_id=barber_user_id,
        business_day=business_day,
        entry_amounts=body.entry_amounts,
    )
    db.commit()
    return {"summary_id": str(s.id), "status": str(s.status), "version": s.manager_proposal_version}


@router.post("/official-line")
def manager_official_line(
    body: ManagerOfficialLineBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = ledger_service.create_manager_official_service_line(
        db,
        manager=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        barber_user_id=body.barber_user_id,
        occurred_at=body.occurred_at,
        service_type_id=body.service_type_id,
        amount=body.amount,
        payment_method=body.payment_method,
        note=body.note,
    )
    db.commit()
    db.refresh(row)
    return _ledger_row(row)


@router.get("/queue")
def reconciliation_queue(
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    rows = (
        db.query(BarberDailySummary)
        .options(joinedload(BarberDailySummary.timeline_events))
        .order_by(BarberDailySummary.business_date.desc())
        .limit(200)
        .all()
    )
    barber_ids = sorted({r.barber_user_id for r in rows})
    users = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.id.in_(barber_ids))
        .all()
    )
    by_id = {u.id: u for u in users}
    return {
        "items": [
            {
                "summary_id": str(r.id),
                "barber_user_id": str(r.barber_user_id),
                "barber_label": (
                    (by_id.get(r.barber_user_id).profile.full_name)  # type: ignore[union-attr]
                    if by_id.get(r.barber_user_id) and by_id.get(r.barber_user_id).profile  # type: ignore[union-attr]
                    else f"@{by_id.get(r.barber_user_id).username}"  # type: ignore[union-attr]
                    if by_id.get(r.barber_user_id)
                    else "Barber"
                ),
                "business_date": r.business_date.isoformat(),
                "status": str(r.status),
                "manager_proposal_version": r.manager_proposal_version,
                "total_original_barber": str(r.total_original_barber),
                "total_manager_approved": str(r.total_manager_approved),
                "used_manager_entries_due_to_missing_barber": r.used_manager_entries_due_to_missing_barber,
                "barber_rejection_reason": r.barber_rejection_reason,
                "last_manager_action_at": r.last_manager_action_at.isoformat()
                if r.last_manager_action_at
                else None,
            }
            for r in rows
        ]
    }


@router.get("/day/{barber_user_id}/{business_day}/detail")
def manager_day_detail(
    barber_user_id: UUID,
    business_day: date,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    summary = reconciliation_service.get_or_create_daily_summary(
        db, barber_user_id=barber_user_id, business_day=business_day
    )
    issues = ledger_service.compute_index_reconciliation_issues(
        db, barber_user_id=barber_user_id, business_day=business_day
    )
    entries, total = ledger_service.list_barber_day_entries(
        db, barber_user_id=barber_user_id, business_day=business_day, page=1, page_size=500
    )
    timeline = (
        db.query(ReconciliationTimelineEvent)
        .filter(ReconciliationTimelineEvent.summary_id == summary.id)
        .order_by(ReconciliationTimelineEvent.created_at.asc())
        .all()
    )
    return {
        "summary": {
            "id": str(summary.id),
            "status": str(summary.status),
            "manager_proposal_version": summary.manager_proposal_version,
            "total_original_barber": str(summary.total_original_barber),
            "total_manager_approved": str(summary.total_manager_approved),
            "used_manager_entries_due_to_missing_barber": summary.used_manager_entries_due_to_missing_barber,
            "barber_rejection_reason": summary.barber_rejection_reason,
            "admin_final_day_total": str(summary.admin_final_day_total)
            if summary.admin_final_day_total is not None
            else None,
        },
        "issues": issues,
        "total_entries": total,
        "items": [_ledger_row(r) for r in entries],
        "timeline": [
            {
                "event_type": str(t.event_type),
                "message": t.message,
                "created_at": t.created_at.isoformat(),
                "payload": t.payload,
            }
            for t in timeline
        ],
    }
