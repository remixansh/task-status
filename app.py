import os
from datetime import datetime, time
import pytz
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from google import genai
from apscheduler.schedulers.background import BackgroundScheduler

load_dotenv()

app = Flask(__name__)
CORS(app)

# Firebase Setup
firebase_creds_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'data-9875b-firebase-adminsdk-fbsvc-99f54fcf27.json')
try:
    cred = credentials.Certificate(firebase_creds_path)
    firebase_admin.initialize_app(cred, {'projectId': 'data-9875b'})
    db = firestore.client()
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    db = None

# Gemini Setup
gemini_client = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))

# Timezone setup
IST = pytz.timezone('Asia/Kolkata')

def get_ist_now():
    return datetime.now(IST)

def delete_collection(coll_ref, batch_size):
    if batch_size == 0:
        return

    docs = coll_ref.limit(batch_size).stream()
    deleted = 0

    for doc in docs:
        doc.reference.delete()
        deleted = deleted + 1

    if deleted >= batch_size:
        return delete_collection(coll_ref, batch_size)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    try:
        date_str = request.args.get('date')
        tasks_ref = db.collection('tasks')
        
        if date_str:
            # Filter by date
            try:
                date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
                start_datetime = IST.localize(datetime.combine(date_obj, time.min))
                end_datetime = IST.localize(datetime.combine(date_obj, time.max))
                query = tasks_ref.where(filter=FieldFilter('timestamp', '>=', start_datetime)).where(filter=FieldFilter('timestamp', '<=', end_datetime)).order_by('timestamp', direction=firestore.Query.DESCENDING)
            except ValueError:
                return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400
        else:
            query = tasks_ref.order_by('timestamp', direction=firestore.Query.DESCENDING)
            
        docs = query.stream()
        tasks = []
        for doc in docs:
            task_dict = doc.to_dict()
            task_dict['id'] = doc.id
            if 'timestamp' in task_dict and isinstance(task_dict['timestamp'], datetime):
                task_dict['timestamp'] = task_dict['timestamp'].astimezone(IST).isoformat()
            tasks.append(task_dict)
        return jsonify(tasks), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks', methods=['POST'])
