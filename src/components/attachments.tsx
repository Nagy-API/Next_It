"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Link2, Loader2, Paperclip, Presentation, X } from "lucide-react";
import { addLinkAction, removeAttachmentAction } from "@/app/actions";
import { linkInfo } from "@/lib/links";
import { ActionForm, Submit, useToast } from "./client";
import { btn } from "./ui";

export type AttachmentItem = { id: string; kind: "file" | "link"; name: string; href: string; mime: string | null; size: number | null; createdById: string };

/** Same list as the server allows (src/server/attachments.ts). */
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.rtf,.txt,.csv,.png,.jpg,.jpeg,.webp,.gif,.heic,.mp3,.m4a,.wav,.mp4,.mov,.zip";
const MAX = 25 * 1024 * 1024;

function iconFor(a: Pick<AttachmentItem, "kind" | "mime" | "name">) {
  if (a.kind === "link") return Link2;
  const m = a.mime ?? "";
  if (m.startsWith("image/")) return FileImage;
  if (m.startsWith("video/")) return FileVideo;
  if (m.startsWith("audio/")) return FileAudio;
  if (/sheet|excel|csv/.test(m)) return FileSpreadsheet;
  if (/presentation|powerpoint/.test(m)) return Presentation;
  if (/zip/.test(m)) return FileArchive;
  return FileText;
}

function sizeText(n: number | null) {
  if (!n) return "";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function upload(file: File, target: { itemId?: string; taskId?: string; workTaskId?: string }) {
  if (file.size > MAX) throw new Error(`${file.name} is bigger than 25 MB. Put it on Google Drive and attach the link instead.`);
  const fd = new FormData();
  fd.set("file", file);
  if (target.itemId) fd.set("itemId", target.itemId);
  if (target.taskId) fd.set("taskId", target.taskId);
  if (target.workTaskId) fd.set("workTaskId", target.workTaskId);
  const res = await fetch("/api/files", { method: "POST", body: fd });
  const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string; size?: number; mime?: string; error?: string };
  if (!res.ok || !json.id) throw new Error(json.error ?? "The upload didn't work. Please try again.");
  return json as { id: string; name: string; size: number; mime: string };
}

/** Files and links on an item or a task: open, add, remove. */
export function Attachments({
  items,
  itemId,
  taskId,
  workTaskId,
  meId,
  manager,
  canAdd = true,
  compact,
}: {
  items: AttachmentItem[];
  itemId?: string;
  taskId?: string;
  workTaskId?: string;
  meId: string;
  manager?: boolean;
  canAdd?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const push = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await upload(f, { itemId, taskId, workTaskId });
      push({ kind: "ok", text: files.length > 1 ? `${files.length} files attached.` : "File attached." });
      router.refresh();
    } catch (e) {
      push({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className={clsx("flex flex-wrap gap-1.5", !compact && "sm:gap-2")}>
          {items.map((a) => {
            const Icon = iconFor(a);
            const label = a.kind === "link" ? linkInfo(a.href).label : sizeText(a.size);
            return (
              <li key={a.id} className="group flex max-w-full items-center rounded-lg border border-line bg-white pr-1 text-[13px] transition-colors hover:border-line-strong">
                <a href={a.href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 py-1.5 pl-2.5 pr-1.5">
                  <Icon className={clsx("size-4 shrink-0", a.kind === "link" ? "text-electric" : "text-muted")} strokeWidth={1.8} />
                  <span className="truncate font-medium text-ink">{a.name}</span>
                  {label && <span className="shrink-0 text-[11.5px] text-faint">{label}</span>}
                </a>
                {(a.createdById === meId || manager) && (
                  <ActionForm action={removeAttachmentAction} inlineError={false}>
                    <input type="hidden" name="attachmentId" value={a.id} />
                    <button type="submit" className="rounded p-1 text-faint opacity-60 transition-opacity hover:bg-canvas hover:text-bad group-hover:opacity-100" aria-label={`Remove ${a.name}`}>
                      <X className="size-3.5" />
                    </button>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canAdd && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btn("secondary", "sm")}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />} {busy ? "Uploading" : "Attach file"}
          </button>
          {!linking ? (
            <button type="button" onClick={() => setLinking(true)} className={btn("ghost", "sm")}>
              <Link2 className="size-3.5" /> Add link
            </button>
          ) : (
            <ActionForm action={addLinkAction} resetOnSuccess onSuccess={() => setLinking(false)} className="flex min-w-[240px] flex-1 items-center gap-1.5">
              {itemId && <input type="hidden" name="itemId" value={itemId} />}
              {taskId && <input type="hidden" name="taskId" value={taskId} />}
              {workTaskId && <input type="hidden" name="workTaskId" value={workTaskId} />}
              <input name="url" required autoFocus placeholder="Paste a Google Doc, Drive, Canva… link" className="field field-sm h-8 min-w-0 flex-1" />
              <Submit size="sm" variant="dark">
                Add
              </Submit>
              <button type="button" onClick={() => setLinking(false)} className="rounded p-1 text-faint hover:text-ink" aria-label="Cancel">
                <X className="size-4" />
              </button>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inside a form that creates something (Give a task, Add content): files are uploaded right away and attached
 * when the form is sent (hidden "attachmentId" fields). Links are written as files people can open.
 */
export function PendingAttachments() {
  const push = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const addDraft = () => {
    const v = draft.trim();
    if (!v) return;
    setLinks((all) => (all.includes(v) ? all : [...all, v]));
    setDraft("");
  };
  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        const r = await upload(f, {});
        setFiles((all) => [...all, { id: r.id, name: r.name, size: r.size }]);
      }
    } catch (e) {
      push({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <input key={f.id} type="hidden" name="attachmentId" value={f.id} />
      ))}
      {links.map((l) => (
        <input key={l} type="hidden" name="attachLink" value={l} />
      ))}
      {(files.length > 0 || links.length > 0) && (
        <ul className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <li key={l} className="flex items-center gap-1.5 rounded-lg border border-line bg-white py-1 pl-2.5 pr-1 text-[13px]">
              <Link2 className="size-3.5 text-electric" />
              <span className="max-w-[220px] truncate font-medium">{l.replace(/^https?:\/\//, "")}</span>
              <button type="button" onClick={() => setLinks((all) => all.filter((x) => x !== l))} className="rounded p-0.5 text-faint hover:text-bad" aria-label="Remove link">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-white py-1 pl-2.5 pr-1 text-[13px]">
              <Paperclip className="size-3.5 text-muted" />
              <span className="max-w-[200px] truncate font-medium">{f.name}</span>
              <span className="text-[11.5px] text-faint">{sizeText(f.size)}</span>
              <button type="button" onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))} className="rounded p-0.5 text-faint hover:text-bad" aria-label={`Remove ${f.name}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btn("secondary", "sm")}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />} {busy ? "Uploading" : "Attach files"}
        </button>
        <div className="flex min-w-[220px] flex-1 items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            onBlur={addDraft}
            placeholder="Or paste a document link"
            aria-label="Document link"
            className="field field-sm h-8 min-w-0 flex-1"
          />
        </div>
      </div>
    </div>
  );
}
