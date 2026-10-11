"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Link2, Loader2, Lock, NotebookPen, Paperclip, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { createNoteAction, deleteNoteAction, loadNotebookAction, noteLinkAction, noteRemoveFileAction, saveNoteAction } from "@/app/notebook-actions";
import type { NotebookNote } from "@/server/notebook";
import { ACCEPT, iconFor, sizeText, upload } from "./attachments";
import { Modal, useToast } from "./client";
import { btn } from "./ui";

/** Anything can open the notebook: `openNotebook()` (notes strip, user menu, the N shortcut). */
export const NOTEBOOK_EVENT = "nexora:notebook";
export function openNotebook() {
  window.dispatchEvent(new Event(NOTEBOOK_EVENT));
}

const COLORS = [null, "#3b82f6", "#10b981", "#f59e0b", "#e0569b", "#8b5cf6", "#64748b"] as const;

function when(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Cairo" });
}

function titleOf(n: Pick<NotebookNote, "title" | "body">) {
  return n.title.trim() || n.body.trim().split("\n")[0]?.slice(0, 80) || "Untitled";
}

/** Mounted once in the shell; listens for openNotebook() and the "N" key. */
export function NotebookHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener(NOTEBOOK_EVENT, on);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener(NOTEBOOK_EVENT, on);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="My notebook" width={900}>
      <Notebook />
    </Modal>
  );
}

