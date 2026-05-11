"""Business calendar helpers (shop timezone, barber edit cutoff)."""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from app.core.config import settings


def shop_tz() -> ZoneInfo:
    return ZoneInfo(settings.business_timezone)


def business_date_for_instant(occurred_at: datetime) -> date:
    """Calendar date in the configured business timezone."""
    return occurred_at.astimezone(shop_tz()).date()


def barber_may_edit_entry(*, business_date: date, now: datetime) -> bool:
    """Barbers may not edit records after 21:00 local on the entry's business day."""
    tz = shop_tz()
    cutoff = datetime.combine(business_date, time(21, 0), tzinfo=tz)
    return now.astimezone(tz) < cutoff
