from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.task import Task


DEFAULT_TASK_NAMES = [
    "Give Medicine",
    "Check Vitals",
    "Assist Walking",
    "Provide Support",
]

CARE_OPTIONS = {
    "elderly_care": [
        {"value": "medicine_reminder", "label": "Medicine Reminder"},
        {"value": "walking_support", "label": "Walking Support"},
        {"value": "meal_assistance", "label": "Meal Assistance"},
        {"value": "companionship", "label": "Companionship"},
        {"value": "bathroom_assistance", "label": "Bathroom Assistance"},
        {"value": "other", "label": "Other"},
    ],
    "patient_care": [
        {"value": "vitals_check", "label": "Vitals Check"},
        {"value": "injection_support", "label": "Injection Support"},
        {"value": "wound_care", "label": "Wound Care"},
        {"value": "medicine_assistance", "label": "Medicine Assistance"},
        {"value": "doctor_followup", "label": "Doctor Follow-up"},
        {"value": "other", "label": "Other"},
    ],
    "bedridden_care": [
        {"value": "position_change", "label": "Position Change"},
        {"value": "bedsore_prevention", "label": "Bedsore Prevention"},
        {"value": "feeding_support", "label": "Feeding Support"},
        {"value": "hygiene_support", "label": "Hygiene Support"},
        {"value": "mobility_assistance", "label": "Mobility Assistance"},
        {"value": "other", "label": "Other"},
    ],
}

CARE_TYPE_LABELS = {
    "elderly_care": "Elderly Care",
    "patient_care": "Patient Care",
    "bedridden_care": "Bedridden Care",
}

CARE_TASK_LABELS = {
    option["value"]: option["label"]
    for options in CARE_OPTIONS.values()
    for option in options
}


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


def build_care_notes(care_type: str | None, selected_care_tasks: list[str] | None, custom_care_details: str | None) -> str:
    care_label = CARE_TYPE_LABELS.get(care_type or "", _normalize_task_name((care_type or "").replace("_", " ")))
    task_labels = [
        CARE_TASK_LABELS.get(task, _normalize_task_name(task.replace("_", " ")))
        for task in (selected_care_tasks or [])
        if task and task != "other"
    ]
    if not task_labels and not (custom_care_details or "").strip():
        return ""

    parts: list[str] = []
    if care_label:
        parts.append(f"{care_label}: {', '.join(task_labels)}" if task_labels else care_label)
    elif task_labels:
        parts.append(", ".join(task_labels))

    details = (custom_care_details or "").strip()
    if details:
        parts.append(f"Additional details: {details}")

    return ". ".join(parts)


def _extract_structured_tasks(booking: Booking) -> list[str]:
    selected_tasks = booking.selected_care_tasks if isinstance(booking.selected_care_tasks, list) else []
    task_names: list[str] = []
    seen: set[str] = set()

    for task_value in selected_tasks:
        if not isinstance(task_value, str) or task_value == "other":
            continue
        task_name = _normalize_task_name(CARE_TASK_LABELS.get(task_value, task_value.replace("_", " ")))
        if not task_name or task_name.casefold() in seen:
            continue
        task_names.append(task_name)
        seen.add(task_name.casefold())

    custom_details = (booking.custom_care_details or "").strip()
    if "other" in selected_tasks and custom_details:
        custom_task = _normalize_task_name(custom_details)
        if custom_task and custom_task.casefold() not in seen:
            task_names.append(custom_task)

    return task_names


def ensure_default_tasks(db: Session, booking_id: int) -> list[Task]:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise ValueError("Booking not found")

    existing_tasks = db.query(Task).filter(Task.booking_id == booking_id).all()
    if existing_tasks:
        return existing_tasks

    created_tasks: list[Task] = []
    structured_tasks = _extract_structured_tasks(booking)
    note_tasks = _extract_note_tasks(booking.notes)
    selected_task_names = structured_tasks or note_tasks.copy()
    existing_names = {task_name.casefold() for task_name in selected_task_names}

    if not structured_tasks:
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
