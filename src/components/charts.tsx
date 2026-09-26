/**
 * Small, dependency-free charts (inline SVG / HTML), following the dataviz method:
 * one hue for magnitude, an ordinal blue ramp for workflow stages (validated), thin marks,
 * rounded data-ends, 2px surface gaps, hover tooltips, and numbers always available as text.
 */
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";

/** Ordinal ramp for workflow stages, light → dark = further along. Validated with validate_palette.js --ordinal. */
export const STAGE_RAMP = {
  content: "#7FB0F7",
  production: "#3B82F6",
  social: "#1D4ED8",
  published: "#0B1639",
} as const;

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Column chart, one series (single hue); the highlighted column is the current period. */
export function MonthColumns({ points, highlight, height = 150, unit = "items" }: { points: { label: string; value: number }[]; highlight?: number; height?: number; unit?: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="relative" style={{ height: height + 28 }} role="img" aria-label={points.map((p) => `${p.label}: ${p.value} ${unit}`).join(", ")}>
      {/* recessive baseline + midline */}
      <div className="absolute inset-x-0 border-t border-line" style={{ top: height }} />
      <div className="absolute inset-x-0 border-t border-line/60" style={{ top: height / 2 }} />
      <div className="absolute inset-x-0 top-0 flex items-end justify-around" style={{ height }}>
        {points.map((p, i) => {
          const h = (p.value / max) * (height - 18);
          const hl = i === (highlight ?? points.length - 1);
          return (
            <div key={p.label + i} className="group relative flex h-full w-full max-w-[64px] flex-col items-center justify-end">
              {/* direct label only on the highlighted column; others on hover */}
              <span className={clsx("mb-1 text-[12px] font-semibold tabular-nums", hl ? "text-ink" : "text-transparent group-hover:text-ink-2")}>{p.value}</span>
              <div className="w-6 rounded-t-[4px] transition-opacity duration-150 group-hover:opacity-80" style={{ height: Math.max(h, p.value ? 3 : 0), background: hl ? "#0B1639" : "#3B82F6" }} />
              <span className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-md bg-navy-900 px-2 py-1 text-[11.5px] font-medium text-white shadow-pop group-hover:block">
                {p.label}: {p.value} {unit}
              </span>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 flex justify-around" style={{ top: height + 8 }}>
        {points.map((p, i) => (
          <span key={p.label + i} className={clsx("w-full max-w-[64px] text-center text-[12px]", i === (highlight ?? points.length - 1) ? "font-semibold text-ink" : "text-muted")}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One horizontal part-to-whole bar (stacked), 2px surface gaps between segments, hover shows each value. */
export function StackedBar({ segments, total, className }: { segments: { label: string; value: number; color: string }[]; total?: number; className?: string }) {
  const sum = total ?? segments.reduce((a, s) => a + s.value, 0);
  if (!sum) return <div className={clsx("h-3 rounded-full bg-[#eef2f8]", className)} />;
  return (
    <div className={clsx("flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-[#eef2f8]", className)}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div key={s.label} className="group relative h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / sum) * 100}%`, background: s.color }}>
            <span className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-900 px-2 py-1 text-[11.5px] font-medium text-white shadow-pop group-hover:block">
              {s.label}: {s.value}
            </span>
          </div>
        ))}
    </div>
  );
}

/** Done / total as a meter: fill on a lighter track of the same hue, with the numbers as text. */
export function Meter({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#dbeafe]">
        <div className="h-full rounded-full bg-electric" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-[72px] text-right text-[12.5px] tabular-nums text-ink-2">
        {total ? (
          <>
            <b className="text-ink">{done}</b>/{total} · {pct}%
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </span>
    </div>
  );
}

/** Signed delta vs the previous period; up is good for completed work. */
export function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  const d = now - before;
  if (!d) return <span className="text-[12px] text-muted">same as {label}</span>;
  return (
    <span className={clsx("text-[12px] font-semibold", d > 0 ? "text-ok" : "text-bad")}>
      {d > 0 ? <ArrowUp className="inline size-3.5" strokeWidth={2.6} /> : <ArrowDown className="inline size-3.5" strokeWidth={2.6} />} {Math.abs(d)} <span className="font-normal text-muted">vs {label}</span>
    </span>
  );
}
