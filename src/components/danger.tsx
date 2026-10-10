"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ActionResult } from "@/app/actions";
import { ActionForm, Modal, Submit } from "./client";
import { btn } from "./ui";

/**
 * Deleting something big (a brand, a space) asks the person to type its name — one slip of the mouse can never
 * remove a whole section. The server checks the typed name again.
 */
export function TypedDelete({
  open,
  onClose,
  name,
  what,
  details,
  action,
  fields,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  what: string;
  details: React.ReactNode;
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  onDone?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <Modal open={open} onClose={onClose} title={`Delete ${what} “${name}”?`} width={460}>
      <ActionForm
        action={action}
        onSuccess={() => {
          setTyped("");
          onClose();
          onDone?.();
        }}
      >
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="flex gap-3 rounded-xl border border-bad/30 bg-bad-soft p-3 text-[13.5px] text-ink-2">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <div className="space-y-1">{details}</div>
        </div>
        <label className="mt-4 block text-[13px] font-medium text-ink-2">
          Type <b className="select-all rounded bg-sunken px-1.5 py-0.5 font-mono text-ink">{name}</b> to confirm
          <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus className="field mt-1.5 w-full" placeholder={name} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btn("secondary", "md")}>
            Keep it
          </button>
          <Submit variant="danger" disabled={!ok}>
            Delete {what}
          </Submit>
        </div>
      </ActionForm>
    </Modal>
  );
}

/** "Recently deleted": bring a brand or a space back with everything in it. */
export function RestoreList({
  title,
  rows,
  action,
  field,
}: {
  title: string;
  rows: { id: string; name: string; color: string; when: string }[];
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  field: string;
}) {
  if (!rows.length) return null;
  return (
    <details className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[14px] font-semibold">
        <span>
          {title} <span className="ml-1 rounded-full bg-sunken px-2 py-0.5 text-[12px] text-muted">{rows.length}</span>
        </span>
        <span className="text-[12.5px] font-medium text-electric group-open:hidden">Show</span>
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="size-3 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
            <span className="text-[12.5px] text-muted">deleted {r.when}</span>
            <ActionForm action={action}>
              <input type="hidden" name={field} value={r.id} />
              <Submit variant="secondary" size="sm">
                Restore
              </Submit>
            </ActionForm>
          </li>
        ))}
      </ul>
    </details>
  );
}
