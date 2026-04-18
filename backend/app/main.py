import os
import base64

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
from sqlalchemy import inspect, text
from app.database import Base, SessionLocal, engine
from app.models import booking as booking_model  # noqa: F401
from app.models import caregiver as caregiver_model  # noqa: F401
from app.models import document as document_model  # noqa: F401
from app.models import location as location_model  # noqa: F401
from app.models import notification as notification_model  # noqa: F401
from app.models import payment_transaction as payment_transaction_model  # noqa: F401
from app.models import review as review_model  # noqa: F401
from app.models import user as user_model  # noqa: F401
from app.models.caregiver import Caregiver
from app.models.document import Document
from app.routes import admin, auth, booking, caregiver, onboarding, tracking
from app.routes import task, payment


Base.metadata.create_all(bind=engine)


def ensure_booking_columns() -> None:
    inspector = inspect(engine)
    if "bookings" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("bookings")}
    statements: list[str] = []
    dialect_name = engine.dialect.name
    binary_column_type = "BYTEA" if dialect_name == "postgresql" else "BLOB"

    if "patient_name" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN patient_name VARCHAR")
    if "patient_age" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN patient_age INTEGER")
    if "patient_condition" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN patient_condition VARCHAR DEFAULT 'elderly_care'")
    if "service_type" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN service_type VARCHAR")
    if "notes" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN notes VARCHAR")
    if "duration_type" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN duration_type VARCHAR DEFAULT 'hourly'")
    if "hours" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN hours INTEGER")
    if "days" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN days INTEGER")
    if "months" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN months INTEGER")
    if "payment_method" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN payment_method VARCHAR DEFAULT 'online'")
    if "payment_status" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN payment_status VARCHAR DEFAULT 'pending'")
    if "payment_collected_method" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN payment_collected_method VARCHAR")
    if "amount" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN amount FLOAT DEFAULT 0")
    if "razorpay_order_id" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN razorpay_order_id VARCHAR")
    if "razorpay_payment_id" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN razorpay_payment_id VARCHAR")
    if "cancelled_by" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN cancelled_by VARCHAR")
    if "cancel_reason" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN cancel_reason VARCHAR")
    if "admin_notes" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN admin_notes VARCHAR")
    if "reassigned_from_caregiver_id" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN reassigned_from_caregiver_id INTEGER")
    if "otp" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN otp VARCHAR")
    if "otp_verified" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN otp_verified BOOLEAN DEFAULT FALSE")
    if "qr_code_path" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN qr_code_path VARCHAR")
    if "prescription_file_name" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN prescription_file_name VARCHAR")
    if "prescription_content_type" not in existing_columns:
        statements.append("ALTER TABLE bookings ADD COLUMN prescription_content_type VARCHAR")
    if "prescription_file_data" not in existing_columns:
        statements.append(f"ALTER TABLE bookings ADD COLUMN prescription_file_data {binary_column_type}")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


ensure_booking_columns()


def ensure_caregiver_columns() -> None:
    inspector = inspect(engine)
    if "caregivers" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("caregivers")}
    statements: list[str] = []

    if "location" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN location VARCHAR")
    if "full_name" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN full_name VARCHAR")
    if "phone" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN phone VARCHAR")
    if "status" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN status VARCHAR DEFAULT 'pending'")
    if "document_name" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN document_name VARCHAR")
    if "document_content_type" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN document_content_type VARCHAR")
    if "document_data" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN document_data TEXT")
    if "is_enabled" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN is_enabled BOOLEAN DEFAULT TRUE")
    if "forced_offline" not in existing_columns:
        statements.append("ALTER TABLE caregivers ADD COLUMN forced_offline BOOLEAN DEFAULT FALSE")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


ensure_caregiver_columns()


def ensure_notification_columns() -> None:
    inspector = inspect(engine)
    if "notifications" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("notifications")}
    statements: list[str] = []

    if "user_email" not in existing_columns:
        statements.append("ALTER TABLE notifications ADD COLUMN user_email VARCHAR")
    if "user_phone" not in existing_columns:
        statements.append("ALTER TABLE notifications ADD COLUMN user_phone VARCHAR")
    if "email_status" not in existing_columns:
        statements.append("ALTER TABLE notifications ADD COLUMN email_status VARCHAR DEFAULT 'not_requested'")
    if "sms_status" not in existing_columns:
        statements.append("ALTER TABLE notifications ADD COLUMN sms_status VARCHAR DEFAULT 'not_requested'")
    if "delivery_error" not in existing_columns:
        statements.append("ALTER TABLE notifications ADD COLUMN delivery_error TEXT")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


ensure_notification_columns()


def migrate_legacy_caregiver_documents() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if "caregivers" not in existing_tables or "documents" not in existing_tables:
        return

    session = SessionLocal()
    try:
        caregivers = (
            session.query(Caregiver)
            .filter(Caregiver.document_data.isnot(None))
            .all()
        )
        for caregiver in caregivers:
            existing_id_document = (
                session.query(Document)
                .filter(
                    Document.caregiver_id == caregiver.id,
                    Document.document_type == "id",
                )
                .first()
            )
            if existing_id_document:
                continue

            try:
                file_data = base64.b64decode(caregiver.document_data, validate=True)
            except Exception:
                file_data = caregiver.document_data.encode("utf-8")

            if not file_data:
                continue

            session.add(
                Document(
                    caregiver_id=caregiver.id,
                    document_type="id",
                    file_name=caregiver.document_name or f"caregiver-{caregiver.id}-id-document",
                    content_type=caregiver.document_content_type or "application/octet-stream",
                    file_data=file_data,
                )
            )
        session.commit()
    finally:
        session.close()


migrate_legacy_caregiver_documents()

app = FastAPI(title="ApnaCare API")
os.makedirs("qr_codes", exist_ok=True)

frontend_origins = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:4000,https://apnacare-fhcb.vercel.app"
)
allowed_origins = [origin.strip() for origin in frontend_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/qr_codes", StaticFiles(directory="qr_codes"), name="qr_codes")

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(booking.router, prefix="/booking", tags=["Booking"])
app.include_router(caregiver.router, prefix="/caregiver", tags=["Caregiver"])
app.include_router(onboarding.router)
app.include_router(tracking.router, prefix="/tracking", tags=["Tracking"])
app.include_router(task.router)
app.include_router(payment.router)
app.include_router(admin.router)



@app.get("/")
def root():
    return {"message": "ApnaCare API Running"}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("BACKEND_HOST", "127.0.0.1"),
        port=int(os.getenv("BACKEND_PORT", "9000")),
        reload=os.getenv("BACKEND_RELOAD", "false").lower() == "true",
    )
