"""reconciliation audit notifications commission payout

Revision ID: a1b2c3d4e5f6
Revises: fbd6e7f50c90
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "fbd6e7f50c90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "barber_daily_summaries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("barber_user_id", sa.UUID(), nullable=False),
        sa.Column("financial_month_id", sa.UUID(), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("manager_proposal_version", sa.Integer(), nullable=False),
        sa.Column("total_original_barber", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("total_manager_approved", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("used_manager_entries_due_to_missing_barber", sa.Boolean(), nullable=False),
        sa.Column("barber_rejection_reason", sa.Text(), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settled_by_user_id", sa.UUID(), nullable=True),
        sa.Column("admin_resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("admin_resolved_by_user_id", sa.UUID(), nullable=True),
        sa.Column("admin_resolution_note", sa.Text(), nullable=True),
        sa.Column("admin_final_day_total", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("last_manager_action_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_manager_action_by_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["barber_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["financial_month_id"], ["financial_months.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["settled_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["admin_resolved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["last_manager_action_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barber_user_id", "business_date", name="uq_barber_daily_summaries_barber_date"),
    )
    op.create_index(
        op.f("ix_barber_daily_summaries_barber_user_id"),
        "barber_daily_summaries",
        ["barber_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_barber_daily_summaries_business_date"),
        "barber_daily_summaries",
        ["business_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_barber_daily_summaries_financial_month_id"),
        "barber_daily_summaries",
        ["financial_month_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_barber_daily_summaries_status"),
        "barber_daily_summaries",
        ["status"],
        unique=False,
    )

    op.create_table(
        "barber_sequence_counters",
        sa.Column("barber_user_id", sa.UUID(), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["barber_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("barber_user_id"),
    )

    op.create_table(
        "reconciliation_timeline_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("summary_id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(length=48), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["summary_id"], ["barber_daily_summaries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_reconciliation_timeline_events_created_at"),
        "reconciliation_timeline_events",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reconciliation_timeline_events_event_type"),
        "reconciliation_timeline_events",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reconciliation_timeline_events_summary_id"),
        "reconciliation_timeline_events",
        ["summary_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reconciliation_timeline_events_actor_user_id"),
        "reconciliation_timeline_events",
        ["actor_user_id"],
        unique=False,
    )

    op.create_table(
        "app_notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("notification_type", sa.String(length=48), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_app_notifications_created_at"), "app_notifications", ["created_at"], unique=False)
    op.create_index(op.f("ix_app_notifications_entity_id"), "app_notifications", ["entity_id"], unique=False)
    op.create_index(op.f("ix_app_notifications_entity_type"), "app_notifications", ["entity_type"], unique=False)
    op.create_index(op.f("ix_app_notifications_notification_type"), "app_notifications", ["notification_type"], unique=False)
    op.create_index(op.f("ix_app_notifications_user_id"), "app_notifications", ["user_id"], unique=False)

    op.add_column("ledger_entries", sa.Column("business_date", sa.Date(), nullable=True))
    op.add_column("ledger_entries", sa.Column("original_barber_amount", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("ledger_entries", sa.Column("manager_approved_amount", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("ledger_entries", sa.Column("barber_sequence_index", sa.Integer(), nullable=True))
    op.add_column("ledger_entries", sa.Column("reconciliation_status", sa.String(length=40), nullable=True))
    op.add_column(
        "ledger_entries",
        sa.Column("record_lifecycle", sa.String(length=16), nullable=False, server_default="active"),
    )
    op.add_column("ledger_entries", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ledger_entries", sa.Column("deleted_by_user_id", sa.UUID(), nullable=True))
    op.add_column("ledger_entries", sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ledger_entries", sa.Column("purged_by_user_id", sa.UUID(), nullable=True))
    op.add_column("ledger_entries", sa.Column("purge_reason", sa.Text(), nullable=True))
    op.add_column("ledger_entries", sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "ledger_entries",
        sa.Column(
            "is_manager_created_without_barber",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("ledger_entries", sa.Column("barber_daily_summary_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_ledger_entries_barber_daily_summary",
        "ledger_entries",
        "barber_daily_summaries",
        ["barber_daily_summary_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_ledger_entries_deleted_by_user",
        "ledger_entries",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_ledger_entries_purged_by_user",
        "ledger_entries",
        "users",
        ["purged_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_ledger_entries_barber_daily_summary_id"), "ledger_entries", ["barber_daily_summary_id"], unique=False)
    op.create_index(op.f("ix_ledger_entries_barber_sequence_index"), "ledger_entries", ["barber_sequence_index"], unique=False)
    op.create_index(op.f("ix_ledger_entries_business_date"), "ledger_entries", ["business_date"], unique=False)
    op.create_index(op.f("ix_ledger_entries_record_lifecycle"), "ledger_entries", ["record_lifecycle"], unique=False)
    op.create_index(op.f("ix_ledger_entries_reconciliation_status"), "ledger_entries", ["reconciliation_status"], unique=False)

    op.execute(
        """
        CREATE UNIQUE INDEX uq_ledger_barber_sequence
        ON ledger_entries (employee_user_id, barber_sequence_index)
        WHERE barber_sequence_index IS NOT NULL
        """
    )

    op.add_column(
        "monthly_commission_statements",
        sa.Column("payout_state", sa.String(length=16), nullable=False, server_default="unpaid"),
    )
    op.add_column("monthly_commission_statements", sa.Column("payout_marked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("monthly_commission_statements", sa.Column("payout_marked_by_user_id", sa.UUID(), nullable=True))
    op.add_column("monthly_commission_statements", sa.Column("payout_payment_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("monthly_commission_statements", sa.Column("payout_paid_by_label", sa.String(length=255), nullable=True))
    op.add_column("monthly_commission_statements", sa.Column("payout_note", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_monthly_commission_payout_marked_by",
        "monthly_commission_statements",
        "users",
        ["payout_marked_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_monthly_commission_statements_payout_state"),
        "monthly_commission_statements",
        ["payout_state"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_monthly_commission_statements_payout_state"), table_name="monthly_commission_statements")
    op.drop_constraint("fk_monthly_commission_payout_marked_by", "monthly_commission_statements", type_="foreignkey")
    op.drop_column("monthly_commission_statements", "payout_note")
    op.drop_column("monthly_commission_statements", "payout_paid_by_label")
    op.drop_column("monthly_commission_statements", "payout_payment_date")
    op.drop_column("monthly_commission_statements", "payout_marked_by_user_id")
    op.drop_column("monthly_commission_statements", "payout_marked_at")
    op.drop_column("monthly_commission_statements", "payout_state")

    op.execute("DROP INDEX IF EXISTS uq_ledger_barber_sequence")

    op.drop_index(op.f("ix_ledger_entries_reconciliation_status"), table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_record_lifecycle"), table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_business_date"), table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_barber_sequence_index"), table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_barber_daily_summary_id"), table_name="ledger_entries")
    op.drop_constraint("fk_ledger_entries_purged_by_user", "ledger_entries", type_="foreignkey")
    op.drop_constraint("fk_ledger_entries_deleted_by_user", "ledger_entries", type_="foreignkey")
    op.drop_constraint("fk_ledger_entries_barber_daily_summary", "ledger_entries", type_="foreignkey")
    op.drop_column("ledger_entries", "barber_daily_summary_id")
    op.drop_column("ledger_entries", "is_manager_created_without_barber")
    op.drop_column("ledger_entries", "locked_at")
    op.drop_column("ledger_entries", "purge_reason")
    op.drop_column("ledger_entries", "purged_by_user_id")
    op.drop_column("ledger_entries", "purged_at")
    op.drop_column("ledger_entries", "deleted_by_user_id")
    op.drop_column("ledger_entries", "deleted_at")
    op.drop_column("ledger_entries", "record_lifecycle")
    op.drop_column("ledger_entries", "reconciliation_status")
    op.drop_column("ledger_entries", "barber_sequence_index")
    op.drop_column("ledger_entries", "manager_approved_amount")
    op.drop_column("ledger_entries", "original_barber_amount")
    op.drop_column("ledger_entries", "business_date")

    op.drop_index(op.f("ix_app_notifications_user_id"), table_name="app_notifications")
    op.drop_index(op.f("ix_app_notifications_notification_type"), table_name="app_notifications")
    op.drop_index(op.f("ix_app_notifications_entity_type"), table_name="app_notifications")
    op.drop_index(op.f("ix_app_notifications_entity_id"), table_name="app_notifications")
    op.drop_index(op.f("ix_app_notifications_created_at"), table_name="app_notifications")
    op.drop_table("app_notifications")

    op.drop_index(op.f("ix_reconciliation_timeline_events_actor_user_id"), table_name="reconciliation_timeline_events")
    op.drop_index(op.f("ix_reconciliation_timeline_events_summary_id"), table_name="reconciliation_timeline_events")
    op.drop_index(op.f("ix_reconciliation_timeline_events_event_type"), table_name="reconciliation_timeline_events")
    op.drop_index(op.f("ix_reconciliation_timeline_events_created_at"), table_name="reconciliation_timeline_events")
    op.drop_table("reconciliation_timeline_events")

    op.drop_table("barber_sequence_counters")

    op.drop_index(op.f("ix_barber_daily_summaries_status"), table_name="barber_daily_summaries")
    op.drop_index(op.f("ix_barber_daily_summaries_financial_month_id"), table_name="barber_daily_summaries")
    op.drop_index(op.f("ix_barber_daily_summaries_business_date"), table_name="barber_daily_summaries")
    op.drop_index(op.f("ix_barber_daily_summaries_barber_user_id"), table_name="barber_daily_summaries")
    op.drop_table("barber_daily_summaries")
