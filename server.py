import sqlite3
from flask import Flask, request, jsonify, send_from_directory
import os
from datetime import datetime

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

if __name__ == '__main__':
    print("Starting GenZ Jyotisha Backend Server on port 8000...")
    app.run(host='127.0.0.1', port=8000, debug=True)
