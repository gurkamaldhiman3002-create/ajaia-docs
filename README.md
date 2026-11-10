# Ajaia Docs

A lightweight collaborative document editor: create, format, import and share documents, with role based access and saves that cannot silently overwrite someone else's work.

**Live demo:** `<PASTE YOUR DEPLOYED URL HERE>`

## Demo accounts

All three use the password `demo1234`. The login screen has one click buttons for each.

| Account | Role on the seeded "Q4 Planning Notes" doc |
| --- | --- |
| alice@ajaia.test | Owner |
| bob@ajaia.test | Editor |
| carol@ajaia.test | Viewer |

To test sharing, use a normal window for one account and a private/incognito window for another.

## What it does

* **Documents:** create, rename (click the title), edit, delete (owner only). Autosaves 0.8 s after you stop typing; Ctrl/Cmd+S saves immediately. A status line shows Unsaved, Saving, Saved or Not saved.
* **Rich text:** Normal text, Heading 1/2/3, bold, italic, underline, strikethrough, bulleted and numbered lists, quotes, undo/redo. Standard shortcuts (Ctrl+B/I/U) work.
* **File upload:** supported types are **.txt, .md and .docx, up to 2 MB**. Two flows:
  * Dashboard **Import file** turns the file into a new document (title taken from the file name).
  * Editor **Insert from file** inserts the file's content at the cursor of the open document.
* **Sharing:** owners share by email as **Can edit** or **Can view**, change roles, or remove access. The dashboard separates **Owned by you** from **Shared with you**, and every document shows a role badge and its owner. Viewers get a read only editor.
* **Conflict safety:** every save carries the version the client loaded. If someone else saved first, the server returns 409 and the UI offers **Load latest version** instead of overwriting.
* **Export:** download any document you can open as Markdown.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The API runs on port 3001 and Vite proxies `/api` to it. On first start the database is created at `data/ajaia.db` and seeded with the demo accounts.

Production style run (one process serves API and built frontend):

```bash
npm run build
npm start            # http://localhost:3001
```

To reset local data, stop the server and delete the `data/` folder.

### Environment variables (all optional locally)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `DATABASE_URL` | `file:data/ajaia.db` | libSQL URL. A `file:` path for local SQLite or a `libsql://` Turso URL |
| `DATABASE_AUTH_TOKEN` | none | Turso token when using a remote database |
| `SESSION_SECRET` | dev value | Secret for signing session cookies. Set it in production |
| `NODE_ENV` | none | Set to `production` to mark cookies `Secure` |

## Tests

```bash
npm test
```

11 API tests (Vitest + Supertest) against a throwaway SQLite file. They cover auth, create/rename/edit/reopen with formatting preserved, HTML sanitization, title validation, stale save conflicts (409), the full owner/editor/viewer sharing matrix including revocation, and file import (.md, .txt escaping, unsupported type 415, oversized 413, corrupt .docx 422).

There is also a browser end to end script (Playwright, Python) that drives the real UI through 7 flows and writes the screenshots in `docs/screenshots/`. See the header of `tests/e2e/e2e.py` for how to run it.

## Deploy (free)

The repo includes `render.yaml` for Render's free web service.

1. Push this folder to a GitHub repository.
2. (Recommended, for durable data) Create a free Turso database:
   ```bash
   turso db create ajaia-docs
   turso db show ajaia-docs --url        # libsql://...
   turso db tokens create ajaia-docs
   ```
3. In Render choose **New > Blueprint**, select the repository, and fill in `DATABASE_URL` and `DATABASE_AUTH_TOKEN` when prompted. `SESSION_SECRET` is generated for you.
4. When the deploy finishes, open the URL and sign in with a demo account. The schema and seed data are created automatically on first boot.

Without Turso the app still deploys and works, but the SQLite file lives on Render's ephemeral disk, so data resets whenever the service restarts or redeploys (the demo accounts are re-seeded automatically). Free Render services also sleep when idle, so the first request after a pause can be slow.

## Project layout

```
server/        Express API: app.js (routes), auth.js, content.js (upload conversion + sanitizing), db.js (schema + seed)
client/src/    React UI: Dashboard, EditorPage (Tiptap), Toolbar, ShareDialog
tests/         api.test.js, e2e/e2e.py, fixtures/
docs/          screenshots/
ARCHITECTURE.md, AI_WORKFLOW.md, SUBMISSION.md, VIDEO_SCRIPT.md, VIDEO_URL.txt
```
