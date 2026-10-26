"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeHref, sanitizeFieldHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

import { RichText } from "@/components/rich-text";

export function InlineHtmlEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  tall = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  tall?: boolean;
}) {
  const emitted = useRef(sanitizeFieldHtml(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: false,
          linkOnPaste: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            rel: "noopener noreferrer",
            target: "_blank",
          },
          isAllowedUri: (url) => normalizeHref(url) !== null,
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
    ],
    content: value || "",
    onUpdate: ({ editor: current }) => {
      const clean = sanitizeFieldHtml(current.getHTML());
      if (clean === emitted.current) return;
      emitted.current = clean;
      onChangeRef.current(clean);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = sanitizeFieldHtml(value);
    if (next === emitted.current) return;
    emitted.current = next;
    editor.commands.setContent(next || "", { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (autoFocus && editor) editor.commands.focus("end");
  }, [autoFocus, editor]);

  function openLink() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    selectionRef.current = { from, to };
    const current = editor.getAttributes("link").href;
    setLinkUrl(typeof current === "string" ? current : "");
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const href = normalizeHref(linkUrl);
    if (!href) {
      setLinkError("Use um link http, https ou e-mail.");
      return;
    }
    const selection = selectionRef.current;
    const chain = editor.chain().focus();
    if (selection) chain.setTextSelection(selection);
    chain.extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
    setLinkError(null);
  }

  function removeLink() {
    if (!editor) return;
    const selection = selectionRef.current;
    const chain = editor.chain().focus();
    if (selection) chain.setTextSelection(selection);
    chain.extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
    setLinkError(null);
  }

  return (
    <div
      className="inline-html-editor overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 border-b bg-muted/40 px-1 py-1">
        <ToolbarButton
          label="Negrito"
          active={Boolean(editor?.isActive("bold"))}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Itálico"
          active={Boolean(editor?.isActive("italic"))}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Lista"
          active={Boolean(editor?.isActive("bulletList"))}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Lista numerada"
          active={Boolean(editor?.isActive("orderedList"))}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={Boolean(editor?.isActive("link")) || linkOpen}
          disabled={!editor}
          onClick={() => (linkOpen ? setLinkOpen(false) : openLink())}
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {linkOpen ? (
        <div className="space-y-1 border-b px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
              placeholder="https:// ou e-mail"
              className="h-8"
              aria-label="Endereço do link"
            />
            <Button type="button" size="sm" className="h-8" onClick={applyLink}>
              Ok
            </Button>
            {editor?.isActive("link") ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={removeLink}
              >
                Remover
              </Button>
            ) : null}
          </div>
          {linkError ? (
            <p className="text-[11px] text-destructive-foreground">{linkError}</p>
          ) : null}
        </div>
      ) : null}

      {editor ? (
        <EditorContent
          editor={editor}
          className={cn(
            "[&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:text-sm [&_.ProseMirror]:outline-none [&_.ProseMirror_a]:underline [&_.ProseMirror_ol]:my-1 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_p]:my-0 [&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5",
            tall ? "[&_.ProseMirror]:min-h-[10rem]" : "[&_.ProseMirror]:min-h-[2.25rem]",
          )}
        />
      ) : (
        <div
          className={cn("px-3 py-2 text-sm", tall ? "min-h-[10rem]" : "min-h-[2.25rem]")}
        >
          {value ? (
            <RichText html={value} />
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
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
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40",
        active && "bg-background text-foreground shadow-sm",
      )}
    >
      {children}
    </button>
  );
}
