from datetime import datetime
import logging

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.models.document import Document
from app.models.review import Review
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingOtpVerify
from app.services.assignment_service import validate_coordinates, validate_preferred_gender
from app.schemas.review import ReviewCreate
from app.services.auth_service import decode_access_token
from app.services.assignment_service import reassign_booking_after_rejection
from app.services.document_service import (
    decode_document_payload,
    infer_content_type,
    serialize_document,
    sort_documents,
)
from app.services.booking_fulfillment_service import finalize_booking_assignment
from app.services.face_verification_service import verify_faces
from app.services.notification_service import notify_user
from app.services.pricing_service import calculate_amount, calculate_booking_end_time
from app.services.task_service import ensure_default_tasks

router = APIRouter()
logger = logging.getLogger(__name__)


ACTIVE_BOOKING_STATUSES = ["assigned", "accepted", "on_the_way", "arrived", "started"]


def get_current_user_payload(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    payload["user_id"] = int(user_id)
    return payload


def get_caregiver_context(db: Session, caregiver_id: int | None):
    if not caregiver_id:
        return None, None

    caregiver = db.query(Caregiver).filter(Caregiver.id == caregiver_id).first()
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first() if caregiver else None
    return caregiver, caregiver_user


def serialize_booking(
    booking: Booking,
    patient_user: User | None = None,
    review: Review | None = None,
    caregiver: Caregiver | None = None,
    caregiver_user: User | None = None,
    include_security: bool = False,
):
    public_documents = [
        serialize_document(document)
        for document in sort_documents(list(caregiver.documents or []))
        if document.document_type in {"profile", "id", "certificate"}
    ] if caregiver else []

    return {
        "id": booking.id,
        "user_id": booking.user_id,
        "caregiver_id": booking.caregiver_id,
        "patient_id": booking.patient_id,
        "patient_name": booking.patient_name or (patient_user.name if patient_user else None),
        "patient_age": booking.patient_age,
        "patient_condition": booking.patient_condition,
        "preferred_gender": booking.preferred_gender,
        "user_latitude": booking.user_latitude,
        "user_longitude": booking.user_longitude,
        "assigned_distance_km": booking.assigned_distance_km,
        "assignment_reason": booking.assignment_reason,
        "service_type": booking.service_type,
        "notes": booking.notes,
        "duration_type": booking.duration_type,
        "hours": booking.hours,
        "days": booking.days,
        "months": booking.months,
        "status": booking.status,
        "payment_method": booking.payment_method,
        "otp_verified": booking.otp_verified,
        "face_verified": booking.face_verified,
        "face_verification_status": booking.face_verification_status,
        "manual_override": booking.manual_override,
        "payment_status": booking.payment_status,
        "payment_collected_method": booking.payment_collected_method,
        "amount": booking.amount,
        "start_time": booking.start_time.isoformat() if booking.start_time else None,
        "end_time": booking.end_time.isoformat() if booking.end_time else None,
        "otp": booking.otp if include_security else None,
        "qr_code_path": booking.qr_code_path if include_security else None,
        "prescription_file_name": booking.prescription_file_name,
        "has_prescription": bool(booking.prescription_file_data),
        "caregiver": (
            {
                "id": caregiver.id,
                "full_name": caregiver.full_name,
                "phone": caregiver.phone,
                "email": caregiver_user.email if caregiver_user else None,
                "gender": caregiver.gender,
                "experience": caregiver.experience,
                "skills": [item.strip() for item in (caregiver.skills or "").split(",") if item.strip()],
                "rating": caregiver.rating,
                "is_verified": caregiver.is_verified,
                "distance_km": booking.assigned_distance_km,
                "documents": public_documents,
            }
            if caregiver
            else None
        ),
        "has_review": review is not None,
        "review": (
            {
                "id": review.id,
                "rating": review.rating,
                "comment": review.comment,
                "created_at": review.created_at.isoformat() if review.created_at else None,
            }
            if review
            else None
        ),
    }


@router.post("")
@router.post("/")
@router.post("/create")
def create_booking(
    data: BookingCreate,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    user_id = payload["user_id"]
    payment_method = data.payment_method.strip().lower()
    if payment_method not in {"online", "cash_on_delivery"}:
        raise HTTPException(status_code=400, detail="Invalid payment method")

    start_time = datetime.fromisoformat(f"{data.date}T{data.time}")
    try:
        amount = calculate_amount(data.duration_type, data.hours, data.days, data.months)
        end_time = calculate_booking_end_time(
            start_time,
            data.duration_type,
            data.hours,
            data.days,
            data.months,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    preferred_gender = validate_preferred_gender(data.preferred_gender)
    user_latitude, user_longitude = validate_coordinates(
        data.user_latitude,
        data.user_longitude,
        latitude_label="user_latitude",
        longitude_label="user_longitude",
    )

    booking = Booking(
        user_id=user_id,
        service_type=data.service_type,
        notes=data.notes,
        duration_type=data.duration_type,
        hours=data.hours,
        days=data.days,
        months=data.months,
        amount=amount,
        payment_method=payment_method,
        payment_status="cod_pending" if payment_method == "cash_on_delivery" else "pending",
        patient_id=user_id,
        patient_name=data.patient_name,
        patient_age=data.age,
        patient_condition=data.patient_condition,
        preferred_gender=preferred_gender,
        user_latitude=user_latitude,
        user_longitude=user_longitude,
        start_time=start_time,
        end_time=end_time,
        status="pending",
    )
    if data.prescription:
        booking.prescription_file_name = data.prescription.file_name
        booking.prescription_content_type = infer_content_type(
            data.prescription.file_name,
            data.prescription.content_type,
        )
        booking.prescription_file_data = decode_document_payload(data.prescription.file_data)
    db.add(booking)
    db.flush()

    caregiver = None
    caregiver_user = None
    if payment_method == "cash_on_delivery":
        caregiver, _, caregiver_user = finalize_booking_assignment(db, booking)

    patient_user = db.query(User).filter(User.id == user_id).first()
    if payment_method == "online" and patient_user:
        notify_user(
            db,
            user_id=patient_user.id,
            role="user",
            title="Booking created",
            message=f"Booking #{booking.id} is waiting for payment confirmation before caregiver assignment.",
            type="booking_created",
            email=patient_user.email,
            phone=patient_user.phone,
            recipient_name=patient_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Patient": booking.patient_name or patient_user.name,
                "Service": booking.service_type or "Home care",
                "Payment": "Online",
            },
            email_subject="ApnaCare booking created",
        )
    if payment_method == "cash_on_delivery" and patient_user and not caregiver:
        notify_user(
            db,
            user_id=patient_user.id,
            role="user",
            title="Booking confirmed",
            message=f"Booking #{booking.id} is confirmed for cash on delivery and is waiting for caregiver availability.",
            type="booking_pending_assignment",
            email=patient_user.email,
            phone=patient_user.phone,
            recipient_name=patient_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Patient": booking.patient_name or patient_user.name,
                "Service": booking.service_type or "Home care",
                "Payment": "Cash on delivery",
            },
            email_subject="ApnaCare booking confirmed",
        )
    if patient_user and payment_method == "cash_on_delivery":
        notify_user(
            db,
            user_id=patient_user.id,
            role="user",
            title="Booking created",
            message=f"Booking created successfully for {booking.service_type or 'care service'}.",
            type="booking_created",
            email=patient_user.email,
            phone=patient_user.phone,
            recipient_name=patient_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Patient": booking.patient_name or patient_user.name,
                "Service": booking.service_type or "Home care",
                "Payment": "Cash on delivery",
            },
            email_subject="ApnaCare booking created",
        )
    db.commit()
    db.refresh(booking)

    return {
        "message": (
            "Booking created but no matching caregiver available"
            if payment_method == "cash_on_delivery" and not caregiver and booking.status == "pending"
            else "Booking created successfully"
        ),
        "booking_id": booking.id,
        "status": booking.status,
        "caregiver_id": caregiver.id if caregiver else None,
        "otp": booking.otp,
        "qr_code_path": booking.qr_code_path,
        "service_type": booking.service_type,
        "patient_condition": booking.patient_condition,
        "duration_type": booking.duration_type,
        "hours": booking.hours,
        "days": booking.days,
        "months": booking.months,
        "amount": booking.amount,
        "preferred_gender": booking.preferred_gender,
        "assigned_distance_km": booking.assigned_distance_km,
        "assignment_reason": booking.assignment_reason,
        "payment_method": booking.payment_method,
        "payment_status": booking.payment_status,
        "prescription_file_name": booking.prescription_file_name,
        "has_prescription": bool(booking.prescription_file_data),
        "scheduled_for": start_time.isoformat(),
        "caregiver": (
            {
                "id": caregiver.id,
                "name": caregiver.full_name,
                "phone": caregiver.phone,
                "gender": caregiver.gender,
                "skills": [item.strip() for item in (caregiver.skills or "").split(",") if item.strip()],
                "experience": caregiver.experience,
                "rating": caregiver.rating,
                "distance_km": booking.assigned_distance_km,
                "is_verified": caregiver.is_verified,
            }
            if caregiver
            else None
        ),
        "booking": serialize_booking(
            booking,
            caregiver=caregiver,
            caregiver_user=caregiver_user,
            include_security=True,
        ),
    }


