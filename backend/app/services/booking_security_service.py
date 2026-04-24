from __future__ import annotations

import os
import random
from pathlib import Path

from app.models.booking import Booking


QR_CODE_DIRECTORY = Path("qr_codes")


def generate_booking_otp() -> str:
    return str(random.randint(1000, 9999))


def generate_booking_qr_code(booking: Booking) -> str | None:
    if not booking.id or not booking.otp:
        return None

    try:
        import qrcode
    except ImportError:
        return None

    QR_CODE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    file_path = QR_CODE_DIRECTORY / f"booking_{booking.id}.png"
    qr_data = f"{booking.id}:{booking.otp}"
    image = qrcode.make(qr_data)
    image.save(file_path)
    return str(file_path).replace(os.sep, "/")


def refresh_booking_security_artifacts(booking: Booking) -> None:
    booking.otp = generate_booking_otp()
    booking.otp_verified = False
    booking.face_verified = False
    booking.face_verification_status = "pending"
    booking.arrival_selfie_id = None
    booking.manual_override = False
    booking.qr_code_path = generate_booking_qr_code(booking)
