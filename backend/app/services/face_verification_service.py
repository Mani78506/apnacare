import logging
import os
import tempfile


logger = logging.getLogger(__name__)


def verify_faces(profile_bytes: bytes, selfie_bytes: bytes) -> dict:
    profile_path = None
    selfie_path = None

    try:
        if profile_bytes == selfie_bytes:
            result = {
                "verified": True,
                "distance": 0.0,
                "threshold": 0.0,
                "message": "Face verified successfully",
            }
            logger.info("Face verification shortcut matched identical image bytes")
            return result

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as profile_temp:
            profile_temp.write(profile_bytes)
            profile_path = profile_temp.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as selfie_temp:
            selfie_temp.write(selfie_bytes)
            selfie_path = selfie_temp.name

        from deepface import DeepFace

        result = DeepFace.verify(
            img1_path=profile_path,
            img2_path=selfie_path,
            enforce_detection=False,
        )
        payload = {
            "verified": bool(result.get("verified")),
            "distance": float(result["distance"]) if result.get("distance") is not None else None,
            "threshold": float(result["threshold"]) if result.get("threshold") is not None else None,
            "message": "Face verified successfully" if result.get("verified") else "Face verification failed. Admin review required.",
        }
        logger.info(
            "Face verification result verified=%s distance=%s threshold=%s",
            payload["verified"],
            payload["distance"],
            payload["threshold"],
        )
        return payload
    except Exception as exc:
        logger.exception("Face verification crashed")
        message = str(exc)
        if "No module named 'deepface'" in message or "No module named 'tensorflow'" in message:
            message = "Face verification service is unavailable in this environment. Admin review required."
        return {
            "verified": False,
            "distance": None,
            "threshold": None,
            "message": f"Face verification failed: {message}",
        }
    finally:
        for path in (profile_path, selfie_path):
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except OSError:
                    pass
