from fastapi import APIRouter, Depends, Header, HTTPException, Response
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.caregiver import Caregiver
from app.models.document import Document
from app.models.user import User
from app.schemas.caregiver import CaregiverProfileRegistration
from app.services.auth_service import create_access_token, decode_access_token, hash_password
from app.services.document_service import (
    extract_registration_documents,
    get_primary_document,
    serialize_document,
    sort_documents,
    replace_caregiver_documents,
)
from app.services.notification_service import create_notification

router = APIRouter(prefix="/caregiver", tags=["Caregiver Onboarding"])


def get_current_payload(authorization: str | None = Header(default=None)):
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

    payload["user_id"] = int(user_id)
    return payload


def get_current_admin(payload: dict = Depends(get_current_payload)):
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


def get_current_caregiver(
    db: Session = Depends(get_db),
    payload: dict = Depends(get_current_payload),
):
    if payload.get("role") != "caregiver":
        raise HTTPException(status_code=403, detail="Caregiver access required")

    caregiver = db.query(Caregiver).filter(Caregiver.user_id == payload["user_id"]).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver profile not found")
    return caregiver


def serialize_caregiver(caregiver: Caregiver, email: str | None = None):
    documents = sort_documents(list(caregiver.documents or []))
    primary_document = get_primary_document(documents)
    return {
        "id": caregiver.id,
        "user_id": caregiver.user_id,
        "full_name": caregiver.full_name,
        "phone": caregiver.phone,
        "email": email,
        "location": caregiver.location,
        "skills": [item.strip() for item in (caregiver.skills or "").split(",") if item.strip()],
        "experience": caregiver.experience,
        "status": caregiver.status,
        "is_available": caregiver.is_available,
        "is_enabled": caregiver.is_enabled,
        "forced_offline": caregiver.forced_offline,
        "is_verified": caregiver.is_verified,
        "document_name": primary_document.file_name if primary_document else caregiver.document_name,
        "document_uploaded": bool(documents) or bool(caregiver.document_data),
        "documents": [serialize_document(document) for document in documents],
    }


@router.post("/register")
def register_caregiver(payload: CaregiverProfileRegistration, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    registration_documents = extract_registration_documents(payload)
    if not registration_documents:
        raise HTTPException(
            status_code=422,
            detail="Caregiver registration requires profile photo, ID proof, and certificate documents. Legacy clients must upload at least one ID proof document.",
        )

    user = User(
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        password=hash_password(payload.password),
        role="caregiver",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    caregiver = Caregiver(
        user_id=user.id,
        full_name=payload.name,
        phone=payload.phone,
        location=payload.location,
        skills=", ".join(payload.skills),
        experience=payload.experience,
        status="pending",
        is_available=False,
        is_enabled=True,
        forced_offline=False,
        is_verified=False,
        document_name=registration_documents[0]["file_name"] if registration_documents else payload.document_name,
        document_content_type=registration_documents[0]["content_type"] if registration_documents else payload.document_content_type,
        document_data=payload.document_data if not registration_documents else None,
        latitude=17.3850,
        longitude=78.4867,
        rating=0,
    )
    db.add(caregiver)
    db.commit()
    db.refresh(caregiver)

    if registration_documents:
        replace_caregiver_documents(db, caregiver, registration_documents)
        db.commit()
        db.refresh(caregiver)

    token = create_access_token({"user_id": user.id, "role": user.role})

    return {
        "message": "Application submitted. Waiting for approval",
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
            "caregiver_id": caregiver.id,
            "caregiver_status": caregiver.status,
            "caregiver_verified": caregiver.is_verified,
        },
        "caregiver": serialize_caregiver(caregiver, email=user.email),
    }


@router.get("/all")
def get_all_caregivers(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    caregivers = db.query(Caregiver).order_by(Caregiver.id.desc()).all()
    emails_by_user_id = (
        {
            user.id: user.email
            for user in db.query(User).filter(User.id.in_([caregiver.user_id for caregiver in caregivers])).all()
        }
        if caregivers
        else {}
    )

    return {
        "caregivers": [
            serialize_caregiver(caregiver, email=emails_by_user_id.get(caregiver.user_id))
            for caregiver in caregivers
        ]
    }


@router.get("/me")
def get_my_caregiver_profile(
    caregiver: Caregiver = Depends(get_current_caregiver),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == caregiver.user_id).first()
    return {"caregiver": serialize_caregiver(caregiver, email=user.email if user else None)}


@router.get("/document/{doc_id}")
def get_caregiver_document(doc_id: int, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return Response(
        content=document.file_data,
        media_type=document.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{document.file_name}"',
        },
    )


@router.post("/approve/{id}")
def approve_caregiver(
    id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    caregiver = db.query(Caregiver).filter(Caregiver.id == id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver not found")

    caregiver.status = "approved"
    caregiver.is_verified = True
    caregiver.is_available = True
    caregiver.is_enabled = True
    caregiver.forced_offline = False
    db.commit()
    db.refresh(caregiver)

    user = db.query(User).filter(User.id == caregiver.user_id).first()
    if user:
        create_notification(
            db,
            user_id=user.id,
            role="caregiver",
            title="Application approved",
            message="Your caregiver profile has been approved. You can now go online and accept jobs.",
            type="caregiver_approved",
        )
        db.commit()
    return {
        "message": "Caregiver approved",
        "caregiver": serialize_caregiver(caregiver, email=user.email if user else None),
    }


@router.post("/reject/{id}")
def reject_caregiver(
    id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    caregiver = db.query(Caregiver).filter(Caregiver.id == id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver not found")

    caregiver.status = "rejected"
    caregiver.is_verified = False
    caregiver.is_available = False
    caregiver.forced_offline = True
    db.commit()
    db.refresh(caregiver)

    user = db.query(User).filter(User.id == caregiver.user_id).first()
    if user:
        create_notification(
            db,
            user_id=user.id,
            role="caregiver",
            title="Application rejected",
            message="Your caregiver profile needs more review before it can go live. Please contact support if needed.",
            type="caregiver_rejected",
        )
        db.commit()
    return {
        "message": "Caregiver rejected",
        "caregiver": serialize_caregiver(caregiver, email=user.email if user else None),
    }


@router.get("/{id}")
def get_caregiver_by_id(id: int, db: Session = Depends(get_db)):
    caregiver = db.query(Caregiver).filter(Caregiver.id == id).first()
    if not caregiver:
        raise HTTPException(status_code=404, detail="Caregiver not found")

    user = db.query(User).filter(User.id == caregiver.user_id).first()
    return {"caregiver": serialize_caregiver(caregiver, email=user.email if user else None)}
