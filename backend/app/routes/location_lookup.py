from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.geocoding_service import geocode_address

router = APIRouter(prefix="/location", tags=["Location"])


class GeocodeRequest(BaseModel):
    address: str


@router.post("/geocode")
def geocode_address_lookup(payload: GeocodeRequest):
    if not payload.address.strip():
        raise HTTPException(status_code=400, detail="Address is required")

    result = geocode_address(payload.address)
    if not result:
        raise HTTPException(status_code=404, detail="Unable to resolve coordinates for this address")

    return result
