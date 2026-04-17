import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.models.location import Location
from app.models.notification import Notification
from app.models.payment_transaction import PaymentTransaction
from app.models.review import Review
from app.models.user import User
from app.schemas.caregiver import CaregiverAvailabilityUpdate, CaregiverLocationUpdate, CaregiverStatusUpdate
from app.services.assignment_service import reassign_booking_after_rejection, resolve_status_path, validate_status_transition
from app.services.auth_service import decode_access_token, hash_password
from app.services.document_service import get_primary_document, serialize_document, sort_documents
from app.services.notification_service import create_notification
from app.services.websocket_manager import manager

router = APIRouter()


def get_expected_caregiver_amount(booking: Booking) -> float:
    return round((booking.amount or 0) * 0.8, 2)


def resolve_booking_earning(booking: Booking, transaction: PaymentTransaction | None) -> float:
    if transaction and transaction.caregiver_amount is not None:
        return round(transaction.caregiver_amount, 2)
    return get_expected_caregiver_amount(booking)


def resolve_booking_paid_at(booking: Booking, transaction: PaymentTransaction | None):
    if transaction and transaction.paid_at:
        return transaction.paid_at
    if booking.payment_status == "paid":
        return booking.end_time or booking.start_time
    return None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


ACTIVE_BOOKING_STATUSES = ["assigned", "accepted", "on_the_way", "arrived", "started"]


def caregiver_has_active_booking(db: Session, caregiver_id: int) -> bool:
    return (
        db.query(Booking)
        .filter(
            Booking.caregiver_id == caregiver_id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
        .first()
        is not None
    )


def get_current_caregiver(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

    if payload.get("role") != "caregiver":
        raise HTTPException(status_code=403, detail="Caregiver access required")

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == int(payload["user_id"])).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver profile not found")

    return caregiver


def serialize_caregiver(caregiver: Caregiver, user: User | None = None):
    documents = sort_documents(list(caregiver.documents or []))
    primary_document = get_primary_document(documents)
    return {
        "id": caregiver.id,
        "user_id": caregiver.user_id,
        "full_name": caregiver.full_name,
        "phone": caregiver.phone,
        "email": user.email if user else None,
        "location": caregiver.location,
        "skills": [item.strip() for item in (caregiver.skills or "").split(",") if item.strip()],
        "experience": caregiver.experience,
        "status": caregiver.status,
        "is_available": caregiver.is_available,
        "is_enabled": caregiver.is_enabled,
        "forced_offline": caregiver.forced_offline,
        "is_verified": caregiver.is_verified,
        "document_name": primary_document.file_name if primary_document else caregiver.document_name,
        "document_uploaded": bool(documents) or bool(caregiver.document_data),
        "documents": [serialize_document(document) for document in documents],
        "rating": caregiver.rating,
    }

def broadcast_booking_update(booking_id: int, payload: dict):
    coroutine = manager.broadcast(booking_id, payload)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coroutine)
    except RuntimeError:
        asyncio.run(coroutine)

