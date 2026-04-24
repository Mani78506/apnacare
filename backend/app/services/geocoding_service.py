import os

from fastapi import HTTPException

try:
    from geopy.geocoders import Nominatim
except Exception:  # pragma: no cover
    Nominatim = None


GEOCODER_USER_AGENT = os.getenv("GEOCODER_USER_AGENT", "apnacare-location-service")


def geocode_address(address: str) -> dict[str, float | str] | None:
    normalized = (address or "").strip()
    if not normalized:
        return None
    if Nominatim is None:
        raise HTTPException(status_code=500, detail="Geocoding service is not available")

    geolocator = Nominatim(user_agent=GEOCODER_USER_AGENT, timeout=10)
    result = geolocator.geocode(normalized)
    if not result:
        return None

    return {
        "address": getattr(result, "address", normalized),
        "latitude": float(result.latitude),
        "longitude": float(result.longitude),
    }


def resolve_address_coordinates(
    *,
    address: str | None,
    latitude: float | None,
    longitude: float | None,
    validate_coordinates,
    address_required_message: str = "Address is required",
    geocode_failure_message: str = "Unable to resolve coordinates for this address",
) -> tuple[str | None, float | None, float | None]:
    normalized_address = (address or "").strip() or None
    if latitude is not None or longitude is not None:
        lat, lng = validate_coordinates(latitude, longitude)
        return normalized_address, lat, lng

    if not normalized_address:
        return None, None, None

    resolved = geocode_address(normalized_address)
    if not resolved:
        raise HTTPException(status_code=400, detail=geocode_failure_message)

    lat, lng = validate_coordinates(
        float(resolved["latitude"]),
        float(resolved["longitude"]),
    )
    return str(resolved["address"]), lat, lng
