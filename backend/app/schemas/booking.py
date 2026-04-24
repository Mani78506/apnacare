from pydantic import BaseModel


class BookingPrescriptionUpload(BaseModel):
    file_name: str
    content_type: str | None = None
    file_data: str


class BookingCreate(BaseModel):
    patient_name: str
    age: int
    date: str
    time: str
    service_type: str = "elder_care"
    patient_condition: str = "elderly_care"
    preferred_gender: str = "any"
    user_address: str | None = None
    user_latitude: float | None = None
    user_longitude: float | None = None
    search_radius_km: float = 10
    notes: str = ""
    duration_type: str = "hourly"
    hours: int | None = 1
    days: int | None = None
    months: int | None = None
    payment_method: str = "online"
    prescription: BookingPrescriptionUpload | None = None


class BookingOtpVerify(BaseModel):
    booking_id: int
    entered_otp: str
