from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError
from passlib.exc import UnknownHashError
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.config import FRONTEND_URL
from app.models.caregiver import Caregiver
from app.models.user import User
from app.schemas.user import ForgotPasswordRequest, ResetPasswordRequest, UserCreate, UserLogin
from app.services.auth_service import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.services.assignment_service import validate_caregiver_gender, validate_coordinates
from app.services.document_service import extract_registration_documents, replace_caregiver_documents
from app.services.email_service import send_email
from app.services.geocoding_service import resolve_address_coordinates

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    if user.role == "caregiver":
        if not user.location or user.experience is None or not user.skills:
            raise HTTPException(
                status_code=422,
                detail="Caregiver onboarding requires location, experience, and at least one skill",
            )
        registration_documents = extract_registration_documents(user)
        if not registration_documents:
            raise HTTPException(
                status_code=422,
                detail="Caregiver signup requires profile photo, ID proof, and certificate documents. Legacy clients must upload at least one ID proof document.",
            )
    else:
        registration_documents = []

    caregiver_gender = validate_caregiver_gender(user.gender) if user.role == "caregiver" else None
    caregiver_address, caregiver_latitude, caregiver_longitude = (
        resolve_address_coordinates(
            address=user.address or user.location,
            latitude=user.latitude,
            longitude=user.longitude,
            validate_coordinates=lambda latitude, longitude: validate_coordinates(
                latitude,
                longitude,
                latitude_label="latitude",
                longitude_label="longitude",
            ),
            geocode_failure_message="Unable to resolve coordinates for the caregiver address",
        )
        if user.role == "caregiver"
        else resolve_address_coordinates(
            address=user.address,
            latitude=user.latitude,
            longitude=user.longitude,
            validate_coordinates=lambda latitude, longitude: validate_coordinates(
                latitude,
                longitude,
                latitude_label="latitude",
                longitude_label="longitude",
            ),
            geocode_failure_message="Unable to resolve coordinates for the user address",
        )
    )

    db_user = User(
        name=user.name,
        phone=user.phone,
        email=user.email,
        password=hash_password(user.password),
        role=user.role,
        address=None if user.role == "caregiver" else caregiver_address,
        latitude=None if user.role == "caregiver" else caregiver_latitude,
        longitude=None if user.role == "caregiver" else caregiver_longitude,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    caregiver = None
    if db_user.role == "caregiver":
        caregiver = Caregiver(
            user_id=db_user.id,
            full_name=user.name,
            phone=user.phone,
            location=caregiver_address or user.location or user.address,
            address=caregiver_address or user.address or user.location,
            gender=caregiver_gender,
            experience=user.experience,
            skills=", ".join(user.skills or []),
            status="pending",
            is_verified=False,
            document_name=registration_documents[0]["file_name"] if registration_documents else user.document_name,
            document_content_type=registration_documents[0]["content_type"] if registration_documents else user.document_content_type,
            document_data=user.document_data if not registration_documents else None,
            latitude=caregiver_latitude,
            longitude=caregiver_longitude,
            is_available=False,
            rating=0,
        )
        db.add(caregiver)
        db.commit()
        db.refresh(caregiver)

        if registration_documents:
            replace_caregiver_documents(db, caregiver, registration_documents)
            db.commit()
            db.refresh(caregiver)

    return {
        "id": db_user.id,
        "name": db_user.name,
        "email": db_user.email,
        "phone": db_user.phone,
        "role": db_user.role,
        "caregiver_id": caregiver.id if caregiver else None,
        "caregiver_status": caregiver.status if caregiver else None,
        "caregiver_verified": caregiver.is_verified if caregiver else None,
    }

@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        password_is_valid = verify_password(user.password, db_user.password)
    except UnknownHashError:
        password_is_valid = user.password == db_user.password
        if password_is_valid:
            db_user.password = hash_password(user.password)
            db.commit()
            db.refresh(db_user)

    if not password_is_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.expected_role:
        role_messages = {
            "admin": "This login is only for admin accounts.",
            "caregiver": "This login is only for caregiver accounts.",
            "user": "This login is only for patient accounts.",
        }
        if db_user.role != user.expected_role:
            raise HTTPException(
                status_code=403,
                detail=role_messages.get(user.expected_role, "This login is not allowed for this account."),
            )

    token = create_access_token({
        "user_id": db_user.id,
        "role": db_user.role
    })

    caregiver = None
    if db_user.role == "caregiver":
        caregiver = db.query(Caregiver).filter(Caregiver.user_id == db_user.id).first()

    return {
        "token": token,
        "token_type": "bearer",
        "user": {
            "id": db_user.id,
            "name": db_user.name,
            "email": db_user.email,
            "phone": db_user.phone,
            "role": db_user.role,
            "caregiver_id": caregiver.id if caregiver else None,
            "caregiver_status": caregiver.status if caregiver else None,
            "caregiver_verified": caregiver.is_verified if caregiver else None,
        },
    }


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    requested_role = (data.role or "").strip().lower()
    if requested_role not in {"user", "caregiver"}:
        raise HTTPException(status_code=400, detail="role must be either user or caregiver")

    db_user = db.query(User).filter(User.email == data.email).first()
    if not db_user or db_user.role != requested_role:
        return {"message": "If the account exists, a password reset link has been sent."}

    token = create_password_reset_token(db_user.email, db_user.role)
    reset_url = f"{FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    send_email(
        db_user.email,
        "Reset your ApnaCare password",
        f"Use the following secure link to reset your ApnaCare password: {reset_url}",
        recipient_name=db_user.name,
        details={
            "Role": "Caregiver" if db_user.role == "caregiver" else "Patient",
            "Reset link": reset_url,
            "Valid for": "30 minutes",
        },
    )
    return {"message": "If the account exists, a password reset link has been sent."}


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(data.new_password.strip()) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    try:
        payload = decode_password_reset_token(data.token)
    except JWTError as exc:
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired") from exc

    email = payload.get("sub")
    role = payload.get("role")
    if not email or role not in {"user", "caregiver"}:
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired")

    db_user = db.query(User).filter(User.email == email, User.role == role).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Account not found")

    db_user.password = hash_password(data.new_password.strip())
    db.commit()
    return {"message": "Password reset successful"}
