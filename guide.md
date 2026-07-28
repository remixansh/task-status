# TaskStatus Deployment Guide

This guide explains how to deploy the TaskStatus dashboard to [Render](https://render.com), a modern cloud hosting platform.

## 1. Prerequisites
- A GitHub account with this repository pushed.
- A Render account (free tier works perfectly).
- Your Firebase Service Account JSON file (`data-9875b-firebase-adminsdk-fbsvc-99f54fcf27.json`).
- Your Gemini API Key.

---

## 2. Preparing for Render

Render requires a WSGI server to run Flask apps in production. I have already added `gunicorn` to your `requirements.txt` file.

The application uses a `BackgroundScheduler` for daily summaries. Render's free tier spins down after 15 minutes of inactivity. For the 6 PM daily summary to trigger automatically, you need a service like [cron-job.org](https://cron-job.org) to ping your web service at 17:59 IST to ensure the instance is awake when 18:00 IST hits.

---

## 3. Deploying to Render

1. Go to your [Render Dashboard](https://dashboard.render.com/) and click **New+ -> Web Service**.
2. Connect your GitHub account and select the `task-status` repository.
3. Fill out the configuration:
   - **Name**: `task-status-dashboard` (or any name you prefer)
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app` (This tells Render to use Gunicorn to run your Flask app)

4. Scroll down to **Environment Variables** and add the following:
   - **Key**: `PYTHON_VERSION` | **Value**: `3.10.0` (Recommended)
   - **Key**: `GEMINI_API_KEY` | **Value**: *(Paste your Gemini API key here)*
   - **Key**: `FIREBASE_CREDENTIALS_PATH` | **Value**: `/etc/secrets/firebase.json`

5. Scroll down to **Secret Files**:
   - Click **Add Secret File**.
   - **Filename**: `firebase.json`
   - **Contents**: Paste the entire contents of your `data-9875b-firebase-adminsdk-fbsvc-99f54fcf27.json` file here.
   - *(Note: Render will securely mount this file at `/etc/secrets/firebase.json` which matches our environment variable above).*

6. Click **Create Web Service**. 

Render will now build your environment and launch the app. Once you see "Your service is live 🎉", you can click the URL at the top left to visit your live TaskStatus dashboard!

---

## 4. Setting up the Daily Cron Ping (Free Tier Only)

Because Render puts free instances to sleep, the 6 PM automatic summary might fail to trigger if the server is asleep. 

1. Go to [cron-job.org](https://cron-job.org) (or use UptimeRobot).
2. Create a free account and click **Create Cronjob**.
3. **URL**: Enter your Render app URL (e.g., `https://task-status-xyz.onrender.com/api/tasks`).
4. **Execution schedule**: Set it to run every day at **17:55 IST** (5:55 PM). 
5. Save the job.

This ensures your server is awake just before 6 PM, guaranteeing the APScheduler fires on time!
