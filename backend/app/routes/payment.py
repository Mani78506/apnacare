from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.caregiver import Caregiver
from app.models.payment_transaction import PaymentTransaction
from app.models.user import User
from app.schemas.payment import CashPaymentConfirmRequest, PaymentOrderCreate, PaymentVerifyRequest
from app.services.auth_service import decode_access_token
from app.services.booking_fulfillment_service import finalize_booking_assignment
from app.services.notification_service import notify_user
from app.services.razorpay_service import get_razorpay_client, get_razorpay_key_id

router = APIRouter(prefix="/payment", tags=["Payment"])


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


def get_user_booking(db: Session, booking_id: int, user_id: int) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.user_id == user_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not booking.amount or booking.amount <= 0:
        raise HTTPException(status_code=400, detail="Booking amount is invalid")
    return booking


def mark_booking_paid(
    db: Session,
    booking: Booking,
    payment_channel: str,
    razorpay_payment_id: str | None = None,
):
    caregiver_share = round((booking.amount or 0) * 0.8, 2)
    platform_share = round((booking.amount or 0) - caregiver_share, 2)

    booking.payment_status = "paid"
    booking.payment_collected_method = payment_channel
    if razorpay_payment_id:
        booking.razorpay_payment_id = razorpay_payment_id

    transaction = db.query(PaymentTransaction).filter(PaymentTransaction.booking_id == booking.id).first()
    if not transaction:
        transaction = PaymentTransaction(
            booking_id=booking.id,
            caregiver_id=booking.caregiver_id,
        )
        db.add(transaction)

    transaction.gross_amount = booking.amount or 0
    transaction.caregiver_amount = caregiver_share
    transaction.platform_fee = platform_share
    transaction.status = "paid"
    transaction.paid_at = datetime.utcnow()

    caregiver = db.query(Caregiver).filter(Caregiver.id == booking.caregiver_id).first()
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first() if caregiver else None
    patient_user = db.query(User).filter(User.id == booking.user_id).first()
    if patient_user:
        notify_user(
            db,
            user_id=patient_user.id,
            role="user",
            title="Payment successful",
            message=f"Booking #{booking.id} payment has been recorded successfully via {payment_channel.replace('_', ' ')}.",
            type="payment_success",
            email=patient_user.email,
            phone=patient_user.phone,
            recipient_name=patient_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Amount": f"Rs. {(booking.amount or 0):.2f}",
                "Payment Mode": payment_channel.replace("_", " ").title(),
            },
            email_subject="ApnaCare payment successful",
        )
    if caregiver_user:
        notify_user(
            db,
            user_id=caregiver_user.id,
            role="caregiver",
            title="Payment received",
            message=f"Payment for booking #{booking.id} has been recorded via {payment_channel.replace('_', ' ')}. Earnings credited: Rs. {caregiver_share:.2f}.",
            type="payment_received",
            email=caregiver_user.email,
            phone=caregiver.phone,
            recipient_name=caregiver.full_name or caregiver_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Earnings": f"Rs. {caregiver_share:.2f}",
                "Payment Mode": payment_channel.replace("_", " ").title(),
            },
            email_subject="ApnaCare payment received",
        )

    db.commit()

    return caregiver_share, platform_share


@router.post("/create-order")
def create_payment_order(
    data: PaymentOrderCreate,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="Patient access required")

    booking = get_user_booking(db, data.booking_id, payload["user_id"])
    if booking.payment_method == "cash_on_delivery" and booking.status != "completed":
        raise HTTPException(status_code=400, detail="COD bookings can be paid online only after care is completed")
    if booking.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Booking has already been paid")

    client = get_razorpay_client()
    amount_in_paise = int(round((booking.amount or 0) * 100))
    order = client.order.create(
        {
            "amount": amount_in_paise,
            "currency": "INR",
            "payment_capture": 1,
            "notes": {
                "booking_id": str(booking.id),
                "user_id": str(booking.user_id),
            },
        }
    )

    booking.razorpay_order_id = order["id"]
    db.commit()

    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "booking_id": booking.id,
        "key": get_razorpay_key_id(),
    }


