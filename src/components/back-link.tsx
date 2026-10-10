"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * "Always remember where I was": every page visited in this tab is kept in a short trail (sessionStorage).
 * The Back link on an item / task goes to the page you really came from (Reports, My tasks, a search…) —
 * with the browser's own Back, so the page opens at the same scroll position. No trail → the usual parent page.
 */
const KEY = "nexora:trail";

function readTrail(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Mounted once in the shell: records each page. Going back pops instead of pushing. */
export function NavTrail() {
  const pathname = usePathname();
  const search = useSearchParams();
  const url = `${pathname}${search.size ? `?${search}` : ""}`;
  useEffect(() => {
    try {
      const t = readTrail();
      if (t.at(-1) === url) return;
      if (t.at(-2) === url) t.pop();
      else t.push(url);
      sessionStorage.setItem(KEY, JSON.stringify(t.slice(-30)));
    } catch {
      /* storage off: Back falls back to the parent page */
    }
  }, [url]);
  return null;
}

const NAMES: [RegExp, string][] = [
  [/^\/my-work/, "My tasks"],
  [/^\/overview/, "Overview"],
  [/^\/reports/, "Reports"],
  [/^\/stats/, "Dashboard"],
  [/^\/activity/, "Activity log"],
  [/^\/work/, "Open work"],
  [/^\/search/, "Search"],
  [/^\/shoots/, "Shoot schedule"],
  [/^\/chat/, "Team chat"],
  [/^\/team\/[^/]+/, "their numbers"],
  [/^\/team/, "Team"],
  [/^\/quick/, "Quick update"],
  [/^\/brands\/[^/]+/, "the brand"],
  [/^\/brands/, "Brands"],
  [/^\/projects/, "Projects"],
  [/^\/items\//, "the previous item"],
  [/^\/spaces\/[^/]+\/t\//, "the previous task"],
  [/^\/spaces/, "the space"],
  [/^\/dashboards/, "Dashboards"],
];

export function BackLink({ fallback, label, children }: { fallback: string; label: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [prev, setPrev] = useState<string | null>(null);
  useEffect(() => {
    const t = readTrail();
    const here = t.lastIndexOf(t.findLast((u) => u.split("?")[0] === pathname) ?? "");
    const p = here > 0 ? t[here - 1] : null;
    // Coming from the parent itself? Then the normal link says it best.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrev(p && p.split("?")[0] !== fallback.split("?")[0] ? p : null);
  }, [pathname, fallback]);
  if (prev) {
    const name = NAMES.find(([re]) => re.test(prev))?.[1] ?? "where you were";
    return (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <button type="button" onClick={() => router.back()} className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-electric hover:underline">
          <ArrowLeft className="size-4" /> Back to {name}
        </button>
        <Link href={fallback} className="inline-flex items-center gap-1.5 text-muted hover:text-electric">
          {children}
          {label}
        </Link>
      </span>
    );
  }
  return (
    <Link href={fallback} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
      <ArrowLeft className="size-4" />
      {children}
      {label}
    </Link>
  );
}
