from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.models.review import Review
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingOtpVerify
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
from app.services.notification_service import create_notification
from app.services.pricing_service import calculate_amount, calculate_booking_end_time
from app.services.task_service import ensure_default_tasks

router = APIRouter()


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
        "service_type": booking.service_type,
        "notes": booking.notes,
        "duration_type": booking.duration_type,
        "hours": booking.hours,
        "days": booking.days,
        "months": booking.months,
        "status": booking.status,
        "payment_method": booking.payment_method,
        "otp_verified": booking.otp_verified,
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
                "experience": caregiver.experience,
                "skills": [item.strip() for item in (caregiver.skills or "").split(",") if item.strip()],
                "rating": caregiver.rating,
                "is_verified": caregiver.is_verified,
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
        create_notification(
            db,
            user_id=patient_user.id,
            role="user",
            title="Booking created",
            message=f"Booking #{booking.id} is waiting for payment confirmation before caregiver assignment.",
            type="booking_created",
        )
    if payment_method == "cash_on_delivery" and patient_user and not caregiver:
        create_notification(
            db,
            user_id=patient_user.id,
            role="user",
            title="Booking confirmed",
            message=f"Booking #{booking.id} is confirmed for cash on delivery and is waiting for caregiver availability.",
            type="booking_pending_assignment",
        )
    db.commit()
    db.refresh(booking)

    return {
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
        "payment_method": booking.payment_method,
        "payment_status": booking.payment_status,
        "prescription_file_name": booking.prescription_file_name,
        "has_prescription": bool(booking.prescription_file_data),
        "scheduled_for": start_time.isoformat(),
        "caregiver": (
            {
                "name": caregiver.full_name,
                "phone": caregiver.phone,
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
        "message": "Booking reassigned" if next_caregiver else "Booking moved back to pending",
        "booking_id": booking.id,
        "status": booking.status,
        "caregiver_id": booking.caregiver_id,
        "duration_type": booking.duration_type,
        "amount": booking.amount,
        "payment_status": booking.payment_status,
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
        return {"message": "Verified successfully", "booking_id": booking.id, "status": booking.status}
    if booking.otp != data.entered_otp.strip():
        raise HTTPException(status_code=400, detail="Invalid OTP")

    booking.otp_verified = True
    booking.status = "started"
    db.commit()
    db.refresh(booking)

    patient_user = db.query(User).filter(User.id == booking.user_id).first()
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first()
    if patient_user:
        create_notification(
            db,
            user_id=patient_user.id,
            role="user",
            title="OTP verified",
            message=f"Booking #{booking.id} OTP has been verified. Caregiver service has started.",
            type="otp_verified",
        )
    if caregiver_user:
        create_notification(
            db,
            user_id=caregiver_user.id,
            role="caregiver",
            title="OTP verified",
            message=f"Booking #{booking.id} is verified. You can now begin service.",
            type="otp_verified",
        )
    db.commit()

    return {"message": "Verified successfully", "booking_id": booking.id, "status": booking.status}


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
