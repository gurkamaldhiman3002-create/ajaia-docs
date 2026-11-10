# AI workflow note

> Before submitting: review this note and edit it so every statement matches what you did. Add your own review steps in the last section.

## Tools used

* **Claude (Anthropic), Opus model, in claude.ai** as an agentic coding assistant with a sandboxed shell. It scaffolded the project, wrote the server, client, tests and docs, ran the test suite and a headless browser, and reviewed screenshots.
* **Playwright with headless Chrome** for end to end verification and screenshots.
* **python-docx** to generate a real Word file as an upload fixture instead of trusting a mocked one.

## Where AI materially sped things up

* **Scaffolding and wiring.** Express routes, the libSQL schema, the Vite/React setup, and the Tiptap toolbar are boilerplate heavy. Generating them took minutes instead of an hour or more.
* **Test matrix.** The owner/editor/viewer access matrix, revocation, and upload error cases (415, 413, 422) were enumerated and written quickly, and then actually run.
* **Browser verification.** A Playwright script that signs in as three users in separate browser contexts, formats text, imports files, shares, triggers a save conflict, and checks mobile layout was written and executed in the same session. Seeing the screenshots caught a layout problem (below).
* **Docs.** First drafts of the README, architecture note, and this note.

## AI output that was changed or rejected

These are concrete corrections made during the build, not hypotheticals:

* **Duplicate Underline extension removed.** The first plan installed `@tiptap/extension-underline`. Checking the installed Tiptap v3 StarterKit showed Underline is already bundled, so the extra package would register the extension twice. It was removed.
* **Autosave reading from a destroyed editor.** The first version of `save()` called `editor.getHTML()` at save time. Because unsaved work is also flushed when the editor page unmounts, that call could run after Tiptap had destroyed the editor. The save pipeline was changed to read from a ref updated on every content change.
* **Circular import.** `navigate()` was first exported from `App.jsx` and imported by `Dashboard.jsx`, which App imports. It was moved to `nav.js`.
* **Non portable start script.** `NODE_ENV=production node ...` in `npm start` would fail on Windows. `NODE_ENV` moved into the Render config instead.
* **Tests that failed only on Windows.** The generated test cleanup deleted each temporary database folder without closing the SQLite connection first. That passed on Linux, but on my Windows machine all 11 tests failed with `EPERM` because Windows will not delete an open file. The fix closes the database before deleting and never fails a test over leftover temp files.
* **Convoluted test code.** One generated assertion built a user ID with a confusing `a && b` expression. It was rewritten as two plain lines.
* **Screenshots that hid the UI.** The first editor screenshot was scrolled past the title, status and Share button, so it did not show the feature it was meant to show. The script was changed to scroll to the top first, and all screenshots were retaken on a fresh database (the first set also had duplicate documents from repeated runs).
* **Design choices kept on purpose over simpler AI defaults:** 404 instead of 403 for documents you cannot access, optimistic version checks instead of last write wins, and server side sanitizing instead of trusting the editor's output.

## How correctness, UX, and reliability were verified

* **Automated API tests:** `npm test` runs 11 Vitest + Supertest tests against a temporary database. All pass.
* **End to end in a real browser:** `tests/e2e/e2e.py` ran against the production build (`npm run build && npm start`) and passed all 7 flows on repeated runs: create, rename, format and reload persistence; insert from file; sharing dialog including the unknown email error; .docx import with bold and list preserved; viewer is read only (no toolbar, `contenteditable=false`); editor can edit; stale save shows the conflict banner and reload brings in the other user's change.
* **Visual review:** screenshots of every key screen, including a 390 px wide mobile viewport, were inspected by eye.
* **Security checks in tests:** script tags and event handlers are stripped from saved HTML, HTML inside .txt uploads is escaped, and forged session cookies are rejected.

## My own review

* Ran the test suite on my own Windows machine, found that all 11 tests failed during cleanup, and had the cleanup fixed before deploying.
* Tested the app locally: created a document, renamed it, applied bold formatting, refreshed, and confirmed everything persisted.
* Deployed to Render with a Turso database, then checked in the Turso dashboard that the users, documents and document_shares tables were created and seeded.
* Tested sharing on the live site in a private window as Carol and confirmed the shared document is read only with no toolbar.
