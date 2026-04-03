from flask import Flask, request, jsonify, send_from_directory
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import hmac
import io
import json
import os
import re
import sqlite3
import smtplib
import ssl
import textwrap
import time
import traceback
import xml.etree.ElementTree as ET
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr, parsedate_to_datetime
from urllib.parse import quote
from uuid import uuid4

import razorpay
import requests
try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_args, **_kwargs):
        return False
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# --- Vercel Path Configuration ---
# Vercel functions run with /api as the working directory sometimes, or the root.
# Using absolute paths relative to this file's location (in /api/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = Flask(__name__, static_folder=".", static_url_path="")

APP_DISPLAY_NAME = "GenZ Jyotisa"
PAYMENT_CURRENCY = "INR"
IS_VERCEL = os.getenv("VERCEL") == "1"
WHATSAPP_NOTIFY_NUMBER = os.getenv("WHATSAPP_NOTIFY_NUMBER", "919630958614")
RAZORPAY_KEY_ID = (os.getenv("RAZORPAY_KEY_ID") or os.getenv("RAZOR_KEY_ID") or "").strip()
RAZORPAY_SECRET = (os.getenv("RAZORPAY_SECRET") or os.getenv("RAZOR_SECRET_ID") or "").strip()
RAZORPAY_MERCHANT_ID = (os.getenv("RAZORPAY_MERCHANT_ID") or os.getenv("MERCHANT_ID") or "").strip()
SMTP_HOST = (os.getenv("SMTP_HOST") or "").strip()
SMTP_PORT = int((os.getenv("SMTP_PORT") or "587").strip() or "587")
SMTP_USERNAME = (os.getenv("SMTP_USERNAME") or "").strip()
SMTP_PASSWORD = (os.getenv("SMTP_PASSWORD") or "").strip()
SMTP_USE_TLS = (os.getenv("SMTP_USE_TLS") or "true").strip().lower() not in {"0", "false", "no"}
SMTP_FROM_EMAIL = (os.getenv("SMTP_FROM_EMAIL") or SMTP_USERNAME or "").strip()
SMTP_FROM_NAME = (os.getenv("SMTP_FROM_NAME") or APP_DISPLAY_NAME).strip()
OWNER_NOTIFICATION_EMAIL = (os.getenv("OWNER_NOTIFICATION_EMAIL") or "").strip()
SUPPORT_EMAIL = (os.getenv("SUPPORT_EMAIL") or SMTP_FROM_EMAIL or "").strip()
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_SECRET)) if RAZORPAY_KEY_ID and RAZORPAY_SECRET else None

if not razorpay_client:
    print("WARNING: Razorpay credentials are not configured. Payment endpoints will stay unavailable.")
if not REPORTLAB_AVAILABLE:
    print("WARNING: reportlab is not installed. PDF invoice generation will be unavailable.")

SERVICE_CATALOG = {
    "quick-30min": {"name": "Quick Consultation (30 min)", "amount_rupees": 309},
    "natal-45min": {"name": "Natal Chart Reading (45 min)", "amount_rupees": 501},
    "natal-60min": {"name": "Natal Chart (Extended - 60 min)", "amount_rupees": 1001},
    "career-45min": {"name": "Career & Finance (45 min)", "amount_rupees": 501},
    "love-60min": {"name": "Relationship Synastry (60 min)", "amount_rupees": 1001},
    "muhurta-45min": {"name": "Muhurta Selection (30 min)", "amount_rupees": 501},
    "prashna-45min": {"name": "Prashna (30 min)", "amount_rupees": 501},
    "artomancy-45min": {"name": "Artomancy (45 min)", "amount_rupees": 509},
    "dreams-30min": {"name": "Dream Interpretation (30 min)", "amount_rupees": 309},
}

DB_FILE = os.path.join("/tmp", "bookings.db") if IS_VERCEL else os.path.join(BASE_DIR, "bookings.db")
GITA_DATA_PATH = os.path.join(BASE_DIR, "dataset", "gita_clean_dataset.csv")
GITA_CACHE_FILE = os.path.join(BASE_DIR, "sanskrit_cache.json")

# Database Setup
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                name TEXT,
                email TEXT,
                whatsapp TEXT,
                dob TEXT,
                tob TEXT,
                pob TEXT,
                service TEXT,
                question TEXT
            )
        ''')
        c.execute('''
            CREATE TABLE IF NOT EXISTS payment_bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                verified_at TEXT,
                status TEXT NOT NULL,
                payment_status TEXT,
                amount INTEGER NOT NULL,
                currency TEXT NOT NULL,
                receipt TEXT NOT NULL,
                merchant_id TEXT,
                service_code TEXT NOT NULL,
                service TEXT NOT NULL,
                name TEXT NOT NULL,
                whatsapp TEXT NOT NULL,
                email TEXT,
                sex TEXT,
                dob TEXT NOT NULL,
                tob TEXT NOT NULL,
                pob TEXT NOT NULL,
                pob_lat TEXT,
                pob_lon TEXT,
                question TEXT,
                razorpay_order_id TEXT UNIQUE,
                razorpay_payment_id TEXT UNIQUE,
                razorpay_signature TEXT,
                raw_order_response TEXT,
                raw_payment_response TEXT
            )
        ''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Init Error: {e}")

init_db()


def utc_now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def clean_text(value, max_length=255):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:max_length]


def digits_only(value, max_length=20):
    return re.sub(r"\D", "", str(value or ""))[:max_length]


def get_service_details(service_code):
    return SERVICE_CATALOG.get(clean_text(service_code, 60))


