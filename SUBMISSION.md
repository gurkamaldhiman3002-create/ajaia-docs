# Submission: Ajaia Docs

**Live product:** `<PASTE YOUR DEPLOYED URL HERE>`
**Walkthrough video:** `<PASTE YOUR VIDEO LINK HERE>`
**Source:** this Google Drive folder (`ajaia-docs/`)

## Test accounts

Password for all: `demo1234` (one click sign in buttons are on the login page)

* alice@ajaia.test, owner of the seeded "Q4 Planning Notes"
* bob@ajaia.test, editor on that document
* carol@ajaia.test, viewer on that document

Use a private window to be signed in as two people at once.

## What is included

| Item | Location |
| --- | --- |
| Source code | `server/`, `client/`, `package.json`, `package-lock.json`, `vite.config.js` |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Automated tests | `tests/api.test.js` (11 API tests, `npm test`), `tests/e2e/e2e.py` (browser flows) |
| Test fixtures | `tests/fixtures/retro.md`, `tests/fixtures/vendor_review.docx` |
| Deployment config | `render.yaml`, `.node-version`, `.env.example` |
| Screenshots | `docs/screenshots/` (8 images: login, dashboards, formatting, sharing, read only viewer, conflict, mobile) |
| Video link | `VIDEO_URL.txt` |
| Video outline | `VIDEO_SCRIPT.md` |
| This file | `SUBMISSION.md` |

## Status

### Working end to end
* Create, rename, edit, autosave, reopen, delete documents
* Rich text: headings 1 to 3, bold, italic, underline, strikethrough, bulleted and numbered lists, quotes, undo/redo
* Upload: .txt, .md, .docx (2 MB max) as a new document or inserted into the open document
* Sharing by email with Can edit / Can view roles, role changes, revoking access, owned vs shared sections, role badges, read only mode for viewers
* Persistence in SQLite/libSQL with formatting preserved after refresh
* Stale save detection (HTTP 409) with a reload action
* Server side HTML sanitizing, input validation, clear error messages for bad uploads and unknown users
* Stretch: role based permissions and Markdown export

### Intentionally not built
* Real time co-editing and presence, comments, version history
* Sign up, password reset, email invites (accounts are seeded)
* Images and tables inside documents

### Next 2 to 4 hours
1. Real time collaboration with Yjs and presence indicators
2. Version history with restore
3. Rate limiting and CSRF tokens on mutating routes
4. Run the Playwright suite in CI
