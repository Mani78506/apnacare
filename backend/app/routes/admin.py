from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.models.document import Document
from app.models.location import Location
from app.models.notification import Notification
from app.models.payment_transaction import PaymentTransaction
from app.models.review import Review
from app.models.user import User
from app.schemas.admin import BookingCancelRequest, BookingReassignRequest
from app.services.assignment_service import assign_best_caregiver, calculate_distance_km
from app.services.auth_service import decode_access_token
from app.services.booking_security_service import refresh_booking_security_artifacts
from app.services.document_service import get_primary_document, serialize_document, sort_documents
from app.services.notification_service import create_notification

router = APIRouter(prefix="/admin", tags=["Admin"])
ACTIVE_BOOKING_STATUSES = {"assigned", "accepted", "on_the_way", "arrived", "started"}


def get_current_admin(
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    payload["user_id"] = int(payload["user_id"])
    return payload


def serialize_booking(
    booking: Booking,
    patient: User | None,
    caregiver: Caregiver | None,
    caregiver_user: User | None,
):
    latest_location = None
    if caregiver:
        latest_location = (
            {
                "lat": caregiver.latitude,
                "lng": caregiver.longitude,
            }
            if caregiver.latitude is not None and caregiver.longitude is not None
            else None
        )

    return {
        "id": booking.id,
        "status": booking.status,
        "payment_status": booking.payment_status,
        "amount": booking.amount,
        "service_type": booking.service_type,
        "notes": booking.notes,
        "start_time": booking.start_time.isoformat() if booking.start_time else None,
        "end_time": booking.end_time.isoformat() if booking.end_time else None,
        "patient": {
            "id": patient.id if patient else booking.user_id,
            "name": booking.patient_name or (patient.name if patient else None),
            "age": booking.patient_age,
            "email": patient.email if patient else None,
            "phone": patient.phone if patient else None,
        },
        "caregiver": {
            "id": caregiver.id if caregiver else booking.caregiver_id,
            "name": caregiver.full_name if caregiver else None,
            "email": caregiver_user.email if caregiver_user else None,
            "phone": caregiver.phone if caregiver else None,
            "gender": caregiver.gender if caregiver else None,
            "address": (caregiver.address or caregiver.location) if caregiver else None,
            "status": caregiver.status if caregiver else None,
            "is_available": caregiver.is_available if caregiver else None,
            "is_enabled": caregiver.is_enabled if caregiver else None,
            "forced_offline": caregiver.forced_offline if caregiver else None,
            "rating": caregiver.rating if caregiver else None,
            "latest_location": latest_location,
        },
        "preferred_gender": booking.preferred_gender,
        "assigned_distance_km": booking.assigned_distance_km,
        "assignment_reason": booking.assignment_reason,
        "cancel_reason": booking.cancel_reason,
        "cancelled_by": booking.cancelled_by,
        "admin_notes": booking.admin_notes,
        "reassigned_from_caregiver_id": booking.reassigned_from_caregiver_id,
        "otp_verified": booking.otp_verified,
        "face_verified": booking.face_verified,
        "face_verification_status": booking.face_verification_status,
        "manual_override": booking.manual_override,
        "arrival_selfie_id": booking.arrival_selfie_id,
    }


def get_latest_location(db: Session, caregiver_id: int):
    latest = (
        db.query(Location)
        .filter(Location.caregiver_id == caregiver_id)
        .order_by(Location.timestamp.desc())
        .first()
    )
    if not latest:
        return None
    return {
        "lat": latest.latitude,
        "lng": latest.longitude,
        "timestamp": latest.timestamp.isoformat() if latest.timestamp else None,
    }


def serialize_caregiver(caregiver: Caregiver, user: User | None, stats: dict | None = None):
    stats = stats or {}
    documents = sort_documents(list(caregiver.documents or []))
    primary_document = get_primary_document(documents)
    return {
        "id": caregiver.id,
        "user_id": caregiver.user_id,
        "full_name": caregiver.full_name,
        "email": user.email if user else None,
        "phone": caregiver.phone,
        "location": caregiver.location,
        "address": caregiver.address or caregiver.location,
        "gender": caregiver.gender,
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
        "latitude": caregiver.latitude,
        "longitude": caregiver.longitude,
        "stats": stats,
    }


@router.get("/overview")
def get_admin_overview(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    bookings = db.query(Booking).all()
    caregivers = db.query(Caregiver).all()
    users = db.query(User).filter(User.role == "user").count()
    active_bookings = [item for item in bookings if item.status in {"assigned", "on_the_way", "arrived"}]
    transactions = db.query(PaymentTransaction).all()

    return {
        "total_bookings": len(bookings),
        "active_bookings": len(active_bookings),
        "completed_bookings": len([item for item in bookings if item.status == "completed"]),
        "cancelled_bookings": len([item for item in bookings if item.status == "cancelled"]),
        "active_users": users,
        "active_caregivers": len([item for item in caregivers if item.is_available and item.status == "approved"]),
        "pending_caregivers": len([item for item in caregivers if item.status == "pending"]),
        "revenue": round(sum(item.gross_amount for item in transactions if item.status == "paid"), 2),
        "platform_fees": round(sum(item.platform_fee for item in transactions if item.status == "paid"), 2),
    }


@router.get("/bookings")
def get_admin_bookings(
    status: str | None = Query(default=None),
    payment_status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    bookings = db.query(Booking).order_by(Booking.start_time.desc(), Booking.id.desc()).all()
    user_ids = list({booking.user_id for booking in bookings})
    caregiver_ids = list({booking.caregiver_id for booking in bookings if booking.caregiver_id})
    users_by_id = {user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    caregivers = db.query(Caregiver).filter(Caregiver.id.in_(caregiver_ids)).all() if caregiver_ids else []
    caregivers_by_id = {caregiver.id: caregiver for caregiver in caregivers}
    caregiver_users_by_id = {
        user.id: user
        for user in db.query(User).filter(User.id.in_([caregiver.user_id for caregiver in caregivers])).all()
    } if caregivers else {}

    serialized = [
        serialize_booking(
            booking,
            users_by_id.get(booking.user_id),
            caregivers_by_id.get(booking.caregiver_id),
            caregiver_users_by_id.get(caregivers_by_id[booking.caregiver_id].user_id) if booking.caregiver_id in caregivers_by_id else None,
        )
        for booking in bookings
    ]

    if status:
        serialized = [item for item in serialized if item["status"] == status]
    if payment_status:
        serialized = [item for item in serialized if item["payment_status"] == payment_status]
    if search:
        needle = search.strip().lower()
        serialized = [
            item
            for item in serialized
            if needle in " ".join(
                [
                    str(item["id"]),
                    item["patient"]["name"] or "",
                    item["patient"]["email"] or "",
                    item["caregiver"]["name"] or "",
                    item["caregiver"]["email"] or "",
                    item["service_type"] or "",
                ]
            ).lower()
        ]

    return {"bookings": serialized}


@router.get("/bookings/{booking_id}")
def get_booking_detail(
    booking_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    patient = db.query(User).filter(User.id == booking.user_id).first()
    caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first()
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first() if caregiver else None
    available_caregivers = (
        db.query(Caregiver)
        .filter(
            Caregiver.status == "approved",
            Caregiver.is_verified == True,
            Caregiver.is_available == True,
            Caregiver.is_enabled == True,
            Caregiver.forced_offline == False,
        )
        .order_by(Caregiver.full_name.asc())
        .all()
    )
    available_caregivers = [
        item
        for item in available_caregivers
        if not db.query(Booking).filter(Booking.caregiver_id == item.id, Booking.status.in_(ACTIVE_BOOKING_STATUSES)).first()
    ]

    return {
        "booking": serialize_booking(booking, patient, caregiver, caregiver_user),
        "eligible_caregivers": [
            serialize_caregiver(item, db.query(User).filter(User.id == item.user_id).first())
            for item in available_caregivers
        ],
    }


@router.post("/bookings/{booking_id}/reassign")
def reassign_booking(
    booking_id: int,
    payload: BookingReassignRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    previous_caregiver_id = booking.caregiver_id
    previous_caregiver = db.query(Caregiver).filter(Caregiver.id == previous_caregiver_id).first() if previous_caregiver_id else None
    if previous_caregiver:
        previous_caregiver.is_available = previous_caregiver.is_enabled and not previous_caregiver.forced_offline
    booking.reassigned_from_caregiver_id = previous_caregiver_id

    next_caregiver = None
    if payload.caregiver_id is not None:
        next_caregiver = db.query(Caregiver).filter(Caregiver.id == payload.caregiver_id).first()
        if not next_caregiver:
            raise HTTPException(status_code=404, detail="Target caregiver not found")
        has_active_booking = db.query(Booking).filter(
            Booking.caregiver_id == next_caregiver.id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        ).first()
        if (
            next_caregiver.status != "approved"
            or not next_caregiver.is_verified
            or not next_caregiver.is_available
            or not next_caregiver.is_enabled
            or next_caregiver.forced_offline
            or has_active_booking
        ):
            raise HTTPException(status_code=400, detail="Target caregiver is not available for reassignment")
    else:
        next_caregiver = assign_best_caregiver(
            db,
            booking,
            excluded_caregiver_ids={booking.caregiver_id} if booking.caregiver_id else None,
        )
        if not next_caregiver:
            raise HTTPException(status_code=404, detail="No alternate caregiver available")

    if payload.caregiver_id is not None:
        booking.caregiver_id = next_caregiver.id
        booking.status = "assigned"
        booking.assigned_distance_km = (
            round(
                calculate_distance_km(booking.user_latitude, booking.user_longitude, next_caregiver.latitude, next_caregiver.longitude),
                2,
            )
            if booking.user_latitude is not None
            and booking.user_longitude is not None
            and next_caregiver.latitude is not None
            and next_caregiver.longitude is not None
            else None
        )
        booking.assignment_reason = "Assigned by admin manual reassignment."
        refresh_booking_security_artifacts(booking)
        next_caregiver.is_available = False

    patient = db.query(User).filter(User.id == booking.user_id).first()
    next_caregiver_user = db.query(User).filter(User.id == next_caregiver.user_id).first()
    if patient:
        create_notification(
            db,
            user_id=patient.id,
            role="user",
            title="Caregiver reassigned",
            message=f"Booking #{booking.id} has been reassigned to {next_caregiver.full_name or 'a new caregiver'}. Use OTP {booking.otp} for doorstep verification.",
            type="booking_reassigned",
        )
    if next_caregiver_user:
        create_notification(
            db,
            user_id=next_caregiver_user.id,
            role="caregiver",
            title="New booking assigned",
            message=f"Booking #{booking.id} has been assigned to you by admin.",
            type="booking_assigned",
        )

    db.commit()
    db.refresh(booking)

    return {
        "message": "Booking reassigned",
        "booking": serialize_booking(booking, patient, next_caregiver, next_caregiver_user),
    }


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(
    booking_id: int,
    payload: BookingCancelRequest,
    db: Session = Depends(get_db),
    admin_payload: dict = Depends(get_current_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first()
    patient = db.query(User).filter(User.id == booking.user_id).first()
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first() if caregiver else None

    booking.status = "cancelled"
    booking.cancelled_by = "admin"
    booking.cancel_reason = payload.reason or "Cancelled by admin"
    booking.admin_notes = payload.reason or booking.admin_notes
    if caregiver:
        caregiver.is_available = caregiver.is_enabled and not caregiver.forced_offline

    if patient:
        create_notification(
            db,
            user_id=patient.id,
            role="user",
            title="Booking cancelled",
            message=f"Booking #{booking.id} was cancelled by admin. Reason: {booking.cancel_reason}.",
            type="booking_cancelled",
        )
    if caregiver_user:
        create_notification(
            db,
            user_id=caregiver_user.id,
            role="caregiver",
            title="Booking cancelled",
            message=f"Booking #{booking.id} has been cancelled by admin.",
            type="booking_cancelled",
        )

    db.commit()
    db.refresh(booking)

    return {
        "message": "Booking cancelled",
        "booking": serialize_booking(booking, patient, caregiver, caregiver_user),
        "cancelled_by_admin_id": admin_payload["user_id"],
    }


@router.get("/booking/{booking_id}/face-review")
def get_face_review(
    booking_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    profile_photo = (
        db.query(Document)
        .filter(
            Document.caregiver_id == booking.caregiver_id,
            Document.document_type.in_(["profile_photo", "profile"]),
        )
        .order_by(Document.id.asc())
        .first()
        if booking.caregiver_id
        else None
    )

    return {
        "booking_id": booking.id,
        "caregiver_id": booking.caregiver_id,
        "otp_verified": booking.otp_verified,
        "face_verified": booking.face_verified,
        "face_verification_status": booking.face_verification_status,
        "profile_photo_document_id": profile_photo.id if profile_photo else None,
        "arrival_selfie_document_id": booking.arrival_selfie_id,
    }


@router.post("/booking/{booking_id}/face-override")
def approve_face_override(
    booking_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.manual_override = True
    booking.face_verification_status = "manual_override"
    db.commit()

    return {
        "message": "Manual override approved",
        "booking_id": booking.id,
    }


@router.get("/live-jobs")
def get_live_jobs(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    bookings = (
        db.query(Booking)
        .filter(Booking.status.in_(["assigned", "on_the_way", "arrived"]))
        .order_by(Booking.start_time.asc(), Booking.id.desc())
        .all()
    )
    results = []
    for booking in bookings:
        patient = db.query(User).filter(User.id == booking.user_id).first()
        caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first()
        caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first() if caregiver else None
        results.append(
            {
                **serialize_booking(booking, patient, caregiver, caregiver_user),
                "live_location": get_latest_location(db, caregiver.id) if caregiver else None,
            }
        )
    return {"jobs": results}


@router.get("/payments/summary")
def get_payment_summary(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    transactions = db.query(PaymentTransaction).order_by(PaymentTransaction.created_at.desc()).all()
    caregivers = {item.id: item for item in db.query(Caregiver).all()}
    caregiver_users = {
        item.id: item
        for item in db.query(User).filter(User.id.in_([caregiver.user_id for caregiver in caregivers.values()])).all()
    } if caregivers else {}

    earnings_by_caregiver: dict[int, float] = {}
    for item in transactions:
        if item.caregiver_id:
            earnings_by_caregiver[item.caregiver_id] = earnings_by_caregiver.get(item.caregiver_id, 0) + item.caregiver_amount

    return {
        "summary": {
            "total_revenue": round(sum(item.gross_amount for item in transactions if item.status == "paid"), 2),
            "paid_transactions": len([item for item in transactions if item.status == "paid"]),
            "pending_transactions": len([item for item in transactions if item.status != "paid"]),
            "platform_commission": round(sum(item.platform_fee for item in transactions if item.status == "paid"), 2),
        },
        "by_caregiver": [
            {
                "caregiver_id": caregiver_id,
                "caregiver_name": caregivers[caregiver_id].full_name if caregiver_id in caregivers else None,
                "email": caregiver_users.get(caregivers[caregiver_id].user_id).email if caregiver_id in caregivers and caregiver_users.get(caregivers[caregiver_id].user_id) else None,
                "earnings": round(amount, 2),
            }
            for caregiver_id, amount in sorted(earnings_by_caregiver.items(), key=lambda item: item[1], reverse=True)
        ],
        "transactions": [
            {
                "id": item.id,
                "booking_id": item.booking_id,
                "caregiver_id": item.caregiver_id,
                "gross_amount": item.gross_amount,
                "caregiver_amount": item.caregiver_amount,
                "platform_fee": item.platform_fee,
                "status": item.status,
                "paid_at": item.paid_at.isoformat() if item.paid_at else None,
            }
            for item in transactions
        ],
    }


@router.get("/caregivers")
def get_caregiver_management(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    caregivers = db.query(Caregiver).order_by(Caregiver.id.desc()).all()
    users = {item.id: item for item in db.query(User).filter(User.id.in_([caregiver.user_id for caregiver in caregivers])).all()} if caregivers else {}
    bookings = db.query(Booking).all()
    reviews = db.query(Review).all()

    stats_by_caregiver: dict[int, dict] = {}
    for caregiver in caregivers:
        caregiver_bookings = [item for item in bookings if item.caregiver_id == caregiver.id]
        caregiver_reviews = [item for item in reviews if item.caregiver_id == caregiver.id]
        stats_by_caregiver[caregiver.id] = {
            "jobs_completed": len([item for item in caregiver_bookings if item.status == "completed"]),
            "active_jobs": len([item for item in caregiver_bookings if item.status in {"assigned", "on_the_way", "arrived"}]),
            "average_rating": round(sum(item.rating for item in caregiver_reviews) / len(caregiver_reviews), 2) if caregiver_reviews else caregiver.rating or 0,
            "review_count": len(caregiver_reviews),
        }

    return {
        "caregivers": [
            serialize_caregiver(caregiver, users.get(caregiver.user_id), stats=stats_by_caregiver.get(caregiver.id))
            for caregiver in caregivers
        ]
    }


@router.post("/caregivers/{caregiver_id}/enable")
def enable_caregiver(
    caregiver_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    caregiver = db.query(Caregiver).filter(Caregiver.id == caregiver_id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver not found")

    caregiver.is_enabled = True
    caregiver.forced_offline = False
    caregiver.is_available = caregiver.status == "approved"
    user = db.query(User).filter(User.id == caregiver.user_id).first()
    if user:
        create_notification(
            db,
            user_id=user.id,
            role="caregiver",
            title="Account enabled",
            message="Admin has enabled your caregiver account.",
            type="caregiver_enabled",
        )
    db.commit()
    db.refresh(caregiver)
    return {"message": "Caregiver enabled", "caregiver": serialize_caregiver(caregiver, user)}


@router.post("/caregivers/{caregiver_id}/disable")
def disable_caregiver(
    caregiver_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    caregiver = db.query(Caregiver).filter(Caregiver.id == caregiver_id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver not found")

    caregiver.is_enabled = False
    caregiver.is_available = False
    user = db.query(User).filter(User.id == caregiver.user_id).first()
    if user:
        create_notification(
            db,
            user_id=user.id,
            role="caregiver",
            title="Account disabled",
            message="Admin has disabled your caregiver account.",
            type="caregiver_disabled",
        )
    db.commit()
    db.refresh(caregiver)
    return {"message": "Caregiver disabled", "caregiver": serialize_caregiver(caregiver, user)}


@router.post("/caregivers/{caregiver_id}/force-offline")
def force_offline_caregiver(
    caregiver_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    caregiver = db.query(Caregiver).filter(Caregiver.id == caregiver_id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver not found")

    caregiver.forced_offline = True
    caregiver.is_available = False
    user = db.query(User).filter(User.id == caregiver.user_id).first()
    if user:
        create_notification(
            db,
            user_id=user.id,
            role="caregiver",
            title="Forced offline",
            message="Admin has forced your caregiver account offline.",
            type="caregiver_forced_offline",
        )
    db.commit()
    db.refresh(caregiver)
    return {"message": "Caregiver forced offline", "caregiver": serialize_caregiver(caregiver, user)}


@router.get("/reviews")
def get_reviews(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    reviews = db.query(Review).order_by(Review.created_at.desc(), Review.id.desc()).all()
    users = {item.id: item for item in db.query(User).all()}
    caregivers = {item.id: item for item in db.query(Caregiver).all()}

    return {
        "reviews": [
            {
                "id": review.id,
                "booking_id": review.booking_id,
                "rating": review.rating,
                "comment": review.comment,
                "created_at": review.created_at.isoformat() if review.created_at else None,
                "patient_name": users.get(review.user_id).name if users.get(review.user_id) else None,
                "caregiver_name": caregivers.get(review.caregiver_id).full_name if caregivers.get(review.caregiver_id) else None,
            }
            for review in reviews
        ]
    }


@router.get("/notifications")
def get_admin_notifications(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.role == "admin")
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
