import { useEffect, useRef, useState } from 'react';
import { api, ACCEPTED_FILES, checkFile } from './api.js';
import { navigate } from './nav.js';
import { formatWhen } from './format.js';

export default function Dashboard() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  async function load() {
    try {
      setDocs(await api.listDocs());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function createBlank() {
    setBusy(true);
    try {
      const doc = await api.createDoc();
      navigate(`/d/${doc.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function importFile(file) {
    const problem = checkFile(file);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const doc = await api.importDoc(file);
      navigate(`/d/${doc.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Delete "${doc.title}"? People it is shared with will lose access too.`)) return;
    try {
      await api.deleteDoc(doc.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="dashboard">
      <div className="dash-actions">
        <h1>Documents</h1>
        <div className="dash-buttons">
          <button className="btn btn-primary" onClick={createBlank} disabled={busy}>New document</button>
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy}>Import file</button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_FILES}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importFile(f);
            }}
          />
        </div>
        <p className="muted dash-hint">Import turns a .txt, .md or .docx file (up to 2 MB) into a new editable document.</p>
      </div>

      {error && <p className="banner banner-error" role="alert">{error}</p>}

      {!docs ? (
        !error && <p className="muted">Loading documents…</p>
      ) : (
        <>
          <DocList
            title="Owned by you"
            empty="You have no documents yet. Create one or import a file to get started."
            docs={docs.owned}
            onDelete={remove}
          />
          <DocList
            title="Shared with you"
            empty="Nothing has been shared with you yet. Documents others share with you will appear here."
            docs={docs.shared}
          />
        </>
      )}
    </main>
  );
}

function DocList({ title, empty, docs, onDelete }) {
  return (
    <section className="doclist">
      <h2>{title} <span className="count">{docs.length}</span></h2>
      {docs.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul>
          {docs.map((d) => (
            <li key={d.id} className={`docrow docrow-${d.role}`}>
              <a href={`#/d/${d.id}`} className="docrow-main">
                <span className="docrow-title">{d.title}</span>
                <span className="docrow-meta">
                  {d.role === 'owner' ? 'You own this' : `Owned by ${d.owner.name}`}, edited {formatWhen(d.updatedAt)}
                </span>
              </a>
              <RolePill role={d.role} />
              {onDelete && (
                <button className="btn btn-quiet btn-danger" onClick={() => onDelete(d)} aria-label={`Delete ${d.title}`}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RolePill({ role }) {
  const label = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' }[role];
  return <span className={`pill pill-${role}`}>{label}</span>;
}
