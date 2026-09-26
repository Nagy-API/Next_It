import Link from "next/link";
import clsx from "clsx";
import { Clapperboard, GalleryHorizontalEnd, Image as ImageIcon, CircleDashed, type LucideIcon } from "lucide-react";
import type { ContentType } from "@/db/schema";
import { TYPE_META } from "@/domain/workflow";

export { clsx as cx };

/* ------------------------------ Buttons ------------------------------ */

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background,color,box-shadow,border-color] disabled:opacity-50 disabled:pointer-events-none select-none";
const btnVariants = {
  primary: "bg-electric text-white hover:bg-[#2f74e6] shadow-[0_1px_0_rgb(255_255_255/0.2)_inset,0_1px_2px_rgb(11_22_57/0.2)]",
  dark: "bg-navy-900 text-white hover:bg-navy-800",
  secondary: "bg-white text-ink border border-line hover:border-line-strong hover:bg-[#fafbfd]",
  ghost: "text-ink-2 hover:bg-[#eef1f7] hover:text-ink",
  danger: "bg-white text-bad border border-line hover:bg-bad-soft hover:border-bad/30",
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
  blue: "bg-electric-soft text-[#1d5fd1]",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  back: "bg-back-soft text-back",
  wait: "bg-wait-soft text-wait",
  navy: "bg-navy-900 text-white",
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

const AVATAR_COLORS = ["#3B82F6", "#E0569B", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#EF4444", "#0EA5E9", "#F97316", "#14B8A6"];
export function personColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ name, size = 24, className, ring }: { name: string | null | undefined; size?: number; className?: string; ring?: boolean }) {
  if (!name)
    return (
      <span
        title="Unassigned"
        className={clsx("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong bg-white text-faint", className)}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        ?
      </span>
    );
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      title={name}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", ring && "ring-2 ring-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4), background: personColor(name) }}
    >
      {initials}
    </span>
  );
}

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
    <div className={clsx("flex h-1.5 w-full overflow-hidden rounded-full bg-[#e9edf5]", className)}>
      {segments.map((s, i) =>
        s.value > 0 ? <div key={i} title={s.label ? `${s.label}: ${s.value}` : undefined} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} /> : null,
      )}
    </div>
  );
}
