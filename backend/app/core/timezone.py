from datetime import datetime, timezone
from zoneinfo import ZoneInfo

DUSHANBE_TZ = ZoneInfo("Asia/Dushanbe")


def now_dushanbe() -> datetime:
    """Return current timezone-aware datetime in Asia/Dushanbe (UTC+5)."""
    return datetime.now(DUSHANBE_TZ)


def to_dushanbe(dt: datetime) -> datetime:
    """Normalize any datetime to Asia/Dushanbe (UTC+5)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=DUSHANBE_TZ)
    return dt.astimezone(DUSHANBE_TZ)


def to_utc(dt: datetime) -> datetime:
    """Normalize any datetime to UTC for storage."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=DUSHANBE_TZ).astimezone(timezone.utc)
    return dt.astimezone(timezone.utc)
