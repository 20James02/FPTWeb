from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pagefpt.core.errors import DomainError


def compute_sla(start: datetime, calendar: dict, minutes=10) -> datetime:
    zone = ZoneInfo("Asia/Ho_Chi_Minh")
    cursor = start.astimezone(zone)
    weekdays = set(calendar["weekdays"])
    opening, closing = time.fromisoformat(calendar["start"]), time.fromisoformat(calendar["end"])
    if not weekdays or closing <= opening:
        raise DomainError("INVALID_SHIFT", 422)
    remaining = timedelta(minutes=minutes)
    for _ in range(370):
        a = datetime.combine(cursor.date(), opening, zone)
        b = datetime.combine(cursor.date(), closing, zone)
        if cursor.weekday() in weekdays and cursor < b:
            cursor = max(cursor, a)
            available = b - cursor
            if available >= remaining:
                return (cursor + remaining).astimezone(UTC)
            remaining -= available
        cursor = datetime.combine(cursor.date() + timedelta(days=1), time(), zone)
    raise DomainError("INVALID_SHIFT", 422)
