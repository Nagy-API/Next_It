"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ClipboardPaste, Plus, Trash2, Wand2 } from "lucide-react";
import { createItemsAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/client";
import { TypeIcon, btn } from "@/components/ui";
import type { ContentType } from "@/db/schema";
import { TYPE_META, guessTypeFromTitle } from "@/domain/workflow";
import { monthLabel, monthName } from "@/lib/dates";
import { parsePastedList } from "@/lib/paste";

type Brand = { id: string; name: string; slug: string; color: string; defaultCreatorId: string | null };
type Project = { id: string; name: string; clientName: string };
type Person = { id: string; name: string; teams: string[] };
type Platform = { id: string; name: string };
type Row = { key: number; title: string; type: ContentType; postingDate: string; postingTime: string; canvaUrl: string };

const TYPES = Object.keys(TYPE_META) as ContentType[];
let seq = 1;
const blank = (): Row => ({ key: seq++, title: "", type: "reel", postingDate: "", postingTime: "", canvaUrl: "" });

export function AddForm({
  brands,
  projects,
  people,
  platforms,
  initial,
}: {
  brands: Brand[];
  projects: Project[];
  people: Person[];
  platforms: Platform[];
  initial: { mode: "plan" | "project"; brandId: string; year: number; month: number; projectId: string };
}) {
  const [mode, setMode] = useState(initial.mode);
  const [brandId, setBrandId] = useState(initial.brandId);
  const [ym, setYm] = useState(`${initial.year}-${String(initial.month).padStart(2, "0")}`);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const brand = brands.find((b) => b.id === brandId);
  const [ownerTouched, setOwnerTouched] = useState(false);
  const [owner, setOwner] = useState<string>(brand?.defaultCreatorId ?? "");
  const effectiveOwner = ownerTouched ? owner : mode === "plan" ? (brand?.defaultCreatorId ?? "") : owner;
  const [sendWithCanva, setSendWithCanva] = useState(true);
  const [platformIds, setPlatformIds] = useState<string[]>(platforms.filter((p) => ["instagram", "tiktok"].includes(p.name.toLowerCase())).map((p) => p.id));

  const [year, month] = ym.split("-").map(Number);
  const filled = rows.filter((r) => r.title.trim());
  const counts = useMemo(() => TYPES.map((t) => [t, filled.filter((r) => r.type === t).length] as const).filter(([, n]) => n), [filled]);
  const monthOptions = useMemo(() => {
    const now = new Date();
    const list: string[] = [];
    for (let d = -3; d <= 6; d++) {
      const x = new Date(now.getFullYear(), now.getMonth() + d, 1);
      list.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
    }
    if (!list.includes(ym)) list.unshift(ym);
    return list;
  }, [ym]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Pre-fill type from the title while the user hasn't picked one ("Post 03…" → Static).
        if (patch.title !== undefined && !("type" in patch)) {
          const g = guessTypeFromTitle(patch.title);
          if (g) next.type = g;
        }
        return next;
      }),
    );

  const applyPaste = () => {
    const parsed = parsePastedList(pasteText, year, month);
    if (!parsed.length) return;
    setRows((rs) => [...rs.filter((r) => r.title.trim()), ...parsed.map((p) => ({ key: seq++, ...p }))]);
    setPasteText("");
    setPasting(false);
  };

  const target = mode === "plan" ? { kind: "plan", brandId, year, month } : { kind: "project", projectId };
  const returnTo = mode === "plan" ? `/brands/${brand?.slug}?m=${ym}` : `/projects/${projectId}`;
  const valid = filled.length > 0 && (mode === "plan" ? !!brandId : !!projectId);

  return (
    <ActionForm action={createItemsAction} className="space-y-6">
      <input type="hidden" name="target" value={JSON.stringify(target)} />
      <input type="hidden" name="rows" value={JSON.stringify(filled.map((r) => ({ title: r.title, type: r.type, postingDate: r.postingDate, postingTime: r.postingTime, canvaUrl: r.canvaUrl })))} />
      <input type="hidden" name="platformIds" value={JSON.stringify(mode === "plan" ? platformIds : [])} />
      <input type="hidden" name="contentAssigneeId" value={effectiveOwner} />
      <input type="hidden" name="sendWithCanva" value={sendWithCanva ? "1" : "0"} />
      <input type="hidden" name="returnTo" value={returnTo} />

      {/* 1. Where */}
      <section className="card p-5">
        <div className="eyebrow mb-3">1 · Where does it go?</div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex rounded-lg border border-line p-0.5">
            {(["plan", "project"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={clsx("rounded-md px-3 py-1.5 text-[13px] font-medium", mode === m ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>
                {m === "plan" ? "Monthly brand plan" : "One-off project"}
              </button>
            ))}
          </div>
          {mode === "plan" ? (
            <>
              <div className="w-[240px]">
                <label className="label">Brand</label>
                <select className="field" value={brandId} onChange={(e) => setBrandId(e.target.value)} required>
                  <option value="">Choose a brand…</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-[200px]">
                <label className="label">Month</label>
                <select className="field" value={ym} onChange={(e) => setYm(e.target.value)}>
                  {monthOptions.map((k) => (
                    <option key={k} value={k}>
                      {monthLabel(Number(k.slice(0, 4)), Number(k.slice(5)))}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : projects.length ? (
            <div className="w-[320px]">
              <label className="label">Project</label>
              <select className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                <option value="">Choose a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clientName} · {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-[13px] text-muted">
              No projects yet — <Link className="link" href="/projects">create one first</Link>.
            </p>
          )}
        </div>
      </section>

      {/* 2. What */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="eyebrow">2 · What content?</div>
            <p className="mt-1 text-[13px] text-muted">One row per Reel/post. Only the title is required. The type is guessed from the title — change it with one click.</p>
          </div>
          <button type="button" onClick={() => setPasting((p) => !p)} className={btn(pasting ? "dark" : "secondary")}>
            <ClipboardPaste className="size-4" /> Paste a list
          </button>
        </div>

        {pasting && (
          <div className="border-b border-line bg-electric-soft/40 px-5 py-4">
            <label className="label">Paste lines from Canva, the old Excel sheet, or a message — one item per line</label>
            <textarea
              autoFocus
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={7}
              placeholder={"The Ampoule\thttps://canva.link/…\t11/10/2026\nPost 02: Talk To Me   10 Oct\nCarousel 01: Swipe To Complete | Oct 6 | 19:00"}
              className="field font-mono text-[12.5px]"
            />
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={applyPaste} disabled={!pasteText.trim()} className={btn("primary", "sm")}>
                <Wand2 className="size-4" /> Read {pasteText.trim() ? parsePastedList(pasteText, year, month).length : 0} items
              </button>
              <span className="text-[12px] text-muted">Links, dates (day first), times and types are picked out automatically. “OFF” lines are skipped.</span>
            </div>
          </div>
        )}

        <div className="hidden grid-cols-[28px_minmax(0,1fr)_236px_150px_96px_minmax(0,0.8fr)_32px] gap-2 bg-[#fafbfd] px-5 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted md:grid">
          <span>#</span>
          <span>Title</span>
          <span>Type</span>
          <span>{mode === "plan" ? "Posting date" : "Due date"}</span>
          <span>Time</span>
          <span>Canva link (this page)</span>
          <span />
        </div>
        <div className="divide-y divide-line">
          {rows.map((r, i) => (
            <div key={r.key} className="grid items-center gap-2 px-5 py-2 md:grid-cols-[28px_minmax(0,1fr)_236px_150px_96px_minmax(0,0.8fr)_32px]">
              <span className="text-[12px] tabular-nums text-faint max-md:hidden">{i + 1}</span>
              <input
                value={r.title}
                onChange={(e) => update(r.key, { title: e.target.value })}
                placeholder={i === 0 ? "e.g. The Ampoule" : ""}
                aria-label="Title"
                className="field field-sm h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (i === rows.length - 1) setRows((rs) => [...rs, blank()]);
                  }
                }}
              />
              <div className="flex rounded-md border border-line p-0.5">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    title={TYPE_META[t].label}
                    onClick={() => update(r.key, { type: t })}
                    className={clsx("flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[11.5px] font-medium", r.type === t ? "bg-navy-900 text-white [&_svg]:text-white" : "text-muted hover:bg-canvas")}
                  >
                    <TypeIcon type={t} className="size-3.5" />
                    <span className="hidden xl:inline">{TYPE_META[t].label}</span>
                  </button>
                ))}
              </div>
              <input type="date" value={r.postingDate} onChange={(e) => update(r.key, { postingDate: e.target.value })} aria-label="Date" className="field field-sm h-9" />
              <input type="time" value={r.postingTime} onChange={(e) => update(r.key, { postingTime: e.target.value })} aria-label="Time" className="field field-sm h-9" />
              <input value={r.canvaUrl} onChange={(e) => update(r.key, { canvaUrl: e.target.value })} placeholder="https://canva.link/…" aria-label="Canva link" className="field field-sm h-9" />
              <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))} className="flex size-8 items-center justify-center rounded-md text-faint hover:bg-bad-soft hover:text-bad" aria-label="Remove row">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <button type="button" onClick={() => setRows((rs) => [...rs, blank(), blank(), blank()])} className={btn("ghost", "sm")}>
            <Plus className="size-4" /> Add rows
          </button>
          <div className="text-[13px] text-muted">
            {filled.length ? (
              <>
                <b className="text-ink">{filled.length} items</b> · {counts.map(([t, n]) => `${n} ${n === 1 ? TYPE_META[t].label : TYPE_META[t].plural}`).join(" · ")}
              </>
            ) : (
              "Nothing added yet"
            )}
          </div>
        </div>
      </section>

      {/* 3. Who & how */}
      <section className="card p-5">
        <div className="eyebrow mb-3">3 · Starting point</div>
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label className="label">Content owner</label>
            <select
              className="field"
              value={effectiveOwner}
              onChange={(e) => {
                setOwnerTouched(true);
                setOwner(e.target.value);
              }}
            >
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.teams.includes("content") ? "" : " "}
                </option>
              ))}
            </select>
            {mode === "plan" && brand && !ownerTouched && <p className="mt-1 text-[12px] text-muted">{brand.name}&rsquo;s default creator</p>}
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:border-line-strong">
            <input type="checkbox" checked={sendWithCanva} onChange={(e) => setSendWithCanva(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-electric)]" />
            <span>
              <span className="block text-[14px] font-medium">Rows with a Canva link are ready</span>
              <span className="block text-[12.5px] text-muted">They go straight to their team (Reels → Media, Posts & Carousels → Design) and the delivery time is saved. Rows without a link wait with you.</span>
            </span>
          </label>
          {mode === "plan" && (
            <div>
              <div className="label">Publish on</div>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => {
                  const on = platformIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatformIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                      className={clsx("rounded-full border px-3 py-1 text-[13px] font-medium", on ? "border-electric bg-electric-soft text-[#1d5fd1]" : "border-line text-muted hover:border-line-strong")}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[12px] text-muted">Social can change this per item later.</p>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <span className="text-[13px] text-muted">
          {mode === "plan" && brand ? `${brand.name} · ${monthName(month)} ${year}` : ""}
        </span>
        <Submit size="lg" disabled={!valid}>
          Add {filled.length || ""} {filled.length === 1 ? "item" : "items"}
        </Submit>
      </div>
    </ActionForm>
  );
}
