from fastapi import APIRouter, Depends, HTTPException
from passlib.exc import UnknownHashError
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.caregiver import Caregiver
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin
from app.services.auth_service import hash_password, verify_password, create_access_token
from app.services.assignment_service import validate_caregiver_gender, validate_coordinates
from app.services.document_service import extract_registration_documents, replace_caregiver_documents

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
    caregiver_latitude, caregiver_longitude = (
        validate_coordinates(
            user.latitude,
            user.longitude,
            latitude_label="latitude",
            longitude_label="longitude",
        )
        if user.role == "caregiver"
        else (None, None)
    )

    db_user = User(
        name=user.name,
        phone=user.phone,
        email=user.email,
        password=hash_password(user.password),
        role=user.role
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
            location=user.location,
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
