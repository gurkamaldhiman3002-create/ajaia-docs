import { useEditorState } from '@tiptap/react';

export default function Toolbar({ editor, onImport }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold'),
      italic: e?.isActive('italic'),
      underline: e?.isActive('underline'),
      strike: e?.isActive('strike'),
      h1: e?.isActive('heading', { level: 1 }),
      h2: e?.isActive('heading', { level: 2 }),
      h3: e?.isActive('heading', { level: 3 }),
      bullet: e?.isActive('bulletList'),
      ordered: e?.isActive('orderedList'),
      quote: e?.isActive('blockquote'),
      canUndo: e?.can().undo(),
      canRedo: e?.can().redo(),
    }),
  });
  if (!editor || !s) return null;

  const chain = () => editor.chain().focus();
  const blockValue = s.h1 ? 'h1' : s.h2 ? 'h2' : s.h3 ? 'h3' : 'p';

  function setBlock(value) {
    if (value === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(value[1]) }).run();
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <select value={blockValue} onChange={(e) => setBlock(e.target.value)} aria-label="Text style">
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="tb-sep" />
      <Tb active={s.bold} onClick={() => chain().toggleBold().run()} label="Bold (Ctrl+B)"><b>B</b></Tb>
      <Tb active={s.italic} onClick={() => chain().toggleItalic().run()} label="Italic (Ctrl+I)"><i>I</i></Tb>
      <Tb active={s.underline} onClick={() => chain().toggleUnderline().run()} label="Underline (Ctrl+U)"><u>U</u></Tb>
      <Tb active={s.strike} onClick={() => chain().toggleStrike().run()} label="Strikethrough"><s>S</s></Tb>
      <span className="tb-sep" />
      <Tb active={s.bullet} onClick={() => chain().toggleBulletList().run()} label="Bulleted list">• List</Tb>
      <Tb active={s.ordered} onClick={() => chain().toggleOrderedList().run()} label="Numbered list">1. List</Tb>
      <Tb active={s.quote} onClick={() => chain().toggleBlockquote().run()} label="Quote">“ Quote</Tb>
      <span className="tb-sep" />
      <Tb disabled={!s.canUndo} onClick={() => chain().undo().run()} label="Undo (Ctrl+Z)">Undo</Tb>
      <Tb disabled={!s.canRedo} onClick={() => chain().redo().run()} label="Redo (Ctrl+Shift+Z)">Redo</Tb>
      <span className="tb-spacer" />
      <button type="button" className="btn btn-quiet" onClick={onImport} title="Insert a .txt, .md or .docx file at the cursor">
        Insert from file
      </button>
    </div>
  );
}

function Tb({ active, disabled, onClick, label, children }) {
  return (
    <button
      type="button"
      className={`tb ${active ? 'tb-active' : ''}`}
      aria-pressed={active ?? undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
