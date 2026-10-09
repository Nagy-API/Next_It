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
import { formatDay, monthLabel, monthName } from "@/lib/dates";
import { parsePastedList } from "@/lib/paste";
import { DateInput } from "@/components/date-input";
import { PendingAttachments } from "@/components/attachments";
import { PlatformIcon } from "@/components/platform-icon";

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

  const preview = pasteText.trim() ? parsePastedList(pasteText, year, month) : [];
  const mm = String(month).padStart(2, "0");
  const example = [
    `Reel | The Ampoule | 11/${mm} | 7pm | https://canva.link/the-ampoule`,
    `Post 02: Talk To Me | 10/${mm}`,
    `Carousel: 5 Hair Myths | 14/${mm} | 19:00`,
    `Story | Behind the scenes | 12/${mm}`,
    `OFF`,
  ].join("\n");
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
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <label className="label" htmlFor="paste-box">
                  Paste or type your list — <b>one line = one post</b>
                </label>
                <textarea
                  id="paste-box"
                  autoFocus
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  placeholder={example}
                  className="field font-mono text-[12.5px]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={applyPaste} disabled={!preview.length} className={btn("primary", "sm")}>
                    <Wand2 className="size-4" /> Add {preview.length} item{preview.length === 1 ? "" : "s"} to the list below
                  </button>
                  <button type="button" onClick={() => setPasteText(example)} className={btn("secondary", "sm")}>
                    Try the example
                  </button>
                  {pasteText && (
                    <button type="button" onClick={() => setPasteText("")} className={btn("ghost", "sm")}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-white p-3.5 text-[12.5px] leading-relaxed text-ink-2">
                <div className="mb-1.5 font-display text-[13.5px] font-bold text-ink">How to write it</div>
                <p>
                  Write the <b>title</b>, then anything you know — in any order, separated by <b>|</b> (or copy the columns straight from Excel):
                </p>
                <ul className="mt-1.5 space-y-1">
                  <li>
                    📅 <b>Date</b>: <code className="rounded bg-canvas px-1">11/10</code>, <code className="rounded bg-canvas px-1">11 Oct</code> (day first)
                  </li>
                  <li>
                    ⏰ <b>Time</b>: <code className="rounded bg-canvas px-1">19:00</code> or <code className="rounded bg-canvas px-1">7pm</code>
                  </li>
                  <li>
                    🔗 <b>Link</b> (Canva, Google Doc, Drive…): paste it anywhere on the line
                  </li>
                  <li>
                    🎬 <b>Type</b>: the words Reel, Post, Carousel or Story
                  </li>
                  <li>
                    🚫 Lines that say <code className="rounded bg-canvas px-1">OFF</code> are skipped
                  </li>
                </ul>
                <p className="mt-1.5 text-muted">You&rsquo;ll see exactly what was understood before anything is saved.</p>
              </div>
            </div>
            {preview.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
                <div className="bg-[#fafbfd] px-3 py-2 text-[12px] font-semibold text-muted">What we understood ({preview.length})</div>
                <table className="w-full text-[12.5px]">
                  <tbody className="divide-y divide-line">
                    {preview.slice(0, 12).map((r, i) => (
                      <tr key={i}>
                        <td className="w-8 px-3 py-1.5 text-faint">{i + 1}</td>
                        <td className="px-2 py-1.5 font-medium">{r.title}</td>
                        <td className="px-2 py-1.5">{TYPE_META[r.type].label}</td>
                        <td className="px-2 py-1.5 tabular-nums">{r.postingDate ? formatDay(r.postingDate) : <span className="text-faint">no date</span>}</td>
                        <td className="px-2 py-1.5 tabular-nums">{r.postingTime || <span className="text-faint">—</span>}</td>
                        <td className="px-2 py-1.5">{r.canvaUrl ? <span className="font-semibold text-ok">✓ Link</span> : <span className="text-faint">no link</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 12 && <div className="px-3 py-1.5 text-[12px] text-muted">…and {preview.length - 12} more</div>}
              </div>
            )}
          </div>
        )}

        <div className="hidden grid-cols-[28px_minmax(0,1fr)_236px_150px_96px_minmax(0,0.8fr)_32px] gap-2 bg-[#fafbfd] px-5 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted md:grid">
          <span>#</span>
          <span>Title</span>
          <span>Type</span>
          <span>{mode === "plan" ? "Posting date" : "Due date"}</span>
          <span>Time</span>
          <span>Content link (optional)</span>
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
              <DateInput value={r.postingDate} onChange={(v) => update(r.key, { postingDate: v })} aria-label="Date" size="sm" className="w-full" />
              <input type="time" value={r.postingTime} onChange={(e) => update(r.key, { postingTime: e.target.value })} aria-label="Time" className="field field-sm h-9" />
              <input value={r.canvaUrl} onChange={(e) => update(r.key, { canvaUrl: e.target.value })} placeholder="Canva, Doc, Drive…" aria-label="Content link (optional)" className="field field-sm h-9" />
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
              <span className="block text-[14px] font-medium">Rows with a link are ready</span>
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
                      className={clsx("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] font-medium", on ? "border-electric bg-electric-soft text-[#1d5fd1]" : "border-line text-muted hover:border-line-strong")}
                    >
                      <PlatformIcon name={p.name} size={18} muted={!on} />
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

      {/* 4. Files */}
      <section className="card p-5">
        <div className="eyebrow mb-1">4 · Files & links <span className="font-normal normal-case tracking-normal text-muted">(optional)</span></div>
        <p className="mb-3 text-[12.5px] text-muted">A brief, a script, references: attached to every item above. You can add more on each item later.</p>
        <PendingAttachments />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {mode === "plan" && <span className="mr-auto text-[12.5px] text-muted">Items dated in another month go to that month by themselves.</span>}
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
