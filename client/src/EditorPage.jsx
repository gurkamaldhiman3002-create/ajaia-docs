import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
import { api, ACCEPTED_FILES, checkFile } from './api.js';
import Toolbar from './Toolbar.jsx';
import ShareDialog from './ShareDialog.jsx';
import { RolePill } from './Dashboard.jsx';
import { formatWhen } from './format.js';

const AUTOSAVE_MS = 800;

const STATUS_TEXT = {
  idle: '',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Not saved',
  conflict: 'Not saved, newer version exists',
};

export default function EditorPage({ docId }) {
  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('idle');
  const [notice, setNotice] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  // Refs hold the save pipeline state so debounced callbacks never read stale values.
  const versionRef = useRef(1);
  const titleRef = useRef('');
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const blockedRef = useRef(false);
  const timerRef = useRef(null);
  const editorRef = useRef(null);
  const htmlRef = useRef('');
  const importInput = useRef(null);

  const canEdit = doc && doc.role !== 'viewer';

  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (!dirtyRef.current || blockedRef.current) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    const trimmed = titleRef.current.trim();
    const payload = { contentHtml: htmlRef.current, version: versionRef.current };
    if (trimmed) payload.title = trimmed;

    savingRef.current = true;
    dirtyRef.current = false;
    setStatus('saving');
    try {
      const updated = await api.updateDoc(docId, payload);
      versionRef.current = updated.version;
      setDoc((d) => ({ ...d, updatedAt: updated.updatedAt, title: updated.title }));
      setStatus(dirtyRef.current ? 'unsaved' : 'saved');
      setNotice(trimmed ? '' : 'Title cannot be empty, so the previous title was kept.');
    } catch (err) {
      dirtyRef.current = true;
      if (err.status === 409) {
        blockedRef.current = true;
        setStatus('conflict');
      } else {
        setStatus('error');
        setNotice(err.message);
      }
    } finally {
      savingRef.current = false;
      if (queuedRef.current && !blockedRef.current) {
        queuedRef.current = false;
        save();
      }
    }
  }, [docId]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setStatus('unsaved');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, AUTOSAVE_MS);
  }, [save]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: '',
    editable: false,
    onUpdate: ({ editor: ed, transaction }) => {
      if (!transaction.docChanged) return;
      htmlRef.current = ed.getHTML();
      markDirty();
    },
  });
  editorRef.current = editor;

  const load = useCallback(async () => {
    try {
      const data = await api.getDoc(docId);
      setDoc(data);
      setTitle(data.title);
      titleRef.current = data.title;
      versionRef.current = data.version;
      dirtyRef.current = false;
      blockedRef.current = false;
      setStatus('idle');
      setNotice('');
      setLoadError('');
    } catch (err) {
      setLoadError(err.status === 404 ? 'This document does not exist or has not been shared with you.' : err.message);
    }
  }, [docId]);

  useEffect(() => { load(); }, [load]);

  // Push loaded content into the editor once both exist.
  useEffect(() => {
    if (!editor || !doc || dirtyRef.current) return;
    editor.commands.setContent(doc.contentHtml || '', { emitUpdate: false });
    htmlRef.current = editor.getHTML();
    editor.setEditable(doc.role !== 'viewer');
  }, [editor, doc?.id, doc?.version, doc?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on Ctrl/Cmd+S, warn before closing with unsaved work, flush on unmount.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    const onBeforeUnload = (e) => {
      if (dirtyRef.current || savingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (dirtyRef.current && !blockedRef.current) save();
    };
  }, [save]);

  function onTitleChange(value) {
    setTitle(value);
    titleRef.current = value;
    markDirty();
  }

  async function importIntoDoc(file) {
    const problem = checkFile(file);
    if (problem) return setNotice(problem);
    try {
      const { contentHtml } = await api.convertFile(file);
      editor.chain().focus().insertContent(contentHtml).run();
      setNotice(`Imported ${file.name} at the cursor.`);
    } catch (err) {
      setNotice(err.message);
    }
  }

  function exportMarkdown() {
    const md = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' }).turndown(editor.getHTML());
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(titleRef.current.trim() || 'document').replace(/[^\w\s-]/g, '').trim() || 'document'}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loadError) {
    return (
      <main className="editor-page">
        <div className="banner banner-error" role="alert">{loadError}</div>
        <p><a href="#/">Back to documents</a></p>
      </main>
    );
  }
  if (!doc) return <main className="editor-page"><p className="muted">Opening document…</p></main>;

  return (
    <main className="editor-page">
      <div className="doc-header">
        <a href="#/" className="back">Documents</a>
        <input
          className="doc-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          readOnly={!canEdit}
          maxLength={200}
          aria-label="Document title"
          placeholder="Untitled document"
        />
        <div className="doc-meta">
          <RolePill role={doc.role} />
          <span className="muted">
            {doc.role === 'owner' ? 'You own this' : `Owned by ${doc.owner.name}`}
          </span>
          <span className={`save-status save-${status}`} aria-live="polite">
            {STATUS_TEXT[status] || (doc.updatedAt ? `Last edited ${formatWhen(doc.updatedAt)}` : '')}
          </span>
          <span className="doc-header-actions">
            <button className="btn btn-quiet" onClick={exportMarkdown}>Export .md</button>
            {doc.role === 'owner' && (
              <button className="btn btn-primary" onClick={() => setShareOpen(true)}>Share</button>
            )}
          </span>
        </div>
      </div>

      {status === 'conflict' && (
        <div className="banner banner-warn" role="alert">
          Someone saved a newer version while you were editing. Your latest changes were not saved.
          <button className="btn" onClick={load}>Load latest version</button>
        </div>
      )}
      {doc.role === 'viewer' && (
        <div className="banner banner-view">You can view this document. Ask {doc.owner.name} for edit access to make changes.</div>
      )}
      {notice && (
        <div className="banner banner-info" role="status">
          {notice}
          <button className="btn btn-quiet" onClick={() => setNotice('')} aria-label="Dismiss">Dismiss</button>
        </div>
      )}

      {canEdit && (
        <Toolbar editor={editor} onImport={() => importInput.current?.click()} />
      )}
      <input
        ref={importInput}
        type="file"
        accept={ACCEPTED_FILES}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) importIntoDoc(f);
        }}
      />

      <div className="desk">
        <article className={`paper ${canEdit ? '' : 'paper-readonly'}`}>
          <EditorContent editor={editor} />
        </article>
      </div>

      {shareOpen && <ShareDialog docId={doc.id} onClose={() => setShareOpen(false)} />}
    </main>
  );
}
