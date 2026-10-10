"use client";

/**
 * Avatars everywhere: the person's photo when they uploaded one, else coloured initials.
 * Managers get a small gold star so everyone knows who runs the work.
 */
import { createContext, useContext } from "react";
import clsx from "clsx";

export type AvatarPerson = { id: string; name: string; v: number | null; manager: boolean; /** Shown instead of "Manager" (e.g. "IT"). */ role?: string | null };

const Ctx = createContext<Map<string, AvatarPerson>>(new Map());

export function AvatarProvider({ people, children }: { people: AvatarPerson[]; children: React.ReactNode }) {
  return <Ctx.Provider value={new Map(people.map((p) => [p.name, p]))}>{children}</Ctx.Provider>;
}

export function usePeople() {
  return useContext(Ctx);
}

const AVATAR_COLORS = ["#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#06B6D4", "#EF4444", "#6366F1", "#14B8A6", "#F97316"];

export function personColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function avatarSrc(p: Pick<AvatarPerson, "id" | "v">) {
  return p.v ? `/api/avatar/${p.id}?v=${p.v}` : null;
}

export function Avatar({
  name,
  size = 24,
  className,
  ring,
  badge = true,
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
  ring?: boolean;
  /** Show the manager star (on by default for avatars 22px and up). */
  badge?: boolean;
}) {
  const people = useContext(Ctx);
  if (!name)
    return (
      <span
        title="Unassigned"
        className={clsx("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface text-faint", className)}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        ?
      </span>
    );
  const p = people.get(name);
  const src = p ? avatarSrc(p) : null;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const star = badge && p?.manager && !p.role && size >= 22;
  return (
    <span className={clsx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} title={p?.role ? `${name} · ${p.role}` : p?.manager ? `${name} · Manager` : name}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} width={size} height={size} className={clsx("size-full rounded-full object-cover", ring && "ring-2 ring-surface")} />
      ) : (
        <span
          className={clsx("inline-flex size-full items-center justify-center rounded-full font-semibold text-white", ring && "ring-2 ring-surface")}
          style={{ fontSize: Math.max(9, size * 0.4), background: personColor(name) }}
        >
          {initials}
        </span>
      )}
      {star && (
        <span
          aria-label="Manager"
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-[#f5b301] text-white ring-2 ring-surface"
          style={{ width: Math.max(12, size * 0.42), height: Math.max(12, size * 0.42) }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "70%", height: "70%" }} aria-hidden>
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** "Manager" chip with the star, for headers and lists. A role label (e.g. "IT") replaces it. */
export function ManagerChip({ className, role }: { className?: string; role?: string | null }) {
  if (role)
    return (
      <span className={clsx("inline-flex items-center gap-1 rounded-full bg-electric-soft px-2 py-0.5 text-[11px] font-semibold text-electric", className)}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-3" aria-hidden>
          <path d="M7 6l-4 4 4 4M13 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {role}
      </span>
    );
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full bg-[#fff6db] px-2 py-0.5 text-[11px] font-semibold text-[#9a6b00]", className)}>
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-3" aria-hidden>
        <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" />
      </svg>
      Manager
    </span>
  );
}