@router.post("/reject/{booking_id}")
def reject_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "caregiver":
        raise HTTPException(status_code=403, detail="Caregiver access required")

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == payload["user_id"]).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver profile not found")

    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.caregiver_id == caregiver.id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status not in ACTIVE_BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail="This booking can no longer be rejected")

    next_caregiver = reassign_booking_after_rejection(db, booking, caregiver)
    if next_caregiver:
        ensure_default_tasks(db, booking.id)

    db.commit()
    db.refresh(booking)
    booking_caregiver, booking_caregiver_user = get_caregiver_context(db, booking.caregiver_id)

    return {
        "message": "Booking reassigned" if next_caregiver else "No alternate caregiver available",
        "booking_id": booking.id,
        "status": booking.status,
        "caregiver_id": booking.caregiver_id,
        "duration_type": booking.duration_type,
        "amount": booking.amount,
        "payment_status": booking.payment_status,
        "assignment_reason": booking.assignment_reason,
        "booking": serialize_booking(
            booking,
            caregiver=booking_caregiver,
            caregiver_user=booking_caregiver_user,
            include_security=True,
        ),
    }


@router.get("/calculate-price")
def calculate_price(
    duration_type: str = Query(...),
    hours: int | None = Query(default=None),
    days: int | None = Query(default=None),
    months: int | None = Query(default=None),
):
    try:
        amount = calculate_amount(duration_type, hours, days, months)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"amount": amount}


