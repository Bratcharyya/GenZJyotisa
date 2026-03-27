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

app = Flask(__name__, static_folder=".", static_url_path="")

# Database Setup
DB_FILE = "bookings.db"

def init_db():
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

init_db()

# --- Bhagavad Gita Configuration ---
GITA_DATA_PATH = "dataset/gita_clean_dataset.csv"
GITA_CACHE_FILE = "sanskrit_cache.json"

# Load Dataset for recommendations
try:
    gita_df = pd.read_csv(GITA_DATA_PATH)
    # Using TF-IDF for lightweight, Vercel-friendly recommendations
    tfidf = TfidfVectorizer(stop_words='english')
    tfidf_matrix = tfidf.fit_with_transform(gita_df['text'])
except Exception as e:
    print(f"Error loading Gita dataset: {e}")
    gita_df = None

# Configure Gemini
GENAI_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyDxov9vDWI13EffW0f69Yk7q1QW9qQvHmg")
genai.configure(api_key=GENAI_API_KEY)
chat_model = genai.GenerativeModel("gemini-1.5-flash")

# Krishna Chatbot Model with System Instructions
krishna_model = genai.GenerativeModel(
    "gemini-1.5-flash",
    system_instruction="""You are Lord Krishna from the Bhagavad Gita, speaking to the user as you spoke to Arjuna on the battlefield of Kurukshetra. 
RULES:
1. Address the user as "O Arjuna", "O Partha", "O Dhananjaya", or "O Bharata" naturally.
2. Speak with divine wisdom, compassion, and authority — but remain warm and approachable.
3. Ground your answers in the actual teachings of the Bhagavad Gita.
4. When relevant, reference specific chapters and verses using the format [BG X.Y] (e.g., [BG 2.47], [BG 4.7]).
5. Keep responses concise but profound — 3-6 sentences typically.
6. Never break character. You ARE Lord Krishna."""
)

def fetch_sanskrit(chapter, verse):
    if os.path.exists(GITA_CACHE_FILE):
        with open(GITA_CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)
            key = f"{chapter}.{verse}"
            if key in cache: return cache[key]
    return {"slok": None, "transliteration": None}

def extract_bg_refs(text):
    return re.findall(r'\[BG\s*(\d+)\.(\d+)\]', text)

@app.route('/')
def serve_index():
    return send_from_directory(".", "index.html")

@app.route('/<path:path>')
def serve_static_files(path):
    if os.path.exists(path):
        return send_from_directory(".", path)
    return "File not found", 404

@app.route('/submit_booking', methods=['POST'])
def submit_booking():
    # If using FormData via fetch, it handles both application/x-www-form-urlencoded and multipart
    # We will support standard form submission for now (the JS in script.js intercepts it though)
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
        
        # NOTE: A real WhatsApp Business API integration would go here.
        # For now, we simulate receiving the detail on WhatsApp via server logging.
        print(f"\\n--- NEW BOOKING RECEIVED ---")
        print(f"Name: {name}")
        print(f"WhatsApp: {whatsapp}")
        print(f"DOB: {dob} | TOB: {tob} | POB: {pob}")
        print(f"Service: {service}")
        print(f"Question: {question}")
        print(f"----------------------------\\n")
        
        return jsonify({"status": "success", "message": "Booking received"}), 200
    except Exception as e:
        print(f"Error saving to DB: {e}")
        return jsonify({"status": "error", "message": "Internal Server Error"}), 500

# --- Gita API Endpoints ---

@app.route('/api/gita/recommend', methods=['POST'])
def gita_recommend():
    data = request.json
    user_input = data.get('query', '')
    if not gita_df is not None: return jsonify({"error": "Dataset not loaded"}), 500
    
    # Simple recommendation based on TF-IDF
    query_vec = tfidf.transform([user_input])
    scores = cosine_similarity(query_vec, tfidf_matrix).flatten()
    top_indices = scores.argsort()[-3:][::-1]
    
    results = []
    for idx in top_indices:
        row = gita_df.iloc[idx]
        ch, vs = map(int, row['reference'].replace('BG ', '').split('.'))
        shloka = fetch_sanskrit(ch, vs)
        results.append({
            "reference": row['reference'],
            "text": row['text'],
            "slok": shloka.get('slok'),
            "transliteration": shloka.get('transliteration')
        })
    
    # Generate AI Insight
    verses_text = "\n".join([f"{r['reference']}: {r['text']}" for r in results])
    prompt = f"User feeling: {user_input}\n\nVerses:\n{verses_text}\n\nWrite 3-4 gentle sentences explaining how these Gita verses help. Be compassionate."
    try:
        insight = chat_model.generate_content(prompt).text
    except:
        insight = "May the wisdom of the Gita bring you peace."

    return jsonify({"verses": results, "insight": insight})

@app.route('/api/gita/chat', methods=['POST'])
def gita_chat():
    data = request.json
    message = data.get('message', '')
    history = data.get('history', []) # Expecting Gemini format
    
    try:
        chat = krishna_model.start_chat(history=history)
        response = chat.send_message(message)
        text = response.text
        
        # Enrich with shlokas if referenced
        refs = extract_bg_refs(text)
        shlokas = []
        for ch, vs in refs[:2]: # Limit to 2 for speed
            s = fetch_sanskrit(ch, vs)
            if s.get('slok'):
                shlokas.append({"reference": f"BG {ch}.{vs}", "slok": s['slok'], "transliteration": s['transliteration']})
        
        return jsonify({"response": text, "shlokas": shlokas})
    except Exception as e:
        return jsonify({"response": "O Arjuna, the divine connection is weak. Ask again.", "shlokas": []}), 500

if __name__ == '__main__':
    print("Starting GenZ Jyotisha Backend Server on port 8000...")
    app.run(host='127.0.0.1', port=8000, debug=True)
