from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.payment_transaction import PaymentTransaction
from app.models.user import User
from app.services.assignment_service import assign_caregiver
from app.services.notification_service import notify_user
from app.services.task_service import ensure_default_tasks


def finalize_booking_assignment(db: Session, booking: Booking):
    caregiver = assign_caregiver(db, booking)
    if not caregiver:
        return None, None, None

    ensure_default_tasks(db, booking.id)
    transaction = db.query(PaymentTransaction).filter(PaymentTransaction.booking_id == booking.id).first()
    if transaction:
        transaction.caregiver_id = caregiver.id
    patient_user = db.query(User).filter(User.id == booking.user_id).first()
    caregiver_user = db.query(User).filter(User.id == caregiver.user_id).first()

    if patient_user:
        notify_user(
            db,
            user_id=patient_user.id,
            role="user",
            title="Caregiver assigned",
            message=f"Booking #{booking.id} is confirmed. Share OTP {booking.otp} with your caregiver at the doorstep.",
            type="booking_assigned",
            email=patient_user.email,
            phone=patient_user.phone,
            recipient_name=patient_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Service": booking.service_type or "Home care",
                "Caregiver": caregiver.full_name or "Assigned caregiver",
                "OTP": booking.otp or "Pending",
            },
            email_subject="ApnaCare caregiver assigned",
        )
    if caregiver_user:
        notify_user(
            db,
            user_id=caregiver_user.id,
            role="caregiver",
            title="New booking assigned",
            message=f"Booking #{booking.id} has been assigned to you. Verify the patient OTP before starting care.",
            type="booking_assigned",
            email=caregiver_user.email,
            phone=caregiver.phone,
            recipient_name=caregiver.full_name or caregiver_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "Patient": patient_user.name if patient_user else "Patient",
                "Service": booking.service_type or "Home care",
                "Scheduled": booking.start_time.isoformat() if booking.start_time else "As soon as possible",
            },
            email_subject="ApnaCare new booking assigned",
        )
    if patient_user and booking.otp:
        notify_user(
            db,
            user_id=patient_user.id,
            role="user",
            title="OTP generated",
            message=f"Your OTP for booking #{booking.id} is {booking.otp}.",
            type="otp_generated",
            email=patient_user.email,
            phone=patient_user.phone,
            recipient_name=patient_user.name,
            details={
                "Booking ID": f"#{booking.id}",
                "OTP": booking.otp,
                "Caregiver": caregiver.full_name or "Assigned caregiver",
            },
            email_subject="ApnaCare OTP",
        )

    return caregiver, patient_user, caregiver_user
