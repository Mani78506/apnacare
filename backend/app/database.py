from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import DATABASE_URL


if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured")

normalized_database_url = DATABASE_URL
if normalized_database_url.startswith("postgres://"):
    normalized_database_url = normalized_database_url.replace("postgres://", "postgresql://", 1)

engine_options = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

database_url = make_url(normalized_database_url)
if database_url.get_backend_name().startswith("postgresql"):
    query = dict(database_url.query)
    if "sslmode" not in query and database_url.host not in {"localhost", "127.0.0.1"}:
        query["sslmode"] = "require"
        database_url = database_url.set(query=query)

engine = create_engine(database_url, **engine_options)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
