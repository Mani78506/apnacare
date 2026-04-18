from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.services.email_service import send_email
from app.services.sms_service import send_sms


def create_notification(
    db: Session,
    *,
    user_id: int,
    role: str,
    title: str,
    message: str,
    type: str,
    user_email: str | None = None,
    user_phone: str | None = None,
    email_status: str = "not_requested",
    sms_status: str = "not_requested",
    delivery_error: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        role=role,
        title=title,
        message=message,
        type=type,
        user_email=user_email,
        user_phone=user_phone,
        email_status=email_status,
        sms_status=sms_status,
        delivery_error=delivery_error,
        is_read=False,
    )
    db.add(notification)
    db.flush()
    return notification


def notify_user(
    db: Session,
    *,
    user_id: int,
    role: str,
    title: str,
    message: str,
    type: str,
    email: str | None = None,
    phone: str | None = None,
    recipient_name: str | None = None,
    details: dict[str, str] | None = None,
    email_subject: str | None = None,
    send_email_notification: bool = True,
    send_sms_notification: bool = True,
) -> Notification:
    email_status = "not_requested"
    sms_status = "not_requested"
    delivery_errors: list[str] = []

    if send_email_notification:
        if email:
            email_sent, email_error = send_email(
                email,
                email_subject or title,
                message,
                recipient_name=recipient_name,
                details=details,
            )
            email_status = "sent" if email_sent else "failed"
            if email_error:
                delivery_errors.append(f"email: {email_error}")
        else:
            email_status = "skipped"

    if send_sms_notification:
        if phone:
            sms_sent, sms_error = send_sms(phone, message)
            sms_status = "sent" if sms_sent else "failed"
            if sms_error:
                delivery_errors.append(f"sms: {sms_error}")
        else:
            sms_status = "skipped"

    return create_notification(
        db,
        user_id=user_id,
        role=role,
        title=title,
        message=message,
        type=type,
        user_email=email,
        user_phone=phone,
        email_status=email_status,
        sms_status=sms_status,
        delivery_error=" | ".join(delivery_errors) if delivery_errors else None,
    )
