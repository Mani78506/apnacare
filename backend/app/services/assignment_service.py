import math

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.services.booking_security_service import refresh_booking_security_artifacts

try:
    from geopy.distance import geodesic
except Exception:  # pragma: no cover - fallback path
    geodesic = None


VALID_STATUS_FLOW: dict[str, list[str]] = {
    "pending": ["assigned"],
    "assigned": ["accepted"],
    "accepted": ["on_the_way"],
    "on_the_way": ["arrived"],
    "arrived": ["started"],
    "started": ["completed"],
}

ACTIVE_BOOKING_STATUSES = {"assigned", "accepted", "on_the_way", "arrived", "started"}


def validate_preferred_gender(value: str | None) -> str:
    normalized = (value or "any").strip().lower()
    if normalized not in {"any", "male", "female"}:
        raise HTTPException(status_code=400, detail="preferred_gender must be one of: any, male, female")
    return normalized


def validate_caregiver_gender(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    normalized = value.strip().lower()
    if normalized not in {"male", "female", "other"}:
        raise HTTPException(status_code=400, detail="caregiver.gender must be one of: male, female, other")
    return normalized


def validate_coordinates(latitude: float | None, longitude: float | None, *, latitude_label: str = "latitude", longitude_label: str = "longitude") -> tuple[float | None, float | None]:
    if latitude is None and longitude is None:
        return None, None
    if latitude is None or longitude is None:
        raise HTTPException(status_code=400, detail=f"{latitude_label} and {longitude_label} must be provided together")
    if latitude < -90 or latitude > 90:
        raise HTTPException(status_code=400, detail=f"{latitude_label} must be between -90 and 90")
    if longitude < -180 or longitude > 180:
        raise HTTPException(status_code=400, detail=f"{longitude_label} must be between -180 and 180")
    return float(latitude), float(longitude)


def validate_search_radius_km(value: float | None) -> float:
    radius = float(value if value is not None else 10)
    if radius <= 0 or radius > 50:
        raise HTTPException(status_code=400, detail="search_radius_km must be greater than 0 and less than or equal to 50")
    return radius


def validate_status_transition(current: str, new: str) -> None:
    if new not in VALID_STATUS_FLOW.get(current, []):
        raise HTTPException(status_code=400, detail="Invalid status transition")


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c


def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    if geodesic is not None:
        return float(geodesic((lat1, lon1), (lat2, lon2)).km)
    return haversine_distance_km(lat1, lon1, lat2, lon2)


def _split_skill_tags(value: str | None) -> set[str]:
    return {
        item.strip().lower().replace("-", " ").replace("_", " ")
        for item in (value or "").split(",")
        if item.strip()
    }


def _normalize_skill_value(value: str | None) -> str:
    return (value or "").strip().lower().replace("-", " ").replace("_", " ")


def _skill_match_score(caregiver: Caregiver, booking: Booking) -> int:
    caregiver_skills = _split_skill_tags(caregiver.skills)
    if not caregiver_skills:
        return 0

    score = 0
    for lookup in (booking.service_type, booking.patient_condition):
        normalized_lookup = _normalize_skill_value(lookup)
        if not normalized_lookup:
            continue
        if normalized_lookup in caregiver_skills:
            score += 2
        elif any(normalized_lookup in skill or skill in normalized_lookup for skill in caregiver_skills):
            score += 1
    return score


def _caregiver_has_active_booking(db: Session, caregiver_id: int) -> bool:
    return (
        db.query(Booking)
        .filter(
            Booking.caregiver_id == caregiver_id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
        .first()
        is not None
    )


def _available_caregiver_query(db: Session):
    return db.query(Caregiver).filter(
        Caregiver.status == "approved",
        Caregiver.is_available.is_(True),
        Caregiver.is_enabled.is_(True),
        Caregiver.forced_offline.is_(False),
        Caregiver.is_verified.is_(True),
    )


def _reset_pending_assignment(booking: Booking, message: str) -> None:
    booking.caregiver_id = None
    booking.status = "pending"
    booking.assigned_distance_km = None
    booking.assignment_reason = message


def find_best_caregiver(db: Session, booking: Booking, excluded_caregiver_ids: set[int] | None = None) -> Caregiver | None:
    excluded_caregiver_ids = excluded_caregiver_ids or set()
    if booking.user_latitude is None or booking.user_longitude is None:
        _reset_pending_assignment(booking, "Location required for smart caregiver assignment.")
        return None

    radius_km = validate_search_radius_km(booking.search_radius_km)
    booking.search_radius_km = radius_km

    query = _available_caregiver_query(db).filter(
        Caregiver.latitude.is_not(None),
        Caregiver.longitude.is_not(None),
    )
    if booking.preferred_gender and booking.preferred_gender != "any":
        query = query.filter(Caregiver.gender == booking.preferred_gender)
    if excluded_caregiver_ids:
        query = query.filter(~Caregiver.id.in_(excluded_caregiver_ids))

    candidates = query.all()
    ranked: list[tuple[float, float, float, float, int, Caregiver]] = []

    for caregiver in candidates:
        if _caregiver_has_active_booking(db, caregiver.id):
            continue

        distance_km = calculate_distance_km(
            float(booking.user_latitude),
            float(booking.user_longitude),
            float(caregiver.latitude),
            float(caregiver.longitude),
        )
        if distance_km > radius_km:
            continue

        rating = float(caregiver.rating or 0)
        experience = float(caregiver.experience or 0)
        skill_score = _skill_match_score(caregiver, booking)
        ranked.append((distance_km, -rating, -experience, -skill_score, caregiver.id, caregiver))

    if not ranked:
        _reset_pending_assignment(booking, "No available caregiver found within selected range.")
        return None

    ranked.sort(key=lambda item: item[:5])
    distance_km, _, _, _, _, selected = ranked[0]
    booking.caregiver_id = selected.id
    validate_status_transition(booking.status or "pending", "assigned")
    booking.status = "assigned"
    booking.assigned_distance_km = round(distance_km, 2)
    booking.assignment_reason = "Assigned based on availability, location range, rating, and experience."
    refresh_booking_security_artifacts(booking)
    selected.is_available = False
    return selected


def assign_best_caregiver(db: Session, booking: Booking, excluded_caregiver_ids: set[int] | None = None) -> Caregiver | None:
    return find_best_caregiver(db, booking, excluded_caregiver_ids)


def assign_caregiver(db: Session, booking: Booking) -> Caregiver | None:
    return find_best_caregiver(db, booking)


def reassign_booking_after_rejection(db: Session, booking: Booking, current_caregiver: Caregiver) -> Caregiver | None:
    booking.reassigned_from_caregiver_id = current_caregiver.id
    current_caregiver.is_available = current_caregiver.is_enabled and not current_caregiver.forced_offline

    next_caregiver = find_best_caregiver(db, booking, excluded_caregiver_ids={current_caregiver.id})
    if next_caregiver:
        return next_caregiver

    _reset_pending_assignment(booking, "No available caregiver found in your selected range")
    booking.otp = None
    booking.otp_verified = False
    booking.face_verified = False
    booking.face_verification_status = "pending"
    booking.arrival_selfie_id = None
    booking.manual_override = False
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
