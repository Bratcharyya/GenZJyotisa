from flask import Flask, request, jsonify, send_from_directory
import os
import json
import sqlite3
import pandas as pd
import google.generativeai as genai
from datetime import datetime
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
import requests
import razorpay
import xml.etree.ElementTree as ET

app = Flask(__name__, static_folder=".", static_url_path="")

# Razorpay Client Initialization
RAZORPAY_KEY_ID = "rzp_test_SWEFJ7XQd5AYV3"
RAZORPAY_SECRET = "NGgLFiD1ZyXPpSgKfPO4TNx1"
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_SECRET))

# --- Vercel Path Configuration ---
# Vercel functions run with /api as the working directory sometimes, or the root.
# Using absolute paths relative to this file's location (in /api/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_FILE = os.path.join(BASE_DIR, "bookings.db")
GITA_DATA_PATH = os.path.join(BASE_DIR, "dataset", "gita_clean_dataset.csv")
GITA_CACHE_FILE = os.path.join(BASE_DIR, "sanskrit_cache.json")

# Database Setup
def init_db():
    try:
        conn = sqlite3.connect(DB_FILE)
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
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Init Error: {e}")

init_db()

# --- Bhagavad Gita Configuration ---
try:
    if os.path.exists(GITA_DATA_PATH):
        gita_df = pd.read_csv(GITA_DATA_PATH)
        tfidf = TfidfVectorizer(stop_words='english')
        tfidf_matrix = tfidf.fit_transform(gita_df['text'])
    else:
        print(f"Gita Dataset not found at {GITA_DATA_PATH}")
        gita_df = None
except Exception as e:
    print(f"Error loading Gita dataset: {e}")
    gita_df = None

# Configure Gemini
GENAI_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyAY7Wt5KcCMEztj8MGBwHZIPZIXyvgx624")
if not GENAI_API_KEY:
    print("WARNING: GOOGLE_API_KEY not found in environment variables!")
else:
    print("GOOGLE_API_KEY found. Initializing AI...")

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
        data = request.json
        amount = int(data.get('amount', 0)) * 100  # Convert to paise
        currency = "INR"
        
        if amount <= 0:
            return jsonify({"status": "error", "message": "Invalid amount"}), 400
            
        order_receipt = f"rcptid_{int(datetime.now().timestamp())}"
        
        order_data = {
            "amount": amount,
            "currency": currency,
            "receipt": order_receipt,
            "payment_capture": 1 # Auto capture
        }
        
        # Create order with Razorpay
        razorpay_order = razorpay_client.order.create(data=order_data)
        
        return jsonify({
            "status": "success",
            "order_id": razorpay_order['id'],
            "amount": razorpay_order['amount'],
            "currency": razorpay_order['currency']
        }), 200
        
    except Exception as e:
        print(f"Razorpay Order Creation Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/submit_booking', methods=['POST'])
def submit_booking():
    data = request.form
    name = data.get('name', '')
    email = data.get('email', '')
    whatsapp = data.get('whatsapp', '')
    dob = data.get('dob', '')
    tob = data.get('tob', '')
    pob = data.get('pob', '')
    service = data.get('service', '')
    question = data.get('question', '')
    timestamp = datetime.now().isoformat()

    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''
            INSERT INTO bookings (timestamp, name, email, whatsapp, doB, tob, pob, service, question)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (timestamp, name, email, whatsapp, dob, tob, pob, service, question))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Booking received"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/gita/recommend', methods=['POST'])
def gita_recommend():
    data = request.json
    user_input = data.get('query', '')
    if gita_df is None: return jsonify({"error": "Dataset not loaded"}), 500
    
    query_vec = tfidf.transform([user_input])
    scores = cosine_similarity(query_vec, tfidf_matrix).flatten()
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
    data = request.json
    message = data.get('message', '')
    history = data.get('history', [])
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
    try:
        url = "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        root = ET.fromstring(response.content)
        items = root.findall('.//item')[:10]
        headlines = []
        for item in items:
            title = item.find('title')
            link = item.find('link')
            if title is not None and link is not None:
                headlines.append(f"[{title.text}]({link.text})")
        if not headlines: raise ValueError("No news items found")
        return jsonify({"news": " | ".join(headlines)})
    except Exception as e:
        return jsonify({"news": "✦ Spiritual wisdom is eternal... ✦ Celestial events unfolding... ✦"})

# Vercel entry point
# No app.run() needed here for production
