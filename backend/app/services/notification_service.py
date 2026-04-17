from sqlalchemy.orm import Session

from app.models.notification import Notification


def create_notification(
    db: Session,
    *,
    user_id: int,
    role: str,
    title: str,
    message: str,
    type: str,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        role=role,
        title=title,
        message=message,
        type=type,
        is_read=False,
    )
    db.add(notification)
    db.flush()
    return notification
