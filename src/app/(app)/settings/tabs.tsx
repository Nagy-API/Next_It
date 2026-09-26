"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/settings/brands", label: "Brands" },
  { href: "/settings/people", label: "People" },
  { href: "/settings/platforms", label: "Platforms" },
  { href: "/settings/account", label: "My account" },
];

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line">
      {TABS.filter((t) => isAdmin || t.href === "/settings/account").map((t) => (
        <Link key={t.href} href={t.href} className={clsx("-mb-px border-b-2 px-3 py-2 text-[14px] font-medium", pathname.startsWith(t.href) ? "border-electric text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
