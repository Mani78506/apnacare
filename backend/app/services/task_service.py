from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.task import Task


DEFAULT_TASK_NAMES = [
    "Give Medicine",
    "Check Vitals",
    "Assist Walking",
    "Provide Support",
]


def _normalize_task_name(value: str) -> str:
    cleaned = " ".join((value or "").replace("\r", " ").replace("\n", " ").split()).strip(" ,.;:-")
    if not cleaned:
        return ""
    if len(cleaned) > 120:
        cleaned = cleaned[:117].rstrip(" ,.;:-") + "..."
    return cleaned[0].upper() + cleaned[1:]


def _extract_note_tasks(notes: str | None) -> list[str]:
    if not notes:
        return []

    normalized_notes = notes.replace("\r\n", "\n").replace("\r", "\n")
    if "\n" in normalized_notes:
        raw_items = [part for part in normalized_notes.split("\n") if part.strip()]
    else:
        raw_items = []
        for chunk in normalized_notes.split("."):
            raw_items.extend(segment for segment in chunk.split(";") if segment.strip())

    tasks: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        cleaned = item.strip()
        cleaned = cleaned.lstrip("-*0123456789.) ").strip()
        normalized = _normalize_task_name(cleaned)
        if not normalized:
            continue

        key = normalized.casefold()
        if key in seen:
            continue

        seen.add(key)
        tasks.append(normalized)

    return tasks


def ensure_default_tasks(db: Session, booking_id: int) -> list[Task]:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise ValueError("Booking not found")

    existing_tasks = db.query(Task).filter(Task.booking_id == booking_id).all()
    if existing_tasks:
        return existing_tasks

    created_tasks: list[Task] = []
    note_tasks = _extract_note_tasks(booking.notes)
    selected_task_names = note_tasks.copy()
    existing_names = {task_name.casefold() for task_name in selected_task_names}

    for name in DEFAULT_TASK_NAMES:
        if name.casefold() in existing_names:
            continue
        selected_task_names.append(name)
        existing_names.add(name.casefold())

    for name in selected_task_names:
        task = Task(
            booking_id=booking_id,
            name=name,
            completed=False,
            completed_at=None,
        )
        db.add(task)
        created_tasks.append(task)

    db.flush()
    return created_tasks