function Notebook() {
  const push = useToast();
  const [notes, setNotes] = useState<NotebookNote[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Partial<NotebookNote>>());

  const flush = useCallback(
    async (id: string) => {
      const patch = pending.current.get(id);
      pending.current.delete(id);
      timers.current.delete(id);
      if (!patch) return;
      setSaving("saving");
      const r = await saveNoteAction(id, { title: patch.title, body: patch.body, color: patch.color, pinned: patch.pinned });
      if (!r.ok) {
        push({ kind: "error", text: r.error });
        setSaving("idle");
      } else setSaving("saved");
    },
    [push],
  );

  // Load once; save anything still waiting when the notebook closes.
  useEffect(() => {
    let alive = true;
    loadNotebookAction().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setNotes(r.data ?? []);
        if (window.matchMedia("(min-width: 768px)").matches && r.data?.[0]) setActiveId(r.data[0].id);
      } else {
        setNotes([]);
        push({ kind: "error", text: r.error });
      }
    });
    const t = timers.current;
    return () => {
      alive = false;
      for (const [id, h] of t) {
        clearTimeout(h);
        void flush(id);
      }
    };
  }, [flush, push]);

  const change = (id: string, patch: Partial<NotebookNote>, now = false) => {
    setNotes((all) => (all ?? []).map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)));
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    const old = timers.current.get(id);
    if (old) clearTimeout(old);
    if (now) void flush(id);
    else timers.current.set(id, setTimeout(() => void flush(id), 700));
  };

  const create = async () => {
    const r = await createNoteAction();
    if (!r.ok || !r.data) return push({ kind: "error", text: r.ok ? "Couldn't add a note." : r.error });
    const n: NotebookNote = { id: r.data, title: "", body: "", color: null, pinned: false, updatedAt: new Date().toISOString(), files: [] };
    setNotes((all) => [n, ...(all ?? [])]);
    setActiveId(n.id);
    setQ("");
  };

  const remove = async (id: string) => {
    const n = notes?.find((x) => x.id === id);
    if (n && (n.title || n.body || n.files.length) && !confirm(`Delete "${titleOf(n)}"? This can't be undone.`)) return;
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    pending.current.delete(id);
    const r = await deleteNoteAction(id);
    if (!r.ok) return push({ kind: "error", text: r.error });
    setNotes((all) => (all ?? []).filter((x) => x.id !== id));
    setActiveId(null);
  };

  const reload = async (keep: string) => {
    const r = await loadNotebookAction();
    if (r.ok && r.data) {
      // Keep what's being typed; take the files from the server.
      setNotes((all) => r.data!.map((n) => ({ ...n, ...(all?.find((x) => x.id === n.id && pending.current.has(n.id)) ?? {}), files: n.files })));
      setActiveId(keep);
    }
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = [...(notes ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
    return s ? all.filter((n) => `${n.title}\n${n.body}\n${n.files.map((f) => f.name).join(" ")}`.toLowerCase().includes(s)) : all;
  }, [notes, q]);
  const active = notes?.find((n) => n.id === activeId) ?? null;

  if (!notes)
    return (
      <div className="flex h-40 items-center justify-center text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );

  return (
    <div className="-mx-5 -mb-5 border-t border-line">
      <div className="flex items-center gap-2 bg-subtle px-5 py-2 text-[12.5px] text-muted">
        <Lock className="size-3.5 shrink-0" /> Only you can see this. Not your manager, not the admin. Ideas, drafts, links, files.
      </div>
      <div className="grid min-h-[60vh] md:grid-cols-[260px_1fr]">
        <aside className={clsx("flex min-h-0 flex-col border-line md:border-r", active && "max-md:hidden")}>
          <div className="flex items-center gap-2 p-3">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my notes" aria-label="Search my notes" className="field h-9 pl-8 text-[13px]" />
            </label>
            <button type="button" onClick={create} className={btn("primary", "sm", "h-9 shrink-0")} aria-label="New note">
              <Plus className="size-4" /> New
            </button>
          </div>
          <div className="max-h-[60vh] flex-1 overflow-y-auto px-2 pb-3">
            {list.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <NotebookPen className="mx-auto size-8 text-faint" strokeWidth={1.4} />
                <p className="mt-2 text-[13px] font-medium text-ink-2">{q ? "Nothing matches." : "Your notebook is empty."}</p>
                {!q && <p className="mt-1 text-[12.5px] text-faint">Write a thought before it runs away.</p>}
              </div>
            ) : (
              list.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setActiveId(n.id)}
                  className={clsx("mb-0.5 flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors", n.id === activeId ? "bg-electric-soft" : "hover:bg-hover")}
                >
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: n.color ?? "var(--color-line-strong)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[13.5px] font-semibold text-ink">
                      <span className="truncate">{titleOf(n)}</span>
                      {n.pinned && <Pin className="size-3 shrink-0 text-muted" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-faint">
                      {when(n.updatedAt)}
                      {n.files.length > 0 && (
                        <>
                          <Paperclip className="size-3" /> {n.files.length}
                        </>
                      )}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={clsx("min-w-0", !active && "max-md:hidden")}>
          {active ? (
            <Editor key={active.id} note={active} saving={saving} onBack={() => setActiveId(null)} onChange={(p, now) => change(active.id, p, now)} onDelete={() => remove(active.id)} onFiles={() => reload(active.id)} />
          ) : (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
              <NotebookPen className="size-10 text-faint" strokeWidth={1.3} />
              <p className="max-w-[300px] text-[13.5px] text-muted">Pick a note on the left, or start a new one. Everything saves as you type.</p>
              <button type="button" onClick={create} className={btn("secondary", "sm")}>
                <Plus className="size-4" /> New note
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Editor({
  note,
  saving,
  onBack,
  onChange,
  onDelete,
  onFiles,
}: {
  note: NotebookNote;
  saving: "idle" | "saving" | "saved";
  onBack: () => void;
  onChange: (p: Partial<NotebookNote>, now?: boolean) => void;
  onDelete: () => void;
  onFiles: () => Promise<void>;
}) {
  const push = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  // Let the page grow with the text.
  useEffect(() => {
    const t = bodyRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.max(220, t.scrollHeight)}px`;
  }, [note.body]);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await upload(f, { privateNoteId: note.id });
      await onFiles();
    } catch (e) {
      push({ kind: "error", text: e instanceof Error ? e.message : "The upload didn't work." });
    }
    setBusy(false);
  };

  const addLink = async () => {
    if (!link?.trim()) return setLink(null);
    setBusy(true);
    const r = await noteLinkAction(note.id, link.trim());
    if (!r.ok) push({ kind: "error", text: r.error });
    else {
      setLink(null);
      await onFiles();
    }
    setBusy(false);
  };

  const removeFile = async (id: string) => {
    const r = await noteRemoveFileAction(id);
    if (!r.ok) return push({ kind: "error", text: r.error });
    await onFiles();
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void addFiles(Array.from(e.dataTransfer.files));
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          void addFiles(files);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
        <button type="button" onClick={onBack} className={btn("ghost", "sm", "md:hidden")} aria-label="Back to my notes">
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex items-center gap-1 px-1" role="group" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c ?? "none"}
              type="button"
              onClick={() => onChange({ color: c }, true)}
              aria-label={c ? `Colour ${c}` : "No colour"}
              aria-pressed={note.color === c}
              className={clsx("flex size-6 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110", note.color === c && "ring-2 ring-ink ring-offset-1 ring-offset-surface")}
            >
              <span className={clsx("size-4 rounded-full", !c && "border border-dashed border-line-strong")} style={c ? { background: c } : undefined} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-5 w-px bg-line" />
        <button type="button" onClick={() => onChange({ pinned: !note.pinned }, true)} className={btn("ghost", "sm")} aria-pressed={note.pinned} title={note.pinned ? "Unpin" : "Pin to the top"}>
          {note.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          <span className="max-sm:hidden">{note.pinned ? "Unpin" : "Pin"}</span>
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={btn("ghost", "sm")} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          <span className="max-sm:hidden">Attach</span>
        </button>
        <button type="button" onClick={() => setLink(link === null ? "" : null)} className={btn("ghost", "sm")}>
          <Link2 className="size-4" />
          <span className="max-sm:hidden">Link</span>
        </button>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />
        <span className="ml-auto text-[11.5px] text-faint" aria-live="polite">
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
        </span>
        <button type="button" onClick={onDelete} className={btn("ghost", "sm", "text-bad")} aria-label="Delete note">
          <Trash2 className="size-4" />
        </button>
      </div>

      {link !== null && (
        <form
          className="flex gap-2 border-b border-line px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addLink();
          }}
        >
          <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link (Canva, Drive, a reference…)" className="field h-9 flex-1 text-[13px]" aria-label="Link" />
          <button type="submit" className={btn("primary", "sm", "h-9")} disabled={busy}>
            Add
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4" style={note.color ? { boxShadow: `inset 3px 0 0 ${note.color}` } : undefined}>
        <input
          value={note.title}
          onChange={(e) => onChange({ title: e.target.value.slice(0, 140) })}
          placeholder="Title"
          aria-label="Title"
          className="w-full bg-transparent font-display text-[20px] font-bold text-ink outline-none placeholder:text-faint"
        />
        <textarea
          ref={bodyRef}
          value={note.body}
          autoFocus={!note.body && !note.title}
          onChange={(e) => onChange({ body: e.target.value.slice(0, 20_000) })}
          placeholder="Write anything. Ideas for next month, a caption draft, a list for tomorrow…"
          aria-label="Note"
          className="mt-2 w-full resize-none bg-transparent text-[14.5px] leading-relaxed text-ink outline-none placeholder:text-faint"
        />
        {note.files.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Files and links</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {note.files.map((f) => {
                const Icon = iconFor(f);
                const img = f.kind === "file" && f.mime?.startsWith("image/") && !/heic/.test(f.mime);
                return (
                  <div key={f.id} className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-line bg-surface p-2">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.href} alt="" className="size-10 shrink-0 rounded-md object-cover" loading="lazy" />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-subtle text-muted">
                        <Icon className="size-4.5" />
                      </span>
                    )}
                    <a href={f.href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate text-[13px] font-medium text-ink">{f.name}</span>
                      <span className="block text-[11.5px] text-faint">{f.kind === "link" ? "Link" : sizeText(f.size)}</span>
                    </a>
                    <button type="button" onClick={() => removeFile(f.id)} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-hover hover:text-bad" aria-label={`Remove ${f.name}`}>
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="mt-4 text-[11.5px] text-faint">Drop or paste files here too. Up to 25 MB each.</p>
      </div>
    </div>
  );
}
