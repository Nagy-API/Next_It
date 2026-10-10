"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { addTimeAction, deleteTimeAction, editTimeAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/client";

/** Correct one stretch of worked time (only for people allowed to edit time). Times are Cairo time. */
export function EditSession({ id, start, end, running }: { id: string; start: string; end: string | null; running: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <span className="ml-1 inline-flex gap-0.5 align-middle">
        <button type="button" onClick={() => setOpen(true)} className="cursor-pointer rounded p-1 text-faint hover:bg-canvas hover:text-electric" title="Correct this time" aria-label="Correct this time">
          <Pencil className="size-3.5" />
        </button>
        {!running && (
          <ActionForm action={deleteTimeAction} inlineError={false}>
            <input type="hidden" name="sessionId" value={id} />
            <button
              type="submit"
              className="cursor-pointer rounded p-1 text-faint hover:bg-bad-soft hover:text-bad"
              title="Remove this time"
              aria-label="Remove this time"
              onClick={(e) => {
                if (!confirm("Remove this time entry? It stays in the activity log.")) e.preventDefault();
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </ActionForm>
        )}
      </span>
    );
  return (
    <ActionForm action={editTimeAction} onSuccess={() => setOpen(false)} className="mt-1.5 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-2">
      <input type="hidden" name="sessionId" value={id} />
      <label className="text-[12px]">
        <span className="block text-muted">Started</span>
        <input type="datetime-local" name="startedAt" defaultValue={start} required className="field h-9 py-1 text-[13px]" />
      </label>
      <label className="text-[12px]">
        <span className="block text-muted">{running ? "Ended (leave empty: still running)" : "Ended"}</span>
        <input type="datetime-local" name="endedAt" defaultValue={end ?? ""} required={!running} className="field h-9 py-1 text-[13px]" />
      </label>
      <Submit size="sm" variant="primary">
        Save
      </Submit>
      <button type="button" onClick={() => setOpen(false)} className="cursor-pointer px-2 text-[12.5px] text-muted hover:text-ink">
        Cancel
      </button>
    </ActionForm>
  );
}

/** Add time someone forgot to clock on a step. */
export function AddSession({ stageId, people, defaultUserId, day }: { stageId: string; people: { id: string; name: string }[]; defaultUserId: string | null; day: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 inline-flex cursor-pointer items-center gap-1 pl-4 text-[12.5px] font-medium text-electric">
        <Plus className="size-3.5" /> Add time
      </button>
    );
  return (
    <ActionForm action={addTimeAction} onSuccess={() => setOpen(false)} className="mt-1.5 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-2">
      <input type="hidden" name="stageId" value={stageId} />
      <label className="text-[12px]">
        <span className="block text-muted">Who</span>
        <select name="userId" defaultValue={defaultUserId ?? ""} required className="field h-9 py-1 text-[13px]">
          <option value="" disabled>
            Pick…
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px]">
        <span className="block text-muted">From</span>
        <input type="datetime-local" name="startedAt" defaultValue={`${day}T10:00`} required className="field h-9 py-1 text-[13px]" />
      </label>
      <label className="text-[12px]">
        <span className="block text-muted">To</span>
        <input type="datetime-local" name="endedAt" defaultValue={`${day}T11:00`} required className="field h-9 py-1 text-[13px]" />
      </label>
      <Submit size="sm" variant="primary">
        Add
      </Submit>
      <button type="button" onClick={() => setOpen(false)} className="cursor-pointer px-2 text-[12.5px] text-muted hover:text-ink">
        Cancel
      </button>
    </ActionForm>
  );
}
