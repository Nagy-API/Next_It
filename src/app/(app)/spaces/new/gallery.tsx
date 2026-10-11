"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Check, FileSpreadsheet, FileText, LayoutGrid, Presentation, Search, LayoutTemplate, Workflow, type LucideIcon } from "lucide-react";
import { createPageAction } from "@/app/page-actions";
import { ActionForm, Submit } from "@/components/client";
import { TEMPLATE_CATEGORIES, type PageKind } from "@/domain/pages";
import { NewSpaceFields } from "./form";

export type GalleryKind = "space" | PageKind;
type Thumb =
  | { kind: "space"; statuses: { name: string; color: string }[]; fields: string[]; automations: number }
  | { kind: "whiteboard"; nodes: { x: number; y: number; w: number; h: number; type: string; color: string }[]; edges: [number, number, number, number][]; box: [number, number, number, number] }
  | { kind: "doc"; lines: { type: string; text: string }[] }
  | { kind: "sheet"; cols: string[]; rows: string[][] };
export type GalleryItem = { key: string; kind: GalleryKind; category: string; name: string; icon: string; color?: string; description: string; thumb: Thumb };

const KINDS: { k: GalleryKind; label: string; icon: LucideIcon; hint: string }[] = [
  { k: "space", label: "Space", icon: LayoutGrid, hint: "A department or workflow: statuses, columns, lists, automations" },
  { k: "whiteboard", label: "Whiteboard", icon: Presentation, hint: "Sticky notes, matrices, flowcharts, mind maps" },
  { k: "doc", label: "Doc", icon: FileText, hint: "Briefs, scripts, SOPs, meeting notes" },
  { k: "sheet", label: "Sheet", icon: FileSpreadsheet, hint: "Rows and columns with formulas" },
];

/**
 * The template library: pick what to make (space, whiteboard, doc, sheet), browse by shelf or search,
 * see a real preview, then name it on the right. Everything can be changed afterwards.
 */
