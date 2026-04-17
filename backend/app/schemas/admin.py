from pydantic import BaseModel


class BookingReassignRequest(BaseModel):
    caregiver_id: int | None = None


class BookingCancelRequest(BaseModel):
    reason: str | None = None


class CaregiverControlRequest(BaseModel):
    note: str | None = None
