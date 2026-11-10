export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status}).`, data);
  return data;
}

function fileForm(file) {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export const api = {
  me: () => request('GET', '/api/auth/me'),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout'),
  users: () => request('GET', '/api/users'),

  listDocs: () => request('GET', '/api/documents'),
  createDoc: (data = {}) => request('POST', '/api/documents', data),
  getDoc: (id) => request('GET', `/api/documents/${id}`),
  updateDoc: (id, data) => request('PATCH', `/api/documents/${id}`, data),
  deleteDoc: (id) => request('DELETE', `/api/documents/${id}`),
  importDoc: (file) => request('POST', '/api/documents/import', fileForm(file)),
  convertFile: (file) => request('POST', '/api/convert', fileForm(file)),

  listShares: (id) => request('GET', `/api/documents/${id}/shares`),
  share: (id, email, role) => request('PUT', `/api/documents/${id}/shares`, { email, role }),
  unshare: (id, userId) => request('DELETE', `/api/documents/${id}/shares/${userId}`),
};

export const ACCEPTED_FILES = '.txt,.md,.markdown,.docx';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Client-side pre-check so users get instant feedback; the server re-validates. */
export function checkFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_FILES.split(',').includes(ext)) return 'Only .txt, .md and .docx files can be imported.';
  if (file.size > MAX_FILE_BYTES) return 'That file is over the 2 MB limit.';
  return null;
}
