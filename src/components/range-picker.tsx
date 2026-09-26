"use client";

import clsx from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { RANGES, type RangeKey } from "@/lib/ranges";

export function RangePicker({ current, from, to }: { current: RangeKey; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [custom, setCustom] = useState({ from, to });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl border border-line bg-white p-1 shadow-card">
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
          <button key={k} type="button" onClick={() => router.push(`${pathname}?range=${k}`)} className={clsx("rounded-lg px-3 py-1.5 text-[13px] font-medium", current === k ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>
            {RANGES[k]}
          </button>
        ))}
      </div>
      <form
        className={clsx("flex items-center gap-1.5 rounded-xl border bg-white p-1 pl-2 shadow-card", current === "custom" ? "border-electric" : "border-line")}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`${pathname}?range=custom&from=${custom.from}&to=${custom.to}`);
        }}
      >
        <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="field field-sm h-8 w-[140px] border-0" aria-label="From" />
        <span className="text-muted">→</span>
        <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="field field-sm h-8 w-[140px] border-0" aria-label="To" />
        <button className="rounded-lg bg-canvas px-2.5 py-1.5 text-[13px] font-medium hover:bg-line">Apply</button>
      </form>
    </div>
  );
}
