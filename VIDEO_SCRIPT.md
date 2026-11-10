# Walkthrough video script (target about 4 minutes)

Setup before recording: open the live URL in a normal window signed in as Alice, and a private window ready on the login screen. Have `tests/fixtures/retro.md` and `tests/fixtures/vendor_review.docx` somewhere easy to pick.

## 1. Intro (about 20 s)
"This is Ajaia Docs, a lightweight document editor. I focused on four things: a solid editing experience, a file import that is actually useful, real access control for sharing, and saves that can't silently overwrite someone's work."

## 2. Main flow as Alice (about 80 s)
* Show the dashboard: "Owned by you" and "Shared with you" are separate, every row has a role badge.
* Click **New document**, rename it by clicking the title.
* Type a heading, a paragraph with bold, italic and underline, a bulleted list and a numbered list. Point at the save status changing to "All changes saved".
* Refresh the page: the title and formatting come back.
* Click **Insert from file** and insert a Markdown file at the cursor.
* Go back and use **Import file** with the .docx: it becomes a new document with headings, bold and lists preserved. Mention supported types: .txt, .md, .docx up to 2 MB.

## 3. Sharing (about 60 s)
* Open the document, click **Share**, add bob@ajaia.test as **Can edit** and carol@ajaia.test as **Can view**. Try a fake email to show the error message.
* In the private window sign in as Carol: the doc appears under "Shared with you" with the owner's name. Open it: yellow banner, no toolbar, it is read only.
* Sign out, sign in as Bob, edit the doc.
* Back in Alice's window (still showing the old version), type something: the conflict banner appears. Click **Load latest version** and Bob's change is there. "The server rejects stale saves with a version check, so nobody silently loses work."

## 4. What I cut and why (about 30 s)
"I deliberately did not build real time co-editing, comments, or version history. Real time sync is the riskiest piece in a short timebox, so I chose optimistic concurrency, which is correct, and listed Yjs as the next step. Auth is seeded demo accounts with signed cookies, not a full identity system."

## 5. Key implementation decisions (about 40 s)
* One Express service serves the API and the React build, so one free deploy.
* libSQL: a SQLite file locally and in tests, free Turso in production, same code.
* All access checks go through one server function; unshared docs return 404, not 403.
* All document HTML is sanitized on the server with an allowlist that matches the editor, because shared docs render in other people's browsers.
* Show `npm test` passing: 11 API tests including the full sharing matrix and upload errors.

## 6. How AI helped (about 30 s)
"I used Claude as a coding agent for scaffolding, the test matrix, a Playwright end to end script, and doc drafts. I verified with automated tests and a browser run against the production build. A few things I corrected: a duplicate editor extension, an autosave bug that could read from a destroyed editor, and screenshots that hid the UI I was trying to show." (Adjust to what you personally did.)
