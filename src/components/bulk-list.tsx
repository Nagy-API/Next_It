"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import Link from "next/link";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { bulkAction, cancelItemAction } from "@/app/actions";
import type { StageKind } from "@/db/schema";
import { STAGE_META } from "@/domain/workflow";
import type { WorkItem } from "@/server/queries";
import { ActionForm, Modal, Submit } from "./client";
import { btn } from "./ui";
import { ItemRow } from "./item-row";
import { DateInput } from "@/components/date-input";

type P = { id: string; name: string; teams: string[] };

/** A list of items with checkboxes and a bulk bar (assign / deadline / complete) for a whole month at once. */
export function BulkList({ items, people, showContext = false, selectable = true, canDeadline = false }: { items: WorkItem[]; people: P[]; showContext?: boolean; selectable?: boolean; canDeadline?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const kinds = useMemo(() => {
    const ks = new Set<StageKind>();
    for (const i of items) if (selected.has(i.id)) for (const s of i.stages) ks.add(s.kind);
    return (["content", "shooting", "media", "design", "social", "delivery"] as StageKind[]).filter((k) => ks.has(k));
  }, [items, selected]);
  const [kind, setKind] = useState<StageKind | "">("");
  const effectiveKind = kind && kinds.includes(kind) ? kind : (kinds.find((k) => k !== "content") ?? kinds[0] ?? "content");
  const [mode, setMode] = useState<"assign" | "deadline" | "complete">("assign");

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const all = items.length > 0 && items.every((i) => selected.has(i.id));
  const team = STAGE_META[effectiveKind].team;
  const sortedPeople = [...people].sort((a, b) => Number(!!team && b.teams.includes(team)) - Number(!!team && a.teams.includes(team)));

  if (!selectable)
    return (
      <div className="card divide-y divide-line overflow-hidden">
        {items.map((i) => (
          <ItemRow key={i.id} item={i} showContext={showContext} />
        ))}
      </div>
    );
  return (
    <div>
      <div className="card divide-y divide-line overflow-hidden">
        <label className="flex cursor-pointer items-center gap-3 bg-subtle px-4 py-2 text-[12.5px] text-muted">
          <input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(items.map((i) => i.id)))} className="size-4 accent-[var(--color-electric)]" />
          {selected.size ? `${selected.size} selected` : "Select items to assign, set deadlines or complete them together"}
        </label>
        {items.map((i) => (
          <ItemRow
            key={i.id}
            item={i}
            showContext={showContext}
            leading={
              <input
                type="checkbox"
                aria-label={`Select ${i.title}`}
                checked={selected.has(i.id)}
                onChange={() => toggle(i.id)}
                className="relative z-10 size-4 shrink-0 cursor-pointer accent-[var(--color-electric)]"
              />
            }
            actions={<RowActions itemId={i.id} title={i.title} deleted={!!i.cancelledAt} />}
            editable
          />
        ))}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 lg:pl-[var(--sbw,0px)]">
          <ActionForm
            action={bulkAction}
            inlineError={false}
            onSuccess={() => setSelected(new Set())}
            className="flex max-w-full animate-in flex-wrap items-center gap-2 rounded-2xl bg-strong p-2 pl-4 text-white shadow-pop"
          >
            <input type="hidden" name="itemIds" value={JSON.stringify([...selected])} />
            <input type="hidden" name="action" value={mode} />
            <span className="mr-1 text-[13px] font-semibold">{selected.size} selected</span>
            <div className="flex rounded-lg bg-white/10 p-0.5 text-[13px]">
              {(canDeadline ? (["assign", "deadline", "complete"] as const) : (["assign", "complete"] as const)).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={clsx("rounded-md px-2.5 py-1", mode === m ? "bg-surface text-navy-900" : "text-white/80 hover:text-white")}>
                  {m === "assign" ? "Assign" : m === "deadline" ? "Deadline" : "Mark done"}
                </button>
              ))}
            </div>
            <select name="kind" value={effectiveKind} onChange={(e) => setKind(e.target.value as StageKind)} className="h-8 rounded-md border-0 bg-white/10 px-2 text-[13px] text-white [&>option]:text-ink">
              {kinds
                .filter((k) => mode !== "complete" || (k !== "social" && !STAGE_META[k].needsDriveLink))
                .map((k) => (
                  <option key={k} value={k}>
                    {STAGE_META[k].label}
                  </option>
                ))}
            </select>
            {mode === "assign" && (
              <select name="userId" defaultValue="" className="h-8 rounded-md border-0 bg-white/10 px-2 text-[13px] text-white [&>option]:text-ink" aria-label="Person">
                <option value="">Unassigned</option>
                {sortedPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {mode === "deadline" && <DateInput name="date" dark className="w-[140px]" aria-label="Deadline" />}
            {mode === "complete" && <span className="text-[12.5px] text-white/60">Only items currently at this stage</span>}
            <Submit size="sm" variant="primary">
              Apply
            </Submit>
            <button type="button" onClick={() => setSelected(new Set())} className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Clear selection">
              <X className="size-4" />
            </button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}

/** Edit / delete right from the list (Content team). Delete asks first and can be undone. */
function RowActions({ itemId, title, deleted }: { itemId: string; title: string; deleted: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (deleted)
    return (
      <ActionForm action={cancelItemAction} inlineError={false}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="cancelled" value="0" />
        <Submit size="sm" variant="secondary">
          <RotateCcw className="size-3.5" /> Restore
        </Submit>
      </ActionForm>
    );
  return (
    <>
      <Link href={`/items/${itemId}?edit=1`} className="flex size-8 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-canvas hover:text-ink" aria-label={`Edit ${title}`} title="Edit">
        <Pencil className="size-4" />
      </Link>
      <button type="button" onClick={() => setConfirming(true)} className="flex size-8 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-bad-soft hover:text-bad" aria-label={`Delete ${title}`} title="Delete">
        <Trash2 className="size-4" />
      </button>
      <Modal open={confirming} onClose={() => setConfirming(false)} title={`Delete “${title}”?`}>
        <p className="text-[14px] text-ink-2">It disappears from the plan, tasks and calendar. Its history is kept and it can be restored (Show deleted items).</p>
        <ActionForm action={cancelItemAction} onSuccess={() => setConfirming(false)} className="mt-4 flex justify-end gap-2">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="cancelled" value="1" />
          <button type="button" onClick={() => setConfirming(false)} className={btn("ghost")}>
            Keep it
          </button>
          <Submit variant="primary" className="!bg-bad hover:!bg-[#b92f2f]">
            <Trash2 className="size-4" /> Delete
          </Submit>
        </ActionForm>
      </Modal>
    </>
  );
}
