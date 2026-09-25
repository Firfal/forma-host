"use client";

import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import type { ComponentType } from "react";
import type { RichText } from "@shared/types";
import { cn } from "@/lib/cn";
import { richTextExtensions } from "./extensions";

function ToolbarButton({
  label,
  icon: Icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-muted hover:bg-surface hover:text-ink disabled:opacity-40",
        active && "bg-surface text-ink",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  function toggleLink() {
    if (state.link) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Adresse du lien (https://…)");
    if (!url) return;
    const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  const chain = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line-soft px-1.5 py-1">
      <ToolbarButton
        label="Gras"
        icon={Bold}
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        label="Italique"
        icon={Italic}
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <span className="mx-1 h-4 w-px bg-line" />
      <ToolbarButton
        label="Titre"
        icon={Heading2}
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Sous-titre"
        icon={Heading3}
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        label="Liste"
        icon={List}
        active={state.bullet}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Liste numérotée"
        icon={ListOrdered}
        active={state.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Citation"
        icon={Quote}
        active={state.quote}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <ToolbarButton label="Lien" icon={Link2} active={state.link} onClick={toggleLink} />
      <span className="mx-1 h-4 w-px bg-line" />
      <ToolbarButton
        label="Annuler"
        icon={Undo2}
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      />
      <ToolbarButton
        label="Rétablir"
        icon={Redo2}
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      />
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Écris ici…",
  id,
  className,
}: {
  value: RichText | null;
  onChange: (value: RichText | null) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  const editor = useEditor({
    extensions: richTextExtensions,
    content: (value as JSONContent | null) ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: id ?? "",
        class: "prose-forma min-h-32 px-3 py-2 focus:outline-none",
        "aria-label": placeholder,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? null : (e.getJSON() as RichText)),
  });

  return (
    <div
      className={cn(
        "rounded-md border border-line bg-white focus-within:border-ink/40 focus-within:ring-2 focus-within:ring-brand-logo/25",
        className,
      )}
    >
      {editor ? <Toolbar editor={editor} /> : <div className="h-9 border-b border-line-soft" />}
      <EditorContent editor={editor} />
    </div>
  );
}
