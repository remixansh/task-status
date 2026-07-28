Project Overview: Intern Task Status Dashboard

Goal

To build a simple, responsive task management dashboard designed for an intern to track daily activities, maintain context, and generate automated end-of-day summaries.

Core Features

Task Management:

Create tasks with a title, status (e.g., Pending, In Progress, Completed), context/description, and timestamp.

Update task status or details.

Delete tasks.

Commenting System:

Add comments to specific tasks (requires Name and Comment text).

Edit existing comments.

Views:

Dashboard/Calendar View: A structured view of tasks.

Log View: A chronologically ordered list of all tasks with timestamps, accessible via a toggle button.

Automated Daily Summary (The "6 PM ITC" Feature):

A scheduled backend process that runs at 6:00 PM IST (Indian Standard Time - assuming ITC meant IST based on context).

It gathers all tasks and their context for the current day.

It uses the Gemini API to generate a concise summary note of the day's work.

This summary is appended as a special note or task at the end of the day's log.

Responsiveness:

The UI must adapt seamlessly to both desktop (PC) and mobile screens.

Theme Toggle:

A button to switch between the standard dashboard view and the chronological log view.

Tech Stack

Frontend: HTML5, CSS3 (Vanilla or lightweight framework like Tailwind for rapid responsive design), Vanilla JavaScript.

Backend: Python with Flask framework.

Database: Firebase Realtime Database or Firestore (accessed securely via the Flask backend, not directly from the frontend).

AI Integration: Google Gemini API (for daily summaries).

Scheduling: APScheduler (Advanced Python Scheduler) or a similar Python library within Flask to handle the 6 PM task.

Color Palette (from image_352301.png)

The design will strictly adhere to this AWSMCOLOR palette:

Dark Charcoal/Slate: #485550 (Primary text, headers, dark mode backgrounds)

Lime/Chartreuse: #C0EB6A (Primary accents, buttons, active states, highlights)

Off-White/Light Gray: #F4F6F0 (Secondary backgrounds, card backgrounds, light mode backgrounds)

Pure White: #FFFFFF (Primary backgrounds, text on dark elements)

Architecture Flow

User interacts with the HTML/JS frontend.

Frontend sends AJAX/Fetch requests (GET, POST, PUT, DELETE) to Flask API endpoints.

Flask backend authenticates/validates the request.

Flask backend uses the Firebase Admin SDK to interact with the database (read/write tasks and comments).

At 6 PM, the Flask scheduler triggers a function to read that day's tasks from Firebase, sends them to the Gemini API, receives the summary, and writes the summary back to Firebase.