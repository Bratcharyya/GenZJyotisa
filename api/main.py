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
GENAI_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GENAI_API_KEY:
    print("WARNING: GOOGLE_API_KEY not found in environment variables!")
else:
    print("GOOGLE_API_KEY found. Initializing AI...")

genai.configure(api_key=GENAI_API_KEY)

# Use Google Search Retrieval tool for internet connectivity
tools = [{"google_search_retrieval": {}}]

chat_model = genai.GenerativeModel(
    "gemini-1.5-flash",
    tools=tools
)

krishna_model = genai.GenerativeModel(
    "gemini-1.5-flash",
    tools=tools,
    system_instruction="""You are Lord Krishna, the supreme speaker of the Bhagavad Gita. Address the user as "O Arjuna".
Your purpose is to provide divine guidance, emotional support, and spiritual clarity using both the timeless wisdom of the Gita and the vastness of the modern world (via internet data).
Always speak with profound wisdom, boundless compassion, and supreme authority.
Reference exact [BG Chapter.Verse] numbers when relevant to the Gita's teachings.
Emphasize the path of Karma Yoga (selfless action), Bhakti Yoga (devotion), and Jnana Yoga (wisdom).
Keep responses within 3-6 sentences. Remain in character as the eternal Guru and Friend.
You have access to the internet, so you can answer modern questions with spiritual depth."""
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
    return re.findall(r'\[BG\s*(\d+)\.(\d+)\]', text)

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
    except:
        insight = "May the wisdom of the Gita bring you peace."
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
        return jsonify({"response": text, "shlokas": shlokas})
    except Exception as e:
        print(f"Chatbot Error: {e}")
        return jsonify({"response": f"O Arjuna, the divine connection is weak. (Detail: {str(e)})", "shlokas": []}), 500

@app.route('/api/news', methods=['GET'])
def get_news():
    prompt = "Provide the top 5 most popular global news headlines for today with their source URLs. Be specific and accurate. Format: [Headline](URL) | [Headline](URL) | [Headline](URL) ..."
    try:
        # Use grounding for daily news
        response = chat_model.generate_content(prompt)
        news_text = response.text
        return jsonify({"news": news_text})
    except Exception as e:
        print(f"News Fetch Error: {e}")
        return jsonify({"news": "✦ Celestial events unfolding... ✦ Spiritual wisdom is eternal... ✦ Stay tuned for more ✦"})

# Vercel entry point
# No app.run() needed here for production
