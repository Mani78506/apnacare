from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.services.booking_security_service import refresh_booking_security_artifacts
from app.services.matching_service import find_best_caregiver


VALID_STATUS_FLOW: dict[str, list[str]] = {
    "pending": ["assigned"],
    "assigned": ["accepted"],
    "accepted": ["on_the_way"],
    "on_the_way": ["arrived"],
    "arrived": ["started"],
    "started": ["completed"],
}


def validate_status_transition(current: str, new: str) -> None:
    if new not in VALID_STATUS_FLOW.get(current, []):
        raise HTTPException(status_code=400, detail="Invalid status transition")


def _available_caregiver_query(db: Session):
    return db.query(Caregiver).filter(
        Caregiver.status == "approved",
        Caregiver.is_available.is_(True),
        Caregiver.is_enabled.is_(True),
        Caregiver.forced_offline.is_(False),
    )


def assign_caregiver(db: Session, booking: Booking) -> Caregiver | None:
    caregiver = find_best_caregiver(db, 17.3850, 78.4867)
    if not caregiver:
        caregiver = _available_caregiver_query(db).order_by(Caregiver.id.asc()).first()

    if not caregiver:
        return None

    booking.caregiver_id = caregiver.id
    validate_status_transition(booking.status or "pending", "assigned")
    booking.status = "assigned"
    refresh_booking_security_artifacts(booking)
    caregiver.is_available = False
    return caregiver


def reassign_booking_after_rejection(db: Session, booking: Booking, current_caregiver: Caregiver) -> Caregiver | None:
    current_caregiver.is_available = False
    booking.reassigned_from_caregiver_id = current_caregiver.id

    next_caregiver = (
        _available_caregiver_query(db)
        .filter(Caregiver.id != current_caregiver.id)
        .order_by(Caregiver.rating.desc(), Caregiver.id.asc())
        .first()
    )

    if next_caregiver:
        booking.caregiver_id = next_caregiver.id
        booking.status = "assigned"
        refresh_booking_security_artifacts(booking)
        next_caregiver.is_available = False
        return next_caregiver

    booking.caregiver_id = None
    booking.status = "pending"
    booking.otp = None
    booking.otp_verified = False
    booking.qr_code_path = None
    return None


def resolve_status_path(current: str, requested: str) -> list[str]:
    if requested == "rejected":
        return ["rejected"]

    if current == requested:
        return []

    compatibility_steps: dict[tuple[str, str], list[str]] = {
        ("assigned", "on_the_way"): ["accepted", "on_the_way"],
        ("arrived", "completed"): ["started", "completed"],
    }
    if (current, requested) in compatibility_steps:
        return compatibility_steps[(current, requested)]

    validate_status_transition(current, requested)
    return [requested]
