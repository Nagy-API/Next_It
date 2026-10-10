"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export type SettingsTab = "workspace" | "messages" | "access" | "brands" | "people" | "platforms" | "account";
const TABS: { key: SettingsTab; href: string; label: string }[] = [
  { key: "workspace", href: "/settings/workspace", label: "Workspace" },
  { key: "messages", href: "/settings/messages", label: "Messages" },
  { key: "access", href: "/settings/access", label: "Access" },
  { key: "brands", href: "/settings/brands", label: "Brands" },
  { key: "people", href: "/settings/people", label: "People" },
  { key: "platforms", href: "/settings/platforms", label: "Platforms" },
  { key: "account", href: "/settings/account", label: "My account" },
];

export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {TABS.filter((t) => tabs.includes(t.key)).map((t) => (
        <Link key={t.href} href={t.href} className={clsx("-mb-px shrink-0 border-b-2 px-3 py-2 text-[14px] font-medium", pathname.startsWith(t.href) ? "border-electric text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
