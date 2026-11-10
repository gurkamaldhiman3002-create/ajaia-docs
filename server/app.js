import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError, asyncHandler } from './errors.js';
import {
  verifyPassword,
  createSessionToken,
  requireAuth,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from './auth.js';
import {
  fileToHtml,
  sanitizeContent,
  titleFromFilename,
  MAX_UPLOAD_BYTES,
  MAX_CONTENT_CHARS,
} from './content.js';

const titleSchema = z.string().trim().min(1, 'Title cannot be empty.').max(200, 'Title must be 200 characters or fewer.');
const contentSchema = z.string().max(MAX_CONTENT_CHARS, 'Document is too large to save.');

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
});
const createSchema = z.object({
  title: titleSchema.optional(),
  contentHtml: contentSchema.optional(),
});
const updateSchema = z
  .object({
    title: titleSchema.optional(),
    contentHtml: contentSchema.optional(),
    version: z.number().int().positive('version is required for saves.'),
  })
  .refine((v) => v.title !== undefined || v.contentHtml !== undefined, 'Nothing to update.');
const shareSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  role: z.enum(['viewer', 'editor']),
});

function parse(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message || 'Invalid request.');
  }
  return result.data;
}

function toDocSummary(row, role) {
  return {
    id: row.id,
    title: row.title,
    role,
    owner: { id: row.owner_id, name: row.owner_name, email: row.owner_email },
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export function createApp({ db, sessionSecret, serveClient = false }) {
  if (!sessionSecret) throw new Error('sessionSecret is required');
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  const auth = requireAuth(db, sessionSecret);

  /** Returns { doc, role } where role is owner | editor | viewer, or throws 404. */
  async function loadWithAccess(docId, userId) {
    const { rows } = await db.execute({
      sql: `SELECT d.*, u.name AS owner_name, u.email AS owner_email, s.role AS share_role
            FROM documents d
            JOIN users u ON u.id = d.owner_id
            LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
            WHERE d.id = ?`,
      args: [userId, docId],
    });
    const doc = rows[0];
    // 404 rather than 403 so users cannot probe for documents they were never given.
    if (!doc) throw new HttpError(404, 'Document not found.');
    const role = doc.owner_id === userId ? 'owner' : doc.share_role;
    if (!role) throw new HttpError(404, 'Document not found.');
    return { doc, role };
  }

  function requireRole(role, allowed, action) {
    if (!allowed.includes(role)) {
      throw new HttpError(403, `You have ${role} access and cannot ${action}.`);
    }
  }

  async function insertDocument(ownerId, title, contentHtml) {
    const id = randomUUID();
    await db.execute({
      sql: 'INSERT INTO documents (id, owner_id, title, content_html) VALUES (?, ?, ?, ?)',
      args: [id, ownerId, title, sanitizeContent(contentHtml)],
    });
    return id;
  }

  async function fullDocument(docId, userId) {
    const { doc, role } = await loadWithAccess(docId, userId);
    return {
      ...toDocSummary(doc, role),
      contentHtml: doc.content_html,
      version: Number(doc.version),
    };
  }

  // ---------- health ----------
  app.get('/api/health', asyncHandler(async (_req, res) => {
    await db.execute('SELECT 1');
    res.json({ ok: true });
  }));

  // ---------- auth ----------
  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Incorrect email or password.');
    }
    res.cookie(SESSION_COOKIE, createSessionToken(user.id, sessionSecret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: SESSION_MAX_AGE_MS,
    });
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  }));

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

  // Directory of other users, so the share dialog can suggest teammates.
  app.get('/api/users', auth, asyncHandler(async (req, res) => {
    const { rows } = await db.execute({
      sql: 'SELECT id, email, name FROM users WHERE id != ? ORDER BY name',
      args: [req.user.id],
    });
    res.json({ users: rows.map((r) => ({ id: r.id, email: r.email, name: r.name })) });
  }));

  // ---------- documents ----------
  app.get('/api/documents', auth, asyncHandler(async (req, res) => {
    const owned = await db.execute({
      sql: `SELECT d.id, d.title, d.owner_id, d.created_at, d.updated_at, u.name AS owner_name, u.email AS owner_email
            FROM documents d JOIN users u ON u.id = d.owner_id
            WHERE d.owner_id = ? ORDER BY d.updated_at DESC`,
      args: [req.user.id],
    });
    const shared = await db.execute({
      sql: `SELECT d.id, d.title, d.owner_id, d.created_at, d.updated_at, u.name AS owner_name, u.email AS owner_email, s.role
            FROM document_shares s
            JOIN documents d ON d.id = s.document_id
            JOIN users u ON u.id = d.owner_id
            WHERE s.user_id = ? ORDER BY d.updated_at DESC`,
      args: [req.user.id],
    });
    res.json({
      owned: owned.rows.map((r) => toDocSummary(r, 'owner')),
      shared: shared.rows.map((r) => toDocSummary(r, r.role)),
    });
  }));

  app.post('/api/documents', auth, asyncHandler(async (req, res) => {
    const { title, contentHtml } = parse(createSchema, req.body);
    const id = await insertDocument(req.user.id, title || 'Untitled document', contentHtml || '');
    res.status(201).json(await fullDocument(id, req.user.id));
  }));

  app.post('/api/documents/import', auth, upload.single('file'), asyncHandler(async (req, res) => {
    const html = await fileToHtml(req.file);
    const id = await insertDocument(req.user.id, titleFromFilename(req.file.originalname), html);
    res.status(201).json(await fullDocument(id, req.user.id));
  }));

  // Converts a file to HTML without creating a document (used to import into an open draft).
  app.post('/api/convert', auth, upload.single('file'), asyncHandler(async (req, res) => {
    res.json({ contentHtml: await fileToHtml(req.file) });
  }));

  app.get('/api/documents/:id', auth, asyncHandler(async (req, res) => {
    res.json(await fullDocument(req.params.id, req.user.id));
  }));

  app.patch('/api/documents/:id', auth, asyncHandler(async (req, res) => {
    const body = parse(updateSchema, req.body);
    const { role } = await loadWithAccess(req.params.id, req.user.id);
    requireRole(role, ['owner', 'editor'], 'edit this document');

    const sets = ['version = version + 1', "updated_at = datetime('now')"];
    const args = [];
    if (body.title !== undefined) { sets.push('title = ?'); args.push(body.title); }
    if (body.contentHtml !== undefined) { sets.push('content_html = ?'); args.push(sanitizeContent(body.contentHtml)); }

    // Optimistic concurrency: the write only lands if nobody saved since this client loaded.
    const result = await db.execute({
      sql: `UPDATE documents SET ${sets.join(', ')} WHERE id = ? AND version = ?`,
      args: [...args, req.params.id, body.version],
    });
    if (result.rowsAffected === 0) {
      const latest = await fullDocument(req.params.id, req.user.id);
      throw new HttpError(409, 'This document was changed by someone else. Reload to get the latest version.', { latest });
    }
    res.json(await fullDocument(req.params.id, req.user.id));
  }));

  app.delete('/api/documents/:id', auth, asyncHandler(async (req, res) => {
    const { role } = await loadWithAccess(req.params.id, req.user.id);
    requireRole(role, ['owner'], 'delete this document');
    await db.batch([
      { sql: 'DELETE FROM document_shares WHERE document_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM documents WHERE id = ?', args: [req.params.id] },
    ], 'write');
    res.status(204).end();
  }));

  // ---------- sharing ----------
  app.get('/api/documents/:id/shares', auth, asyncHandler(async (req, res) => {
    await loadWithAccess(req.params.id, req.user.id);
    const { rows } = await db.execute({
      sql: `SELECT u.id, u.email, u.name, s.role FROM document_shares s JOIN users u ON u.id = s.user_id
            WHERE s.document_id = ? ORDER BY u.name`,
      args: [req.params.id],
    });
    res.json({ shares: rows.map((r) => ({ userId: r.id, email: r.email, name: r.name, role: r.role })) });
  }));

  app.put('/api/documents/:id/shares', auth, asyncHandler(async (req, res) => {
    const { email, role } = parse(shareSchema, req.body);
    const { role: myRole } = await loadWithAccess(req.params.id, req.user.id);
    requireRole(myRole, ['owner'], 'change sharing');
    if (email === req.user.email) throw new HttpError(400, 'You already own this document.');

    const { rows } = await db.execute({ sql: 'SELECT id, email, name FROM users WHERE email = ?', args: [email] });
    const target = rows[0];
    if (!target) throw new HttpError(404, `No user with email ${email}. Try one of the demo accounts.`);

    await db.execute({
      sql: `INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
            ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`,
      args: [req.params.id, target.id, role],
    });
    res.json({ share: { userId: target.id, email: target.email, name: target.name, role } });
  }));

  app.delete('/api/documents/:id/shares/:userId', auth, asyncHandler(async (req, res) => {
    const { role } = await loadWithAccess(req.params.id, req.user.id);
    requireRole(role, ['owner'], 'change sharing');
    await db.execute({
      sql: 'DELETE FROM document_shares WHERE document_id = ? AND user_id = ?',
      args: [req.params.id, req.params.userId],
    });
    res.status(204).end();
  }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // ---------- static client ----------
  if (serveClient) {
    const dist = path.resolve('dist');
    if (fs.existsSync(dist)) {
      app.use(express.static(dist));
      app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
  }

  // ---------- errors ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. The limit is 2 MB.' : err.message;
      return res.status(status).json({ error: message });
    }
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.details });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side.' });
  });

  return app;
}