export function Gallery({
  kind,
  items,
  canCreateSpaces,
  spaces,
  spaceId,
  people,
  brands,
}: {
  kind: GalleryKind;
  items: GalleryItem[];
  canCreateSpaces: boolean;
  spaces: { id: string; name: string; icon: string | null; color: string }[];
  spaceId: string | null;
  people: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const ofKind = items.filter((t) => t.kind === kind);
  const [picked, setPicked] = useState<string>(ofKind[0]?.key ?? "");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ofKind.filter((t) => (!cat || t.category === cat) && (!s || `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(s)));
  }, [ofKind, cat, q]);
  const tpl = ofKind.find((t) => t.key === picked) ?? ofKind[0];
  const counts = new Map<string, number>();
  for (const t of ofKind) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  const switchKind = (k: GalleryKind) => {
    const next = new URLSearchParams(sp.toString());
    if (k === "space") next.delete("kind");
    else next.set("kind", k);
    router.replace(`${pathname}?${next}`, { scroll: false });
    setPicked("");
    setCat("");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="tablist" aria-label="What to make">
        {KINDS.filter((x) => x.k !== "space" || canCreateSpaces).map((x) => (
          <button
            key={x.k}
            role="tab"
            aria-selected={kind === x.k}
            onClick={() => switchKind(x.k)}
            className={clsx(
              "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5",
              kind === x.k ? "border-electric bg-electric-soft/60 shadow-[0_0_0_3px_rgb(59_130_246/0.15)]" : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl", kind === x.k ? "bg-electric text-white" : "bg-sunken text-ink-2")}>
              <x.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[15px] font-bold">{x.label}</span>
              <span className="block text-[12.5px] leading-snug text-muted">{x.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${ofKind.length} templates…`} aria-label="Search templates" className="field h-9 pl-8" />
            </div>
            <span className="text-[12.5px] text-muted">{shown.length} shown</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            <Chip on={!cat} onClick={() => setCat("")} label="All" n={ofKind.length} />
            {TEMPLATE_CATEGORIES.filter((c) => counts.has(c)).map((c) => (
              <Chip key={c} on={cat === c} onClick={() => setCat(c)} label={c} n={counts.get(c) ?? 0} />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setPicked(t.key)}
                aria-pressed={tpl?.key === t.key}
                className={clsx(
                  "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-pop",
                  tpl?.key === t.key ? "border-electric shadow-[0_0_0_3px_rgb(59_130_246/0.15)]" : "border-line",
                )}
              >
                {tpl?.key === t.key && (
                  <span className="absolute right-2.5 top-2.5 z-10 grid size-6 place-items-center rounded-full bg-electric text-white shadow">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
                <Preview thumb={t.thumb} color={t.color} />
                <div className="flex-1 border-t border-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[18px]">{t.icon}</span>
                    <span className="truncate font-display text-[14.5px] font-bold group-hover:text-electric">{t.name}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{t.description}</p>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{t.category}</div>
                </div>
              </button>
            ))}
            {!shown.length && <p className="col-span-full rounded-xl border border-dashed border-line p-6 text-center text-[14px] text-muted">No template matches. Try another word, or start blank.</p>}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          {tpl && kind === "space" ? (
            <NewSpaceFields key={tpl.key} template={{ key: tpl.key, name: tpl.name, icon: tpl.icon, color: tpl.color ?? "#3B82F6" }} people={people} brands={brands} />
          ) : tpl ? (
            <NewPageForm key={tpl.key} kind={kind as PageKind} tpl={tpl} spaces={spaces} spaceId={spaceId} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={clsx("shrink-0 cursor-pointer rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors", on ? "border-strong bg-strong text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
      {label} <span className={on ? "text-white/60" : "text-faint"}>{n}</span>
    </button>
  );
}

function NewPageForm({ kind, tpl, spaces, spaceId }: { kind: PageKind; tpl: GalleryItem; spaces: { id: string; name: string; icon: string | null }[]; spaceId: string | null }) {
  const [title, setTitle] = useState(tpl.key.startsWith("blank-") ? "" : tpl.name);
  const label = KINDS.find((k) => k.k === kind)?.label ?? "Page";
  if (!spaces.length)
    return (
      <div className="card space-y-2 p-5 text-[14px]">
        <LayoutTemplate className="size-5 text-electric" />
        <p className="font-semibold">Docs, whiteboards and sheets live inside a space.</p>
        <p className="text-muted">Ask a manager to add you to a space (or create one from the Space tab), then come back here.</p>
      </div>
    );
  return (
    <ActionForm action={createPageAction} className="card space-y-4 p-5">
      <input type="hidden" name="kind" value={kind} />
      {!tpl.key.startsWith("blank-") && <input type="hidden" name="template" value={tpl.key} />}
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-electric-soft text-[24px]">{tpl.icon}</span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">New {label.toLowerCase()}</div>
          <div className="truncate font-display text-[16px] font-bold">{tpl.name}</div>
        </div>
      </div>
      <label className="block text-[13px] font-medium text-ink-2">
        Name
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={`e.g. ${tpl.name}`} className="field mt-1" autoFocus />
      </label>
      <label className="block text-[13px] font-medium text-ink-2">
        In the space
        <select name="spaceId" defaultValue={spaceId && spaces.some((s) => s.id === spaceId) ? spaceId : spaces[0].id} className="field mt-1">
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon ? `${s.icon} ` : ""}
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[12.5px] text-muted">Everyone who can see that space can open it. It saves by itself while you work.</p>
      <Submit size="lg" className="w-full">
        Create the {label.toLowerCase()}
      </Submit>
    </ActionForm>
  );
}

/** A real miniature of the template, drawn from its own content. */
function Preview({ thumb, color }: { thumb: Thumb; color?: string }) {
  if (thumb.kind === "space")
    return (
      <div className="h-[120px] space-y-2 p-3" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color ?? "#3b82f6"} 14%, var(--color-surface)), var(--color-surface))` }}>
        <div className="flex flex-wrap gap-1">
          {thumb.statuses.slice(0, 7).map((s) => (
            <span key={s.name} className="tint rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ "--tint": `color-mix(in srgb, ${s.color} 82%, #0b1639)` } as React.CSSProperties}>
              {s.name}
            </span>
          ))}
        </div>
        {thumb.fields.length > 0 && <div className="truncate text-[11.5px] text-muted">Columns: {thumb.fields.slice(0, 4).join(", ")}</div>}
        {thumb.automations > 0 && (
          <div className="flex items-center gap-1 text-[11.5px] text-ink-2">
            <Workflow className="size-3" /> {thumb.automations} automation{thumb.automations > 1 ? "s" : ""}
          </div>
        )}
      </div>
    );
  if (thumb.kind === "whiteboard") {
    const [x, y, w, h] = thumb.box;
    return (
      <div className="h-[120px] bg-subtle p-2">
        <svg viewBox={`${x} ${y} ${Math.max(w, 1)} ${Math.max(h, 1)}`} className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
          {thumb.nodes
            .filter((n) => n.type === "zone")
            .map((n, i) => (
              <rect key={`z${i}`} x={n.x} y={n.y} width={n.w} height={n.h} rx={14} fill={n.color} fillOpacity={0.12} stroke={n.color} strokeOpacity={0.45} strokeWidth={3} />
            ))}
          {thumb.edges.map(([x1, y1, x2, y2], i) => (
            <line key={`e${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-muted)" strokeWidth={4} strokeOpacity={0.6} />
          ))}
          {thumb.nodes
            .filter((n) => n.type !== "zone" && n.type !== "text")
            .map((n, i) =>
              n.type === "ellipse" ? (
                <ellipse key={`n${i}`} cx={n.x + n.w / 2} cy={n.y + n.h / 2} rx={n.w / 2} ry={n.h / 2} fill={n.color} fillOpacity={0.3} stroke={n.color} strokeWidth={3} />
              ) : n.type === "diamond" ? (
                <polygon key={`n${i}`} points={`${n.x + n.w / 2},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w / 2},${n.y + n.h} ${n.x},${n.y + n.h / 2}`} fill={n.color} fillOpacity={0.3} stroke={n.color} strokeWidth={3} />
              ) : (
                <rect key={`n${i}`} x={n.x} y={n.y} width={n.w} height={n.h} rx={n.type === "sticky" ? 4 : 12} fill={n.color} fillOpacity={n.type === "sticky" ? 1 : 0.3} stroke={n.type === "sticky" ? "none" : n.color} strokeWidth={3} />
              ),
            )}
        </svg>
      </div>
    );
  }
  if (thumb.kind === "doc")
    return (
      <div className="h-[120px] space-y-1 overflow-hidden bg-subtle px-4 py-3">
        {thumb.lines.slice(0, 7).map((l, i) => (
          <div key={i} className={clsx("truncate", l.type === "h1" ? "font-display text-[13px] font-bold" : l.type === "h2" || l.type === "h3" ? "text-[11.5px] font-semibold" : "text-[10.5px] text-muted")}>
            {l.type === "bullet" ? "• " : l.type === "todo" ? "☐ " : ""}
            {l.text || " "}
          </div>
        ))}
      </div>
    );
  return (
    <div className="h-[120px] overflow-hidden bg-subtle p-2">
      <table className="w-full table-fixed border-collapse text-[10px]">
        <thead>
          <tr>
            {thumb.cols.slice(0, 5).map((c, i) => (
              <th key={i} className="truncate border border-line bg-sunken px-1 py-0.5 text-left font-semibold text-ink-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {thumb.rows.slice(0, 5).map((r, i) => (
            <tr key={i}>
              {r.slice(0, 5).map((c, j) => (
                <td key={j} className="truncate border border-line bg-surface px-1 py-0.5 text-muted">
                  {c.startsWith("=") ? "ƒ" : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
