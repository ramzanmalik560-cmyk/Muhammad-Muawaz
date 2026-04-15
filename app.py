# ============================================================
#  app.py  —  Language Translator Backend
#  Run:  pip install flask flask-cors requests
#        python app.py
#  API runs on http://127.0.0.1:5000
# ============================================================

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import urllib.parse

# ✅ CREATE APP FIRST
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ✅ THEN use routes
@app.route("/")
def home():
    return "Backend is running!"

# ----------------------------------------------------------
#  Supported languages
# ----------------------------------------------------------
LANGUAGES = {
    "auto": "Auto Detect",
    "en":   "English",
    "ur":   "Urdu",
    "ar":   "Arabic",
    "fr":   "French",
    "de":   "German",
    "es":   "Spanish",
    "it":   "Italian",
    "pt":   "Portuguese",
    "ru":   "Russian",
    "zh":   "Chinese (Simplified)",
    "ja":   "Japanese",
    "ko":   "Korean",
    "hi":   "Hindi",
    "tr":   "Turkish",
    "nl":   "Dutch",
    "pl":   "Polish",
    "sv":   "Swedish",
    "fa":   "Persian",
    "id":   "Indonesian",
}


# ----------------------------------------------------------
#  GET /api/languages  →  returns all supported languages
# ----------------------------------------------------------
@app.route("/api/languages", methods=["GET"])
def get_languages():
    return jsonify({"languages": LANGUAGES})


# ----------------------------------------------------------
#  POST /api/translate
#  Body: { "text": str, "source": str, "target": str }
#  Uses MyMemory free API (no key needed, 1000 words/day)
# ----------------------------------------------------------
@app.route("/api/translate", methods=["POST"])
def translate():
    body = request.get_json()

    if not body:
        return jsonify({"success": False, "error": "No data sent"}), 400

    text   = body.get("text", "").strip()
    source = body.get("source", "auto")
    target = body.get("target", "ur")

    # Validate input
    if not text:
        return jsonify({"success": False, "error": "Text is required"}), 400

    if not target or target == "auto":
        return jsonify({"success": False, "error": "Target language is required"}), 400

    if len(text) > 1000:
        return jsonify({"success": False, "error": "Text too long (max 1000 chars)"}), 400

    try:
        # Build language pair for MyMemory API
        if source == "auto":
            lang_pair = f"autodetect|{target}"
        else:
            lang_pair = f"{source}|{target}"

        # Call MyMemory translation API
        encoded   = urllib.parse.quote(text)
        url       = f"https://api.mymemory.translated.net/get?q={encoded}&langpair={lang_pair}"
        response  = requests.get(url, timeout=10)
        response.raise_for_status()
        data      = response.json()

        # Check API response
        if data.get("responseStatus") != 200:
            error_msg = data.get("responseDetails", "Translation failed")
            return jsonify({"success": False, "error": error_msg}), 500

        translated_text  = data["responseData"]["translatedText"]
        detected_lang    = None

        # Get detected language if auto-detect was used
        if source == "auto":
            matches = data.get("matches", [])
            if matches:
              detected_lang = matches[0].get("source-language", None) or matches[0].get("source-lang", None)

        return jsonify({
            "success":           True,
            "translated_text":   translated_text,
            "source":            source,
            "target":            target,
            "detected_language": detected_lang,
            "char_count":        len(text),
        })

    except requests.exceptions.Timeout:
        return jsonify({"success": False, "error": "Request timed out. Try again."}), 504

    except requests.exceptions.ConnectionError:
        return jsonify({"success": False, "error": "Cannot reach translation server. Check internet."}), 503

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


# ----------------------------------------------------------
#  GET /api/health  →  check if backend is alive
# ----------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"success": True, "status": "Backend is running"})


# ----------------------------------------------------------
#  Run server
# ----------------------------------------------------------
if __name__ == "__main__":
    print("=" * 50)
    print("  Language Translator — Backend")
    print("  URL: http://127.0.0.1:5000")
    print("=" * 50)
    app.run(debug=True, host="127.0.0.1", port=5000)