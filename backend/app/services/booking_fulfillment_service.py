from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.payment_transaction import PaymentTransaction
from app.models.user import User
from app.services.assignment_service import assign_caregiver
from app.services.notification_service import create_notification
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
        create_notification(
            db,
            user_id=patient_user.id,
            role="user",
            title="Caregiver assigned",
            message=f"Booking #{booking.id} is confirmed. Share OTP {booking.otp} with your caregiver at the doorstep.",
            type="booking_assigned",
        )
    if caregiver_user:
        create_notification(
            db,
            user_id=caregiver_user.id,
            role="caregiver",
            title="New booking assigned",
            message=f"Booking #{booking.id} has been assigned to you. Verify the patient OTP before starting care.",
            type="booking_assigned",
        )

    return caregiver, patient_user, caregiver_user
