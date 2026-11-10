import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { HttpError } from './errors.js';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/**
 * Stateless signed session token: "<userId>.<issuedAt>.<hmac>".
 * Good enough for a demo with seeded accounts; see ARCHITECTURE.md for what
 * production auth would need.
 */
export function createSessionToken(userId, secret) {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readSessionToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, issuedAt, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${userId}.${issuedAt}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() - Number(issuedAt) > MAX_AGE_MS) return null;
  return userId;
}

export const SESSION_COOKIE = 'ajaia_session';
export const SESSION_MAX_AGE_MS = MAX_AGE_MS;

export function requireAuth(db, secret) {
  return async (req, _res, next) => {
    try {
      const userId = readSessionToken(req.cookies?.[SESSION_COOKIE], secret);
      if (!userId) throw new HttpError(401, 'Please sign in.');
      const { rows } = await db.execute({
        sql: 'SELECT id, email, name FROM users WHERE id = ?',
        args: [userId],
      });
      if (!rows[0]) throw new HttpError(401, 'Please sign in.');
      req.user = { id: rows[0].id, email: rows[0].email, name: rows[0].name };
      next();
    } catch (err) {
      next(err);
    }
  };
}
