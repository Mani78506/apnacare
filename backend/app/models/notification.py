from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    role = Column(String, index=True)
    type = Column(String)
    title = Column(String)
    message = Column(Text)
    user_email = Column(String, nullable=True)
    user_phone = Column(String, nullable=True)
    email_status = Column(String, default="not_requested")
    sms_status = Column(String, default="not_requested")
    delivery_error = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
