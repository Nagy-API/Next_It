"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Bell, BellRing, CheckCheck, Clock, CornerUpLeft, Inbox, MessageSquare, PartyPopper, UserPlus } from "lucide-react";
import { markReadAction } from "@/app/actions";
import { formatRelative } from "@/lib/dates";

type Note = { id: string; kind: string; title: string; body: string | null; itemId: string | null; createdAt: string; read: boolean; actorName: string | null };
type Alert = { id: string; tone: "bad" | "warn"; title: string; body: string; itemId: string };
type Feed = { unread: number; notifications: Note[]; alerts: Alert[] };

const ICON: Record<string, typeof Bell> = {
  new_task: Inbox,
  assigned: UserPlus,
  sent_back: CornerUpLeft,
  comment: MessageSquare,
  reply: MessageSquare,
  deadline: Clock,
  finished: PartyPopper,
};

const SEEN_KEY = "nexora-seen-notifications";

/**
 * The bell: stored notifications (new task, sent back, comments…) plus live reminders
 * (late, due today/tomorrow, posting soon). Polls every 30 s; can also show desktop notifications.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [desktop, setDesktop] = useState<NotificationPermission | "unsupported">("default");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data: Feed = await res.json();
      setFeed(data);
      // Desktop pop-up for notifications we haven't shown before.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        let seen: string[] = [];
        try {
          seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
        } catch {}
        const fresh = data.notifications.filter((n) => !n.read && !seen.includes(n.id));
        for (const n of fresh.slice(0, 3)) {
          const pop = new Notification(n.title, { body: n.body ?? undefined, icon: "/icon.png", tag: n.id });
          pop.onclick = () => {
            window.focus();
            if (n.itemId) router.push(`/items/${n.itemId}`);
          };
        }
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify([...fresh.map((n) => n.id), ...seen].slice(0, 200)));
        } catch {}
      }
    } catch {}
  }, [router]);

  useEffect(() => {
    // First load happens after mount; then every 30 s and whenever the tab comes back into focus.
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setDesktop(typeof Notification === "undefined" ? "unsupported" : Notification.permission), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  const markRead = async (ids?: string[]) => {
    const fd = new FormData();
    for (const id of ids ?? []) fd.append("id", id);
    await markReadAction(null, fd);
    load();
  };

  const count = (feed?.unread ?? 0) + (feed?.alerts.length ?? 0);
  const urgent = feed?.alerts.some((a) => a.tone === "bad");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count ? `Notifications, ${count} need attention` : "Notifications"}
        aria-expanded={open}
        className="relative flex size-10 cursor-pointer items-center justify-center rounded-lg border border-line bg-white text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
      >
        {count ? <BellRing className="size-[18px]" /> : <Bell className="size-[18px]" />}
        {count > 0 && (
          <span className={clsx("absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ring-2 ring-canvas", urgent ? "bg-bad" : "bg-electric")}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <span role="status" className="sr-only">
        {count ? `${count} notifications need attention` : ""}
      </span>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,400px)] animate-in overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-display text-[15px] font-bold">Notifications</span>
            {!!feed?.unread && (
              <button type="button" onClick={() => markRead()} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-semibold text-electric hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {feed?.alerts.length ? (
              <div className="border-b border-line bg-[#fffaf5] py-1">
                <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Needs attention</div>
                {feed.alerts.map((a) => (
                  <Link key={a.id} href={`/items/${a.itemId}`} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-2.5 hover:bg-white">
                    <AlertTriangle className={clsx("mt-0.5 size-4 shrink-0", a.tone === "bad" ? "text-bad" : "text-warn")} />
                    <span className="min-w-0">
                      <span className={clsx("block text-[13.5px] font-semibold", a.tone === "bad" && "text-bad")}>{a.title}</span>
                      <span className="block text-[12.5px] text-muted">{a.body}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            {!feed ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted">Loading…</div>
            ) : feed.notifications.length === 0 && !feed.alerts.length ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto mb-2 size-6 text-faint" />
                <div className="text-[13.5px] font-medium">You&rsquo;re all caught up</div>
                <div className="text-[12.5px] text-muted">New tasks, comments and reminders show up here.</div>
              </div>
            ) : (
              feed.notifications.map((n) => {
                const Icon = ICON[n.kind] ?? Bell;
                return (
                  <Link
                    key={n.id}
                    href={n.itemId ? `/items/${n.itemId}` : "/my-work"}
                    onClick={() => {
                      setOpen(false);
                      if (!n.read) markRead([n.id]);
                    }}
                    className={clsx("flex gap-3 border-b border-line/70 px-4 py-3 last:border-0 hover:bg-canvas", !n.read && "bg-electric-soft/40")}
                  >
                    <span className={clsx("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", n.kind === "sent_back" ? "bg-back-soft text-back" : n.kind === "finished" ? "bg-ok-soft text-ok" : "bg-electric-soft text-electric")}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block text-[13.5px] leading-snug", !n.read ? "font-semibold text-ink" : "text-ink-2")}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block truncate text-[12.5px] text-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-[11.5px] text-faint">{formatRelative(new Date(n.createdAt))}</span>
                    </span>
                    {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-electric" aria-label="Unread" />}
                  </Link>
                );
              })
            )}
          </div>
          {desktop === "default" && (
            <button
              type="button"
              onClick={async () => setDesktop(await Notification.requestPermission())}
              className="flex w-full cursor-pointer items-center justify-center gap-2 border-t border-line bg-canvas px-4 py-2.5 text-[12.5px] font-semibold text-electric hover:bg-electric-soft"
            >
              <BellRing className="size-3.5" /> Also show pop-ups on my computer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
