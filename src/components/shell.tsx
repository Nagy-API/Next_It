"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { BarChart3, Briefcase, Camera, History, Home, KeyRound, LogOut, Menu, MessagesSquare, Plus, Search, Settings, Tags, UserRound, Users, X } from "lucide-react";
import { GiveTaskButton } from "./tasks";
import { ManagerChip } from "./avatar";
import { logoutAction } from "@/app/actions";
import { NotificationBell } from "./bell";
import { Avatar, btn } from "./ui";

type NavBrand = { id: string; name: string; slug: string; color: string; open: number; late: number };

export function Shell({
  user,
  brands,
  myCount,
  chatUnread,
  canAdd,
  taskPeople,
  taskBrands,
  children,
}: {
  user: { name: string; title: string | null; isAdmin: boolean; username: string; manager: boolean };
  brands: NavBrand[];
  myCount: number;
  chatUnread: number;
  canAdd: boolean;
  taskPeople: { id: string; name: string; teams: string[] }[];
  taskBrands: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The mobile drawer closes itself whenever the route changes.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const mobileOpen = openAt === pathname;
  const setMobileOpen = (o: boolean) => setOpenAt(o ? pathname : null);

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-navy-900 text-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-pop" : "-translate-x-full",
        )}
      >
        <div className="relative flex h-16 items-center px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="NEXORA">
            <Image src="/brand/nexora-mark-white.png" alt="" width={566} height={565} priority className="size-7 drop-shadow-[0_2px_6px_rgba(96,165,250,0.45)]" />
            <Image src="/brand/nexora-wordmark-white.png" alt="NEXORA" width={777} height={153} priority className="h-[18px] w-auto" />
          </Link>
          <span className="ml-2 mt-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-electric-bright">Ops</span>
          <button className="ml-auto rounded-md p-1 text-white/60 hover:text-white lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {user.manager && <GiveTaskButton people={taskPeople} brands={taskBrands} />}
          <NavItem href="/my-work" icon={UserRound} label="My tasks" active={pathname.startsWith("/my-work")} count={myCount} />
          <NavItem href="/overview" icon={Home} label="Overview" active={pathname.startsWith("/overview") || pathname.startsWith("/work")} />
          <NavItem href="/chat" icon={MessagesSquare} label="Team chat" active={pathname.startsWith("/chat")} count={pathname.startsWith("/chat") ? 0 : chatUnread} highlight />
          {user.manager && <NavItem href="/stats" icon={BarChart3} label="Dashboard" active={pathname.startsWith("/stats")} />}
          {user.manager && <NavItem href="/activity" icon={History} label="Activity log" active={pathname.startsWith("/activity")} />}

          <div className="mt-5 mb-1.5 flex items-center justify-between px-3">
            <Link href="/brands" className={clsx("text-[11px] font-semibold uppercase tracking-[0.12em] hover:text-white", pathname === "/brands" ? "text-white" : "text-white/45")}>
              Brands
            </Link>
            <Link href="/brands" className="text-white/40 hover:text-white" title="All brands">
              <Tags className="size-3.5" />
            </Link>
          </div>
          {brands.map((b) => {
            const active = pathname.startsWith(`/brands/${b.slug}`);
            return (
              <Link
                key={b.id}
                href={`/brands/${b.slug}`}
                className={clsx(
                  "group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: b.color }} />
                <span className="flex-1 truncate">{b.name}</span>
                {b.late > 0 ? (
                  <span className="rounded-full bg-bad px-1.5 text-[11px] font-semibold leading-[18px] text-white" title={`${b.late} late`}>
                    {b.late}
                  </span>
                ) : b.open > 0 ? (
                  <span className="text-[11px] tabular-nums text-white/40">{b.open}</span>
                ) : null}
              </Link>
            );
          })}

          <div className="mt-5 space-y-0.5">
            <NavItem href="/projects" icon={Briefcase} label="One-off projects" active={pathname.startsWith("/projects")} />
            <NavItem href="/team" icon={Users} label="Team" active={pathname.startsWith("/team")} />
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          {user.isAdmin && <NavItem href="/settings" icon={Settings} label="Settings" active={pathname.startsWith("/settings")} />}
          <UserMenu user={user} />
        </div>
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-navy-950/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-line/80 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button className="-ml-1 rounded-md p-1.5 text-ink-2 hover:bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <SearchBox />
          <div className="ml-auto" />
          <NotificationBell />
          {canAdd && (
            <Link href="/add" className={btn("primary", "md")}>
              <Plus className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Add content</span>
            </Link>
          )}
        </div>
      </div>

      {/* The NEXORA sun, very faint, with a soft shadow — brand presence without noise. */}
      <div aria-hidden className="pointer-events-none fixed -right-24 top-24 -z-0 hidden size-[420px] opacity-[0.045] lg:block">
        <Image src="/brand/nexora-mark-navy.png" alt="" fill sizes="420px" className="object-contain drop-shadow-[0_18px_30px_rgba(11,22,57,0.5)]" />
      </div>
      <main className="relative z-[1] mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active, count, highlight }: { href: string; icon: typeof Home; label: string; active: boolean; count?: number; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors",
        active ? "bg-electric text-white shadow-[0_4px_14px_-4px_rgb(59_130_246/0.6)]" : "text-white/75 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.9} />
      <span className="flex-1">{label}</span>
      {!!count && (
        <span className={clsx("rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums", active ? "bg-white/25" : highlight ? "bg-electric text-white" : "bg-white/12 text-white")}>{count}</span>
      )}
    </Link>
  );
}

function UserMenu({ user }: { user: { name: string; title: string | null; username: string; manager: boolean } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative mt-1">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/5">
        <Avatar name={user.name} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-white">{user.name}</span>
          <span className="block truncate text-[12px] text-white/50">{user.manager ? "Manager · " : ""}{user.title ?? `@${user.username}`}</span>
        </span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 animate-in overflow-hidden rounded-xl border border-line bg-white py-1 text-ink shadow-pop">
          {user.manager && (
            <div className="border-b border-line px-3 pb-2 pt-1.5">
              <ManagerChip />
            </div>
          )}
          <Link href="/settings/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-canvas">
            <Camera className="size-4 text-muted" /> My photo
          </Link>
          <Link href="/settings/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-canvas">
            <KeyRound className="size-4 text-muted" /> Change password
          </Link>
          <form action={logoutAction}>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-canvas">
              <LogOut className="size-4 text-muted" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function SearchBox() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  return (
    <form
      role="search"
      className="relative w-full max-w-[440px]"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input
        ref={ref}
        key={pathname}
        name="q"
        placeholder="Search content, brands, clients, people…"
        className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-10 text-[14px] placeholder:text-faint focus:border-electric focus:outline-none focus:ring-3 focus:ring-electric/15"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-faint sm:block">/</kbd>
    </form>
  );
}
