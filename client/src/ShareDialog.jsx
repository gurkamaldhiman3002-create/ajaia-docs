import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export default function ShareDialog({ docId, onClose }) {
  const [shares, setShares] = useState([]);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    Promise.all([api.listShares(docId), api.users()])
      .then(([s, u]) => {
        setShares(s.shares);
        setUsers(u.users);
      })
      .catch((err) => setError(err.message));
  }, [docId]);

  async function grant(targetEmail, targetRole) {
    setBusy(true);
    setError('');
    try {
      const { share } = await api.share(docId, targetEmail, targetRole);
      setShares((list) => [...list.filter((s) => s.userId !== share.userId), share].sort((a, b) => a.name.localeCompare(b.name)));
      setEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId) {
    setError('');
    try {
      await api.unshare(docId, userId);
      setShares((list) => list.filter((s) => s.userId !== userId));
    } catch (err) {
      setError(err.message);
    }
  }

  const suggestions = users.filter((u) => !shares.some((s) => s.userId === u.id));

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onCancel={onClose}>
      <h2>Share document</h2>
      <form
        className="share-form"
        onSubmit={(e) => {
          e.preventDefault();
          grant(email, role);
        }}
      >
        <input
          type="email"
          list="share-users"
          placeholder="Teammate's email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email of person to share with"
          required
          autoFocus
        />
        <datalist id="share-users">
          {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
        </datalist>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button className="btn btn-primary" type="submit" disabled={busy}>Share</button>
      </form>
      {suggestions.length > 0 && (
        <p className="muted small">Demo users: {suggestions.map((u) => u.email).join(', ')}</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <h3>People with access</h3>
      {shares.length === 0 ? (
        <p className="muted">Only you can open this document.</p>
      ) : (
        <ul className="share-list">
          {shares.map((s) => (
            <li key={s.userId}>
              <span className="avatar" aria-hidden="true">{s.name[0]}</span>
              <span className="share-who">
                <strong>{s.name}</strong>
                <small>{s.email}</small>
              </span>
              <select value={s.role} onChange={(e) => grant(s.email, e.target.value)} aria-label={`Access for ${s.name}`}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button className="btn btn-quiet btn-danger" onClick={() => revoke(s.userId)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="dialog-footer">
        <button className="btn" onClick={() => dialogRef.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}
