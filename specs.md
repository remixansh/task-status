Application Specifications (AppSpecs)

1. Frontend Specifications (HTML/CSS/JS)

1.1 UI Components

Header: Contains the app title and the "Toggle View" (Dashboard vs. Log) button.

Task Input Form:

Input field for Task Title.

Textarea for Task Context/Description.

Dropdown for Status (Pending, In Progress, Done).

"Add Task" button (Color: #C0EB6A).

Dashboard View (Default):

Cards representing tasks, arranged in a grid or flex layout (responsive).

Each card shows Title, Status (color-coded), Context snippet, and Timestamp.

"Edit" and "Delete" icons/buttons on each card.

Log View:

A vertical, chronological timeline of tasks and summaries.

Distinct styling to differentiate it from the Dashboard view.

Task Details/Modal (for Editing & Commenting):

Form to update task details.

Comment Section:

Input for "Name".

Textarea for "Comment".

"Add Comment" button.

List of existing comments with an "Edit" button next to each.

1.2 Styling (CSS)

Implement CSS variables using the provided palette:

:root {
  --color-dark: #485550;
  --color-accent: #C0EB6A;
  --color-light: #F4F6F0;
  --color-white: #FFFFFF;
}


Responsiveness: Use CSS Media Queries (@media (max-width: 768px)) to change grid layouts to single-column layouts for mobile devices. Ensure touch targets (buttons) are adequately sized.

1.3 Logic (JavaScript)

Manage state: Current view (Dashboard/Log), list of tasks.

Handle form submissions (prevent default, gather data, send Fetch request).

Dynamically render task cards and log entries based on JSON data received from the backend.

Implement the view toggle logic (hiding/showing DOM elements).

2. Backend Specifications (Python Flask)

2.1 API Endpoints

All endpoints should return JSON responses.

GET /api/tasks

Fetches all tasks (optionally filtered by date).

POST /api/tasks

Payload: { title, context, status }

Backend adds a timestamp before saving to Firebase.

PUT /api/tasks/<task_id>

Updates task details or status.

DELETE /api/tasks/<task_id>

Deletes a specific task.

POST /api/tasks/<task_id>/comments

Payload: { name, comment }

Backend adds a timestamp.

PUT /api/tasks/<task_id>/comments/<comment_id>

Updates an existing comment.

2.2 Firebase Integration

Use firebase-admin python package.

Initialize the SDK using a service account key JSON file (keep this secure, do not commit to version control).

Database Structure (Firestore example):

Collection: tasks

Document ID (Auto-generated)

title: string

context: string

status: string

timestamp: datetime

is_summary: boolean (default false)

Sub-collection: comments

Document ID

name: string

comment: string

timestamp: datetime

2.3 Scheduled Task (6 PM Summary)

Use a library like APScheduler integrated with Flask.

Trigger: Daily at 18:00 (Configure timezone to Asia/Kolkata for IST).

Job Logic:

Query Firebase for all tasks created on the current date where is_summary == false.

Format the retrieved data into a text prompt.

Prompt Example: "Summarize the following tasks completed today by an intern. Create a concise end-of-day note: [List of Tasks and Contexts]"

Call the Google Gemini API (google-generativeai package) with the prompt.

Receive the generated text.

Create a new entry in the Firebase tasks collection:

title: "Daily Summary"

context: [Gemini Output]

status: "Completed"

timestamp: Current Time

is_summary: true

3. Environment Variables

Requires a .env file for the backend containing:

FIREBASE_CREDENTIALS_PATH: Path to the service account JSON.

GEMINI_API_KEY: API key for Google Gemini.

FLASK_ENV: development/production.