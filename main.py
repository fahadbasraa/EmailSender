import os
import re
import time
import base64
import logging
from datetime import datetime
from typing import Optional
from pathlib import Path

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from fastapi import FastAPI, File, UploadFile, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

# ─── Init ─────────────────────────────────────────────────────────────────────
# ─── Init ─────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv() # Fallback for Vercel environment variables

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────
# We use Gmail SMTP, thus we need an App Password for the sender email
EMAIL_PASSWORD: str   = os.getenv("EMAIL_PASSWORD", "")
SENDER_EMAIL:   str   = os.getenv("SENDER_EMAIL", "")
SENDER_NAME:    str   = os.getenv("SENDER_NAME", "CV Sender")
MAX_FILE_SIZE:  int   = 5 * 1024 * 1024   # 5 MB
DELAY_BETWEEN:  float = 0.2               # reduced for Vercel's 10-second timeout
MAX_RETRIES:    int   = 1                 # retry attempts per email on failure

# SMTP settings (defaults to Gmail if not provided in .env)
SMTP_SERVER   = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", 587))

# ─── App ──────────────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="CV Bulk Email Sender", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# ─── In-memory email log ──────────────────────────────────────────────────────
email_logs: list[dict] = []

# ─── Helpers ──────────────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def validate_email(addr: str) -> bool:
    return bool(_EMAIL_RE.match(addr.strip()))


def parse_emails(raw: str) -> list[str]:
    """Split on commas, semicolons, spaces or newlines, strip whitespace, and remove duplicates."""
    # Delimiters: comma, semicolon, newline, carriage return, and space.
    parts = re.split(r"[,;\n\r\s]+", raw)
    
    cleaned = [p.strip() for p in parts if p.strip()]
    
    # Remove duplicates while preserving order
    return list(dict.fromkeys(cleaned))


def _log(email: str, status: str, filename: str, error: str = "") -> dict:
    entry = {
        "email":     email,
        "status":    status,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "filename":  filename,
        "error":     error,
    }
    email_logs.append(entry)
    return entry


def send_via_smtp(
    to_email:     str,
    subject:      str,
    message:      str,
    raw_cv_bytes: bytes,
    cv_filename:  str,
    display_name: str,
) -> tuple[bool, str]:
    """
    Send one email directly via Gmail SMTP.
    Returns:
        (True, "")           on success
        (False, error_msg)   on any failure
    """
    try:
        # 1. Build the multi-part email
        msg = MIMEMultipart()
        msg["From"]    = f"{display_name} <{SENDER_EMAIL}>"
        msg["To"]      = to_email
        msg["Subject"] = subject

        # Attach text body
        msg.attach(MIMEText(message, "plain"))

        # Attach PDF
        pdf_attachment = MIMEApplication(raw_cv_bytes, _subtype="pdf")
        pdf_attachment.add_header("Content-Disposition", "attachment", filename=cv_filename)
        msg.attach(pdf_attachment)

        # 2. Connect to SMTP and send
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls()  # Secure the connection
            server.ehlo()
            # Login uses email + Google App Password
            server.login(SENDER_EMAIL, EMAIL_PASSWORD)
            
            # Send
            server.send_message(msg)

        logger.info(f"✓ Gmail SMTP accepted email to {to_email}")
        return True, ""

    except smtplib.SMTPAuthenticationError as exc:
        msg = "Authentication failed. Make sure you are using an App Password."
        logger.error(f"✗ SMTP Auth error: {exc}")
        return False, msg

    except smtplib.SMTPException as exc:
        msg = f"SMTP error: {exc}"
        logger.error(f"✗ SMTP error sending to {to_email}: {exc}")
        return False, msg

    except Exception as exc:
        msg = f"Unexpected error: {exc}"
        logger.error(f"✗ Unexpected error sending to {to_email}: {exc}")
        return False, msg


