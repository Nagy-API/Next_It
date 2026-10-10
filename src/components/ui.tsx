import Link from "next/link";
import clsx from "clsx";
import { Clapperboard, GalleryHorizontalEnd, Image as ImageIcon, CircleDashed, type LucideIcon } from "lucide-react";
import type { ContentType, StageKind, StageProgress } from "@/db/schema";
import { PROGRESS_META, STAGE_COLOR, STAGE_META, TYPE_META } from "@/domain/workflow";
import { formatDay, formatDuration } from "@/lib/dates";

export { clsx as cx };

/* ------------------------------ Buttons ------------------------------ */

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background,color,box-shadow,border-color,transform] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none";
const btnVariants = {
  primary: "bg-electric text-white hover:bg-[#2f74e6] shadow-[0_1px_0_rgb(255_255_255/0.2)_inset,0_1px_2px_rgb(11_22_57/0.2)]",
  dark: "bg-strong text-white hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-bad border border-line hover:bg-bad-soft hover:border-bad/30",
  success: "bg-ok text-white hover:bg-[#0c8a5d]",
};
const btnSizes = { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5 text-[14px]", lg: "h-11 px-5 text-[15px]" };

export type BtnVariant = keyof typeof btnVariants;
export function btn(variant: BtnVariant = "secondary", size: keyof typeof btnSizes = "md", extra?: string) {
  return clsx(btnBase, btnVariants[variant], btnSizes[size], extra);
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children, ...rest }: React.ComponentProps<typeof Link> & { variant?: BtnVariant; size?: keyof typeof btnSizes }) {
  return (
    <Link href={href} className={btn(variant, size, className as string)} {...rest}>
      {children}
    </Link>
  );
}

/* ------------------------------- Badges ------------------------------ */

