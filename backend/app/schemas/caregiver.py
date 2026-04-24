from pydantic import BaseModel


class CaregiverDocumentInput(BaseModel):
    file_name: str
    content_type: str | None = None
    file_data: str


class CaregiverLocationUpdate(BaseModel):
    caregiver_id: int
    booking_id: int | None = None
    lat: float
    lng: float


class CaregiverStatusUpdate(BaseModel):
    booking_id: int
    status: str


class CaregiverAvailabilityUpdate(BaseModel):
    caregiver_id: int | None = None
    is_available: bool
    latitude: float | None = None
    longitude: float | None = None


class CaregiverProfileRegistration(BaseModel):
    name: str
    email: str
    password: str
    phone: str
    location: str
    gender: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    skills: list[str]
    experience: int
    document_name: str | None = None
    document_content_type: str | None = None
    document_data: str | None = None
    profile_photo: CaregiverDocumentInput | None = None
    id_proof: CaregiverDocumentInput | None = None
    certificate: CaregiverDocumentInput | None = None
