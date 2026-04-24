from pydantic import BaseModel


class CaregiverDocumentInput(BaseModel):
    file_name: str
    content_type: str | None = None
    file_data: str


class UserCreate(BaseModel):
    name: str
    phone: str
    email: str
    password: str
    role: str = "user"
    location: str | None = None
    address: str | None = None
    gender: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    skills: list[str] | None = None
    experience: int | None = None
    document_name: str | None = None
    document_content_type: str | None = None
    document_data: str | None = None
    profile_photo: CaregiverDocumentInput | None = None
    id_proof: CaregiverDocumentInput | None = None
    certificate: CaregiverDocumentInput | None = None

class UserLogin(BaseModel):
    email: str
    password: str
    expected_role: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: str
    role: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
