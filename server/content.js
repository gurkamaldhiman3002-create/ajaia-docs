import sanitizeHtml from 'sanitize-html';
import mammoth from 'mammoth';
import { marked } from 'marked';
import path from 'node:path';
import { HttpError } from './errors.js';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'];
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_CONTENT_CHARS = 1_000_000;

/**
 * Allowlist matches what the editor can render. Anything else is stripped,
 * which protects shared viewers from stored XSS.
 */
const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    b: 'strong',
    i: 'em',
    strike: 's',
    del: 's',
    h4: 'h3',
    h5: 'h3',
    h6: 'h3',
  },
};

export function sanitizeContent(html) {
  return sanitizeHtml(String(html ?? ''), SANITIZE_OPTIONS);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function textToHtml(text) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' ').trim();
  return (base || 'Imported document').slice(0, 200);
}

/** Converts an uploaded file buffer into sanitized editor HTML. */
export async function fileToHtml(file) {
  if (!file) throw new HttpError(400, 'No file was uploaded. Use the "file" field.');
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new HttpError(415, `Unsupported file type "${ext || 'unknown'}". Supported: .txt, .md, .docx`);
  }
  if (!file.buffer?.length) throw new HttpError(422, 'The uploaded file is empty.');

  let html;
  if (ext === '.docx') {
    try {
      const result = await mammoth.convertToHtml({ buffer: file.buffer });
      html = result.value;
    } catch {
      throw new HttpError(422, 'Could not read that .docx file. Is it a valid Word document?');
    }
  } else {
    const text = file.buffer.toString('utf8');
    if (text.includes('\u0000')) throw new HttpError(422, 'That file does not look like plain text.');
    html = ext === '.txt' ? textToHtml(text) : await marked.parse(text);
  }

  const clean = sanitizeContent(html);
  if (!clean.trim()) throw new HttpError(422, 'No readable content was found in that file.');
  return clean;
}