def send_with_retry(
    to_email:     str,
    subject:      str,
    message:      str,
    raw_cv_bytes: bytes,
    cv_filename:  str,
    display_name: str,
    max_retries:  int = MAX_RETRIES,
) -> tuple[bool, str]:
    """
    Wrap send_via_smtp with automatic retry on transient failures.
    Waits 3 seconds between retry attempts.
    """
    for attempt in range(1, max_retries + 1):
        ok, error = send_via_smtp(
            to_email, subject, message, raw_cv_bytes, cv_filename, display_name
        )
        if ok:
            return True, ""

        logger.warning(f"  Attempt {attempt}/{max_retries} failed for {to_email}: {error}")
        if attempt < max_retries:
            logger.info(f"  Retrying in 3 s…")
            time.sleep(3)

    return False, error   # return last error after all retries exhausted


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/logs")
async def get_logs():
    """Return the last 100 log entries (newest first)."""
    return {"logs": list(reversed(email_logs[-100:]))}


@app.post("/api/send-emails")
@limiter.limit("5/minute")
async def send_emails(
    request:     Request,
    email_list:  str        = Form(...),
    subject:     str        = Form(...),
    message:     str        = Form(...),
    cv_file:     UploadFile = File(...),
    sender_name: Optional[str] = Form(None),
):
    # ── 1. Config guard ───────────────────────────────────────────────────────
    if not EMAIL_PASSWORD:
        raise HTTPException(status_code=500, detail="EMAIL_PASSWORD is not set in .env")
    if not SENDER_EMAIL:
        raise HTTPException(status_code=500, detail="SENDER_EMAIL is not set in .env")

    # ── 2. File validation ────────────────────────────────────────────────────
    if not cv_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    raw_bytes = await cv_file.read()
    if len(raw_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large ({len(raw_bytes)//1024} KB). Maximum is 5 MB.",
        )

    logger.info(f"CV loaded: {cv_file.filename} ({len(raw_bytes)//1024} KB)")

    # ── 3. Email parsing & validation ─────────────────────────────────────────
    all_emails     = parse_emails(email_list)
    valid_emails   = [e for e in all_emails if validate_email(e)]
    invalid_emails = [e for e in all_emails if not validate_email(e)]

    if not valid_emails:
        raise HTTPException(status_code=400, detail="No valid e-mail addresses found.")

    if invalid_emails:
        logger.warning(f"Skipping {len(invalid_emails)} invalid address(es): {invalid_emails}")

    display_name = sender_name.strip() if sender_name and sender_name.strip() else SENDER_NAME
    logger.info(f"Starting send: {len(valid_emails)} recipient(s) | sender={display_name} <{SENDER_EMAIL}>")

    # ── 4. Send loop ──────────────────────────────────────────────────────────
    results:      list[dict] = []
    sent_count   = 0
    failed_count = 0

    for idx, email in enumerate(valid_emails):
        logger.info(f"[{idx+1}/{len(valid_emails)}] Sending to {email}…")

        # send_with_retry returns (True,"") on success or (False, error) on fail
        ok, error = send_with_retry(
            to_email     = email,
            subject      = subject,
            message      = message,
            raw_cv_bytes = raw_bytes,
            cv_filename  = cv_file.filename,
            display_name = display_name,
        )

        if ok:
            sent_count += 1
            entry = _log(email, "sent", cv_file.filename)
        else:
            failed_count += 1
            entry = _log(email, "failed", cv_file.filename, error=error)

        results.append(entry)

        # ── 2-second courtesy delay between sends (skip after last one) ───
        if idx < len(valid_emails) - 1:
            time.sleep(DELAY_BETWEEN)

    logger.info(
        f"Done. Sent: {sent_count} | Failed: {failed_count} | Total: {len(valid_emails)}"
    )

    return JSONResponse({
        "success": True,
        "summary": {
            "total":          len(valid_emails),
            "sent":           sent_count,
            "failed":         failed_count,
            "invalid_emails": invalid_emails,
        },
        "results": results,
    })
