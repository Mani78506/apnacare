import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, Depends, Header, HTTPException, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.models.user import User
from app.models.location import Location
from app.models.review import Review
from app.models.task import Task
from app.services.auth_service import decode_access_token
from app.services.document_service import serialize_document, sort_documents
from app.services.websocket_manager import manager

router = APIRouter()
logger = logging.getLogger(__name__)

def serialize_utc_timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def serialize_public_caregiver(caregiver: Caregiver | None, caregiver_user: User | None = None):
    if not caregiver:
        return None

    documents = [
        serialize_document(document)
        for document in sort_documents(list(caregiver.documents or []))
        if document.document_type in {"profile", "id", "certificate"}
    ]

    return {
        "id": caregiver.id,
        "full_name": caregiver.full_name,
        "phone": caregiver.phone,
        "email": caregiver_user.email if caregiver_user else None,
        "address": caregiver.address or caregiver.location,
        "gender": caregiver.gender,
        "experience": caregiver.experience,
        "skills": [item.strip() for item in (caregiver.skills or "").split(",") if item.strip()],
        "rating": caregiver.rating,
        "is_verified": caregiver.is_verified,
        "latitude": caregiver.latitude,
        "longitude": caregiver.longitude,
        "documents": documents,
    }

def build_tracking_payload(db: Session, booking: Booking):
    caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first()
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
    elif caregiver and caregiver.latitude is not None and caregiver.longitude is not None:
        payload["lat"] = caregiver.latitude
        payload["lng"] = caregiver.longitude

    return payload


@router.get("/details")
def get_tracking_details(
    booking_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="Patient access required")

    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.user_id == payload["user_id"])
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first() if booking.caregiver_id else None
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first() if caregiver else None
    latest_location = (
        db.query(Location)
        .filter(Location.caregiver_id == booking.caregiver_id)
        .order_by(Location.timestamp.desc())
        .first()
        if booking.caregiver_id
        else None
    )
    review = db.query(Review).filter(Review.booking_id == booking.id).first()
    tasks = db.query(Task).filter(Task.booking_id == booking.id).order_by(Task.id.asc()).all()

    return {
        "booking": {
            "id": booking.id,
            "status": booking.status,
            "payment_method": booking.payment_method,
            "payment_status": booking.payment_status,
            "payment_collected_method": booking.payment_collected_method,
            "otp": booking.otp,
            "otp_verified": booking.otp_verified,
            "face_verified": booking.face_verified,
            "face_verification_status": booking.face_verification_status,
            "manual_override": booking.manual_override,
            "qr_code_path": booking.qr_code_path,
            "service_type": booking.service_type,
            "preferred_gender": booking.preferred_gender,
            "user_address": booking.user_address,
            "user_latitude": booking.user_latitude,
            "user_longitude": booking.user_longitude,
            "search_radius_km": booking.search_radius_km,
            "assigned_distance_km": booking.assigned_distance_km,
            "assignment_reason": booking.assignment_reason,
            "patient_name": booking.patient_name,
            "patient_age": booking.patient_age,
            "start_time": booking.start_time.isoformat() if booking.start_time else None,
            "end_time": booking.end_time.isoformat() if booking.end_time else None,
            "amount": booking.amount,
            "tasks": [
                {
                    "id": task.id,
                    "name": task.name,
                    "completed": task.completed,
                    "status": "completed" if task.completed else "pending",
                    "completed_at": serialize_utc_timestamp(task.completed_at),
                }
                for task in tasks
            ],
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
            "caregiver": serialize_public_caregiver(caregiver, caregiver_user),
        },
        "latest_location": (
            {
                "lat": latest_location.latitude,
                "lng": latest_location.longitude,
                "timestamp": latest_location.timestamp.isoformat() if latest_location.timestamp else None,
            }
            if latest_location
            else None
        ),
    }

@router.get("/eta")
def get_eta(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == "pending" or not booking.caregiver_id:
        return {"eta": "Waiting for caregiver assignment"}

    if booking.status == "arrived":
        return {"eta": "Arrived"}

    if booking.status == "completed":
        return {"eta": "Completed"}

    latest_location = (
        db.query(Location)
        .filter(Location.caregiver_id == booking.caregiver_id)
        .order_by(Location.timestamp.desc())
        .first()
    )

    if latest_location:
        return {"eta": "5 mins"}

    caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first()
    if caregiver and caregiver.latitude is not None and caregiver.longitude is not None:
        return {"eta": "12 mins"}

    return {"eta": "15 mins"}

@router.websocket("/ws/{booking_id}")
async def websocket_endpoint(websocket: WebSocket, booking_id: int):
    db = SessionLocal()
    await manager.connect(booking_id, websocket)

    try:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if booking:
            await websocket.send_json(build_tracking_payload(db, booking))

        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(booking_id, websocket)
    except Exception:
        logger.exception("Tracking websocket failed for booking_id=%s", booking_id)
        manager.disconnect(booking_id, websocket)
    finally:
        db.close()
