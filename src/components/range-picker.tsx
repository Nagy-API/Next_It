"use client";

import clsx from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { RANGES, type RangeKey } from "@/lib/ranges";
import { DateInput } from "@/components/date-input";

export function RangePicker({ current, from, to, keep }: { current: RangeKey; from: string; to: string; /** Other query params to keep (e.g. the Reports tab). */ keep?: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [custom, setCustom] = useState({ from, to });
  const extra = keep ? Object.entries(keep).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("") : "";
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <div className="flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-card [scrollbar-width:none]">
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
          <button key={k} type="button" onClick={() => router.push(`${pathname}?range=${k}${extra}`)} className={clsx("shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium", current === k ? "bg-strong text-white" : "text-muted hover:text-ink")}>
            {RANGES[k]}
          </button>
        ))}
      </div>
      <form
        className={clsx("flex max-w-full items-center gap-1.5 rounded-xl border bg-surface p-1 pl-2 shadow-card", current === "custom" ? "border-electric" : "border-line")}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`${pathname}?range=custom&from=${custom.from}&to=${custom.to}${extra}`);
        }}
      >
        <DateInput value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} size="sm" className="w-[128px] sm:w-[140px]" aria-label="From" />
        <span className="text-muted">→</span>
        <DateInput value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} size="sm" className="w-[128px] sm:w-[140px]" aria-label="To" />
        <button className="rounded-lg bg-canvas px-2.5 py-1.5 text-[13px] font-medium hover:bg-line">Apply</button>
      </form>
    </div>
  );
}
