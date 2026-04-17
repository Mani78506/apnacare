from app.database import SessionLocal
from app.models.user import User
from app.services.auth_service import hash_password


ADMIN_EMAIL = "Apnacare@gmail.com"
ADMIN_NAME = "ApnaCare Admin"
ADMIN_PHONE = "9000000000"
ADMIN_PASSWORD = "Admin@123"


def seed_admin() -> None:
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()

        if admin is None:
            admin = User(
                name=ADMIN_NAME,
                phone=ADMIN_PHONE,
                email=ADMIN_EMAIL,
                password=hash_password(ADMIN_PASSWORD),
                role="admin",
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            print(f"Created admin user: {ADMIN_EMAIL}")
        else:
            admin.name = ADMIN_NAME
            admin.phone = ADMIN_PHONE
            admin.password = hash_password(ADMIN_PASSWORD)
            admin.role = "admin"
            db.commit()
            db.refresh(admin)
            print(f"Updated admin user: {ADMIN_EMAIL}")

        print(f"Password: {ADMIN_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