@router.get("/mine")
def get_my_bookings(
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") == "caregiver":
        raise HTTPException(status_code=403, detail="Patient access required")

    bookings = (
        db.query(Booking)
        .filter(Booking.user_id == payload["user_id"])
        .order_by(Booking.start_time.desc(), Booking.id.desc())
        .all()
    )
    reviews_by_booking_id = (
        {
            review.booking_id: review
            for review in db.query(Review).filter(
                Review.booking_id.in_([booking.id for booking in bookings])
            ).all()
        }
        if bookings
        else {}
    )

    caregiver_context_by_id = {
        caregiver_id: get_caregiver_context(db, caregiver_id)
        for caregiver_id in {booking.caregiver_id for booking in bookings if booking.caregiver_id}
    }

    return {
        "bookings": [
            serialize_booking(
                booking,
                review=reviews_by_booking_id.get(booking.id),
                caregiver=caregiver_context_by_id.get(booking.caregiver_id, (None, None))[0],
                caregiver_user=caregiver_context_by_id.get(booking.caregiver_id, (None, None))[1],
                include_security=True,
            )
            for booking in bookings
        ],
    }


@router.get("/latest")
def get_latest_booking(
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "caregiver":
        raise HTTPException(status_code=403, detail="Caregiver access required")

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == payload["user_id"]).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver profile not found")

    booking = (
        db.query(Booking)
        .filter(
            Booking.caregiver_id == caregiver.id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
        .order_by(Booking.start_time.desc())
        .first()
    )

    if not booking:
        return {
            "booking": None,
            "caregiver_id": caregiver.id,
        }

    return {
        "caregiver_id": caregiver.id,
        "booking": serialize_booking(
            booking,
            patient_user=db.query(User).filter(User.id == booking.user_id).first(),
        ),
    }


@router.get("/{booking_id}/prescription")
def download_booking_prescription(
    booking_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not booking.prescription_file_data:
        raise HTTPException(status_code=404, detail="Prescription not found")

    role = payload.get("role")
    user_id = payload["user_id"]
    is_patient = role == "user" and booking.user_id == user_id
    is_admin = role == "admin"
    is_caregiver = False
    if role == "caregiver":
        caregiver = db.query(Caregiver).filter(Caregiver.user_id == user_id).first()
        is_caregiver = bool(caregiver and caregiver.id == booking.caregiver_id)

    if not (is_patient or is_admin or is_caregiver):
        raise HTTPException(status_code=403, detail="Access denied")

    file_name = booking.prescription_file_name or f"booking-{booking.id}-prescription"
    headers = {"Content-Disposition": f'inline; filename="{file_name}"'}
    return Response(
        content=booking.prescription_file_data,
        media_type=booking.prescription_content_type or "application/octet-stream",
        headers=headers,
    )


@router.post("/verify-otp")
def verify_booking_otp(
    data: BookingOtpVerify,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "caregiver":
        raise HTTPException(status_code=403, detail="Caregiver access required")

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == payload["user_id"]).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver profile not found")

    booking = (
        db.query(Booking)
        .filter(Booking.id == data.booking_id, Booking.caregiver_id == caregiver.id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != "arrived":
        raise HTTPException(status_code=400, detail="OTP can only be verified after arrival")
    if booking.otp_verified:
        return {
            "message": "OTP verified successfully",
            "booking_id": booking.id,
            "otp_verified": True,
            "next_step": "face_verification_required",
            "face_verification_status": booking.face_verification_status,
        }
    if booking.otp != data.entered_otp.strip():
        raise HTTPException(status_code=400, detail="Invalid OTP")

    booking.otp_verified = True
    booking.face_verified = False
    booking.face_verification_status = "pending"
    booking.manual_override = False
    db.commit()
    db.refresh(booking)

    patient_user = db.query(User).filter(User.id == booking.user_id).first()
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first()
    if patient_user:
        notify_user(
            db,
            user_id=patient_user.id,
            role="user",
            title="OTP verified",
            message=f"Booking #{booking.id} OTP has been verified. Face verification is required before care can start.",
            type="otp_verified",
            email=patient_user.email,
            phone=patient_user.phone,
            recipient_name=patient_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Caregiver": caregiver.full_name or caregiver_user.name if caregiver_user else "Assigned caregiver",
                "Status": "OTP verified",
            },
            email_subject="ApnaCare service started",
        )
    if caregiver_user:
        notify_user(
            db,
            user_id=caregiver_user.id,
            role="caregiver",
            title="OTP verified",
            message=f"Booking #{booking.id} OTP is verified. Complete face verification before starting service.",
            type="otp_verified",
            email=caregiver_user.email,
            phone=caregiver.phone,
            recipient_name=caregiver.full_name or caregiver_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Patient": patient_user.name if patient_user else "Patient",
                "Status": "Face verification required",
            },
            email_subject="ApnaCare OTP verified",
        )
    db.commit()

    return {
        "message": "OTP verified successfully",
        "booking_id": booking.id,
        "otp_verified": True,
        "next_step": "face_verification_required",
        "face_verification_status": booking.face_verification_status,
    }


@router.post("/face-verify/{booking_id}")
async def verify_booking_face(
    booking_id: int,
    selfie: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "caregiver":
        raise HTTPException(status_code=403, detail="Caregiver access required")

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == payload["user_id"]).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver profile not found")

    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.caregiver_id == caregiver.id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not booking.otp_verified:
        raise HTTPException(status_code=400, detail="OTP must be verified before face verification")

    profile_photo = (
        db.query(Document)
        .filter(
            Document.caregiver_id == booking.caregiver_id,
            Document.document_type.in_(["profile_photo", "profile"]),
        )
        .order_by(Document.id.asc())
        .first()
    )
    if not profile_photo:
        raise HTTPException(status_code=400, detail="Caregiver profile photo not found")

    selfie_bytes = await selfie.read()
    if not selfie_bytes:
        raise HTTPException(status_code=400, detail="Arrival selfie is required")

    arrival_selfie = Document(
        caregiver_id=booking.caregiver_id,
        document_type="arrival_selfie",
        file_name=selfie.filename or f"arrival-selfie-{booking.id}.jpg",
        content_type=selfie.content_type or "application/octet-stream",
        file_data=selfie_bytes,
    )
    db.add(arrival_selfie)
    db.flush()

    result = verify_faces(profile_photo.file_data, selfie_bytes)
    logger.info(
        "Face verify booking_id=%s caregiver_id=%s verified=%s status_before=%s",
        booking.id,
        booking.caregiver_id,
        result.get("verified"),
        booking.face_verification_status,
    )
    booking.arrival_selfie_id = arrival_selfie.id
    booking.face_verified = bool(result["verified"])
    booking.face_verification_status = "matched" if result["verified"] else "failed"

    if result["verified"]:
        booking.manual_override = False

    db.commit()

    return {
        "verified": bool(result["verified"]),
        "face_verification_status": booking.face_verification_status,
        "distance": result.get("distance"),
        "threshold": result.get("threshold"),
        "message": result["message"],
    }


@router.post("/review")
def submit_review(
    data: ReviewCreate,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="Patient access required")

    booking = (
        db.query(Booking)
        .filter(Booking.id == data.booking_id, Booking.user_id == payload["user_id"])
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed bookings can be reviewed")
    if not booking.caregiver_id:
        raise HTTPException(status_code=400, detail="This booking has no caregiver to review")

    review = db.query(Review).filter(Review.booking_id == booking.id).first()
    if not review:
        review = Review(
            booking_id=booking.id,
            user_id=payload["user_id"],
            caregiver_id=booking.caregiver_id,
        )
        db.add(review)

    review.rating = data.rating
    review.comment = data.comment
    db.commit()
    db.refresh(review)

    caregiver_reviews = db.query(Review).filter(Review.caregiver_id == booking.caregiver_id).all()
    caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first()
    if caregiver and caregiver_reviews:
        caregiver.rating = round(
            sum(item.rating for item in caregiver_reviews) / len(caregiver_reviews),
            2,
        )
        db.commit()

    return {
        "message": "Review submitted",
        "review": {
            "id": review.id,
            "booking_id": review.booking_id,
            "rating": review.rating,
            "comment": review.comment,
            "created_at": review.created_at.isoformat() if review.created_at else None,
        },
    }
