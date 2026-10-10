"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { BarChart3, Briefcase, Camera, FileText, History, Home, KeyRound, LayoutGrid, Lock, LogOut, Menu, MessagesSquare, Plus, Search, Settings, Tags, UserRound, Users, X, Zap } from "lucide-react";
import { GiveTaskButton } from "./tasks";
import { ManagerChip } from "./avatar";
import { logoutAction } from "@/app/actions";
import { NotificationBell } from "./bell";
import { AnnouncementStrip, type Announcement } from "./announcement";
import { ScrollMemory } from "./scroll-memory";
import { Avatar, BrandMark, btn } from "./ui";

type NavBrand = { id: string; name: string; slug: string; color: string; logoUrl: string | null; open: number; late: number };
type NavSpace = { id: string; name: string; color: string; icon: string | null; isPrivate: boolean; open: number; late: number };
/** What this person may open (Settings → Access) and which modules are on (Settings → Workspace). */
export type NavFlags = {
  giveTasks: boolean;
  dashboard: boolean;
  reports: boolean;
  activity: boolean;
  settings: boolean;
  createSpaces: boolean;
  announce: boolean;
  modules: { content: boolean; projects: boolean; spaces: boolean; quick: boolean; chat: boolean };
};
export type ShellLook = { name: string; logos: { wordmark: string; mark: string; watermark: string }; watermark: "logo" | "image" | "none"; watermarkOpacity: number; customWordmark: boolean };