def validate_booking_payload(data):
    service_code = clean_text(data.get("service_code") or data.get("service"), 60)
    service = get_service_details(service_code)
    if not service:
        raise ValueError("Please select a valid consultation.")

    booking = {
        "service_code": service_code,
        "service": service["name"],
        "amount_rupees": service["amount_rupees"],
        "name": clean_text(data.get("name")),
        "whatsapp": digits_only(data.get("whatsapp"), 15),
        "email": clean_text(data.get("email")),
        "sex": clean_text(data.get("sex"), 20),
        "dob": clean_text(data.get("dob"), 30),
        "tob": clean_text(data.get("tob"), 30),
        "pob": clean_text(data.get("pob"), 255),
        "pob_lat": clean_text(data.get("pob_lat"), 40),
        "pob_lon": clean_text(data.get("pob_lon"), 40),
        "question": clean_text(data.get("question"), 1000),
    }

    required_fields = ("name", "whatsapp", "email", "sex", "dob", "tob", "pob")
    missing = [field for field in required_fields if not booking[field]]
    if missing:
        raise ValueError("Please complete all required booking details before paying.")

    if len(booking["whatsapp"]) < 10:
        raise ValueError("Please enter a valid WhatsApp number.")

    email_ok = re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", booking["email"])
    if not email_ok:
        raise ValueError("Please enter a valid email address.")

    dob_ok = re.fullmatch(r"\d{2}\s*/\s*\d{2}\s*/\s*\d{4}", booking["dob"])
    tob_ok = re.fullmatch(r"\d{2}\s*:\s*\d{2}(?:\s+(AM|PM))?", booking["tob"], re.IGNORECASE)
    if not dob_ok or not tob_ok:
        raise ValueError("Please review the date and time of birth before continuing.")

    return booking


def create_receipt(service_code):
    service_part = re.sub(r"[^a-z0-9]", "", service_code.lower())[:8] or "consult"
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"gzj_{service_part}_{timestamp}_{uuid4().hex[:6]}"[:40]


