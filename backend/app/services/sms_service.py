import logging


logger = logging.getLogger(__name__)


def send_sms(phone: str, message: str) -> tuple[bool, str | None]:
    if not phone:
        return False, "Missing recipient phone"

    logger.info("SMS placeholder to %s: %s", phone, message)
    return True, None
