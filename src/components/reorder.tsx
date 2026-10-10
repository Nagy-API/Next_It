"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import { resetOrderAction, saveOrderAction } from "@/app/people-actions";
import { useToast } from "./client";

/**
 * A list the person can put in their own order: drag the grip (computer) or tap ↑ ↓ (phone).
 * Saved for them only; "Reset order" goes back to the automatic order.
 */
export function Reorderable({ rows, custom, className }: { rows: { key: string; node: React.ReactNode; head?: React.ReactNode }[]; custom: boolean; className?: string }) {
  const [order, setOrder] = useState(rows.map((r) => r.key));
  const [seen, setSeen] = useState(rows.map((r) => r.key).join());
  const [drag, setDrag] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [, start] = useTransition();
  const push = useToast();
  // New data from the server (something finished, a new task) resets the local order.
  const sig = rows.map((r) => r.key).join();
  if (sig !== seen) {
    setSeen(sig);
    setOrder(rows.map((r) => r.key));
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const list = order.map((k) => byKey.get(k)).filter(Boolean) as typeof rows;
  const save = (next: string[]) =>
    start(async () => {
      const r = await saveOrderAction(next);
      if (r && !r.ok) push({ kind: "error", text: r.error });
    });
  const move = (key: string, dir: -1 | 1) => {
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    save(next);
  };
  const dirty = custom || order.join() !== sig;
  return (
    <div className={className}>
      <div className="space-y-3">
        {list.map((r, i) => (
          <div
            key={r.key}
            draggable={armed === r.key}
            onDragStart={(e) => {
              setDrag(r.key);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", r.key);
            }}
            onDragOver={(e) => {
              if (!drag || drag === r.key) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > rect.top + rect.height / 2;
              setOrder((o) => {
                const without = o.filter((k) => k !== drag);
                const at = without.indexOf(r.key) + (after ? 1 : 0);
                const next = [...without.slice(0, at), drag, ...without.slice(at)];
                return next.join() === o.join() ? o : next;
              });
            }}
            onDragEnd={() => {
              setDrag(null);
              setArmed(null);
              save(order);
            }}
            className={clsx("group/row relative transition-opacity", drag === r.key && "opacity-40")}
          >
            {r.head}
            <div className="relative">
              <div className="absolute -left-3 top-3 z-10 flex -translate-x-full flex-col items-center sm:-left-4">
                <button
                  type="button"
                  onPointerDown={() => setArmed(r.key)}
                  onPointerUp={() => setArmed(null)}
                  className="hidden cursor-grab touch-none rounded-md p-0.5 text-faint opacity-0 transition hover:bg-sunken hover:text-ink active:cursor-grabbing group-hover/row:opacity-100 sm:block"
                  aria-label="Drag to reorder"
                  title="Drag to put it in your own order"
                >
                  <GripVertical className="size-4" />
                </button>
              </div>
              {r.node}
              <div className="mt-1 flex justify-end gap-1 sm:hidden">
                <button type="button" disabled={i === 0} onClick={() => move(r.key, -1)} className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted disabled:opacity-30" aria-label="Move up">
                  <ChevronUp className="size-4" />
                </button>
                <button type="button" disabled={i === list.length - 1} onClick={() => move(r.key, 1)} className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted disabled:opacity-30" aria-label="Move down">
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {dirty && list.length > 1 && (
        <button
          type="button"
          onClick={() =>
            start(async () => {
              const keys = rows.map((r) => r.key);
              setOrder(keys);
              const r = await resetOrderAction(keys);
              if (r?.ok && r.message) push({ kind: "ok", text: r.message });
            })
          }
          className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-muted hover:text-electric"
        >
          <RotateCcw className="size-3.5" /> Reset to the automatic order (by day)
        </button>
      )}
    </div>
  );
}
