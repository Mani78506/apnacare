from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.caregiver import Caregiver
from app.models.user import User
from app.services.auth_service import decode_access_token
from app.services.document_service import sort_documents

router = APIRouter()


class ProfileUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    location: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    gender: str | None = None
    skills: list[str] | str | None = None
    experience: int | None = None


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
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

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def serialize_document(document) -> dict:
    return {
        "id": document.id,
        "document_type": document.document_type,
        "file_name": document.file_name,
        "content_type": document.content_type,
    }


def serialize_user_profile(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "phone": user.phone,
        "email": user.email,
        "role": user.role,
        "location": user.location or user.address,
        "address": user.address,
        "latitude": user.latitude,
        "longitude": user.longitude,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def serialize_caregiver_profile(user: User, caregiver: Caregiver) -> dict:
    return {
        "id": caregiver.id,
        "name": caregiver.full_name or user.name,
        "phone": caregiver.phone or user.phone,
        "email": user.email,
        "role": user.role,
        "location": caregiver.location,
        "address": caregiver.address or caregiver.location,
        "gender": caregiver.gender,
        "skills": [item.strip() for item in (caregiver.skills or "").split(",") if item.strip()],
        "experience": caregiver.experience,
        "rating": caregiver.rating,
        "is_available": caregiver.is_available,
        "status": caregiver.status,
        "is_verified": caregiver.is_verified,
        "latitude": caregiver.latitude,
        "longitude": caregiver.longitude,
        "documents": [serialize_document(document) for document in sort_documents(list(caregiver.documents or []))],
    }


def get_user_caregiver(db: Session, user: User) -> Caregiver:
    caregiver = db.query(Caregiver).filter(Caregiver.user_id == user.id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver profile not found")
    return caregiver


@router.get("/me")
def get_my_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role == "caregiver":
        caregiver = get_user_caregiver(db, user)
        return serialize_caregiver_profile(user, caregiver)

    return serialize_user_profile(user)


@router.put("/me")
def update_my_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = payload.dict(exclude_unset=True)

    if "name" in updates:
        user.name = payload.name
    if "phone" in updates:
        user.phone = payload.phone

    if user.role == "caregiver":
        caregiver = get_user_caregiver(db, user)
        if "name" in updates:
            caregiver.full_name = payload.name
        if "phone" in updates:
            caregiver.phone = payload.phone
        if "location" in updates:
            caregiver.location = payload.location
        if "address" in updates:
            caregiver.address = payload.address
        if "latitude" in updates:
            caregiver.latitude = payload.latitude
        if "longitude" in updates:
            caregiver.longitude = payload.longitude
        if "gender" in updates:
            caregiver.gender = payload.gender
        if "skills" in updates:
            caregiver.skills = ", ".join(payload.skills) if isinstance(payload.skills, list) else payload.skills
        if "experience" in updates:
            caregiver.experience = payload.experience

        db.commit()
        db.refresh(user)
        db.refresh(caregiver)
        return serialize_caregiver_profile(user, caregiver)

    if "location" in updates:
        user.location = payload.location
    if "address" in updates:
        user.address = payload.address
    if "latitude" in updates:
        user.latitude = payload.latitude
    if "longitude" in updates:
        user.longitude = payload.longitude

    db.commit()
    db.refresh(user)
    return serialize_user_profile(user)
