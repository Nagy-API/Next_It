"use client";

import { useEffect } from "react";
import { PartyPopper } from "lucide-react";
import { celebrate } from "@/components/celebrate";

/** Every planned post of the month is live: a warm thank-you, with confetti the first time each person sees it. */
export function MonthDone({ brand, color, month, total, keyId }: { brand: string; color: string; month: string; total: number; keyId: string }) {
  useEffect(() => {
    try {
      const k = `month-done:${keyId}`;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, "1");
    } catch {
      return;
    }
    const t = setTimeout(() => celebrate("big"), 400);
    return () => clearTimeout(t);
  }, [keyId]);
  return (
    <div className="mt-4 flex items-center gap-3.5 rounded-2xl border px-4 py-3.5" style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 9%, var(--color-surface))` }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: color }}>
        <PartyPopper className="size-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <div className="font-display text-[16px] font-bold text-ink">
          {month} is done for {brand}
        </div>
        <div className="text-[13px] text-ink-2">
          All {total} planned {total === 1 ? "post is" : "posts are"} live. Thank you, team.
        </div>
      </div>
    </div>
  );
}
