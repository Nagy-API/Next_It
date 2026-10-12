"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { KIND_LABEL, METRIC_META, engagementRate, formatMetric, type MetricKey, type PostKind, type SocialMetrics, type SocialPlatform } from "@/domain/social";
import { PlatformIcon } from "../platform-icon";
import { MediaThumb, type MediaItem } from "./media";

export type AnalyticsRow = {
  id: string;
  postId: string;
  caption: string;
  kind: PostKind;
  platform: SocialPlatform;
  account: string;
  brand: string | null;
  day: string;
  when: string;
  permalink: string | null;
  media: MediaItem | null;
  metrics: SocialMetrics;
};

const COLS: MetricKey[] = ["reach", "views", "likes", "comments", "shares", "saves", "skipRate", "avgWatchMs"];
type SortKey = MetricKey | "when" | "engagement";

type Sort = { key: SortKey; dir: 1 | -1 };

function SortTh({ k, children, title, left, sort, setSort }: { k: SortKey; children: React.ReactNode; title?: string; left?: boolean; sort: Sort; setSort: (fn: (s: Sort) => Sort) => void }) {
  return (
    <th className={clsx("whitespace-nowrap px-2.5 py-2 font-medium", left ? "text-left" : "text-right")} title={title} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className={clsx("inline-flex items-center gap-0.5 hover:text-ink", sort.key === k && "text-ink")} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}

/** Every published post with its numbers; click a column to sort by it. */
export function PostsTable({ rows }: { rows: AnalyticsRow[] }) {
  const [sort, setSort] = useState<Sort>({ key: "when", dir: -1 });
  const value = (r: AnalyticsRow): number | string | null => (sort.key === "when" ? r.when : sort.key === "engagement" ? engagementRate(r.metrics) : (r.metrics[sort.key] ?? null));
  const sorted = [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  if (!rows.length) return <div className="rounded-xl border border-dashed border-line-strong bg-subtle px-6 py-10 text-center text-[13px] text-muted">No published posts in this period yet.</div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[980px] text-[13px]">
        <thead className="border-b border-line bg-subtle text-[12px] text-muted">
          <tr>
            <SortTh k="when" left sort={sort} setSort={setSort}>
              Post
            </SortTh>
            {COLS.map((k) => (
              <SortTh key={k} k={k} title={METRIC_META[k].hint} sort={sort} setSort={setSort}>
                {METRIC_META[k].label}
              </SortTh>
            ))}
            <SortTh k="engagement" title="Interactions ÷ reach" sort={sort} setSort={setSort}>
              Engagement
            </SortTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r) => {
            const er = engagementRate(r.metrics);
            return (
              <tr key={r.id} className="hover:bg-hover">
                <td className="px-2.5 py-2">
                  <Link href={`/social/posts/${r.postId}`} className="flex min-w-0 items-center gap-2.5">
                    {r.media ? <MediaThumb m={r.media} className="size-10 shrink-0 rounded-md" /> : <span className="size-10 shrink-0 rounded-md bg-sunken" />}
                    <span className="min-w-0">
                      <span dir="auto" className="block max-w-[300px] truncate font-medium text-ink">
                        {r.caption || `${KIND_LABEL[r.kind]} without a caption`}
                      </span>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted">
                        <PlatformIcon name={r.platform} size={14} />
                        {r.account} · {KIND_LABEL[r.kind]} · {r.day}
                      </span>
                    </span>
                  </Link>
                </td>
                {COLS.map((k) => (
                  <td key={k} className="px-2.5 py-2 text-right tabular-nums text-ink-2">
                    {formatMetric(k, r.metrics[k])}
                  </td>
                ))}
                <td className="px-2.5 py-2 text-right tabular-nums text-ink-2">{er === null ? "—" : `${er.toFixed(1)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One number over time (a single series, so the title names it and there is no legend): a thin line from zero,
 * quiet gridlines, and a crosshair with the exact value where the pointer is.
 */
export function TrendChart({ title, metric, points }: { title: string; metric: MetricKey; points: { t: number; v: number; label: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 560;
  const H = 150;
  const pad = { l: 8, r: 8, t: 18, b: 26 };
  const last = points[points.length - 1];
  if (points.length < 2)
    return (
      <div className="card p-4">
        <div className="text-[12px] font-medium text-muted">{title}</div>
        <div className="mt-1 font-display text-[22px] font-bold tabular-nums">{last ? formatMetric(metric, last.v) : "—"}</div>
        <p className="mt-3 text-[12px] text-muted">The line appears after the numbers have been collected a few times (every hour while the post is new).</p>
      </div>
    );
  const t0 = points[0].t;
  const t1 = last.t;
  const max = Math.max(1, ...points.map((p) => p.v));
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const at = hover === null ? null : points[hover];
  const onMove = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    setHover(best);
  };
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[12px] font-medium text-muted">{title}</div>
        <div className="text-[12px] text-muted">{at ? at.label : "now"}</div>
      </div>
      <div className="mt-0.5 font-display text-[22px] font-bold tabular-nums">{formatMetric(metric, (at ?? last).v)}</div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full touch-none" role="img" aria-label={`${title} over time: from ${formatMetric(metric, points[0].v)} to ${formatMetric(metric, last.v)}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-line)" strokeWidth="1" />
        ))}
        <path d={`${path} L${x(t1).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z`} fill="var(--color-electric)" opacity="0.08" />
        <path d={path} fill="none" stroke="var(--color-electric)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {at && (
          <>
            <line x1={x(at.t)} x2={x(at.t)} y1={pad.t - 4} y2={H - pad.b} stroke="var(--color-line-strong)" strokeWidth="1" />
            <circle cx={x(at.t)} cy={y(at.v)} r="5" fill="var(--color-electric)" stroke="var(--color-surface)" strokeWidth="2" />
          </>
        )}
        <text x={pad.l} y={H - 6} fontSize="14" fill="var(--color-muted)">
          {points[0].label}
        </text>
        <text x={W - pad.r} y={H - 6} fontSize="14" fill="var(--color-muted)" textAnchor="end">
          {last.label}
        </text>
        <text x={W - pad.r} y={pad.t - 3} fontSize="14" fill="var(--color-muted)" textAnchor="end">
          {formatMetric(metric, max)}
        </text>
      </svg>
    </div>
  );
}