const tones = {
  neutral: "bg-wait-soft text-ink-2",
  blue: "bg-electric-soft text-electric",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  back: "bg-back-soft text-back",
  wait: "bg-wait-soft text-wait",
  navy: "bg-strong text-white",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className, icon: Icon, title }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: LucideIcon; title?: string }) {
  return (
    <span title={title} className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap", tones[tone], className)}>
      {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/* ------------------------------- People ------------------------------ */

export { Avatar, ManagerChip, personColor } from "./avatar";
import { Avatar } from "./avatar";

export function Person({ name, size = 22, muted }: { name: string | null | undefined; size?: number; muted?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 min-w-0", muted && "text-muted")}>
      <Avatar name={name} size={size} />
      <span className="truncate">{name ?? "Unassigned"}</span>
    </span>
  );
}

/* ------------------------------ Types ------------------------------ */

const TYPE_ICON: Record<ContentType, LucideIcon> = {
  reel: Clapperboard,
  static: ImageIcon,
  carousel: GalleryHorizontalEnd,
  story: CircleDashed,
};

export function TypeIcon({ type, className }: { type: ContentType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon className={clsx("size-4 shrink-0 text-muted", className)} strokeWidth={1.8} aria-hidden />;
}

export function TypeTag({ type }: { type: ContentType }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2">
      <TypeIcon type={type} className="size-3.5" />
      {TYPE_META[type].label}
    </span>
  );
}

export function BrandDot({ color, className }: { color: string; className?: string }) {
  return <span className={clsx("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

/* ------------------------------ Layout ------------------------------ */

export function PageHeader({ eyebrow, title, subtitle, actions, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-[13px] text-muted">{eyebrow}</div>}
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function SectionTitle({ children, right, className }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="font-display text-[15px] font-bold text-ink">{children}</h2>
      {right}
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-white/60 px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-electric-soft text-electric">
          <Icon className="size-5" />
        </div>
      )}
      <div className="font-display text-[15px] font-bold">{title}</div>
      {children && <div className="mt-1 max-w-md text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, tone, hint, href }: { label: string; value: React.ReactNode; tone?: "bad" | "warn" | "ok" | "blue"; hint?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div
        className={clsx(
          "mt-1 font-display text-[28px] font-bold leading-none tracking-tight",
          tone === "bad" && "text-bad",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
          tone === "blue" && "text-electric",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[12px] text-muted">{hint}</div>}
    </>
  );
  const cls = "card block px-4 py-3.5";
  return href ? (
    <Link href={href} className={clsx(cls, "transition-colors hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

export function ProgressBar({ segments, className }: { segments: { value: number; color: string; label?: string }[]; className?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className={clsx("flex h-1.5 w-full overflow-hidden rounded-full bg-track", className)}>
      {segments.map((s, i) =>
        s.value > 0 ? <div key={i} title={s.label ? `${s.label}: ${s.value}` : undefined} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} /> : null,
      )}
    </div>
  );
}

/* ------------------------------ Extra work ------------------------------ */

/** Work a manager gave as a task on top of the month's plan. */
export function ExtraBadge({ by, className }: { by?: string | null; className?: string }) {
  return (
    <span
      title={by ? `Extra task given by ${by} — on top of the month's plan` : "Extra task — on top of the month's plan"}
      className={clsx("tint inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", className)}
      style={{ "--tint": "#b45309" } as React.CSSProperties}
    >
      Extra{by ? ` · ${by}` : ""}
    </span>
  );
}

/* ------------------------------ Steps ------------------------------ */

/** The step's name in its own colour — the same colour for that step everywhere. */
export function StageChip({ kind, short, className }: { kind: StageKind; short?: boolean; className?: string }) {
  const c = STAGE_COLOR[kind];
  return (
    <span className={clsx("tint inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", className)} style={{ "--tint": c.fg } as React.CSSProperties}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: c.fg }} />
      {short ? STAGE_META[kind].short : STAGE_META[kind].label}
    </span>
  );
}

/* ------------------------------ Status ------------------------------ */

/**
 * Where the person is with the step, readable from outside (rows, Overview, Dashboard, profiles):
 * In progress · Adjusting · Changes requested · Scheduled (with the day) · Waiting approval. Soft colours.
 */
export function ProgressChip({
  progress,
  scheduledFor,
  running,
  className,
  hideNotStarted,
}: {
  progress: StageProgress;
  scheduledFor?: string | null;
  /** The clock is running (a soft pulse). */
  running?: boolean;
  className?: string;
  hideNotStarted?: boolean;
}) {
  if (hideNotStarted && progress === "not_started") return null;
  const m = PROGRESS_META[progress];
  return (
    <span className={clsx("tint inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", className)} style={{ "--tint": m.fg } as React.CSSProperties}>
      <span aria-hidden className={clsx("size-1.5 rounded-full", running && "animate-pulse")} style={{ backgroundColor: m.dot }} />
      {m.label}
      {progress === "scheduled" && scheduledFor ? ` · ${formatDay(scheduledFor)}` : ""}
    </span>
  );
}

/** "⏱ 2h 10m" worked on a step (running = still on the clock). */
export function TimeSpent({ ms, running, className, prefix }: { ms: number; running?: boolean; className?: string; prefix?: string }) {
  if (!ms && !running) return null;
  return (
    <span className={clsx("inline-flex items-center gap-1 text-[12px] font-medium tabular-nums text-ink-2", className)} title={running ? "On the clock now" : "Time worked on this step"}>
      <svg viewBox="0 0 20 20" className={clsx("size-3.5", running ? "text-electric" : "text-faint")} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="10" cy="11" r="6.5" />
        <path d="M10 7.5V11l2.2 1.6M8 2.5h4" strokeLinecap="round" />
      </svg>
      {prefix}
      {formatDuration(ms)}
      {running && <span className="text-electric">· running</span>}
    </span>
  );
}

/** A brand's logo (uploaded in Settings → Brands), else its colour with the first letter. */
export function BrandMark({ name, color, logoUrl, size = 20, className }: { name: string; color: string; logoUrl?: string | null; size?: number; className?: string }) {
  if (logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" width={size} height={size} className={clsx("shrink-0 rounded-md bg-white object-contain ring-1 ring-black/5", className)} style={{ width: size, height: size }} />
    );
  return (
    <span
      aria-hidden
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: Math.max(9, size * 0.5) }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

/** Urgent / Important (nothing for normal). */
export function PriorityChip({ priority, className }: { priority: string | null | undefined; className?: string }) {
  const m = priority === "urgent" ? { label: "Urgent", c: "#ef4444" } : priority === "important" ? { label: "Important", c: "#f59e0b" } : null;
  if (!m) return null;
  return (
    <span className={clsx("tint inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold", className)} style={{ "--tint": m.c } as React.CSSProperties}>
      <span className={clsx("size-1.5 rounded-full", priority === "urgent" && "animate-pulse")} style={{ background: m.c }} />
      {m.label}
    </span>
  );
}
