import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

export const DEMO_PASSWORD = 'demo1234';

export const SEED_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Chen' },
  { email: 'bob@ajaia.test', name: 'Bob Rivera' },
  { email: 'carol@ajaia.test', name: 'Carol Singh' },
];

/**
 * Creates a libSQL client. Locally this is a SQLite file; in production it can
 * point at a free Turso database via DATABASE_URL + DATABASE_AUTH_TOKEN.
 */
export function createDb(url = process.env.DATABASE_URL, authToken = process.env.DATABASE_AUTH_TOKEN) {
  const resolved = url || 'file:data/ajaia.db';
  if (resolved.startsWith('file:')) {
    const filePath = resolved.slice('file:'.length);
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  return createClient({ url: resolved, authToken });
}

export async function migrate(db) {
  await db.executeMultiple(SCHEMA);
}

/** Seeds demo users and one shared document, only on an empty database. */
export async function seed(db) {
  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM users');
  if (Number(rows[0].n) > 0) return false;

  const ids = {};
  for (const u of SEED_USERS) {
    const id = randomUUID();
    ids[u.email] = id;
    await db.execute({
      sql: 'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)',
      args: [id, u.email, u.name, hashPassword(DEMO_PASSWORD)],
    });
  }

  const docId = randomUUID();
  await db.execute({
    sql: 'INSERT INTO documents (id, owner_id, title, content_html) VALUES (?, ?, ?, ?)',
    args: [
      docId,
      ids['alice@ajaia.test'],
      'Q4 Planning Notes',
      '<h1>Q4 Planning Notes</h1><p>This document is owned by <strong>Alice</strong>, shared with Bob as an <em>editor</em> and with Carol as a <u>viewer</u>.</p><h2>Goals</h2><ul><li><p>Ship the internal docs tool</p></li><li><p>Collect feedback from two teams</p></li></ul><h2>Next steps</h2><ol><li><p>Sign in as Bob and edit this page</p></li><li><p>Sign in as Carol and confirm it is read only</p></li></ol>',
    ],
  });
  await db.execute({
    sql: "INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, 'editor'), (?, ?, 'viewer')",
    args: [docId, ids['bob@ajaia.test'], docId, ids['carol@ajaia.test']],
  });
  return true;
}
