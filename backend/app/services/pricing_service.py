import calendar
from datetime import datetime, timedelta


HOURLY_RATE = 200
DAILY_RATE = 1200
MONTHLY_RATE = 20000


def calculate_amount(
    duration_type: str,
    hours: int | None,
    days: int | None,
    months: int | None,
) -> float:
    if duration_type == "hourly":
        if not hours or hours <= 0:
            raise ValueError("Invalid hours")
        return float(hours * HOURLY_RATE)

    if duration_type == "daily":
        if not days or days <= 0:
            raise ValueError("Invalid days")
        return float(days * DAILY_RATE)

    if duration_type == "monthly":
        if not months or months <= 0:
            raise ValueError("Invalid months")
        return float(months * MONTHLY_RATE)

    raise ValueError("Invalid duration type")


def calculate_booking_end_time(
    start_time: datetime,
    duration_type: str,
    hours: int | None,
    days: int | None,
    months: int | None,
) -> datetime:
    if duration_type == "hourly":
        if not hours or hours <= 0:
            raise ValueError("Invalid hours")
        return start_time + timedelta(hours=hours)

    if duration_type == "daily":
        if not days or days <= 0:
            raise ValueError("Invalid days")
        return start_time + timedelta(days=days)

    if duration_type == "monthly":
        if not months or months <= 0:
            raise ValueError("Invalid months")
        total_months = (start_time.month - 1) + months
        year = start_time.year + (total_months // 12)
        month = (total_months % 12) + 1
        day = min(start_time.day, calendar.monthrange(year, month)[1])
        return start_time.replace(year=year, month=month, day=day)

    raise ValueError("Invalid duration type")