@router.post("/verify")
def verify_payment(
    data: PaymentVerifyRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="Patient access required")

    booking = (
        db.query(Booking)
        .filter(
            Booking.razorpay_order_id == data.razorpay_order_id,
            Booking.user_id == payload["user_id"],
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found for this payment")
    if booking.payment_method == "cash_on_delivery" and booking.status != "completed":
        raise HTTPException(status_code=400, detail="COD bookings can be paid online only after care is completed")

    if booking.payment_status == "paid":
        return {"message": "Payment already verified", "booking_id": booking.id, "status": "paid"}

    client = get_razorpay_client()
    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": data.razorpay_order_id,
                "razorpay_payment_id": data.razorpay_payment_id,
                "razorpay_signature": data.razorpay_signature,
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Payment signature verification failed") from exc

    caregiver_share, platform_share = mark_booking_paid(db, booking, "online", data.razorpay_payment_id)
    caregiver = None
    caregiver_user = None
    if not booking.caregiver_id:
        caregiver, _, caregiver_user = finalize_booking_assignment(db, booking)
        if not caregiver:
            patient_user = db.query(User).filter(User.id == booking.user_id).first()
            if patient_user:
                notify_user(
                    db,
                    user_id=patient_user.id,
                    role="user",
                    title="Payment verified",
                    message=f"Booking #{booking.id} payment is complete and caregiver assignment is waiting for availability.",
                    type="booking_pending_assignment",
                    email=patient_user.email,
                    phone=patient_user.phone,
                    recipient_name=patient_user.name,
                    details={
                        "Booking ID": f"#{booking.id}",
                        "Amount": f"Rs. {(booking.amount or 0):.2f}",
                        "Status": "Waiting for caregiver availability",
                    },
                    email_subject="ApnaCare payment verified",
                )
        db.commit()
        db.refresh(booking)

    return {
        "message": "Payment successful and caregiver assigned" if caregiver else "Payment successful",
        "booking_id": booking.id,
        "status": "paid",
        "caregiver_amount": caregiver_share,
        "platform_fee": platform_share,
        "booking_status": booking.status,
        "caregiver": (
            {
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
        "assignment_reason": booking.assignment_reason,
    }


@router.post("/confirm-cash")
def confirm_cash_payment(
    data: CashPaymentConfirmRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="Patient access required")

    booking = get_user_booking(db, data.booking_id, payload["user_id"])
    if booking.payment_method != "cash_on_delivery":
        raise HTTPException(status_code=400, detail="Cash confirmation is only available for COD bookings")
    if booking.status != "completed":
        raise HTTPException(status_code=400, detail="Cash can be confirmed only after care is completed")
    if booking.payment_status == "paid":
        return {"message": "Payment already confirmed", "booking_id": booking.id, "status": "paid"}

    caregiver_share, platform_share = mark_booking_paid(db, booking, "cash")

    return {
        "message": "Cash payment confirmed",
        "booking_id": booking.id,
        "status": "paid",
        "caregiver_amount": caregiver_share,
        "platform_fee": platform_share,
    }


@router.post("/pay/{booking_id}")
def make_payment(
    booking_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="Patient access required")

    booking = get_user_booking(db, booking_id, payload["user_id"])
    if booking.payment_status == "paid":
        return {"message": "Payment already verified", "booking_id": booking.id, "status": "paid"}

    if not booking.razorpay_payment_id:
        raise HTTPException(status_code=400, detail="Use /payment/create-order and /payment/verify to complete payment")

    caregiver_share, platform_share = mark_booking_paid(db, booking, booking.payment_collected_method or "online", booking.razorpay_payment_id)

    return {
        "message": "Payment successful",
        "booking_id": booking_id,
        "status": "paid",
        "caregiver_amount": caregiver_share,
        "platform_fee": platform_share,
    }


@router.get("/status/{booking_id}")
def get_payment_status(
    booking_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_user_payload),
):
    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="Patient access required")

    booking = get_user_booking(db, booking_id, payload["user_id"])

    return {
        "booking_id": booking_id,
        "payment_method": booking.payment_method,
        "payment_status": booking.payment_status,
        "payment_collected_method": booking.payment_collected_method,
        "amount": booking.amount,
        "razorpay_order_id": booking.razorpay_order_id,
        "razorpay_payment_id": booking.razorpay_payment_id,
    }
