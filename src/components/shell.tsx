"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  BarChart3,
  Briefcase,
  CalendarClock,
  Camera,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Home,
  KeyRound,
  LayoutGrid,
  ListChecks,
  Lock,
  LogOut,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Presentation,
  Search,
  Settings,
  Sun,
  Sunset,
  CloudSun,
  Moon,
  Tags,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { GiveTaskButton } from "./tasks";
import { ManagerChip } from "./avatar";
import { logoutAction } from "@/app/actions";
import { deleteBrandAction } from "@/app/people-actions";
import { archiveSpaceAction } from "@/app/space-actions";
import { NotificationBell } from "./bell";
import { ScrollMemory } from "./scroll-memory";
import { NavTrail } from "./back-link";
import { ThemeToggle } from "./theme-toggle";
import { TypedDelete } from "./danger";
import { Popover } from "./client";
import { NotebookHost, openNotebook } from "./notebook";
import { Avatar, BrandMark } from "./ui";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, type SidebarPref } from "@/lib/sidebar";

type NavBrand = { id: string; name: string; slug: string; color: string; logoUrl: string | null; open: number; late: number };
export type NavPage = { id: string; title: string; kind: "doc" | "whiteboard" | "sheet"; icon: string | null };
type NavSpace = { id: string; name: string; color: string; icon: string | null; isPrivate: boolean; open: number; late: number; manage: boolean; pages: NavPage[] };
/** What this person may open (Settings → Access) and which modules are on (Settings → Workspace). */
export type NavFlags = {
  giveTasks: boolean;
  dashboard: boolean;
  reports: boolean;
  activity: boolean;
  settings: boolean;
  createSpaces: boolean;
  manageBrands: boolean;
  exportPlans: boolean;
  social: boolean;
  modules: { content: boolean; projects: boolean; spaces: boolean; quick: boolean; chat: boolean };
};
type Watermark = { src: string; opacity: number } | null;
export type ShellLook = { name: string; logos: { wordmark: string; mark: string }; customWordmark: boolean; light: Watermark; dark: Watermark };
const PAGE_ICON = { doc: FileText, whiteboard: Presentation, sheet: FileSpreadsheet } as const;

