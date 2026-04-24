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


def validate_status_transition(current: str, new: str) -> None:
    if new not in VALID_STATUS_FLOW.get(current, []):
        raise HTTPException(status_code=400, detail="Invalid status transition")


def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    if geodesic is not None:
        return float(geodesic((lat1, lon1), (lat2, lon2)).km)

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


def _available_caregiver_query(db: Session):
    return db.query(Caregiver).filter(
        Caregiver.status == "approved",
        Caregiver.is_available.is_(True),
        Caregiver.is_enabled.is_(True),
        Caregiver.forced_offline.is_(False),
        Caregiver.is_verified.is_(True),
    )


def _build_assignment_reason(
    booking: Booking,
    caregiver: Caregiver,
    skill_score: int,
    distance_km: float | None,
) -> str:
    reason_parts = ["approved", "available"]
    if booking.preferred_gender and booking.preferred_gender != "any":
        reason_parts.append(f"{booking.preferred_gender} preference")
    if skill_score > 0:
        if booking.service_type:
            reason_parts.append(f"service match for {booking.service_type.replace('_', ' ')}")
        if booking.patient_condition:
            reason_parts.append(f"condition match for {booking.patient_condition.replace('_', ' ')}")
    if distance_km is not None:
        reason_parts.append(f"nearest distance at {distance_km:.1f} km")
    else:
        reason_parts.append(f"rating fallback {round(caregiver.rating or 0, 1):.1f}")

    return "Assigned based on " + ", ".join(reason_parts) + "."


def assign_best_caregiver(db: Session, booking: Booking, excluded_caregiver_ids: set[int] | None = None) -> Caregiver | None:
    excluded_caregiver_ids = excluded_caregiver_ids or set()

    query = _available_caregiver_query(db)
    if booking.preferred_gender and booking.preferred_gender != "any":
        query = query.filter(Caregiver.gender == booking.preferred_gender)
    if excluded_caregiver_ids:
        query = query.filter(~Caregiver.id.in_(excluded_caregiver_ids))

    candidates = query.all()
    if not candidates:
        booking.caregiver_id = None
        booking.status = "pending"
        booking.assigned_distance_km = None
        booking.assignment_reason = "No caregiver matched the current approval, availability, skill, gender, and distance filters."
        return None

    has_user_coordinates = booking.user_latitude is not None and booking.user_longitude is not None

    ranked: list[tuple[float, float, int, int, Caregiver, float | None]] = []
    fallback_ranked: list[tuple[float, float, int, Caregiver]] = []

    for caregiver in candidates:
        skill_score = _skill_match_score(caregiver, booking)
        rating = float(caregiver.rating or 0)

        if has_user_coordinates and caregiver.latitude is not None and caregiver.longitude is not None:
            distance_km = calculate_distance_km(
                float(booking.user_latitude),
                float(booking.user_longitude),
                float(caregiver.latitude),
                float(caregiver.longitude),
            )
            score = distance_km - (rating * 0.2) - (skill_score * 0.5)
            ranked.append((score, distance_km, -skill_score, -rating, caregiver, distance_km))
        else:
            fallback_score = -(skill_score * 0.5) - (rating * 0.2)
            fallback_ranked.append((fallback_score, -rating, -skill_score, caregiver))

    selected: Caregiver | None = None
    selected_distance: float | None = None
    selected_skill_score = 0

    if ranked:
        ranked.sort(key=lambda item: (item[0], item[1], item[2], item[3], item[4].id))
        _, _, _, _, selected, selected_distance = ranked[0]
        selected_skill_score = _skill_match_score(selected, booking)
    elif fallback_ranked:
        fallback_ranked.sort(key=lambda item: (item[0], item[1], item[2], item[3].id))
        _, _, _, selected = fallback_ranked[0]
        selected_distance = None
        selected_skill_score = _skill_match_score(selected, booking)

    if not selected:
        booking.caregiver_id = None
        booking.status = "pending"
        booking.assigned_distance_km = None
        booking.assignment_reason = "No caregiver matched the current approval, availability, skill, gender, and distance filters."
        return None

    booking.caregiver_id = selected.id
    validate_status_transition(booking.status or "pending", "assigned")
    booking.status = "assigned"
    booking.assigned_distance_km = round(selected_distance, 2) if selected_distance is not None else None
    booking.assignment_reason = _build_assignment_reason(booking, selected, selected_skill_score, booking.assigned_distance_km)
    refresh_booking_security_artifacts(booking)
    selected.is_available = False
    return selected


def assign_caregiver(db: Session, booking: Booking) -> Caregiver | None:
    return assign_best_caregiver(db, booking)


def reassign_booking_after_rejection(db: Session, booking: Booking, current_caregiver: Caregiver) -> Caregiver | None:
    booking.reassigned_from_caregiver_id = current_caregiver.id
    current_caregiver.is_available = current_caregiver.is_enabled and not current_caregiver.forced_offline

    next_caregiver = assign_best_caregiver(db, booking, excluded_caregiver_ids={current_caregiver.id})
    if next_caregiver:
        return next_caregiver

    booking.caregiver_id = None
    booking.status = "pending"
    booking.assigned_distance_km = None
    booking.assignment_reason = "No alternate caregiver available after rejection."
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