@router.post("/update-location")
def update_location(
    data: CaregiverLocationUpdate,
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    if caregiver.status != "approved":
        raise HTTPException(status_code=403, detail="Caregiver approval is required before live operations.")

    if data.caregiver_id != caregiver.id:
        raise HTTPException(status_code=403, detail="Location update does not match signed-in caregiver")

    location = Location(
        caregiver_id=caregiver.id,
        latitude=data.lat,
        longitude=data.lng,
        timestamp=datetime.utcnow(),
    )

    caregiver.latitude = data.lat
    caregiver.longitude = data.lng

    db.add(location)
    db.commit()

    active_bookings_query = db.query(Booking).filter(Booking.caregiver_id == caregiver.id)
    if data.booking_id:
        active_bookings_query = active_bookings_query.filter(
            Booking.id == data.booking_id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
    else:
        active_bookings_query = active_bookings_query.filter(
            Booking.status.in_(ACTIVE_BOOKING_STATUSES)
        )

    active_bookings = active_bookings_query.all()

    for booking in active_bookings:
        if booking.status == "assigned":
            for next_status in resolve_status_path(booking.status, "on_the_way"):
                validate_status_transition(booking.status, next_status)
                booking.status = next_status

    if active_bookings:
        db.commit()

    for booking in active_bookings:
        broadcast_booking_update(
            booking.id,
            {
                "booking_id": booking.id,
                "status": booking.status,
                "lat": data.lat,
                "lng": data.lng,
            },
        )

    return {"status": "location updated", "booking_count": len(active_bookings)}


@router.post("/update-status")
def update_status(
    data: CaregiverStatusUpdate,
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    if caregiver.status != "approved":
        raise HTTPException(status_code=403, detail="Caregiver approval is required before job updates.")

    allowed_statuses = {"assigned", "accepted", "on_the_way", "arrived", "started", "completed", "rejected"}
    if data.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    booking = (
        db.query(Booking)
        .filter(Booking.id == data.booking_id, Booking.caregiver_id == caregiver.id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if data.status == "rejected":
        reassign_booking_after_rejection(db, booking, caregiver)
        caregiver.is_available = False
    else:
        if data.status == "started":
            raise HTTPException(status_code=400, detail="Verify the patient OTP before starting care.")
        for next_status in resolve_status_path(booking.status, data.status):
            validate_status_transition(booking.status, next_status)
            booking.status = next_status

        if booking.status == "completed":
            caregiver.is_available = caregiver.is_enabled and not caregiver.forced_offline
        else:
            caregiver.is_available = False

    db.commit()

    latest_location = (
        db.query(Location)
        .filter(Location.caregiver_id == booking.caregiver_id)
        .order_by(Location.timestamp.desc())
        .first()
    )

    payload = {
        "booking_id": booking.id,
        "status": booking.status,
    }
    if latest_location:
        payload["lat"] = latest_location.latitude
        payload["lng"] = latest_location.longitude

    broadcast_booking_update(booking.id, payload)

    patient = db.query(User).filter(User.id == booking.user_id).first()
    if patient:
        create_notification(
            db,
            user_id=patient.id,
            role="user",
            title="Status updated",
            message=f"Booking #{booking.id} is now {booking.status.replace('_', ' ')}.",
            type="booking_status_updated",
        )
    db.commit()

    return {"status": booking.status}


@router.post("/toggle-availability")
def toggle_availability(
    data: CaregiverAvailabilityUpdate,
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    if data.caregiver_id and data.caregiver_id != caregiver.id:
        raise HTTPException(status_code=403, detail="Availability update does not match signed-in caregiver")
    if caregiver.status != "approved":
        raise HTTPException(status_code=403, detail="Caregiver approval is required before availability changes.")
    if not caregiver.is_enabled:
        raise HTTPException(status_code=403, detail="This caregiver account is currently disabled by admin.")
    if caregiver.forced_offline and data.is_available:
        raise HTTPException(status_code=403, detail="Admin has forced this account offline.")
    if data.is_available and caregiver_has_active_booking(db, caregiver.id):
        raise HTTPException(status_code=400, detail="Complete the active booking before going available again.")

    caregiver.is_available = data.is_available
    db.commit()

    return {"message": "Availability updated"}


@router.post("/availability")
def update_availability(
    data: CaregiverAvailabilityUpdate,
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    toggle_availability(data, db, caregiver)
    db.refresh(caregiver)
    user = db.query(User).filter(User.id == caregiver.user_id).first()

    return {
        "message": "Availability updated",
        "caregiver": serialize_caregiver(caregiver, user=user),
    }


@router.get("/history")
def get_history(
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    bookings = (
        db.query(Booking)
        .filter(Booking.caregiver_id == caregiver.id)
        .order_by(Booking.start_time.desc(), Booking.id.desc())
        .all()
    )
    transactions = {
        item.booking_id: item
        for item in db.query(PaymentTransaction).filter(
            PaymentTransaction.booking_id.in_([booking.id for booking in bookings])
        ).all()
    } if bookings else {}

    return {
        "history": [
            {
                "id": booking.id,
                "patient_name": booking.patient_name,
                "patient_age": booking.patient_age,
                "status": booking.status,
                "payment_status": booking.payment_status,
                "service_type": booking.service_type,
                "duration_type": booking.duration_type,
                "hours": booking.hours,
                "days": booking.days,
                "months": booking.months,
                "start_time": booking.start_time.isoformat() if booking.start_time else None,
                "end_time": booking.end_time.isoformat() if booking.end_time else None,
                "amount": booking.amount,
                "earning": resolve_booking_earning(booking, transactions.get(booking.id)),
            }
            for booking in bookings
        ]
    }


@router.get("/earnings/summary")
def get_earnings_summary(
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    today_key = datetime.utcnow().date()
    bookings = db.query(Booking).filter(Booking.caregiver_id == caregiver.id).all()
    transactions = {
        item.booking_id: item
        for item in db.query(PaymentTransaction).filter(
            PaymentTransaction.booking_id.in_([booking.id for booking in bookings])
        ).all()
    } if bookings else {}

    today_total = 0.0
    total_earnings = 0.0
    pending_payouts = 0.0
    jobs_paid = 0

    for booking in bookings:
        transaction = transactions.get(booking.id)
        earning = resolve_booking_earning(booking, transaction)
        is_paid = (transaction.status == "paid") if transaction else booking.payment_status == "paid"

        if is_paid:
            jobs_paid += 1
            total_earnings += earning
            paid_at = resolve_booking_paid_at(booking, transaction)
            if paid_at and paid_at.date() == today_key:
                today_total += earning
        else:
            pending_payouts += earning

    return {
        "today_earnings": round(today_total, 2),
        "total_earnings": round(total_earnings, 2),
        "jobs_paid": jobs_paid,
        "pending_payouts": round(pending_payouts, 2),
    }


@router.get("/performance")
def get_performance(
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    reviews = db.query(Review).filter(Review.caregiver_id == caregiver.id).all()
    completed_jobs = (
        db.query(Booking)
        .filter(Booking.caregiver_id == caregiver.id, Booking.status == "completed")
        .count()
    )
    average_rating = (
        sum(review.rating for review in reviews) / len(reviews)
        if reviews
        else caregiver.rating or 0
    )

    caregiver.rating = average_rating
    db.commit()
    db.refresh(caregiver)

    return {
        "jobs_completed": completed_jobs,
        "average_rating": round(average_rating, 2) if average_rating else 0,
        "review_count": len(reviews),
        "approval_status": caregiver.status,
        "is_verified": caregiver.is_verified,
    }


@router.get("/reviews")
def get_reviews(
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    reviews = (
        db.query(Review)
        .filter(Review.caregiver_id == caregiver.id)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .all()
    )
    patient_users = {
        item.id: item
        for item in db.query(User).filter(User.id.in_([review.user_id for review in reviews])).all()
    } if reviews else {}

    return {
        "reviews": [
            {
                "id": review.id,
                "booking_id": review.booking_id,
                "rating": review.rating,
                "comment": review.comment,
                "created_at": review.created_at.isoformat() if review.created_at else None,
                "patient_name": patient_users.get(review.user_id).name if patient_users.get(review.user_id) else None,
            }
            for review in reviews
        ]
    }


@router.get("/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == caregiver.user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(20)
        .all()
    )

    return {
        "notifications": [
            {
                "id": item.id,
                "title": item.title,
                "message": item.message,
                "type": item.type,
                "is_read": item.is_read,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in notifications
        ]
    }


@router.post("/notifications/{notification_id}/read")
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    caregiver: Caregiver = Depends(get_current_caregiver),
):
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == caregiver.user_id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()

    return {"message": "Notification marked as read"}



@router.post("/add-dummy")
def add_dummy(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "caregiver@test.com").first()
    if not user:
        user = User(
            name="Test Caregiver",
            phone="9999999999",
            email="caregiver@test.com",
            password=hash_password("test"),
            role="caregiver",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.password = hash_password("test")
        user.role = "caregiver"
        db.commit()
        db.refresh(user)

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == user.id).first()
    if not caregiver:
        caregiver = Caregiver(
            user_id=user.id,
            full_name=user.name,
            phone=user.phone,
            location="Hyderabad",
            experience=2,
            skills="elder care",
            status="approved",
            is_verified=True,
            latitude=17.3850,
            longitude=78.4867,
            is_available=True,
            is_enabled=True,
            forced_offline=False,
            rating=4.5,
        )
        db.add(caregiver)
        db.commit()
        db.refresh(caregiver)
    else:
        caregiver.full_name = user.name
        caregiver.phone = user.phone
        caregiver.location = caregiver.location or "Hyderabad"
        caregiver.status = "approved"
        caregiver.is_verified = True
        caregiver.is_available = True
        caregiver.is_enabled = True
        caregiver.forced_offline = False
        caregiver.latitude = caregiver.latitude or 17.3850
        caregiver.longitude = caregiver.longitude or 78.4867
        db.commit()
        db.refresh(caregiver)

    return {
        "message": "Dummy caregiver ready",
        "email": "caregiver@test.com",
        "password": "test",
        "caregiver_id": caregiver.id,
    }


@router.post("/reset-dummy")
def reset_dummy(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "caregiver@test.com").first()
    if not user:
        raise HTTPException(status_code=404, detail="Dummy caregiver user not found")

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == user.id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Dummy caregiver profile not found")

    active_bookings = (
        db.query(Booking)
        .filter(
            Booking.caregiver_id == caregiver.id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
        .all()
    )

    reset_count = 0
    for booking in active_bookings:
        booking.status = "completed"
        reset_count += 1

    caregiver.is_available = True
    db.commit()

    return {
        "message": "Dummy caregiver reset",
        "caregiver_id": caregiver.id,
        "active_bookings_completed": reset_count,
        "is_available": caregiver.is_available,
    }