export function Shell({
  user,
  brands,
  spaces,
  nav,
  look,
  motd,
  myCount,
  chatUnread,
  canAdd,
  taskPeople,
  taskBrands,
  children,
}: {
  user: { name: string; title: string | null; isAdmin: boolean; username: string; manager: boolean; roleLabel: string | null };
  brands: NavBrand[];
  spaces: NavSpace[];
  nav: NavFlags;
  look: ShellLook;
  motd: Announcement | null;
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
      <Suspense fallback={null}>
        <ScrollMemory />
      </Suspense>
      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-navy-900 text-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-pop" : "-translate-x-full",
        )}
      >
        <div className="relative flex h-16 items-center px-5">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={look.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.logos.mark} alt="" className="size-7 shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(96,165,250,0.45)]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.logos.wordmark} alt={look.name} className="h-[18px] w-auto max-w-[130px] object-contain" />
          </Link>
          {!look.customWordmark && <span className="ml-2 mt-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-electric-bright">Ops</span>}
          <button className="ml-auto rounded-md p-1 text-white/60 hover:text-white lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2 [scrollbar-width:thin]">
          {nav.giveTasks && <GiveTaskButton people={taskPeople} brands={nav.modules.content ? taskBrands : []} />}
          <div className="space-y-0.5">
            <NavItem href="/my-work" icon={UserRound} label="My tasks" active={pathname.startsWith("/my-work")} count={myCount} />
            <NavItem href="/overview" icon={Home} label="Overview" active={pathname.startsWith("/overview") || pathname.startsWith("/work")} />
            {nav.modules.content && nav.modules.quick && <NavItem href="/quick" icon={Zap} label="Quick update" active={pathname.startsWith("/quick")} />}
            {nav.modules.chat && <NavItem href="/chat" icon={MessagesSquare} label="Team chat" active={pathname.startsWith("/chat")} count={pathname.startsWith("/chat") ? 0 : chatUnread} highlight />}
          </div>
          {(nav.dashboard || nav.reports || nav.activity) && (
            <>
              <NavHeading>Manage</NavHeading>
              <div className="space-y-0.5">
                {nav.dashboard && <NavItem href="/stats" icon={BarChart3} label="Dashboard" active={pathname.startsWith("/stats")} />}
                {nav.reports && <NavItem href="/reports" icon={FileText} label="Reports" active={pathname.startsWith("/reports")} />}
                {nav.activity && <NavItem href="/activity" icon={History} label="Activity log" active={pathname.startsWith("/activity")} />}
              </div>
            </>
          )}

          {nav.modules.spaces && (spaces.length > 0 || nav.createSpaces) && (
            <>
              <div className="mt-5 mb-1.5 flex items-center justify-between px-3">
                <Link href="/spaces" className={clsx("text-[11px] font-semibold uppercase tracking-[0.12em] hover:text-white", pathname === "/spaces" ? "text-white" : "text-white/45")}>
                  Spaces
                </Link>
                {nav.createSpaces ? (
                  <Link href="/spaces/new" className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white" title="New space" aria-label="New space">
                    <Plus className="size-3.5" strokeWidth={2.5} />
                  </Link>
                ) : (
                  <LayoutGrid className="size-3.5 text-white/40" />
                )}
              </div>
              {spaces.map((sp) => {
                const active = pathname.startsWith(`/spaces/${sp.id}`);
                return (
                  <Link
                    key={sp.id}
                    href={`/spaces/${sp.id}`}
                    className={clsx(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] transition-colors",
                      active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-[6px] text-[11px] font-bold text-white" style={{ background: sp.color }}>
                      {sp.icon || sp.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{sp.name}</span>
                    {sp.isPrivate && <Lock className="size-3 text-white/35" aria-label="Private" />}
                    {sp.late > 0 ? (
                      <span className="rounded-full bg-bad px-1.5 text-[11px] font-semibold leading-[18px] text-white" title={`${sp.late} overdue`}>
                        {sp.late}
                      </span>
                    ) : sp.open > 0 ? (
                      <span className="text-[11px] tabular-nums text-white/40">{sp.open}</span>
                    ) : null}
                  </Link>
                );
              })}
              {spaces.length > 0 && (
                <Link
                  href="/dashboards"
                  className={clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13px] transition-colors", pathname.startsWith("/dashboards") ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white")}
                >
                  <BarChart3 className="size-[18px] shrink-0 p-0.5" /> Dashboards
                </Link>
              )}
              {!spaces.length && (
                <Link href="/spaces/new" className="block rounded-lg border border-dashed border-white/15 px-3 py-2 text-[12.5px] text-white/50 hover:border-white/30 hover:text-white">
                  Build your first workflow →
                </Link>
              )}
            </>
          )}

          {nav.modules.content && (
          <>
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
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                <BrandMark name={b.name} color={b.color} logoUrl={b.logoUrl} size={20} className={clsx("!rounded-[6px]", !b.logoUrl && "opacity-90")} />
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
          </>
          )}

          <div className="mt-5 space-y-0.5">
            {nav.modules.projects && <NavItem href="/projects" icon={Briefcase} label="One-off projects" active={pathname.startsWith("/projects")} />}
            <NavItem href="/team" icon={Users} label="Team" active={pathname.startsWith("/team")} />
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          {nav.settings && <NavItem href="/settings" icon={Settings} label="Settings" active={pathname.startsWith("/settings")} />}
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

      {/* The company's mark, very faint, with a soft shadow — brand presence without noise (Settings → Workspace). */}
      {look.watermark !== "none" && look.watermarkOpacity > 0 && (
        <div aria-hidden className="pointer-events-none fixed -right-24 top-24 -z-0 hidden size-[420px] lg:block" style={{ opacity: look.watermarkOpacity / 100 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={look.logos.watermark} alt="" className="size-full object-contain drop-shadow-[0_18px_30px_rgba(11,22,57,0.5)]" />
        </div>
      )}
      <AnnouncementStrip a={motd} canPost={nav.announce} />
      <main className="relative z-[1] mx-auto max-w-[1320px] overflow-x-clip px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-16">{children}</main>

      {/* Phones & tablets: the main places one tap away, like an app. */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(11_22_57/0.25)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-[560px] grid-cols-5">
          <TabItem href="/my-work" icon={UserRound} label="My tasks" active={pathname.startsWith("/my-work")} count={myCount} />
          <TabItem href="/overview" icon={Home} label="Overview" active={pathname.startsWith("/overview") || pathname.startsWith("/work")} />
          {nav.modules.chat ? (
            <TabItem href="/chat" icon={MessagesSquare} label="Chat" active={pathname.startsWith("/chat")} count={pathname.startsWith("/chat") ? 0 : chatUnread} />
          ) : (
            <TabItem href="/team" icon={Users} label="Team" active={pathname.startsWith("/team")} />
          )}
          {nav.modules.content ? (
            <TabItem href="/brands" icon={Tags} label="Brands" active={pathname.startsWith("/brands")} />
          ) : (
            <TabItem href="/spaces" icon={LayoutGrid} label="Spaces" active={pathname.startsWith("/spaces")} />
          )}
          <button type="button" onClick={() => setMobileOpen(true)} className="flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted" aria-label="Open menu">
            <Menu className="size-[22px]" strokeWidth={1.9} />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}

function TabItem({ href, icon: Icon, label, active, count }: { href: string; icon: typeof Home; label: string; active: boolean; count?: number }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={clsx("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors", active ? "text-electric" : "text-muted hover:text-ink")}>
      <span className="relative">
        <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} />
        {!!count && <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-electric px-1 text-center text-[10.5px] font-bold leading-[18px] text-white ring-2 ring-white">{count > 99 ? "99+" : count}</span>}
      </span>
      {label}
      {active && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-electric" />}
    </Link>
  );
}

function NavHeading({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{children}</div>;
}

function NavItem({ href, icon: Icon, label, active, count, highlight }: { href: string; icon: typeof Home; label: string; active: boolean; count?: number; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[14px] font-medium transition-colors",
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

function UserMenu({ user }: { user: { name: string; title: string | null; username: string; manager: boolean; roleLabel: string | null } }) {
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
          <span className="block truncate text-[12px] text-white/50">{user.roleLabel ? `${user.roleLabel} · ` : user.manager ? "Manager · " : ""}{user.title ?? `@${user.username}`}</span>
        </span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 animate-in overflow-hidden rounded-xl border border-line bg-white py-1 text-ink shadow-pop">
          {(user.manager || user.roleLabel) && (
            <div className="border-b border-line px-3 pb-2 pt-1.5">
              <ManagerChip role={user.roleLabel} />
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
      // "/" or Ctrl/⌘+K jumps to search from anywhere.
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable)) {
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
