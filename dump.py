import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
load_dotenv()
if not firebase_admin._apps:
    cred = credentials.Certificate('data-9875b-firebase-adminsdk-fbsvc-99f54fcf27.json')
    firebase_admin.initialize_app(cred)
db = firestore.client()
tasks = db.collection('tasks').stream()
for t in tasks:
    d = t.to_dict()
    print(f"Task: {d.get('title')} | Date: {d.get('timestamp')} | is_summary: {d.get('is_summary')}")

print("Summaries:")
summaries = db.collection('summaries').stream()
for s in summaries:
    print(s.to_dict())
