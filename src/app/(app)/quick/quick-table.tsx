"use client";

import { useState } from "react";
import clsx from "clsx";
import { CheckCircle2, ClipboardPaste, Wand2 } from "lucide-react";
import { quickAction } from "@/app/actions";
import type { StageKind } from "@/db/schema";
import { ActionForm, Submit } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { PlatformIcon } from "@/components/platform-icon";
import { BrandDot, btn } from "@/components/ui";
import { formatDay } from "@/lib/dates";

export type QuickItem = {
  id: string;
  stageId: string;
  title: string;
  brand: { name: string; color: string } | null;
  postingDate: string | null;
  slide: number | null;
  link: string | null;
  platforms: { id: string; name: string; status: string; date: string | null }[];
  live: string[];
};

type RowState = { link: string; done: boolean; live: Record<string, string>; schedule: string };

const URL_RE = /(https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*)/i;

/**
 * One row per item at this step. Paste a list (one link per line, optionally "title | link") and it fills the rows:
 * by title when the line names one, else in order. Nothing is saved until "Save all".
 */
export function QuickTable({ step, hint, items, platforms }: { step: StageKind; hint: string; items: QuickItem[]; platforms: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => Object.fromEntries(items.map((i) => [i.id, { link: "", done: false, live: {}, schedule: "" }])));
  const [paste, setPaste] = useState("");
  const [pasteTarget, setPasteTarget] = useState<string>("link");
  const [scheduleAll, setScheduleAll] = useState("");
  const social = step === "social";
  // Every app: a live link can be pasted even where the app wasn't planned yet (it's added and marked live).
  const cols = platforms;
  const target = social ? (pasteTarget === "link" ? (cols[0]?.id ?? "") : pasteTarget) : "link";

  const set = (id: string, patch: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const value = (r: RowState, key: string) => (key === "link" ? r.link : (r.live[key] ?? ""));
  const withValue = (r: RowState, key: string, v: string): RowState => (key === "link" ? { ...r, link: v, done: step === "content" ? true : r.done } : { ...r, live: { ...r.live, [key]: v } });

  const fill = () => {
    const lines = paste
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setRows((prev) => {
      const next = { ...prev };
      const usable = items;
      for (const line of lines) {
        const url = line.match(URL_RE)?.[0];
        if (!url) continue;
        const label = line.replace(url, "").replace(/[|\t]+/g, " ").trim().toLowerCase();
        const byTitle = label ? usable.find((i) => i.title.toLowerCase() === label) ?? usable.find((i) => label.length > 3 && i.title.toLowerCase().includes(label)) : undefined;
        const row = byTitle ?? usable.find((i) => !value(next[i.id], target));
        if (row) next[row.id] = withValue(next[row.id], target, url);
      }
      return next;
    });
    setPaste("");
  };

  const payload = items
    .map((i) => {
      const r = rows[i.id];
      const live = Object.entries(r.live)
        .filter(([, u]) => u.trim())
        .map(([platformId, url]) => ({ platformId, url }));
      const schedule = r.schedule || scheduleAll;
      const touched = step === "content" ? r.done : step === "shooting" ? r.done : social ? live.length > 0 || !!schedule : !!r.link.trim();
      if (!touched) return null;
      return {
        stageId: i.stageId,
        itemId: i.id,
        title: i.title,
        kind: step,
        link: r.link || undefined,
        done: r.done,
        // Planned apps always (empty = schedule it), other apps only when a link was pasted.
        live: social ? cols.filter((p) => i.platforms.some((x) => x.id === p.id) || r.live[p.id]?.trim()).map((p) => ({ platformId: p.id, url: r.live[p.id] ?? "" })) : undefined,
        scheduleDate: social ? schedule || undefined : undefined,
      };
    })
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {step !== "shooting" && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="quick-paste" className="flex items-center gap-2 text-[13.5px] font-semibold">
              <ClipboardPaste className="size-4 text-electric" /> Paste a list
            </label>
            {social && cols.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="text-muted">into</span>
                {cols.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPasteTarget(p.id)} className={clsx("inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 font-medium", target === p.id ? "border-electric bg-electric-soft" : "border-line bg-surface")}>
                    <PlatformIcon name={p.name} size={18} /> {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            id="quick-paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder={"One link per line, in the order below. Or: Title | link\nhttps://drive.google.com/file/d/first\nThe Ampoule | https://www.instagram.com/p/…"}
            className="field mt-2 font-mono text-[12.5px]"
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={fill} disabled={!paste.trim()} className={btn("primary", "sm")}>
              <Wand2 className="size-3.5" /> Fill the rows
            </button>
            <span className="text-[12px] text-muted">{hint}. Nothing is saved until Save all.</span>
          </div>
        </div>
      )}

      {social && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-medium text-ink-2">Schedule everything without a link for</span>
          <DateInput value={scheduleAll} onChange={setScheduleAll} size="sm" className="w-[150px]" aria-label="Schedule day for all" />
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-subtle text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="w-[90px] px-2 py-2">Posting</th>
              {step === "content" && <th className="px-2 py-2">Link (optional)</th>}
              {(step === "content" || step === "shooting") && <th className="w-[110px] px-2 py-2 text-center">{step === "content" ? "Send on" : "Shot"}</th>}
              {(step === "media" || step === "design") && <th className="px-2 py-2">Drive link of the version</th>}
              {social &&
                cols.map((p) => (
                  <th key={p.id} className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                      <PlatformIcon name={p.name} size={18} /> {p.name}
                    </span>
                  </th>
                ))}
              {social && <th className="w-[150px] px-2 py-2">Schedule</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => {
              const r = rows[i.id];
              return (
                <tr key={i.id} className={clsx((r.done || r.link || Object.values(r.live).some(Boolean)) && "bg-electric-soft/30")}>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {i.brand && <BrandDot color={i.brand.color} />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{i.title}</span>
                        <span className="block truncate text-[11.5px] text-muted">
                          {i.brand?.name}
                          {i.slide ? ` · slide ${i.slide}` : ""}
                          {i.live.length ? ` · live on ${i.live.join(", ")}` : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-[12.5px] tabular-nums text-muted">{i.postingDate ? formatDay(i.postingDate, { weekday: false }) : "—"}</td>
                  {step === "content" && (
                    <td className="px-2 py-2">
                      <input value={r.link} onChange={(e) => set(i.id, { link: e.target.value, done: e.target.value ? true : r.done })} placeholder={i.link ? "Has a link already" : "Canva, Doc, Drive…"} aria-label={`${i.title} link`} className="field field-sm h-8" />
                    </td>
                  )}
                  {(step === "content" || step === "shooting") && (
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={r.done} onChange={(e) => set(i.id, { done: e.target.checked })} aria-label={`${i.title} ${step === "content" ? "send on" : "shot"}`} className="size-5 cursor-pointer accent-[var(--color-electric)]" />
                    </td>
                  )}
                  {(step === "media" || step === "design") && (
                    <td className="px-2 py-2">
                      <input value={r.link} onChange={(e) => set(i.id, { link: e.target.value })} placeholder="https://drive.google.com/…" aria-label={`${i.title} version link`} className="field field-sm h-8" />
                    </td>
                  )}
                  {social &&
                    cols.map((p) => {
                      const planned = i.platforms.find((x) => x.id === p.id);
                      return (
                        <td key={p.id} className="px-2 py-2">
                          {i.live.includes(p.name) ? (
                            <span className="text-[12px] font-semibold text-ok">Live ✓</span>
                          ) : (
                            <input
                              value={r.live[p.id] ?? ""}
                              onChange={(e) => set(i.id, { live: { ...r.live, [p.id]: e.target.value } })}
                              placeholder={planned?.status === "scheduled" && planned.date ? `Scheduled ${formatDay(planned.date, { weekday: false })}` : planned ? "Live link" : "Not planned"}
                              aria-label={`${i.title} ${p.name} link`}
                              className={clsx("field field-sm h-8 min-w-[150px]", !planned && "bg-canvas/60")}
                            />
                          )}
                        </td>
                      );
                    })}
                  {social && (
                    <td className="px-2 py-2">
                      <DateInput value={r.schedule} onChange={(v) => set(i.id, { schedule: v })} size="sm" className="w-[140px]" aria-label={`${i.title} schedule`} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ActionForm action={quickAction} onSuccess={() => setRows(Object.fromEntries(items.map((i) => [i.id, { link: "", done: false, live: {}, schedule: "" }])))} className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-pop backdrop-blur lg:bottom-4">
        <input type="hidden" name="rows" value={JSON.stringify(payload)} />
        <span className="mr-auto inline-flex items-center gap-1.5 text-[13px] text-muted">
          <CheckCircle2 className={clsx("size-4", payload.length ? "text-ok" : "text-faint")} /> {payload.length} ready to save
        </span>
        <Submit disabled={!payload.length}>Save all</Submit>
      </ActionForm>
    </div>
  );
}