def create_task():
    try:
        data = request.json or {}
        new_task = {
            'title': data.get('title', ''),
            'context': data.get('context', ''),
            'status': data.get('status', 'Pending'),
            'timestamp': get_ist_now(),
            'updated_at': get_ist_now(),
            'is_summary': False
        }
        doc_ref = db.collection('tasks').document()
        doc_ref.set(new_task)
        new_task['id'] = doc_ref.id
        new_task['timestamp'] = new_task['timestamp'].isoformat()
        return jsonify(new_task), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    try:
        data = request.json or {}
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        data['updated_at'] = get_ist_now()
        doc_ref = db.collection('tasks').document(task_id)
        doc_ref.update(data)
        return jsonify({'message': 'Task updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    try:
        doc_ref = db.collection('tasks').document(task_id)
        
        # Delete comments subcollection first
        comments_ref = doc_ref.collection('comments')
        delete_collection(comments_ref, 50)
        
        # Delete task
        doc_ref.delete()
        return jsonify({'message': 'Task and comments deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/comments', methods=['GET'])
def get_comments(task_id):
    try:
        comments_ref = db.collection('tasks').document(task_id).collection('comments')
        query = comments_ref.order_by('timestamp')
        docs = query.stream()
        comments = []
        for doc in docs:
            comment_dict = doc.to_dict()
            comment_dict['id'] = doc.id
            if 'timestamp' in comment_dict and isinstance(comment_dict['timestamp'], datetime):
                comment_dict['timestamp'] = comment_dict['timestamp'].astimezone(IST).isoformat()
            comments.append(comment_dict)
        return jsonify(comments), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/comments', methods=['POST'])
def add_comment(task_id):
    try:
        data = request.json or {}
        new_comment = {
            'name': data.get('name', 'Anonymous'),
            'comment': data.get('comment', ''),
            'timestamp': get_ist_now()
        }
        doc_ref = db.collection('tasks').document(task_id).collection('comments').document()
        doc_ref.set(new_comment)
        new_comment['id'] = doc_ref.id
        new_comment['timestamp'] = new_comment['timestamp'].isoformat()
        return jsonify(new_comment), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/comments/<comment_id>', methods=['PUT'])
def update_comment(task_id, comment_id):
    try:
        data = request.json or {}
        if 'comment' not in data:
            return jsonify({'error': 'Comment text required'}), 400
            
        doc_ref = db.collection('tasks').document(task_id).collection('comments').document(comment_id)
        doc_ref.update({'comment': data['comment']})
        return jsonify({'message': 'Comment updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def generate_daily_summary(force=False):
    """Smart summary: only generates if there are new tasks since last summary for today."""
    try:
        now = get_ist_now()
        today_date = now.date()
        today_str = today_date.strftime('%Y-%m-%d')
        start_datetime = IST.localize(datetime.combine(today_date, time.min))
        end_datetime = IST.localize(datetime.combine(today_date, time.max))

        # Get today's tasks
        tasks_ref = db.collection('tasks')
        query = tasks_ref.where(filter=FieldFilter('timestamp', '>=', start_datetime)).where(filter=FieldFilter('timestamp', '<=', end_datetime))
        docs = list(query.stream())
        
        tasks_text = []
        latest_task_time = None
        existing_summary_task_ref = None

        for doc in docs:
            t = doc.to_dict()
            if t.get('is_summary', False):
                existing_summary_task_ref = doc.reference
                continue
            
            tasks_text.append(f"- {t.get('title', 'No Title')} [{t.get('status', 'Pending')}]: {t.get('context', 'No Context')}")
            ts = t.get('timestamp')
            updated = t.get('updated_at')
            if ts and (latest_task_time is None or ts > latest_task_time):
                latest_task_time = ts
            if updated and (latest_task_time is None or updated > latest_task_time):
                latest_task_time = updated

        if not tasks_text:
            return {'generated': False, 'reason': 'No tasks found for today.'}

        # Check if we already have a summary for today
        summaries_ref = db.collection('summaries')
        existing_query = summaries_ref.where(filter=FieldFilter('date', '==', today_str))
        existing_docs = list(existing_query.stream())
        
        if existing_docs and not force:
            # Sort in Python to avoid needing a composite index in Firestore
            existing_docs.sort(key=lambda d: d.to_dict().get('timestamp'), reverse=True)
            last_summary = existing_docs[0].to_dict()
            last_summary_time = last_summary.get('timestamp')
            # If no new tasks since last summary, skip
            if last_summary_time and latest_task_time and latest_task_time <= last_summary_time:
                return {'generated': False, 'reason': 'No new tasks since last summary.', 'summary': last_summary.get('content', '')}

        # Generate with Gemini
        prompt = f"Summarize the following tasks for today ({today_str}) by an intern. Create a concise, professional end-of-day status update. Be brief, use bullet points, and ONLY summarize the tasks provided. Do NOT add any introductory text, pleasantries, or suggestions for 'next steps' or 'next sessions':\n\n" + "\n".join(tasks_text)
        
        response = gemini_client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt
        )
        summary_text = response.text

        # Store in summaries collection
        summary_doc = {
            'date': today_str,
            'content': summary_text,
            'task_count': len(tasks_text),
            'timestamp': get_ist_now()
        }
        if existing_docs:
            doc_ref = existing_docs[0].reference
            doc_ref.update(summary_doc)
        else:
            doc_ref = db.collection('summaries').document()
            doc_ref.set(summary_doc)
            
        summary_doc['id'] = doc_ref.id
        summary_doc['timestamp'] = summary_doc['timestamp'].isoformat()

        # Also store as a task with is_summary flag for the dashboard
        summary_task = {
            'title': f"Daily Summary - {today_str}",
            'context': summary_text,
            'status': 'Completed',
            'timestamp': get_ist_now(),
            'is_summary': True
        }
        
        if existing_summary_task_ref:
            existing_summary_task_ref.update(summary_task)
        else:
            db.collection('tasks').document().set(summary_task)

        print(f"Generated daily summary for {today_str}")
        return {'generated': True, 'summary': summary_doc}
    except Exception as e:
        print(f"Error generating daily summary: {e}")
        return {'generated': False, 'reason': str(e)}

@app.route('/api/generate-summary', methods=['POST'])
def manual_generate_summary():
    try:
        result = generate_daily_summary(force=False)
        if result.get('generated'):
            return jsonify({'message': 'Summary generated!', 'summary': result.get('summary')}), 200
        else:
            reason = result.get('reason', 'Unknown')
            existing = result.get('summary', '')
            if existing:
                return jsonify({'message': reason, 'summary': {'content': existing}}), 200
            return jsonify({'message': reason}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/summaries', methods=['GET'])
def get_summaries():
    """Get all stored summaries, newest first."""
    try:
        summaries_ref = db.collection('summaries')
        query = summaries_ref.order_by('timestamp', direction=firestore.Query.DESCENDING)
        docs = query.stream()
        summaries = []
        for doc in docs:
            s = doc.to_dict()
            s['id'] = doc.id
            if 'timestamp' in s and isinstance(s['timestamp'], datetime):
                s['timestamp'] = s['timestamp'].astimezone(IST).isoformat()
            summaries.append(s)
        return jsonify(summaries), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Scheduler setup
scheduler = BackgroundScheduler(timezone=IST)
scheduler.add_job(generate_daily_summary, 'cron', hour=18, minute=0)

# Check WERKZEUG_RUN_MAIN to ensure scheduler only starts once in debug mode
if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
    scheduler.start()
    print("APScheduler started: Daily summary scheduled for 18:00 IST.")

if __name__ == '__main__':
    app.run(port=5000, debug=True)
