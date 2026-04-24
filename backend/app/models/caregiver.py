from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Caregiver(Base):
    __tablename__ = "caregivers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    full_name = Column(String)
    phone = Column(String)
    location = Column(String)
    gender = Column(String, nullable=True)
    experience = Column(Integer)
    skills = Column(String)
    status = Column(String, default="pending")
    is_verified = Column(Boolean, default=False)
    document_name = Column(String)
    document_content_type = Column(String)
    document_data = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    is_available = Column(Boolean, default=False)
    is_enabled = Column(Boolean, default=True)
    forced_offline = Column(Boolean, default=False)
    rating = Column(Float, default=0)
    documents = relationship("Document", back_populates="caregiver", cascade="all, delete-orphan")
