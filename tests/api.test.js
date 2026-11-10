import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createDb, migrate, seed, DEMO_PASSWORD } from '../server/db.js';

let tmpDir;
let app;
let db;

async function login(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-test-'));
  db = createDb(`file:${path.join(tmpDir, 'test.db')}`);
  await migrate(db);
  await seed(db);
  app = createApp({ db, sessionSecret: 'test-secret' });
});

   afterEach(() => {
     // Close the SQLite file first: Windows will not delete a file that is still open.
     db.close();
     try {
       fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
     } catch {
       // Leftover temp files are harmless; never fail a test over cleanup.
     }
   });

describe('auth', () => {
  it('rejects unauthenticated access and bad passwords', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
    const bad = await request(app).post('/api/auth/login').send({ email: 'alice@ajaia.test', password: 'nope' });
    expect(bad.status).toBe(401);
  });

  it('rejects a tampered session cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'ajaia_session=someone.123.forged');
    expect(res.status).toBe(401);
  });
});

describe('documents', () => {
  it('creates, renames, edits and reopens a document with formatting preserved', async () => {
    const alice = await login('alice@ajaia.test');
    const created = await alice.post('/api/documents').send({});
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Untitled document');

    const saved = await alice.patch(`/api/documents/${created.body.id}`).send({
      title: 'Launch plan',
      contentHtml: '<h2>Plan</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li><p>one</p></li></ul>',
      version: created.body.version,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(created.body.version + 1);

    const reopened = await alice.get(`/api/documents/${created.body.id}`);
    expect(reopened.body.title).toBe('Launch plan');
    expect(reopened.body.contentHtml).toContain('<h2>Plan</h2>');
    expect(reopened.body.contentHtml).toContain('<strong>Bold</strong>');
    expect(reopened.body.contentHtml).toContain('<u>u</u>');
    expect(reopened.body.contentHtml).toContain('<ul>');
  });

  it('strips script and event handlers from saved content', async () => {
    const alice = await login('alice@ajaia.test');
    const created = await alice.post('/api/documents').send({
      contentHtml: '<p onclick="steal()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>',
    });
    expect(created.body.contentHtml).toBe('<p>hi</p>');
  });

  it('validates titles', async () => {
    const alice = await login('alice@ajaia.test');
    const created = await alice.post('/api/documents').send({});
    const res = await alice.patch(`/api/documents/${created.body.id}`).send({ title: '   ', version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  it('returns 409 on a stale save instead of overwriting newer work', async () => {
    const alice = await login('alice@ajaia.test');
    const doc = (await alice.post('/api/documents').send({})).body;
    const first = await alice.patch(`/api/documents/${doc.id}`).send({ contentHtml: '<p>v2</p>', version: doc.version });
    expect(first.status).toBe(200);
    const stale = await alice.patch(`/api/documents/${doc.id}`).send({ contentHtml: '<p>old tab</p>', version: doc.version });
    expect(stale.status).toBe(409);
    expect(stale.body.latest.contentHtml).toBe('<p>v2</p>');
  });
});

describe('sharing', () => {
  it('separates owned and shared docs and enforces viewer vs editor roles', async () => {
    const alice = await login('alice@ajaia.test');
    const bob = await login('bob@ajaia.test');
    const carol = await login('carol@ajaia.test');

    const doc = (await alice.post('/api/documents').send({ title: 'Private draft' })).body;

    // Before sharing, Bob cannot see it at all.
    expect((await bob.get(`/api/documents/${doc.id}`)).status).toBe(404);

    expect((await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' })).status).toBe(200);
    expect((await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'viewer' })).status).toBe(200);

    const bobList = (await bob.get('/api/documents')).body;
    expect(bobList.owned.find((d) => d.id === doc.id)).toBeUndefined();
    expect(bobList.shared.find((d) => d.id === doc.id)).toMatchObject({ role: 'editor', owner: { email: 'alice@ajaia.test' } });

    // Editor can edit, viewer cannot.
    const bobEdit = await bob.patch(`/api/documents/${doc.id}`).send({ contentHtml: '<p>Bob was here</p>', version: 1 });
    expect(bobEdit.status).toBe(200);
    const carolEdit = await carol.patch(`/api/documents/${doc.id}`).send({ contentHtml: '<p>nope</p>', version: 2 });
    expect(carolEdit.status).toBe(403);
    expect((await carol.get(`/api/documents/${doc.id}`)).body.contentHtml).toBe('<p>Bob was here</p>');

    // Only the owner manages sharing or deletes.
    expect((await bob.put(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'editor' })).status).toBe(403);
    expect((await bob.delete(`/api/documents/${doc.id}`)).status).toBe(403);

    // Revoking access removes it.
    const shares = (await alice.get(`/api/documents/${doc.id}/shares`)).body.shares;
    const bobId = shares.find((s) => s.email === 'bob@ajaia.test').userId;
    expect((await alice.delete(`/api/documents/${doc.id}/shares/${bobId}`)).status).toBe(204);
    expect((await bob.get(`/api/documents/${doc.id}`)).status).toBe(404);
  });

  it('rejects sharing with unknown users or yourself', async () => {
    const alice = await login('alice@ajaia.test');
    const doc = (await alice.post('/api/documents').send({})).body;
    expect((await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'ghost@ajaia.test', role: 'viewer' })).status).toBe(404);
    expect((await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'alice@ajaia.test', role: 'viewer' })).status).toBe(400);
    expect((await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'admin' })).status).toBe(400);
  });
});

describe('file upload', () => {
  it('turns a markdown file into a new editable document', async () => {
    const alice = await login('alice@ajaia.test');
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from('# Meeting notes\n\n- **Decide** scope\n- Ship it\n'), 'meeting_notes.md');
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('meeting notes');
    expect(res.body.role).toBe('owner');
    expect(res.body.contentHtml).toContain('<h1>Meeting notes</h1>');
    expect(res.body.contentHtml).toContain('<strong>Decide</strong>');
  });

  it('converts plain text paragraphs and escapes HTML in .txt files', async () => {
    const alice = await login('alice@ajaia.test');
    const res = await alice.post('/api/convert').attach('file', Buffer.from('Line <b>one</b>\n\nPara two'), 'a.txt');
    expect(res.status).toBe(200);
    expect(res.body.contentHtml).toBe('<p>Line &lt;b&gt;one&lt;/b&gt;</p><p>Para two</p>');
  });

  it('rejects unsupported and oversized files with clear errors', async () => {
    const alice = await login('alice@ajaia.test');
    const pdf = await alice.post('/api/documents/import').attach('file', Buffer.from('%PDF'), 'report.pdf');
    expect(pdf.status).toBe(415);
    expect(pdf.body.error).toMatch(/Supported: \.txt, \.md, \.docx/);

    const big = await alice.post('/api/documents/import').attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 'a'), 'big.txt');
    expect(big.status).toBe(413);

    const broken = await alice.post('/api/documents/import').attach('file', Buffer.from('not a zip'), 'broken.docx');
    expect(broken.status).toBe(422);
  });
});
