# Architecture note

## Shape of the system

```
Browser (React + Tiptap)  ──fetch /api──▶  Express (Node)  ──▶  libSQL (SQLite file locally, Turso in prod)
        ▲                                         │
        └──────── static build (dist/) ◀──────────┘   one service, one origin, one deploy
```

* **One deployable unit.** Express serves both the JSON API and the built React app. Same origin means no CORS setup, simple cookies, and a single free Render service.
* **Storage: libSQL.** The same client talks to a local SQLite file in development and tests, and to a free hosted Turso database in production. No paid service, no local Postgres to install.
* **Editor: Tiptap (ProseMirror).** Mature, schema based, and its document model maps cleanly to a small HTML subset.

### Data model

```
users(id, email UNIQUE, name, password_hash)
documents(id, owner_id → users, title, content_html, version, created_at, updated_at)
document_shares(document_id → documents, user_id → users, role IN ('viewer','editor'), PK(document_id, user_id))
```

Ownership lives on the document; access grants live in a join table. A user's effective role is computed in one query: `owner` if they own it, otherwise the share role, otherwise no access.

## What I prioritized and why

1. **Access control enforced on the server, in one place.** Every document route goes through `loadWithAccess`, which returns the caller's role or a 404. Non-shared documents return 404 rather than 403 so users cannot probe for document IDs. Only owners can share, change roles, or delete; viewers cannot write. The UI reflects the role (read only editor, hidden toolbar, badges), but the server is the source of truth.
2. **Saves that never silently lose work.** Each document has a `version`. A save is `UPDATE ... WHERE id = ? AND version = ?`; if another person saved first, nothing is written and the client gets 409 with the latest content and a "Load latest version" action. This is the cheapest honest answer to "two people editing the same doc" without building real time sync.
3. **Content safety.** Document HTML is sanitized on every write with an allowlist that matches what the editor can render (headings, marks, lists, quotes, code, links). Shared documents are rendered in other users' browsers, so stored XSS was the main risk to close. Uploads go through the same sanitizer.
4. **A file upload that is actually useful.** .txt, .md and .docx convert into editable rich text (mammoth for Word, marked for Markdown, paragraph aware conversion for text). It works both as "new document from file" and "insert into the open document". Types and the 2 MB limit are checked on the client for instant feedback and again on the server.
5. **Editing that feels coherent.** Debounced autosave, an explicit save state, Ctrl+S, a warning before closing with unsaved changes, a block style dropdown that reflects the cursor position, and keyboard shortcuts.

## Deliberate scope cuts

* **No real time co-editing or presence.** CRDT/OT sync (for example Yjs) is the right long term answer but is the biggest single risk in a short timebox. Optimistic concurrency covers correctness; real time is the first thing I would add next.
* **Mocked identity.** Seeded accounts with hashed passwords and an HMAC signed, httpOnly cookie. No sign up, password reset, SSO, or server side session revocation. The share target must be an existing user; there are no email invites.
* **No comments, suggestion mode, or version history.** Role based sharing (viewer vs editor) and Markdown export were the stretch items I picked because they were cheap and strengthen the sharing story.
* **No images, tables, or fonts and colors in documents.** They complicate sanitizing, import, and storage for little review value.
* **HTML as the storage format.** Simple to inspect, export and sanitize. Tiptap JSON would be more precise for later real time work and is a planned migration.

## What I would build next (2 to 4 hours)

1. Real time collaboration with Yjs + Hocuspocus (or a y-websocket server), with cursors and presence avatars; keep the version check for the REST path.
2. Version history: write a row to a `document_versions` table on each save (or every N minutes) and add a restore view.
3. Comments anchored to text ranges.
4. Rate limiting on login and upload, CSRF token on mutating routes (SameSite=Lax already blocks the common cases), and audit logging of share changes.
5. A Playwright run in CI against every pull request.

## Known limitations

* Without `DATABASE_URL`, the deployed SQLite file is ephemeral on Render's free tier (documented in the README).
* Conflict resolution is "reload and reapply"; there is no merge view.
* A 2 MB upload limit and a 1M character document limit keep request sizes bounded.
