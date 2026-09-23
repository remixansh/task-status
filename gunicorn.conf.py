# Auto-loaded by `gunicorn app:app` (the Render start command) without needing
# to change that command. Raised from gunicorn's 30s default: generate-summary
# calls Gemini (bounded to 20s, see gemini_client in app.py) plus Firestore
# round-trips, which can exceed 30s together.
timeout = 60
