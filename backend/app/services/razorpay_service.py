import os

from fastapi import HTTPException


def get_razorpay_key_id() -> str:
    key_id = os.getenv("RAZORPAY_KEY_ID")
    if not key_id:
        raise HTTPException(status_code=503, detail="Razorpay is not configured")
    return key_id


def get_razorpay_client():
    key_id = get_razorpay_key_id()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_secret:
        raise HTTPException(status_code=503, detail="Razorpay is not configured")

    try:
        import razorpay
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Razorpay SDK is not installed") from exc

    return razorpay.Client(auth=(key_id, key_secret))
