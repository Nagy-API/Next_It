"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, ChevronLeft, ChevronRight, Clapperboard, CircleDashed, Plus } from "lucide-react";
import { moveSocialPostAction } from "@/app/social-actions";
import { HEADLINE_METRICS, KIND_LABEL, METRIC_META, STATUS_COLOR, STATUS_LABEL, formatMetric, sumMetrics, type PostKind, type PostStatus, type SocialMetrics, type SocialPlatform } from "@/domain/social";
import { useToast } from "../client";
import { PlatformIcon } from "../platform-icon";
import { btn } from "../ui";
import { Composer, type BrandLite, type ChannelLite } from "./composer";
import { MediaThumb, type MediaItem } from "./media";

export type CalPost = {
  id: string;
  brandId: string | null;
  brand: { id: string; name: string; color: string; slug: string } | null;
  kind: PostKind;
  caption: string;
  options: { shareToFeed?: boolean };
  status: PostStatus;
  day: string | null;
  time: string | null;
  media: MediaItem[];
  targets: { id: string; accountId: string; platform: SocialPlatform; accountName: string; status: string; error: string | null; permalink: string | null; metrics: SocialMetrics | null }[];
};

const MOVABLE: PostStatus[] = ["draft", "scheduled", "failed"];
const DOW = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const hour12 = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
const dayNum = (iso: string) => Number(iso.slice(8, 10));

