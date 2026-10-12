"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BarChart3, CalendarDays, Images, PlugZap, type LucideIcon } from "lucide-react";

const TABS: { href: string; label: string; icon: LucideIcon; config?: boolean; work?: boolean }[] = [
  { href: "/social", label: "Calendar", icon: CalendarDays, work: true },
  { href: "/social/media", label: "Media", icon: Images, work: true },
  { href: "/social/analytics", label: "Analytics", icon: BarChart3, work: true },
  { href: "/social/config", label: "Configuration", icon: PlugZap, config: true },
];

/** Calendar · Media · Analytics · Configuration (each shown to the people who may use it). */
export function SocialTabs({ canWork, canConfigure }: { canWork: boolean; canConfigure: boolean }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/social" ? pathname === "/social" || pathname.startsWith("/social/posts") : pathname.startsWith(href));
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {TABS.filter((t) => (t.work && canWork) || (t.config && canConfigure)).map((t) => (
        <Link key={t.href} href={t.href} className={clsx("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[14px] font-medium", active(t.href) ? "border-electric text-ink" : "border-transparent text-muted hover:text-ink")}>
          <t.icon className="size-4" strokeWidth={1.9} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
