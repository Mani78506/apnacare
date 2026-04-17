import base64
import mimetypes

from fastapi import HTTPException

from app.models.document import Document

MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024
DOCUMENT_ORDER = {"profile": 0, "id": 1, "certificate": 2}


def decode_document_payload(file_data: str) -> bytes:
    if not file_data:
        raise HTTPException(status_code=400, detail="Document data is required")

    payload = file_data.split(",", 1)[1] if file_data.startswith("data:") and "," in file_data else file_data
    try:
        raw_bytes = base64.b64decode(payload, validate=True)
    except Exception as exc:  # pragma: no cover - defensive validation
        raise HTTPException(status_code=400, detail="Invalid document encoding") from exc

    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded document is empty")
    if len(raw_bytes) > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Document exceeds 10MB limit")
    return raw_bytes


def infer_content_type(file_name: str | None, content_type: str | None) -> str:
    if content_type:
        return content_type
    guessed, _ = mimetypes.guess_type(file_name or "")
    return guessed or "application/octet-stream"


def serialize_document(document: Document) -> dict:
    return {
        "id": document.id,
        "document_type": document.document_type,
        "file_name": document.file_name,
        "uploaded_at": document.uploaded_at.isoformat() if document.uploaded_at else None,
    }


def sort_documents(documents: list[Document]) -> list[Document]:
    return sorted(
        documents,
        key=lambda item: (DOCUMENT_ORDER.get(item.document_type, 99), item.id or 0),
    )


def get_primary_document(documents: list[Document]) -> Document | None:
    ordered = sort_documents(documents)
    return ordered[0] if ordered else None


def extract_registration_documents(payload) -> list[dict]:
    explicit_documents = {
        "profile": getattr(payload, "profile_photo", None),
        "id": getattr(payload, "id_proof", None),
        "certificate": getattr(payload, "certificate", None),
    }
    provided_explicit = {key: value for key, value in explicit_documents.items() if value is not None}

    if provided_explicit:
        missing = [key for key, value in explicit_documents.items() if value is None]
        if missing:
            missing_labels = ", ".join(missing)
            raise HTTPException(
                status_code=422,
                detail=f"Missing required caregiver documents: {missing_labels}",
            )
        return [
            {
                "document_type": document_type,
                "file_name": document.file_name,
                "content_type": infer_content_type(document.file_name, document.content_type),
                "file_data": decode_document_payload(document.file_data),
            }
            for document_type, document in explicit_documents.items()
        ]

    legacy_data = getattr(payload, "document_data", None)
    if legacy_data:
        legacy_name = getattr(payload, "document_name", None) or "caregiver-id-document"
        legacy_content_type = infer_content_type(
            legacy_name,
            getattr(payload, "document_content_type", None),
        )
        return [
            {
                "document_type": "id",
                "file_name": legacy_name,
                "content_type": legacy_content_type,
                "file_data": decode_document_payload(legacy_data),
            }
        ]

    return []


def replace_caregiver_documents(db, caregiver, documents: list[dict]) -> list[Document]:
    if not documents:
        return []

    existing_documents = list(getattr(caregiver, "documents", []) or [])
    for document in existing_documents:
        db.delete(document)
    db.flush()

    stored_documents: list[Document] = []
    for item in documents:
        document = Document(
            caregiver_id=caregiver.id,
            document_type=item["document_type"],
            file_name=item["file_name"],
            content_type=item["content_type"],
            file_data=item["file_data"],
        )
        db.add(document)
        stored_documents.append(document)

    return stored_documents
