"""Calendar-date helpers aligned with the repository deadline rules."""

from __future__ import annotations

import calendar
import re
from datetime import date, timedelta
from typing import Any

STATUS_OK = "OK"
STATUS_WINDOW = "Notice window open"
STATUS_MISSED = "Notice missed – will auto-renew"
STATUS_EXPIRED = "Expired"
STATUS_REVIEW = "Needs review"

_TODAY = re.compile(r"\{\{TODAY([+-]\d+)\}\}")
_START = re.compile(r"\{\{START:(-?\d+):(\d+)\}\}")
_Q1 = re.compile(r"\{\{Q1:(\d{2}-\d{2})\}\}")
_Q1_START = re.compile(r"\{\{Q1START:(\d{2}-\d{2}):(\d+)\}\}")
_ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")


def shift_months(day: date, months: int) -> date:
    """Move by calendar months and clamp the day to the destination month."""
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last))


def _q1_day(today: date, month_day: str) -> date:
    month_text, day_text = month_day.split("-", 1)
    month = int(month_text)
    day = int(day_text)
    resolved = date(today.year, month, day)
    if resolved < today:
        resolved = date(today.year + 1, month, day)
    return resolved


def resolve_relative_dates(text: str, today: date) -> str:
    """Replace synthetic date tokens. Unrecognised text is left unchanged."""

    def today_repl(match: re.Match[str]) -> str:
        return (today + timedelta(days=int(match.group(1)))).isoformat()

    def start_repl(match: re.Match[str]) -> str:
        anchor = today + timedelta(days=int(match.group(1)))
        return shift_months(anchor, -int(match.group(2))).isoformat()

    def q1_repl(match: re.Match[str]) -> str:
        return _q1_day(today, match.group(1)).isoformat()

    def q1_start_repl(match: re.Match[str]) -> str:
        anchor = _q1_day(today, match.group(1))
        return shift_months(anchor, -int(match.group(2))).isoformat()

    text = _TODAY.sub(today_repl, text)
    text = _START.sub(start_repl, text)
    text = _Q1.sub(q1_repl, text)
    return _Q1_START.sub(q1_start_repl, text)


def resolve_value(value: Any, today: date) -> Any:
    if isinstance(value, str):
        return resolve_relative_dates(value, today)
    if isinstance(value, list):
        return [resolve_value(item, today) for item in value]
    if isinstance(value, dict):
        return {key: resolve_value(item, today) for key, item in value.items()}
    return value


def parse_iso_day(value: object) -> date | None:
    if not isinstance(value, str) or not _ISO_DAY.fullmatch(value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def deadlines(extraction: dict[str, Any], today: date) -> dict[str, Any]:
    """Same status order as the dashboard deadline engine."""
    end = parse_iso_day(extraction.get("endDate"))
    notice_days = extraction.get("noticePeriodDays")
    auto_renew = extraction.get("autoRenew")
    notice: date | None = None
    if end is not None and isinstance(notice_days, int) and not isinstance(notice_days, bool):
        notice = end - timedelta(days=notice_days)
    days_to_renew = (end - today).days if end is not None else None
    days_to_notice = (notice - today).days if notice is not None else None
    if days_to_renew is None or auto_renew is None or not isinstance(notice_days, int) or isinstance(notice_days, bool):
        status = STATUS_REVIEW
    elif days_to_renew < 0:
        status = STATUS_EXPIRED
    elif auto_renew is True and days_to_notice is not None and days_to_notice < 0:
        status = STATUS_MISSED
    elif auto_renew is True and days_to_notice is not None and days_to_notice <= 60:
        status = STATUS_WINDOW
    else:
        status = STATUS_OK
    trap = (
        auto_renew is True
        and days_to_renew is not None
        and days_to_renew >= 0
        and days_to_notice is not None
        and days_to_notice < 30
    )
    return {
        "notice_deadline": notice.isoformat() if notice else None,
        "days_to_notice": days_to_notice,
        "days_to_renew": days_to_renew,
        "renewal_status": status,
        "auto_renew_trap": trap,
    }
