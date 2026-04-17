from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), unique=True, index=True)
    caregiver_id = Column(Integer, ForeignKey("caregivers.id"))
    gross_amount = Column(Float, default=0)
    caregiver_amount = Column(Float, default=0)
    platform_fee = Column(Float, default=0)
    status = Column(String, default="pending")
    paid_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
