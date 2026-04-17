from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from app.database import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"))

    name = Column(String)
    completed = Column(Boolean, default=False)