export function Shell({
  user,
  brands,
  spaces,
  nav,
  look,
  greeting,
  dailyLine,
  myCount,
  chatUnread,
  shootsToday,
  canAdd,
  taskPeople,
  meId,
  taskBrands,
  sidebar,
  children,
}: {
  user: { name: string; title: string | null; isAdmin: boolean; username: string; manager: boolean; roleLabel: string | null };
  brands: NavBrand[];
  spaces: NavSpace[];
  nav: NavFlags;
  look: ShellLook;
  greeting: string;
  dailyLine: string;
  myCount: number;
  chatUnread: number;
  shootsToday: number;
  canAdd: boolean;
  taskPeople: { id: string; name: string; teams: string[]; manager?: boolean }[];
  meId: string;
  taskBrands: { id: string; name: string }[];
  sidebar: SidebarPref;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The mobile drawer closes itself whenever the route changes.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const mobileOpen = openAt === pathname;
  const setMobileOpen = (o: boolean) => setOpenAt(o ? pathname : null);

  const [width, setWidth] = useState(sidebar.width);
  const [collapsed, setCollapsed] = useState(sidebar.collapsed);
  const [dragging, setDragging] = useState(false);
  const save = useCallback((w: number, c: boolean) => {
    document.cookie = `sb=${Math.round(w)}.${c ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      save(width, !c);
      return !c;
    });
  }, [save, width]);

  // Ctrl/⌘ + \ hides or shows the sidebar (full-width page).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "\\" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [toggle]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    let w = width;
    const move = (ev: PointerEvent) => {
      w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, ev.clientX));
      setWidth(w);
    };
    const up = () => {
      setDragging(false);
      save(w, false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const [del, setDel] = useState<{ kind: "brand" | "space"; id: string; name: string } | null>(null);

  return (
    <div
      className={clsx("min-h-dvh", !dragging && "transition-[padding] duration-300 ease-out", !collapsed && "lg:pl-[var(--sb)]")}
      style={{ "--sb": `${width}px`, "--sbw": collapsed ? "0px" : `${width}px` } as React.CSSProperties}
    >
      <Suspense fallback={null}>
        <ScrollMemory />
        <NavTrail />
      </Suspense>
      {/* Sidebar */}
      <aside
        className={clsx(
          "sidebar fixed inset-y-0 left-0 z-40 flex w-[min(86vw,var(--sb))] flex-col text-white",
          !dragging && "transition-transform duration-300 ease-out",
          mobileOpen ? "translate-x-0 shadow-pop" : "-translate-x-full",
          !collapsed && "lg:translate-x-0",
        )}
        aria-label="Main menu"
      >
        <div className="relative flex h-[68px] shrink-0 items-center gap-2 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={look.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.logos.mark} alt="" className="size-8 shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(96,165,250,0.55)]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.logos.wordmark} alt={look.name} className="h-[18px] w-auto max-w-[130px] object-contain" />
          </Link>
          {!look.customWordmark && <span className="mt-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-electric-bright">Ops</span>}
          <button
            className="ml-auto hidden cursor-pointer rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white lg:block"
            onClick={toggle}
            aria-label="Hide the menu"
            title="Hide the menu (Ctrl + \)"
          >
            <PanelLeftClose className="size-[18px]" />
          </button>
          <button className="ml-auto rounded-md p-1 text-white/60 hover:text-white lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-4 pt-1">
          {nav.giveTasks && <GiveTaskButton people={taskPeople} brands={nav.modules.content ? taskBrands : []} meId={meId} />}
          <div className="space-y-0.5">
            <NavItem href="/my-work" icon={UserRound} label="My tasks" active={pathname.startsWith("/my-work")} count={myCount} />
            <NavItem href="/overview" icon={Home} label="Overview" active={pathname.startsWith("/overview") || pathname.startsWith("/work")} />
            {nav.modules.content && <NavItem href="/shoots" icon={Camera} label="Shoot schedule" active={pathname.startsWith("/shoots")} count={shootsToday} hint="shoots today" />}
            {nav.modules.content && nav.modules.quick && <NavItem href="/quick" icon={ListChecks} label="Quick update" active={pathname.startsWith("/quick")} />}
            {nav.social && <NavItem href="/social" icon={CalendarClock} label="Social media schedule" active={pathname.startsWith("/social")} />}
            <button
              type="button"
              onClick={openNotebook}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
              title="Only you can see it (shortcut N)"
            >
              <NotebookPen className="size-[18px] shrink-0" strokeWidth={1.9} />
              <span className="flex-1 truncate">My notebook</span>
              <Lock className="size-3.5 text-white/35" />
            </button>
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
              <SectionHead
                label="Spaces"
                href="/spaces"
                active={pathname === "/spaces"}
                add={
                  nav.createSpaces && (
                    <AddMenu
                      label="Add to Spaces"
                      items={[
                        { href: "/spaces/new", icon: LayoutGrid, title: "New space", hint: "A department or workflow, from a template" },
                        { href: "/spaces/new?kind=whiteboard", icon: Presentation, title: "Whiteboard", hint: "Sticky notes, matrices, flowcharts, mind maps" },
                        { href: "/spaces/new?kind=doc", icon: FileText, title: "Doc", hint: "Write like Word: briefs, SOPs, meeting notes" },
                        { href: "/spaces/new?kind=sheet", icon: FileSpreadsheet, title: "Sheet", hint: "Rows and columns like Excel" },
                        { href: "/dashboards", icon: BarChart3, title: "Dashboard", hint: "Live cards and charts from your spaces" },
                      ]}
                    />
                  )
                }
              />
              {spaces.map((sp) => (
                <SpaceRow key={sp.id} sp={sp} pathname={pathname} onDelete={() => setDel({ kind: "space", id: sp.id, name: sp.name })} />
              ))}
              {spaces.length > 0 && (
                <Link
                  href="/dashboards"
                  className={clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13px] transition-colors", pathname.startsWith("/dashboards") ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white")}
                >
                  <BarChart3 className="size-5 shrink-0 p-0.5" /> Dashboards
                </Link>
              )}
              {!spaces.length && (
                <Link href="/spaces/new" className="block rounded-lg border border-dashed border-white/15 px-3 py-2 text-[12.5px] text-white/55 hover:border-white/30 hover:text-white">
                  <Plus className="mr-1 inline size-3.5 -translate-y-px" /> Build your first space
                </Link>
              )}
            </>
          )}

          {nav.modules.content && (
            <>
              <SectionHead
                label="Brands"
                href="/brands"
                active={pathname === "/brands"}
                add={
                  (canAdd || nav.manageBrands) && (
                    <AddMenu
                      label="Add"
                      items={[
                        ...(canAdd ? [{ href: "/add", icon: PenLine, title: "Add content", hint: "Reels, posts, carousels or stories to a plan" }] : []),
                        ...(nav.manageBrands ? [{ href: "/settings/brands", icon: Tags, title: "New brand", hint: "Its colour, logo and default people" }] : []),
                      ]}
                    />
                  )
                }
              />
              {brands.map((b) => (
                <BrandRow key={b.id} b={b} pathname={pathname} canDelete={nav.manageBrands} canExport={nav.exportPlans} onDelete={() => setDel({ kind: "brand", id: b.id, name: b.name })} />
              ))}
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

        {/* Drag to make the menu wider or narrower; double-click puts it back. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the menu"
          title="Drag to resize · double-click to reset"
          onPointerDown={startDrag}
          onDoubleClick={() => {
            setWidth(SIDEBAR_DEFAULT);
            save(SIDEBAR_DEFAULT, false);
          }}
          className={clsx("absolute inset-y-0 -right-1 hidden w-2 cursor-col-resize lg:block", "after:absolute after:inset-y-0 after:left-[3px] after:w-[2px] after:transition-colors hover:after:bg-electric/70", dragging && "after:bg-electric")}
        />
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-navy-950/45 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)} />}
      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
        <div className={clsx("mx-auto flex h-[68px] items-center gap-3 px-4 sm:px-6 lg:px-8", collapsed ? "max-w-[1560px]" : "max-w-[1320px]")}>
          <button className="-ml-1 rounded-lg p-1.5 text-ink-2 hover:bg-surface lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          {collapsed && (
            <button
              className="-ml-1 hidden size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink lg:grid"
              onClick={toggle}
              aria-label="Show the menu"
              title="Show the menu (Ctrl + \)"
            >
              <PanelLeftOpen className="size-[18px]" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15.5px] font-bold leading-tight text-ink sm:text-[17px]">
              <DayIcon greeting={greeting} />
              {greeting}, {user.name.split(" ")[0]}
            </div>
            <div className="hidden truncate text-[13px] leading-snug text-muted sm:block" title={dailyLine}>
              {dailyLine}
            </div>
          </div>
          <SearchBox />
          <Link href="/search" className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink md:hidden" aria-label="Search">
            <Search className="size-[18px]" />
          </Link>
          <ThemeToggle />
          <NotificationBell />
        </div>
      </header>

      {/* The company's mark, very faint, with a soft shadow — brand presence without noise (Settings → Workspace). */}
      {look.light && (
        <div aria-hidden className="pointer-events-none fixed -right-24 top-24 -z-0 hidden size-[420px] lg:block dark:lg:hidden" style={{ opacity: look.light.opacity / 100 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={look.light.src} alt="" className="size-full object-contain drop-shadow-[0_18px_30px_rgba(11,22,57,0.5)]" />
        </div>
      )}
      {look.dark && (
        <div aria-hidden className="pointer-events-none fixed -right-24 top-24 -z-0 hidden size-[420px] dark:lg:block" style={{ opacity: look.dark.opacity / 100 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={look.dark.src} alt="" className="size-full object-contain" />
        </div>
      )}
      <NotebookHost />
      <main className={clsx("relative z-[1] mx-auto overflow-x-clip px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-16", collapsed ? "max-w-[1560px]" : "max-w-[1320px]")}>{children}</main>

      {del && (
        <TypedDelete
          open
          onClose={() => setDel(null)}
          name={del.name}
          what={del.kind}
          action={del.kind === "brand" ? deleteBrandAction : archiveSpaceAction}
          fields={del.kind === "brand" ? { brandId: del.id } : { spaceId: del.id }}
          details={
            del.kind === "brand" ? (
              <>
                <p>
                  <b>{del.name}</b> and <b>all of its content</b> (every month plan and item) leave the menu, the plans, My tasks and the numbers. Running clocks stop.
                </p>
                <p className="text-muted">Nothing is erased: an admin can restore it with its items from Settings → Brands.</p>
              </>
            ) : (
              <>
                <p>
                  The space <b>{del.name}</b> with <b>all its lists, tasks, docs and whiteboards</b> disappears for everyone.
                </p>
                <p className="text-muted">History is kept: its admins can bring it back from the Spaces page.</p>
              </>
            )
          }
        />
      )}

      {/* Phones & tablets: the main places one tap away, like an app. */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(11_22_57/0.25)] backdrop-blur lg:hidden"
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
            <TabItem href="/shoots" icon={Camera} label="Shoots" active={pathname.startsWith("/shoots")} count={shootsToday} />
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

function SectionHead({ label, href, active, add }: { label: string; href: string; active: boolean; add?: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-5 flex items-center justify-between px-3">
      <Link href={href} className={clsx("text-[11px] font-semibold uppercase tracking-[0.12em] hover:text-white", active ? "text-white" : "text-white/50")}>
        {label}
      </Link>
      {add}
    </div>
  );
}

type AddItem = { href: string; icon: typeof Home; title: string; hint: string };
function AddMenu({ label, items }: { label: string; items: AddItem[] }) {
  if (!items.length) return null;
  return (
    <Popover
      label={label}
      width={290}
      align="left"
      triggerClassName="grid size-6 cursor-pointer place-items-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      trigger={<Plus className="size-4" strokeWidth={2.5} />}
    >
      {(close) => (
        <div className="-m-1.5 space-y-0.5">
          {items.map((it) => (
            <Link key={it.href} href={it.href} onClick={close} className="flex items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-hover">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-electric-soft text-electric">
                <it.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-ink">{it.title}</span>
                <span className="block text-[12.5px] leading-snug text-muted">{it.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Popover>
  );
}

function RowMenu({ children }: { children: (close: () => void) => React.ReactNode }) {
  return (
    <Popover
      label="More"
      width={220}
      align="left"
      className="shrink-0"
      triggerClassName="grid size-6 cursor-pointer place-items-center rounded-md text-white/45 opacity-0 transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
      trigger={<MoreHorizontal className="size-4" />}
    >
      {(close) => <div className="-m-1.5 space-y-0.5">{children(close)}</div>}
    </Popover>
  );
}

const menuItem = "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-ink hover:bg-hover";

function BrandRow({ b, pathname, canDelete, canExport, onDelete }: { b: NavBrand; pathname: string; canDelete: boolean; canExport: boolean; onDelete: () => void }) {
  const active = pathname.startsWith(`/brands/${b.slug}`);
  return (
    <div className={clsx("group flex items-center rounded-lg pr-1 transition-colors", active ? "bg-white/10" : "hover:bg-white/5")}>
      <Link href={`/brands/${b.slug}`} className={clsx("flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-[6px] text-[13.5px]", active ? "text-white" : "text-white/75 group-hover:text-white")}>
        <BrandMark name={b.name} color={b.color} logoUrl={b.logoUrl} size={20} className="!rounded-[6px]" />
        <span className="flex-1 truncate">{b.name}</span>
        {b.late > 0 ? (
          <span className="rounded-full bg-bad px-1.5 text-[11px] font-semibold leading-[18px] text-white" title={`${b.late} late`}>
            {b.late}
          </span>
        ) : b.open > 0 ? (
          <span className="text-[11px] tabular-nums text-white/45">{b.open}</span>
        ) : null}
      </Link>
      <RowMenu>
        {(close) => (
          <>
            <Link href={`/brands/${b.slug}`} onClick={close} className={menuItem}>
              <Tags className="size-4 text-muted" /> Open the plan
            </Link>
            <Link href={`/shoots?brand=${b.slug}`} onClick={close} className={menuItem}>
              <Camera className="size-4 text-muted" /> Shoots
            </Link>
            {canExport && (
              <a href={`/api/export/plan?brand=${b.slug}`} onClick={close} className={menuItem}>
                <Download className="size-4 text-muted" /> This month in Excel
              </a>
            )}
            {canDelete && (
              <>
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                  className={clsx(menuItem, "text-bad hover:bg-bad-soft")}
                >
                  <Trash2 className="size-4" /> Delete brand…
                </button>
              </>
            )}
          </>
        )}
      </RowMenu>
    </div>
  );
}

function SpaceRow({ sp, pathname, onDelete }: { sp: NavSpace; pathname: string; onDelete: () => void }) {
  const active = pathname === `/spaces/${sp.id}` || pathname.startsWith(`/spaces/${sp.id}/t/`) || pathname.startsWith(`/spaces/${sp.id}/settings`);
  const inside = pathname.startsWith(`/spaces/${sp.id}`);
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? inside;
  return (
    <div>
      <div className={clsx("group flex items-center rounded-lg pr-1 transition-colors", active ? "bg-white/10" : "hover:bg-white/5")}>
        <button
          type="button"
          onClick={() => setOpen(!expanded)}
          aria-label={expanded ? `Fold ${sp.name}` : `Unfold ${sp.name}`}
          className={clsx("grid size-5 shrink-0 cursor-pointer place-items-center text-white/35 hover:text-white", !sp.pages.length && "invisible")}
        >
          <ChevronRight className={clsx("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <Link href={`/spaces/${sp.id}`} className={clsx("flex min-w-0 flex-1 items-center gap-2.5 py-[6px] pr-1 text-[13.5px]", active ? "text-white" : "text-white/75 group-hover:text-white")}>
          <span className="grid size-5 shrink-0 place-items-center rounded-[6px] text-[11px] font-bold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)]" style={{ background: sp.color }}>
            {sp.icon || sp.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex-1 truncate">{sp.name}</span>
          {sp.isPrivate && <Lock className="size-3 text-white/40" aria-label="Private" />}
          {sp.late > 0 ? (
            <span className="rounded-full bg-bad px-1.5 text-[11px] font-semibold leading-[18px] text-white" title={`${sp.late} overdue`}>
              {sp.late}
            </span>
          ) : sp.open > 0 ? (
            <span className="text-[11px] tabular-nums text-white/45">{sp.open}</span>
          ) : null}
        </Link>
        {sp.manage && (
          <RowMenu>
            {(close) => (
              <>
                <Link href={`/spaces/new?kind=doc&space=${sp.id}`} onClick={close} className={menuItem}>
                  <FileText className="size-4 text-muted" /> Add a doc
                </Link>
                <Link href={`/spaces/new?kind=whiteboard&space=${sp.id}`} onClick={close} className={menuItem}>
                  <Presentation className="size-4 text-muted" /> Add a whiteboard
                </Link>
                <Link href={`/spaces/new?kind=sheet&space=${sp.id}`} onClick={close} className={menuItem}>
                  <FileSpreadsheet className="size-4 text-muted" /> Add a sheet
                </Link>
                <Link href={`/spaces/${sp.id}/settings`} onClick={close} className={menuItem}>
                  <Settings className="size-4 text-muted" /> Space settings
                </Link>
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                  className={clsx(menuItem, "text-bad hover:bg-bad-soft")}
                >
                  <Trash2 className="size-4" /> Delete space…
                </button>
              </>
            )}
          </RowMenu>
        )}
      </div>
      {expanded && sp.pages.length > 0 && (
        <div className="mb-1 ml-[18px] border-l border-white/10 pl-2">
          {sp.pages.map((p) => {
            const Icon = PAGE_ICON[p.kind];
            const on = pathname === `/spaces/${sp.id}/p/${p.id}`;
            return (
              <Link
                key={p.id}
                href={`/spaces/${sp.id}/p/${p.id}`}
                className={clsx("flex items-center gap-2 rounded-md px-2 py-[5px] text-[13px] transition-colors", on ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white")}
              >
                {p.icon ? <span className="w-4 text-center text-[13px]">{p.icon}</span> : <Icon className="size-4 shrink-0 opacity-80" />}
                <span className="truncate">{p.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabItem({ href, icon: Icon, label, active, count }: { href: string; icon: typeof Home; label: string; active: boolean; count?: number }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={clsx("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors", active ? "text-electric" : "text-muted hover:text-ink")}>
      <span className="relative">
        <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} />
        {!!count && <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-electric px-1 text-center text-[10.5px] font-bold leading-[18px] text-white ring-2 ring-surface">{count > 99 ? "99+" : count}</span>}
      </span>
      {label}
      {active && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-electric" />}
    </Link>
  );
}

function NavHeading({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{children}</div>;
}

function NavItem({ href, icon: Icon, label, active, count, highlight, hint }: { href: string; icon: typeof Home; label: string; active: boolean; count?: number; highlight?: boolean; hint?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[14px] font-medium transition-colors",
        active ? "bg-electric text-white shadow-[0_4px_14px_-4px_rgb(59_130_246/0.6)]" : "text-white/80 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.9} />
      <span className="flex-1 truncate">{label}</span>
      {!!count && (
        <span title={hint ? `${count} ${hint}` : undefined} className={clsx("rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums", active ? "bg-white/25" : highlight ? "bg-electric text-white" : "bg-white/15 text-white")}>
          {count}
        </span>
      )}
    </Link>
  );
}

/** A small sun, sunset or moon next to the greeting (Cairo time, from the greeting itself). */
function DayIcon({ greeting }: { greeting: string }) {
  const [Icon, color] = /morning/i.test(greeting) ? [Sun, "text-amber-500"] : /afternoon/i.test(greeting) ? [CloudSun, "text-amber-500"] : /evening/i.test(greeting) ? [Sunset, "text-orange-500"] : [Moon, "text-indigo-400"];
  return <Icon className={clsx("mr-1.5 inline size-[18px] -translate-y-px", color)} strokeWidth={2} aria-hidden />;
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
      <button onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/5">
        <Avatar name={user.name} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-white">{user.name}</span>
          <span className="block truncate text-[12px] text-white/55">{user.roleLabel ? `${user.roleLabel} · ` : user.manager ? "Manager · " : ""}{user.title ?? `@${user.username}`}</span>
        </span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 animate-in overflow-hidden rounded-xl border border-line bg-surface py-1 text-ink shadow-pop">
          {(user.manager || user.roleLabel) && (
            <div className="border-b border-line px-3 pb-2 pt-1.5">
              <ManagerChip role={user.roleLabel} />
            </div>
          )}
          <button type="button" onClick={() => (setOpen(false), openNotebook())} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-hover">
            <NotebookPen className="size-4 text-muted" /> My notebook
          </button>
          <Link href="/settings/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-hover">
            <Camera className="size-4 text-muted" /> My photo & birthday
          </Link>
          <Link href="/settings/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-hover">
            <KeyRound className="size-4 text-muted" /> Change password
          </Link>
          <form action={logoutAction}>
            <button className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-hover">
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
      className="relative hidden w-[clamp(200px,24vw,320px)] shrink-0 transition-[width] duration-300 focus-within:w-[clamp(240px,32vw,420px)] md:block"
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
        placeholder="Search anything…"
        aria-label="Search content, brands, clients, people"
        className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-10 text-[14px] text-ink placeholder:text-faint focus:border-electric focus:outline-none focus:ring-3 focus:ring-electric/15"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-faint lg:block">/</kbd>
    </form>
  );
}