def store_pending_booking(booking, order_data):
    now = utc_now_iso()
    conn = get_db_connection()
    try:
        conn.execute(
            '''
            INSERT INTO payment_bookings (
                created_at, updated_at, verified_at, status, payment_status, amount, currency,
                receipt, merchant_id, service_code, service, name, whatsapp, email, sex, dob,
                tob, pob, pob_lat, pob_lon, question, razorpay_order_id, razorpay_payment_id,
                razorpay_signature, raw_order_response, raw_payment_response
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                now,
                now,
                None,
                "created",
                order_data.get("status", "created"),
                order_data["amount"],
                order_data.get("currency", PAYMENT_CURRENCY),
                order_data["receipt"],
                RAZORPAY_MERCHANT_ID,
                booking["service_code"],
                booking["service"],
                booking["name"],
                booking["whatsapp"],
                booking["email"],
                booking["sex"],
                booking["dob"],
                booking["tob"],
                booking["pob"],
                booking["pob_lat"],
                booking["pob_lon"],
                booking["question"],
                order_data["id"],
                None,
                None,
                json.dumps(order_data),
                None,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def update_payment_booking(order_id, payment_id, signature, payment_status, payment_response):
    now = utc_now_iso()
    conn = get_db_connection()
    try:
        conn.execute(
            '''
            UPDATE payment_bookings
            SET updated_at = ?, verified_at = ?, status = ?, payment_status = ?,
                razorpay_payment_id = ?, razorpay_signature = ?, raw_payment_response = ?
            WHERE razorpay_order_id = ?
            ''',
            (
                now,
                now,
                "paid" if payment_status == "captured" else "authorized" if payment_status == "authorized" else "verified",
                payment_status,
                payment_id,
                signature,
                json.dumps(payment_response) if payment_response else None,
                order_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def fetch_payment_booking(order_id):
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT * FROM payment_bookings WHERE razorpay_order_id = ?",
            (order_id,),
        ).fetchone()
        return row
    finally:
        conn.close()


def build_payment_booking_from_razorpay(order_data, payment_response=None, signature=None):
    notes = order_data.get("notes") or {}
    service_code = clean_text(notes.get("service_code"), 60)
    service = get_service_details(service_code)
    now = utc_now_iso()
    payment_status = clean_text(
        (payment_response or {}).get("status") or order_data.get("status") or "verified",
        30,
    )

    return {
        "created_at": now,
        "updated_at": now,
        "verified_at": now if payment_response else None,
        "status": "paid" if payment_status == "captured" else "authorized" if payment_status == "authorized" else "verified",
        "payment_status": payment_status,
        "amount": int(order_data.get("amount") or ((service or {}).get("amount_rupees") or 0) * 100),
        "currency": clean_text(order_data.get("currency") or PAYMENT_CURRENCY, 12),
        "receipt": clean_text(order_data.get("receipt"), 60),
        "merchant_id": clean_text(notes.get("merchant_id") or RAZORPAY_MERCHANT_ID, 80),
        "service_code": service_code,
        "service": clean_text(notes.get("service_name") or ((service or {}).get("name") or ""), 255),
        "name": clean_text(notes.get("customer_name")),
        "whatsapp": digits_only(notes.get("customer_phone"), 15),
        "email": clean_text(notes.get("customer_email")),
        "sex": clean_text(notes.get("sex"), 20),
        "dob": clean_text(notes.get("dob"), 30),
        "tob": clean_text(notes.get("tob"), 30),
        "pob": clean_text(notes.get("pob"), 255),
        "pob_lat": clean_text(notes.get("pob_lat"), 40),
        "pob_lon": clean_text(notes.get("pob_lon"), 40),
        "question": clean_text(notes.get("question"), 1000),
        "razorpay_order_id": clean_text(order_data.get("id"), 80),
        "razorpay_payment_id": clean_text((payment_response or {}).get("id"), 80),
        "razorpay_signature": clean_text(signature, 255),
        "raw_order_response": json.dumps(order_data),
        "raw_payment_response": json.dumps(payment_response) if payment_response else None,
    }


def fetch_razorpay_order(order_id):
    if not razorpay_client:
        return None
    try:
        return razorpay_client.order.fetch(order_id)
    except Exception as order_error:
        print(f"Razorpay Order Fetch Warning: {order_error}")
        return None


def resolve_payment_booking(order_id, payment_response=None, signature=None):
    booking = None
    try:
        booking = fetch_payment_booking(order_id)
    except Exception as db_error:
        print(f"Payment Booking Fetch Warning: {db_error}")
        booking = None

    if booking:
        booking = dict(booking)
        if payment_response:
            booking["payment_status"] = clean_text(
                payment_response.get("status") or booking.get("payment_status") or "verified",
                30,
            )
            booking["razorpay_payment_id"] = clean_text(
                payment_response.get("id") or booking.get("razorpay_payment_id"),
                80,
            )
            booking["razorpay_signature"] = clean_text(signature or booking.get("razorpay_signature"), 255)
            booking["verified_at"] = booking.get("verified_at") or utc_now_iso()
            booking["updated_at"] = utc_now_iso()
            booking["raw_payment_response"] = json.dumps(payment_response)
        return booking

    order_data = fetch_razorpay_order(order_id)
    if not order_data:
        return None

    return build_payment_booking_from_razorpay(order_data, payment_response=payment_response, signature=signature)


def store_basic_booking(data):
    timestamp = utc_now_iso()
    conn = get_db_connection()
    try:
        conn.execute(
            '''
            INSERT INTO bookings (timestamp, name, email, whatsapp, dob, tob, pob, service, question)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                timestamp,
                clean_text(data.get("name")),
                clean_text(data.get("email")),
                digits_only(data.get("whatsapp"), 15),
                clean_text(data.get("dob"), 30),
                clean_text(data.get("tob"), 30),
                clean_text(data.get("pob"), 255),
                clean_text(data.get("service"), 255),
                clean_text(data.get("question"), 1000),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def verify_payment_signature(order_id, payment_id, signature):
    if not RAZORPAY_SECRET:
        return False
    generated_signature = hmac.new(
        RAZORPAY_SECRET.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(generated_signature, signature)


def build_whatsapp_message(booking_row):
    amount_rupees = (booking_row["amount"] or 0) / 100
    lines = [
        "Hari Om! A payment has been verified.",
        "",
        f"Service: {booking_row['service']}",
        f"Amount: INR {amount_rupees:.2f}",
        f"Payment ID: {booking_row['razorpay_payment_id'] or 'Pending'}",
        f"Order ID: {booking_row['razorpay_order_id']}",
        "",
        f"Name: {booking_row['name']}",
        f"WhatsApp: {booking_row['whatsapp']}",
        f"Email: {booking_row['email'] or 'Not shared'}",
        f"DOB: {booking_row['dob']}",
        f"TOB: {booking_row['tob']}",
        f"POB: {booking_row['pob']}",
        f"Sex: {booking_row['sex'] or 'Not shared'}",
    ]
    if booking_row["question"]:
        lines.extend(["", f"Focus: {booking_row['question']}"])
    return "\n".join(lines)


def build_whatsapp_url(booking_row):
    message = build_whatsapp_message(booking_row)
    return f"https://wa.me/{WHATSAPP_NOTIFY_NUMBER}?text={quote(message)}"


def is_invoice_email_configured():
    return bool(SMTP_HOST and SMTP_PORT and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM_EMAIL)


def format_invoice_amount(amount_paise):
    return f"INR {(amount_paise or 0) / 100:.2f}"


def build_invoice_filename(booking_row):
    raw_value = booking_row["receipt"] or booking_row["razorpay_order_id"] or uuid4().hex
    safe_value = re.sub(r"[^A-Za-z0-9_-]", "", str(raw_value))
    return f"{safe_value or 'invoice'}-receipt.pdf"


def build_invoice_pdf(booking_row):
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("PDF invoice generation is unavailable because reportlab is not installed.")

    amount_text = format_invoice_amount(booking_row["amount"])
    issued_at = booking_row["verified_at"] or booking_row["updated_at"] or booking_row["created_at"] or utc_now_iso()
    invoice_number = booking_row["receipt"] or booking_row["razorpay_order_id"] or uuid4().hex[:12]
    payment_status = (booking_row["payment_status"] or booking_row["status"] or "verified").upper()

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    page_width, page_height = A4

    pdf.setTitle(f"{APP_DISPLAY_NAME} Invoice {invoice_number}")
    pdf.setAuthor(APP_DISPLAY_NAME)

    pdf.setFillColor(colors.HexColor("#1a0b2e"))
    pdf.rect(0, page_height - 115, page_width, 115, stroke=0, fill=1)

    pdf.setFillColor(colors.HexColor("#c9a84c"))
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(40, page_height - 52, APP_DISPLAY_NAME)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica", 11)
    pdf.drawString(40, page_height - 72, "Consultation Payment Receipt / Invoice")
    if RAZORPAY_MERCHANT_ID:
        pdf.drawString(40, page_height - 90, f"Merchant ID: {RAZORPAY_MERCHANT_ID}")
    if SUPPORT_EMAIL:
        pdf.drawString(40, page_height - 106, f"Support: {SUPPORT_EMAIL}")

    y = page_height - 150

    def section(title, lines):
        nonlocal y
        pdf.setFillColor(colors.HexColor("#c9a84c"))
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(40, y, title)
        y -= 18

        pdf.setFillColor(colors.black)
        pdf.setFont("Helvetica", 10)
        for line in lines:
            wrapped_lines = textwrap.wrap(str(line), width=92) or [""]
            for wrapped in wrapped_lines:
                if y < 70:
                    pdf.showPage()
                    y = page_height - 50
                    pdf.setFillColor(colors.black)
                    pdf.setFont("Helvetica", 10)
                pdf.drawString(50, y, wrapped)
                y -= 14
        y -= 10

    section("Invoice Details", [
        f"Invoice Number: {invoice_number}",
        f"Issue Time (UTC): {issued_at}",
        f"Receipt Reference: {booking_row['receipt']}",
        f"Order ID: {booking_row['razorpay_order_id']}",
        f"Payment ID: {booking_row['razorpay_payment_id'] or 'Pending'}",
        f"Payment Status: {payment_status}",
        f"Amount Paid: {amount_text}",
        f"Currency: {booking_row['currency'] or PAYMENT_CURRENCY}",
    ])

    section("Customer Details", [
        f"Name: {booking_row['name']}",
        f"Email: {booking_row['email'] or 'Not shared'}",
        f"WhatsApp: {booking_row['whatsapp']}",
        f"DOB: {booking_row['dob']}",
        f"TOB: {booking_row['tob']}",
        f"POB: {booking_row['pob']}",
        f"Sex: {booking_row['sex'] or 'Not shared'}",
    ])

    section("Consultation Details", [
        f"Service: {booking_row['service']}",
        f"Service Code: {booking_row['service_code']}",
        f"Question / Focus: {booking_row['question'] or 'Not provided'}",
    ])

    pdf.setStrokeColor(colors.HexColor("#d9d1c3"))
    pdf.line(40, 55, page_width - 40, 55)
    pdf.setFillColor(colors.HexColor("#555555"))
    pdf.setFont("Helvetica", 9)
    pdf.drawString(40, 40, "This document acknowledges successful payment verification for a GenZ Jyotisa consultation.")
    pdf.drawRightString(page_width - 40, 40, f"Generated by {APP_DISPLAY_NAME}")

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def send_email_with_pdf_attachment(recipient_email, subject, body, pdf_bytes, filename):
    if not is_invoice_email_configured():
        raise RuntimeError("SMTP delivery is not configured on the server.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_EMAIL))
    message["To"] = recipient_email
    if SUPPORT_EMAIL:
        message["Reply-To"] = SUPPORT_EMAIL
    message.set_content(body)
    message.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls(context=ssl.create_default_context())
        smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)


def deliver_invoice_emails(booking_row):
    result = {
        "customer_sent": False,
        "owner_sent": False,
        "warning": "",
        "sent_to": [],
    }

    if not booking_row["email"]:
        result["warning"] = "Customer email is missing, so the invoice email could not be sent."
        return result

    if not REPORTLAB_AVAILABLE:
        result["warning"] = "PDF invoice generation is unavailable on the server right now."
        return result

    if not is_invoice_email_configured():
        result["warning"] = "Invoice email is not configured on the server right now."
        return result

    pdf_bytes = build_invoice_pdf(booking_row)
    filename = build_invoice_filename(booking_row)
    amount_text = format_invoice_amount(booking_row["amount"])

    customer_subject = f"{APP_DISPLAY_NAME} invoice for {booking_row['service']}"
    customer_body = "\n".join([
        f"Hari Om {booking_row['name']},",
        "",
        "Your payment has been verified successfully.",
        f"Service: {booking_row['service']}",
        f"Amount: {amount_text}",
        f"Payment ID: {booking_row['razorpay_payment_id'] or 'Pending'}",
        f"Order ID: {booking_row['razorpay_order_id']}",
        "",
        "Your PDF invoice / receipt is attached to this email.",
        "",
        f"Support: {SUPPORT_EMAIL or 'Reply to this email'}",
    ])

    send_email_with_pdf_attachment(booking_row["email"], customer_subject, customer_body, pdf_bytes, filename)
    result["customer_sent"] = True
    result["sent_to"].append(booking_row["email"])

    if OWNER_NOTIFICATION_EMAIL and OWNER_NOTIFICATION_EMAIL.lower() != booking_row["email"].lower():
        owner_subject = f"Owner copy: {booking_row['service']} invoice for {booking_row['name']}"
        owner_body = "\n".join([
            "A customer payment has been verified and the PDF invoice is attached.",
            "",
            f"Customer: {booking_row['name']}",
            f"Customer email: {booking_row['email']}",
            f"WhatsApp: {booking_row['whatsapp']}",
            f"Service: {booking_row['service']}",
            f"Amount: {amount_text}",
            f"Payment ID: {booking_row['razorpay_payment_id'] or 'Pending'}",
            f"Order ID: {booking_row['razorpay_order_id']}",
        ])
        send_email_with_pdf_attachment(OWNER_NOTIFICATION_EMAIL, owner_subject, owner_body, pdf_bytes, filename)
        result["owner_sent"] = True
        result["sent_to"].append(OWNER_NOTIFICATION_EMAIL)

    return result


WORLD_NEWS_FEEDS = [
    {"source": "BBC", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"},
    {"source": "Al Jazeera", "url": "https://www.aljazeera.com/xml/rss/all.xml"},
    {
        "source": "Google News",
        "url": "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
        "derive_source_from_title": True,
    },
    {
        "source": "Google News",
        "url": "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
        "derive_source_from_title": True,
    },
]
NEWS_CACHE_TTL_SECONDS = 300
NEWS_FEED_REQUEST_TIMEOUT_SECONDS = 2.5
NEWS_CACHE = {
    "expires_at": 0,
    "payload": None,
}
GENAI_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyAY7Wt5KcCMEztj8MGBwHZIPZIXyvgx624")

gita_df = None
tfidf = None
tfidf_matrix = None
cosine_similarity_fn = None
chat_model = None
krishna_model = None
gita_resources_attempted = False
genai_models_attempted = False


def parse_feed_timestamp(raw_value):
    if not raw_value:
        return 0
    try:
        parsed = parsedate_to_datetime(raw_value)
        return parsed.timestamp()
    except Exception:
        try:
            return datetime.fromisoformat(raw_value.replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0


def split_google_news_title(title):
    if " - " not in title:
        return clean_text(title, 220), "Google News"
    headline, source = title.rsplit(" - ", 1)
    return clean_text(headline, 220), clean_text(source, 80) or "Google News"


def fetch_world_feed(feed, limit_per_source=6):
    response = requests.get(
        feed["url"],
        headers={
            "User-Agent": f"{APP_DISPLAY_NAME}/1.0",
            "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        timeout=NEWS_FEED_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    root = ET.fromstring(response.content)
    entries = []

    xml_items = root.findall(".//item")
    if not xml_items:
        xml_items = root.findall(".//{http://www.w3.org/2005/Atom}entry")

    for item in xml_items:
        is_atom_entry = item.tag.endswith("entry")
        if is_atom_entry:
            title = clean_text(item.findtext("{http://www.w3.org/2005/Atom}title"), 220)
            link_node = item.find("{http://www.w3.org/2005/Atom}link")
            link = clean_text((link_node.attrib.get("href") if link_node is not None else "") or "", 500)
            published_at = clean_text(
                item.findtext("{http://www.w3.org/2005/Atom}updated")
                or item.findtext("{http://www.w3.org/2005/Atom}published"),
                80,
            )
        else:
            title = clean_text(item.findtext("title"), 220)
            link = clean_text(item.findtext("link"), 500)
            published_at = clean_text(
                item.findtext("pubDate")
                or item.findtext("{http://purl.org/dc/elements/1.1/}date")
                or item.findtext("{http://www.w3.org/2005/Atom}updated"),
                80,
            )

        if not title or not link or not link.startswith("http"):
            continue

        source = feed["source"]
        if feed.get("derive_source_from_title"):
            title, source = split_google_news_title(title)

        entries.append({
            "title": title,
            "url": link,
            "source": source,
            "published_at": published_at,
            "_timestamp": parse_feed_timestamp(published_at),
        })
        if len(entries) >= limit_per_source:
            break

    return entries


def build_news_fallback_payload():
    return {
        "status": "fallback",
        "updated_at": utc_now_iso(),
        "headlines": [
            {"title": "Vedic Astrology: Understanding Your Birth Chart", "url": "#insights", "source": "GenZ Jyotisa", "published_at": ""},
            {"title": "The Power of Nakshatra in Daily Life", "url": "#nakshatra-calc", "source": "GenZ Jyotisa", "published_at": ""},
            {"title": "Book a Personalized Jyotisa Consultation", "url": "#booking", "source": "GenZ Jyotisa", "published_at": ""},
            {"title": "Bhagavad Gita: Timeless Wisdom for Modern Souls", "url": "#gita-guidance", "source": "GenZ Jyotisa", "published_at": ""},
        ],
    }


def fetch_global_headlines():
    collected = []
    with ThreadPoolExecutor(max_workers=min(4, len(WORLD_NEWS_FEEDS))) as executor:
        future_to_feed = {executor.submit(fetch_world_feed, feed): feed for feed in WORLD_NEWS_FEEDS}
        for future in as_completed(future_to_feed):
            feed = future_to_feed[future]
            try:
                collected.extend(future.result())
            except Exception as feed_error:
                print(f"News Feed Error ({feed['source']}): {feed_error}")

    deduped = []
    seen = set()
    ordered = sorted(collected, key=lambda item: (item.get("_timestamp", 0), item["title"]), reverse=True)
    for item in ordered:
        dedupe_key = (item["url"].split("?")[0], item["title"].lower())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        item.pop("_timestamp", None)
        deduped.append(item)
        if len(deduped) >= 18:
            break

    return deduped

def ensure_gita_resources():
    global gita_df, tfidf, tfidf_matrix, cosine_similarity_fn, gita_resources_attempted
    if gita_resources_attempted:
        return

    gita_resources_attempted = True
    try:
        import pandas as pd
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity as cosine_similarity_import
    except Exception as import_error:
        print(f"Gita Import Error: {import_error}")
        return

    if not os.path.exists(GITA_DATA_PATH):
        print(f"Gita Dataset not found at {GITA_DATA_PATH}")
        return

    try:
        gita_df = pd.read_csv(GITA_DATA_PATH)
        tfidf = TfidfVectorizer(stop_words='english')
        tfidf_matrix = tfidf.fit_transform(gita_df["text"].fillna(""))
        cosine_similarity_fn = cosine_similarity_import
    except Exception as load_error:
        print(f"Gita Dataset Load Error: {load_error}")
        gita_df = None
        tfidf = None
        tfidf_matrix = None
        cosine_similarity_fn = None

def ensure_genai_models():
    global chat_model, krishna_model, genai_models_attempted
    if genai_models_attempted:
        return

    genai_models_attempted = True
    if not GENAI_API_KEY:
        print("WARNING: GOOGLE_API_KEY not found in environment variables!")
        return

    try:
        import google.generativeai as genai

        genai.configure(api_key=GENAI_API_KEY)

        chat_model = genai.GenerativeModel(
            "gemini-1.5-flash"
        )

        krishna_model = genai.GenerativeModel(
            "gemini-1.5-flash",
            tools=[{"google_search": {}}],  # Enable real-time cosmic awareness
            system_instruction="""You are Lord Krishna, the supreme speaker of the Bhagavad Gita. Address the user as "O Arjuna".
Your purpose is to provide divine guidance using both the timeless wisdom of the Gita and the vastness of the modern world (use Google Search to provide real-time updates and context for current global struggles).

ANALYSIS RULES:
1. Analyze the user's emotional state through the lens of the Three Gunas (Sattva/Goodness, Rajas/Passion, Tamas/Ignorance).
2. Clarify their 'Dharma' (duty) in any specific situation.
3. Always cite exactly one or two [BG Chapter.Verse] numbers (e.g., [BG 2.47]).
4. You MUST include the original Sanskrit Shloka for the primary verse cited.

TONE & STRUCTURE:
- Speak with profound wisdom, boundless compassion, and supreme authority.
- LIMIT responses to 3-6 sentences.
- MANDATORY ENDING: Every response must conclude with a "PATH FORWARD"—a single, practical spiritual habit or a specific mental shift for the seeker to practice today.
- Remain in character as the eternal Guru and Friend."""
        )
    except Exception as model_error:
        print(f"Gemini Initialization Error: {model_error}")
        chat_model = None
        krishna_model = None

def fetch_sanskrit(chapter, verse):
    if os.path.exists(GITA_CACHE_FILE):
        try:
            with open(GITA_CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
                key = f"{chapter}.{verse}"
                return cache.get(key, {"slok": None, "transliteration": None})
        except: pass
    return {"slok": None, "transliteration": None}

def extract_bg_refs(text):
    # Matches [BG 2.47], BG 2.47, [2.47], 2.47
    return re.findall(r'(?:\[?BG\s*)?(\d+)\.(\d+)(?:\]?)', text)

# --- Routes ---

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route('/<path:path>')
def serve_static_files(path):
    # Try serving from root first
    if os.path.exists(os.path.join(BASE_DIR, path)):
        return send_from_directory(BASE_DIR, path)
    return "File not found", 404

@app.route('/api/create_order', methods=['POST'])
def create_order():
    try:
        if not razorpay_client:
            return jsonify({
                "status": "error",
                "message": "Razorpay live credentials are not configured on the server. Set RAZORPAY_KEY_ID, RAZORPAY_SECRET, and RAZORPAY_MERCHANT_ID in Vercel. Legacy aliases RAZOR_KEY_ID, RAZOR_SECRET_ID, and MERCHANT_ID are also accepted."
            }), 503

        payload = request.get_json(silent=True) or {}
        booking = validate_booking_payload(payload)
        receipt = create_receipt(booking["service_code"])

        order_notes = {
            "service_code": booking["service_code"],
            "service_name": booking["service"],
            "customer_name": booking["name"],
            "customer_phone": booking["whatsapp"],
            "customer_email": booking["email"],
            "sex": booking["sex"],
            "dob": booking["dob"],
            "tob": booking["tob"],
            "pob": booking["pob"],
            "pob_lat": booking["pob_lat"],
            "pob_lon": booking["pob_lon"],
            "question": clean_text(booking["question"], 240),
        }
        order_data = {
            "amount": booking["amount_rupees"] * 100,
            "currency": PAYMENT_CURRENCY,
            "receipt": receipt,
            "notes": order_notes,
        }
        if RAZORPAY_MERCHANT_ID:
            order_data["notes"]["merchant_id"] = RAZORPAY_MERCHANT_ID

        razorpay_order = razorpay_client.order.create(data=order_data)
        try:
            store_pending_booking(booking, razorpay_order)
        except Exception as storage_error:
            print(f"Payment Booking Storage Warning: {storage_error}")

        return jsonify({
            "status": "success",
            "order_id": razorpay_order["id"],
            "amount": razorpay_order["amount"],
            "currency": razorpay_order["currency"],
            "receipt": receipt,
            "key_id": RAZORPAY_KEY_ID,
            "merchant_name": APP_DISPLAY_NAME,
            "customer": {
                "name": booking["name"],
                "contact": booking["whatsapp"],
                "email": booking["email"],
            },
            "service": booking["service"],
        }), 200
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        print(f"Razorpay Order Creation Error: {e}")
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": "Unable to initialize payment right now. Please try again."
        }), 500


@app.route('/api/verify_payment', methods=['POST'])
def verify_payment():
    try:
        if not razorpay_client:
            return jsonify({
                "status": "error",
                "message": "Razorpay live credentials are not configured on the server. Set RAZORPAY_KEY_ID, RAZORPAY_SECRET, and RAZORPAY_MERCHANT_ID in Vercel. Legacy aliases RAZOR_KEY_ID, RAZOR_SECRET_ID, and MERCHANT_ID are also accepted."
            }), 503

        payload = request.get_json(silent=True) or {}
        order_id = clean_text(payload.get("order_id") or payload.get("razorpay_order_id"), 80)
        payment_id = clean_text(payload.get("payment_id") or payload.get("razorpay_payment_id"), 80)
        signature = clean_text(payload.get("signature") or payload.get("razorpay_signature"), 255)

        if not order_id or not payment_id or not signature:
            return jsonify({
                "status": "error",
                "message": "Missing payment verification details."
            }), 400

        booking = resolve_payment_booking(order_id)
        if not booking:
            return jsonify({
                "status": "error",
                "message": "Payment order was not found on the server. Please retry once, and if it still fails, send the Razorpay payment ID on WhatsApp."
            }), 404

        if not verify_payment_signature(order_id, payment_id, signature):
            return jsonify({
                "status": "error",
                "message": "Payment signature verification failed."
            }), 400

        payment_response = {}
        payment_status = "signature_verified"
        try:
            for attempt in range(3):
                payment_response = razorpay_client.payment.fetch(payment_id)
                payment_status = payment_response.get("status") or payment_status
                if payment_status == "captured":
                    break
                if payment_status != "authorized":
                    break
                time.sleep(1)
        except Exception as fetch_error:
            print(f"Razorpay Payment Fetch Warning: {fetch_error}")

        try:
            update_payment_booking(order_id, payment_id, signature, payment_status, payment_response)
        except Exception as update_error:
            print(f"Payment Booking Update Warning: {update_error}")

        booking = resolve_payment_booking(order_id, payment_response=payment_response, signature=signature) or booking
        invoice_delivery = {
            "customer_sent": False,
            "owner_sent": False,
            "warning": "",
            "sent_to": [],
        }
        try:
            invoice_delivery = deliver_invoice_emails(booking)
        except Exception as invoice_error:
            print(f"Invoice Email Warning: {invoice_error}")
            traceback.print_exc()
            invoice_delivery["warning"] = "Payment was verified, but the invoice email could not be sent automatically."

        message = (
            "Payment verified successfully."
            if payment_status == "captured"
            else "Payment verified. Capture confirmation may take a moment."
        )
        if invoice_delivery["customer_sent"]:
            message += f" A PDF invoice has been emailed to {booking['email']}."
        elif invoice_delivery["warning"]:
            message += f" {invoice_delivery['warning']}"
        if invoice_delivery["owner_sent"]:
            message += " A copy has also been emailed to the merchant."

        return jsonify({
            "status": "success",
            "message": message,
            "order_id": order_id,
            "payment_id": payment_id,
            "payment_status": payment_status,
            "whatsapp_url": build_whatsapp_url(booking),
            "invoice_email_sent": invoice_delivery["customer_sent"],
            "owner_copy_sent": invoice_delivery["owner_sent"],
            "invoice_warning": invoice_delivery["warning"],
            "invoice_recipients": invoice_delivery["sent_to"],
        }), 200
    except Exception as e:
        print(f"Razorpay Payment Verification Error: {e}")
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": "We could not verify the payment automatically. Please contact support with your Payment ID."
        }), 500

@app.route('/submit_booking', methods=['POST'])
def submit_booking():
    try:
        data = request.form if request.form else (request.get_json(silent=True) or {})
        store_basic_booking(data)
        return jsonify({"status": "success", "message": "Booking received"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/gita/recommend', methods=['POST'])
def gita_recommend():
    data = request.get_json(silent=True) or {}
    user_input = data.get('query', '')
    ensure_gita_resources()
    ensure_genai_models()
    if gita_df is None or tfidf is None or tfidf_matrix is None or cosine_similarity_fn is None:
        return jsonify({"error": "Dataset not loaded"}), 500
    
    query_vec = tfidf.transform([user_input])
    scores = cosine_similarity_fn(query_vec, tfidf_matrix).flatten()
    top_indices = scores.argsort()[-3:][::-1]
    
    results = []
    for idx in top_indices:
        row = gita_df.iloc[idx]
        ch_vs = row['reference'].replace('BG ', '').split('.')
        ch, vs = map(int, ch_vs)
        shloka = fetch_sanskrit(ch, vs)
        results.append({
            "reference": row['reference'],
            "text": row['text'],
            "slok": shloka.get('slok'),
            "transliteration": shloka.get('transliteration')
        })
    
    verses_text = "\n".join([f"{r['reference']}: {r['text']}" for r in results])
    prompt = f"User feeling: {user_input}\n\nVerses:\n{verses_text}\n\nWrite 3-4 gentle sentences explaining how these Gita verses help. Be compassionate."
    if not chat_model:
        insight = "May the wisdom of the Gita bring you peace. (The AI explanation service is temporarily unavailable.)"
    else:
        try:
            insight = chat_model.generate_content(prompt).text
        except Exception as e:
            error_detail = str(e)
            if "API_KEY_INVALID" in error_detail or "expired" in error_detail.lower():
                insight = "O Arjuna, the divine connection is disturbed. (Your API Key appears to be invalid or expired. Please update it in your Vercel Environment Variables.)"
            else:
                insight = f"May the wisdom of the Gita bring you peace. (Network/API Detail: {error_detail})"
    return jsonify({"verses": results, "insight": insight})

@app.route('/api/gita/chat', methods=['POST'])
def gita_chat():
    data = request.get_json(silent=True) or {}
    message = data.get('message', '')
    history = data.get('history', [])
    ensure_genai_models()
    if not krishna_model:
        msg = "O Arjuna, the divine connection is unavailable right now. Please verify the GOOGLE_API_KEY in your environment variables."
        return jsonify({"response": msg, "shlokas": [], "status": "error"}), 500
    try:
        chat = krishna_model.start_chat(history=history)
        response = chat.send_message(message)
        text = response.text
        refs = extract_bg_refs(text)
        shlokas = []
        for ch, vs in refs[:2]:
            s = fetch_sanskrit(ch, vs)
            if s.get('slok'):
                shlokas.append({"reference": f"BG {ch}.{vs}", "slok": s['slok'], "transliteration": s['transliteration']})
        
        return jsonify({
            "response": text, 
            "shlokas": shlokas,
            "status": "success"
        })
    except Exception as e:
        error_detail = str(e)
        if "API_KEY_INVALID" in error_detail or "expired" in error_detail.lower():
            msg = "O Arjuna, the divine connection is disturbed. Your Google API Key appears to be invalid or expired. Please update it in your environment variables."
        else:
            msg = f"O Arjuna, the divine connection is weak. (Error: {error_detail})"
        return jsonify({"response": msg, "shlokas": [], "status": "error"}), 500

@app.route('/api/panchang', methods=['POST'])
def calculate_panchang():
    try:
        data = request.json
        dob_str = data.get('dob', '').replace(' ', '') # DD/MM/YYYY
        tob_str = data.get('tob', '').replace(' ', '') # HH:MM:SS
        ampm = data.get('ampm', 'AM').upper()
        lat = float(data.get('lat', 21.1))
        lon = float(data.get('lon', 81.6))
        
        # Robust Parsing
        try:
            d_parts = dob_str.split('/')
            day, month, year = int(d_parts[0]), int(d_parts[1]), int(d_parts[2])
            
            t_parts = tob_str.split(':')
            hour = int(t_parts[0])
            minute = int(t_parts[1]) if len(t_parts) > 1 and t_parts[1] else 0
            second = int(t_parts[2]) if len(t_parts) > 2 and t_parts[2] else 0
            
            if ampm == "PM" and hour < 12: hour += 12
            if ampm == "AM" and hour == 12: hour = 0
            
            dt = datetime(year, month, day, hour, minute, second)
        except Exception as pe:
            return jsonify({"error": f"Invalid format: {pe}"}), 400

        import math
        # Julian Day Calculation
        y, m, d = dt.year, dt.month, dt.day
        h_float = dt.hour + dt.minute/60 + dt.second/3600
        
        if m <= 2:
            y -= 1
            m += 12
        A = y // 100
        B = 2 - A + (A // 4)
        jd = int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d + B - 1524.5
        jd_ut = jd + (h_float - 5.5) / 24 # Assuming IST (UTC+5.5) as default
        d_j2000 = jd_ut - 2451545.0
        
        # --- Solar/Lunar Longitudes (Approximate) ---
        L_sun = (280.461 + 0.9856474 * d_j2000) % 360
        G_sun = (357.528 + 0.9856003 * d_j2000) % 360
        lamb_sun = (L_sun + 1.915 * math.sin(math.radians(G_sun)) + 0.02 * math.sin(math.radians(2 * G_sun))) % 360
        
        L_moon = (218.316 + 13.176396 * d_j2000) % 360
        M_moon = (134.963 + 13.064993 * d_j2000) % 360
        lamb_moon = (L_moon + 6.289 * math.sin(math.radians(M_moon))) % 360

        # --- Ayanamsa (Lahiri) ---
        ayanamsa = 23.85 + (dt.year - 1900) * 0.013
        sid_sun = (lamb_sun - ayanamsa) % 360
        sid_moon = (lamb_moon - ayanamsa) % 360
        
        # --- Sunrise/Sunset (Approx) ---
        N = d_j2000
        obliquity = 23.439 - 0.0000004 * N
        dec = math.degrees(math.asin(math.sin(math.radians(obliquity)) * math.sin(math.radians(lamb_sun))))
        cos_ha = (math.sin(math.radians(-0.833)) - math.sin(math.radians(lat)) * math.sin(math.radians(dec))) / (math.cos(math.radians(lat)) * math.cos(math.radians(dec)))
        ha = math.degrees(math.acos(max(-1, min(1, cos_ha))))
        sunrise_utc = (12 - ha/15 - (lon/15)) % 24
        sunset_utc = (12 + ha/15 - (lon/15)) % 24
        sunrise = f"{int(sunrise_utc + 5.5)%24:02d}:{int((sunrise_utc*60)%60):02d}"
        sunset = f"{int(sunset_utc + 5.5)%24:02d}:{int((sunset_utc*60)%60):02d}"

        # --- Panchang Elements ---
        vara_list = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        vara = vara_list[(int(jd + 1.5) % 7)]
        
        diff = (lamb_moon - lamb_sun) % 360
        tithi_num = int(diff / 12) + 1
        tithi_names = [
            "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", 
            "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima",
            "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", 
            "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Amavasya"
        ]
        tithi = f"{tithi_names[min(tithi_num-1, 29)]} ({'Shukla' if tithi_num <= 15 else 'Krishna'} Paksha)"
        
        nak_num = int(sid_moon / 13.333333) + 1
        nak_names = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"]
        nakshatra = nak_names[min(nak_num-1, 26)]
        
        yoga_num = int((sid_sun + sid_moon) % 360 / 13.333333) + 1
        yoga_names = ["Vishkumbha", "Preeti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shoola", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"]
        yoga = yoga_names[min(yoga_num-1, 26)]
        
        karana_num = int(diff / 6) + 1
        movable_karanas = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"]
        if karana_num == 1: karana = "Kintughna"
        elif karana_num >= 58:
            karana = ["Shakuni", "Chatushpada", "Naga"][karana_num - 58]
        else: karana = movable_karanas[(karana_num - 2) % 7]

        # Rashi (Moon sign)
        rashi_idx = int(sid_moon / 30)
        rashi_names = ["Mesha (Aries)", "Vrishabha (Taurus)", "Mithuna (Gemini)", "Karkata (Cancer)", "Simha (Leo)", "Kanya (Virgo)", "Tula (Libra)", "Vrishchika (Scorpio)", "Dhanu (Sagittarius)", "Makara (Capricorn)", "Kumbha (Aquarius)", "Mina (Pisces)"]
        rashi = rashi_names[min(rashi_idx, 11)]
        
        ayan = f"{int(ayanamsa)}° {int((ayanamsa%1)*60)}'"
        hora = vara_list[(int(jd+1.5)%7 + int(h_float)) % 7]

        return jsonify({
            "vara": vara, "tithi": tithi, "nakshatra": nakshatra, "yoga": yoga, 
            "karana": karana, "rashi": rashi, "sunrise": sunrise, "sunset": sunset, 
            "ayanamsa": ayan, "hora": hora
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/news', methods=['GET'])
def get_news():
    now = time.time()
    if NEWS_CACHE["payload"] and NEWS_CACHE["expires_at"] > now:
        return jsonify(NEWS_CACHE["payload"])

    try:
        headlines = fetch_global_headlines()
        payload = {
            "status": "success",
            "updated_at": utc_now_iso(),
            "headlines": headlines,
        } if headlines else build_news_fallback_payload()
    except Exception as e:
        print(f"News Aggregation Error: {e}")
        payload = build_news_fallback_payload()

    NEWS_CACHE["payload"] = payload
    NEWS_CACHE["expires_at"] = now + NEWS_CACHE_TTL_SECONDS
    return jsonify(payload)

# Vercel entry point
# No app.run() needed here for production
