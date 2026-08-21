# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TaskStatus is an intern task-tracking dashboard: a single-file Flask backend (`app.py`) serving a vanilla-JS frontend, backed by Firestore, with a Gemini-generated automated daily summary. There is no build step, framework, or bundler on the frontend — Flask serves one HTML template plus static CSS/JS.

## Commands

```bash
pip install -r requirements.txt   # install dependencies
```

```bash
python app.py                     # run dev server on http://localhost:5000 (debug + reloader)
```

```bash
gunicorn app:app                  # production server (as used on Render)
```

Utility scripts:

```bash
python test_summary.py            # manually invoke generate_daily_summary() and print the result
```

```bash
python dump.py                    # dump all tasks + summaries from Firestore to stdout (inspection)
```

There is no test framework, linter, or formatter configured. `test_summary.py` is a manual invocation script, not a unit test.

## Configuration

Requires a `.env` file (gitignored) with `FIREBASE_CREDENTIALS_PATH`, `GEMINI_API_KEY`, and `FLASK_ENV`. Firebase auth uses a service-account JSON file (also gitignored); the hardcoded Firebase project id is `data-9875b`. In production (Render) the credentials file is mounted as a secret at `/etc/secrets/firebase.json` — see [guide.md](guide.md).

## Architecture

Request flow: browser → same-origin `fetch` calls → Flask JSON API (`/api/*`) → Firebase Admin SDK → Firestore. The frontend never touches Firebase directly.

**Firestore data model** (no schema/ORM — dicts written directly in `app.py`):
- `tasks/{id}`: `title`, `context`, `status` (`Pending` | `In Progress` | `Done`), `timestamp`, `updated_at`, `is_summary` (bool)
  - `tasks/{id}/comments/{id}`: `name`, `comment`, `timestamp`
- `summaries/{id}`: `date` (`YYYY-MM-DD` string), `content`, `task_count`, `timestamp`

**Frontend** (`static/js/app.js`, one file, no modules): fetches *all* tasks once into an in-memory `tasks` array, then filters/groups client-side by date — the API's `?date=` filter exists but is unused by the UI. Two views render from the same array: a calendar Dashboard and a "Terminal" log. Summary content is rendered as Markdown via the `marked` CDN script.

## Cross-cutting details worth knowing before editing

- **Auth is intentionally trivial and static.** `POST /api/login` accepts hardcoded `ansh`/`9431` and returns the literal token `ansh-admin-token`; `require_auth` checks for exactly that string. Only task **write** endpoints (`POST/PUT/DELETE /api/tasks`) are protected. Comments and summary generation are unauthenticated. The frontend stores the token in `localStorage` under `auth_token` and gates UI actions through `requireAuthWrapper`, replaying the pending action after login. Do not assume a real user system exists.

- **The daily summary is dual-written.** `generate_daily_summary()` writes the summary to *both* the `summaries` collection *and* a task doc with `is_summary: True` (so it appears inline on the dashboard). Both must stay in sync — updating one path without the other will desync the UI.

- **Summaries regenerate only when stale.** The function compares the latest task `timestamp`/`updated_at` against the last summary's `timestamp` and skips generation if nothing changed (unless `force=True`). This is why tasks carry `updated_at` — editing a task must bump it or the summary won't refresh.

- **Everything is IST (`Asia/Kolkata`).** Timestamps are stored timezone-aware via `get_ist_now()`; date-range queries localize `time.min`/`time.max` to IST; the scheduler fires cron at 18:00 IST.

- **Firestore composite indexes are deliberately avoided.** Where a query would otherwise need `.where()` + `.order_by()` on different fields, the code fetches and sorts in Python instead (e.g. picking the latest summary for a date). Prefer this pattern over adding indexes.

- **Scheduler start is guarded.** APScheduler is started only when `WERKZEUG_RUN_MAIN == 'true'` (avoids double-start under the Flask debug reloader) or when not in debug. Note: under gunicorn with multiple workers each worker would start its own scheduler — keep it single-worker, or the 18:00 job runs N times.
