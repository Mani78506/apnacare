import logging
import os
import json
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from urllib import error, request


logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "ApnaCare <onboarding@resend.dev>")
RESEND_API_URL = "https://api.resend.com/emails"


def _build_details_markup(details: dict[str, str] | None) -> str:
    if not details:
        return ""

    rows = []
    for label, value in details.items():
        if value is None or value == "":
            continue
        rows.append(
            f"""
            <tr>
              <td style="padding:10px 0;color:#5b6471;font-size:14px;">{escape(str(label))}</td>
              <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{escape(str(value))}</td>
            </tr>
            """
        )

    if not rows:
        return ""

    return f"""
    <div style="margin-top:24px;padding:20px;border:1px solid #dbe7f0;border-radius:18px;background:#f8fbfd;">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;">Booking Details</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-collapse:collapse;">
        {''.join(rows)}
      </table>
    </div>
    """


def _build_html_email(*, recipient_name: str | None, title: str, body: str, details: dict[str, str] | None = None) -> str:
    safe_name = escape(recipient_name or "Customer")
    safe_title = escape(title)
    safe_body = escape(body).replace("\n", "<br>")
    details_markup = _build_details_markup(details)

    return f"""
    <html>
      <body style="margin:0;padding:0;background:#eef6f8;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
        <div style="max-width:680px;margin:0 auto;padding:32px 16px;">
          <div style="background:linear-gradient(135deg,#0f766e,#0b4f6c);border-radius:28px;padding:32px;color:#ffffff;">
            <div style="font-size:13px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.9;">ApnaCare</div>
            <h1 style="margin:14px 0 8px;font-size:30px;line-height:1.1;">Care at home, coordinated with confidence.</h1>
            <p style="margin:0;font-size:15px;line-height:1.7;opacity:0.92;">Personalized home care updates, booking confirmations, payment alerts, and caregiver journey notifications from ApnaCare.</p>
          </div>
          <div style="background:#ffffff;border-radius:28px;margin-top:18px;padding:32px;border:1px solid #d9e6ee;box-shadow:0 18px 60px rgba(15,23,42,0.08);">
            <div style="font-size:15px;color:#334155;">Welcome, <strong>{safe_name}</strong></div>
            <h2 style="margin:10px 0 12px;font-size:24px;color:#0f172a;">{safe_title}</h2>
            <p style="margin:0;font-size:15px;line-height:1.8;color:#475569;">{safe_body}</p>
            {details_markup}
            <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#64748b;">
              This is an automated message from ApnaCare. If you need help with your booking, caregiver, or payment, contact the ApnaCare support team.
            </div>
          </div>
        </div>
      </body>
    </html>
    """


def send_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    recipient_name: str | None = None,
    details: dict[str, str] | None = None,
) -> tuple[bool, str | None]:
    if not to_email:
        return False, "Missing recipient email"
    if not RESEND_API_KEY:
        return False, "Resend API key is not configured"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = RESEND_FROM_EMAIL
    msg["To"] = to_email
    html_body = _build_html_email(recipient_name=recipient_name, title=subject, body=body, details=details)
    plain_body = body
    msg.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    payload = json.dumps(
        {
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "text": plain_body,
        }
    ).encode("utf-8")
    req = request.Request(
        RESEND_API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "apnacare-backend/1.0",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            response.read()
        return True, None
    except error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        logger.exception("Resend rejected email to %s", to_email)
        return False, f"Resend HTTP {exc.code}: {error_body}"
    except Exception as exc:
        logger.exception("Failed to send email to %s", to_email)
        return False, str(exc)