function shift(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
function shiftMonth(iso: string, months: number) {
  const [y, m] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return t.toISOString().slice(0, 10);
}

/** One post on the calendar: time, channels, a thumbnail, the first words, and its numbers once it's out. */
function PostCard({ p, compact, dragging, onOpen, onDragStart, onDragEnd }: { p: CalPost; compact?: boolean; dragging: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const movable = MOVABLE.includes(p.status);
  const platforms = [...new Set(p.targets.map((t) => t.platform))];
  const numbers = sumMetrics(p.targets.map((t) => t.metrics));
  const shownNumbers = HEADLINE_METRICS.filter((k) => typeof numbers[k] === "number").slice(0, compact ? 2 : 4);
  const first = p.media[0];
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      title={`${STATUS_LABEL[p.status]}${p.time ? ` · ${p.time}` : ""}${movable ? " — drag to another day or time, click to edit" : " — click for its numbers"}`}
      className={clsx(
        "group/card relative w-full overflow-hidden rounded-md border border-line bg-surface text-left shadow-card transition-[box-shadow,opacity,transform] hover:border-line-strong hover:shadow-pop",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: p.brand?.color ?? "#94a3b8" }}
    >
      <div className={clsx("flex gap-1.5", compact ? "px-1.5 py-1" : "p-1.5")}>
        {first && !compact && <MediaThumb m={first} className="size-9 shrink-0 rounded" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-ink-2">
            {p.time ?? "No time"}
            {p.kind === "reel" && <Clapperboard className="size-3 text-muted" aria-label="Reel" />}
            {p.kind === "story" && <CircleDashed className="size-3 text-muted" aria-label="Story" />}
            <span className="ml-auto flex items-center gap-0.5">
              {platforms.map((pl) => (
                <PlatformIcon key={pl} name={pl} size={13} />
              ))}
            </span>
          </div>
          <div dir="auto" className={clsx("mt-0.5 break-words text-[12px] leading-snug text-ink", compact ? "truncate" : "line-clamp-2")}>
            {p.caption || <span className="text-faint">{KIND_LABEL[p.kind]} without a caption</span>}
          </div>
        </div>
      </div>
      {p.status === "failed" || p.status === "partial" ? (
        <div className="flex items-center gap-1 border-t border-line bg-bad-soft px-1.5 py-0.5 text-[11px] font-medium text-bad">
          <AlertTriangle className="size-3" /> {STATUS_LABEL[p.status]}
        </div>
      ) : p.status === "published" && shownNumbers.length ? (
        <div className="flex flex-wrap items-center gap-x-2 border-t border-line bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1 font-medium" style={{ color: STATUS_COLOR.published }}>
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: STATUS_COLOR.published }} />
            Published
          </span>
          {shownNumbers.map((k) => (
            <span key={k}>
              <b className="font-semibold tabular-nums text-ink-2">{formatMetric(k, numbers[k])}</b> {METRIC_META[k].label.toLowerCase()}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1 border-t border-line bg-subtle px-1.5 py-0.5 text-[11px] font-medium" style={{ color: STATUS_COLOR[p.status] }}>
          <span aria-hidden className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[p.status] }} />
          {STATUS_LABEL[p.status]}
          {p.status === "published" && !compact && <span className="font-normal text-muted">· numbers arrive soon</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The calendar of the Social media schedule: a week (hour by hour) or a month. Drag a post that hasn't gone out
 * to another day or time; click it to edit; click an empty slot to write a new one there.
 */
export function SocialCalendar({
  posts,
  drafts,
  channels,
  brands,
  media,
  view,
  anchor,
  days,
  today,
  nowHour,
  brandId,
}: {
  posts: CalPost[];
  drafts: CalPost[];
  channels: ChannelLite[];
  brands: BrandLite[];
  media: MediaItem[];
  view: "week" | "month";
  anchor: string;
  /** The days on screen, Saturday first (7 for a week, 42 for a month). */
  days: string[];
  today: string;
  nowHour: number;
  /** The brand chosen at the top of the section (null = every brand). */
  brandId: string | null;
}) {
  const router = useRouter();
  const push = useToast();
  const [, start] = useTransition();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, { day: string; time: string }>>({});
  const [seen, setSeen] = useState(posts);
  const [compose, setCompose] = useState<{ key: number; post: CalPost | null; day: string; time: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Fresh data from the server replaces the optimistic positions.
  if (posts !== seen) {
    setSeen(posts);
    setMoved({});
  }
  const all = [...posts, ...drafts.filter((d) => moved[d.id])].map((p) => (moved[p.id] ? { ...p, ...moved[p.id] } : p));
  const tray = drafts.filter((d) => !moved[d.id]);
  const brand = brands.find((b) => b.id === brandId) ?? null;

  useEffect(() => {
    if (view !== "week") return;
    const el = scroller.current;
    const row = el?.querySelector<HTMLElement>(`[data-hour="${Math.max(0, Math.min(nowHour, 20) - 2)}"]`);
    if (el && row) el.scrollTop = row.offsetTop - 44;
  }, [view, anchor, nowHour]);

  const go = (d: string, v = view) => router.push(`/social?view=${v}&d=${d}`);
  const open = (p: CalPost) => (MOVABLE.includes(p.status) ? setCompose((c) => ({ key: (c?.key ?? 0) + 1, post: p, day: p.day ?? "", time: p.time ?? "" })) : router.push(`/social/posts/${p.id}`));
  const create = (day: string, time: string) => setCompose((c) => ({ key: (c?.key ?? 0) + 1, post: null, day, time }));

  const drop = (day: string, hour: number | null) => {
    const id = drag;
    setDrag(null);
    setOver(null);
    const p = [...posts, ...drafts].find((x) => x.id === id);
    if (!id || !p) return;
    const was = moved[id] ?? { day: p.day, time: p.time };
    const time = hour === null ? (was.time ?? "12:00") : `${pad(hour)}:${was.time?.slice(3, 5) ?? "00"}`;
    if (was.day === day && was.time === time) return;
    setMoved((m) => ({ ...m, [id]: { day, time } }));
    start(async () => {
      const r = await moveSocialPostAction(id, day, time);
      if (r && !r.ok) {
        push({ kind: "error", text: r.error });
        setMoved((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
      } else router.refresh();
    });
  };
  const cellProps = (key: string, day: string, hour: number | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move" as const;
      if (over !== key) setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      drop(day, hour);
    },
  });
  const card = (p: CalPost, compact?: boolean) => (
    <PostCard
      key={p.id}
      p={p}
      compact={compact}
      dragging={drag === p.id}
      onOpen={() => open(p)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.id);
        setDrag(p.id);
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver(null);
      }}
    />
  );

  const [ay, am] = anchor.split("-").map(Number);
  const title = view === "month" ? `${MONTHS[am - 1]} ${ay}` : `${dayNum(days[0])} ${MONTHS[Number(days[0].slice(5, 7)) - 1].slice(0, 3)} – ${dayNum(days[6])} ${MONTHS[Number(days[6].slice(5, 7)) - 1].slice(0, 3)} ${days[6].slice(0, 4)}`;
  const step = (dir: -1 | 1) => go(view === "month" ? shiftMonth(anchor, dir) : shift(anchor, dir * 7));
  const counts = { scheduled: all.filter((p) => p.status === "scheduled" || p.status === "publishing").length, published: all.filter((p) => p.status === "published").length, failed: all.filter((p) => p.status === "failed" || p.status === "partial").length };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button type="button" onClick={() => step(-1)} className="rounded-l-lg p-2 text-ink-2 hover:bg-hover" aria-label={view === "month" ? "Previous month" : "Previous week"}>
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => go(today)} className="border-x border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-hover">
            Today
          </button>
          <button type="button" onClick={() => step(1)} className="rounded-r-lg p-2 text-ink-2 hover:bg-hover" aria-label={view === "month" ? "Next month" : "Next week"}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <h2 className="font-display text-[17px] font-bold">{title}</h2>
        <span className="text-[12.5px] text-muted">
          {counts.scheduled} scheduled · {counts.published} published{counts.failed ? ` · ${counts.failed} need attention` : ""}
        </span>
        <span className="ml-auto" />
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-[13px] font-medium">
          {(["week", "month"] as const).map((v) => (
            <button key={v} type="button" onClick={() => go(anchor, v)} className={clsx("rounded-md px-2.5 py-1", view === v ? "bg-strong text-white" : "text-ink-2 hover:bg-hover")}>
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        <button type="button" className={btn("primary", "md")} onClick={() => create(days.includes(today) ? today : days[0], `${pad(Math.min(nowHour + 1, 23))}:00`)}>
          <Plus className="size-4" /> New post
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="text-muted">Channels:</span>
        {channels
          .filter((c) => !brand || !c.brandId || c.brandId === brand.id)
          .map((c) => (
            <span key={c.id} className={clsx("inline-flex items-center gap-1 rounded-full border bg-surface py-0.5 pl-0.5 pr-2 font-medium", c.status === "error" ? "border-bad/40 text-bad" : "border-line text-ink-2")} title={c.status === "error" ? "Needs reconnecting — see Configuration" : undefined}>
              <PlatformIcon name={c.platform} size={18} />
              {c.username ? `@${c.username}` : c.name}
              {c.status === "error" && <AlertTriangle className="size-3" />}
            </span>
          ))}
        {!channels.length && (
          <span className="text-ink-2">
            none yet —{" "}
            <Link href="/social/config" className="link">
              connect Facebook and Instagram in Configuration
            </Link>
          </span>
        )}
      </div>

      {!!tray.length && (
        <div className="card p-2.5">
          <div className="mb-1.5 text-[12px] font-medium text-ink-2">Drafts without a day · drag one onto the calendar</div>
          <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5">{tray.map((p) => card(p))}</div>
        </div>
      )}

      {view === "week" ? (
        <div ref={scroller} className="card max-h-[calc(100vh-250px)] min-h-[420px] overflow-auto">
          <div className="grid min-w-[900px] grid-cols-[52px_repeat(7,minmax(0,1fr))]">
            <div className="sticky top-0 z-10 border-b border-line bg-surface" />
            {days.map((d, i) => (
              <div key={d} className={clsx("sticky top-0 z-10 border-b border-l border-line bg-surface px-2 py-2 text-center", d === today && "bg-electric-soft")}>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{DOW[i]}</div>
                <div className={clsx("font-display text-[15px] font-bold", d === today ? "text-electric" : "text-ink")}>{dayNum(d)}</div>
              </div>
            ))}
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="contents" data-hour-row={h}>
                <div data-hour={h} className="border-b border-line px-1.5 py-1 text-right text-[11px] tabular-nums text-muted">
                  {hour12(h)}
                </div>
                {days.map((d) => {
                  const key = `${d}T${h}`;
                  const here = all.filter((p) => p.day === d && Number(p.time?.slice(0, 2)) === h).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
                  const past = d < today || (d === today && h < nowHour);
                  return (
                    <div
                      key={key}
                      {...cellProps(key, d, h)}
                      onClick={() => create(d, `${pad(h)}:00`)}
                      className={clsx("group/cell relative min-h-[46px] space-y-1 border-b border-l border-line p-1 transition-colors", past ? "bg-subtle" : "bg-surface", over === key ? "bg-electric-soft outline outline-2 -outline-offset-2 outline-electric" : "hover:bg-hover")}
                    >
                      {here.map((p) => card(p))}
                      {!here.length && <Plus className="absolute left-1/2 top-1/2 hidden size-4 -translate-x-1/2 -translate-y-1/2 text-faint group-hover/cell:block" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[840px] grid-cols-7">
            {DOW.map((d) => (
              <div key={d} className="border-b border-line px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
                {d}
              </div>
            ))}
            {days.map((d, i) => {
              const here = all.filter((p) => p.day === d).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
              const outside = Number(d.slice(5, 7)) !== am;
              return (
                <div
                  key={d}
                  {...cellProps(d, d, null)}
                  onClick={() => create(d, "12:00")}
                  className={clsx("group/cell min-h-[118px] space-y-1 border-b border-line p-1 transition-colors", i % 7 !== 0 && "border-l", outside || d < today ? "bg-subtle" : "bg-surface", over === d ? "bg-electric-soft outline outline-2 -outline-offset-2 outline-electric" : "hover:bg-hover")}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <span className={clsx("inline-flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", d === today ? "bg-electric text-white" : outside ? "text-faint" : "text-ink-2")}>{dayNum(d)}</span>
                    <Plus className="hidden size-3.5 text-faint group-hover/cell:block" aria-hidden />
                  </div>
                  {here.map((p) => card(p, true))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[12px] text-muted">Times are Cairo time. Click an empty slot to write a post there; drag a post to move it. Published posts stay where they are — click one to see its numbers.</p>

      {compose && (
        <Composer
          key={compose.key}
          post={compose.post}
          initial={{ day: compose.day, time: compose.time, brandId: brand?.id ?? null }}
          channels={channels}
          brands={brands}
          media={media}
          onClose={() => setCompose(null)}
        />
      )}
    </div>
  );
}
