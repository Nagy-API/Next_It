"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { DateInput } from "@/components/date-input";
import { formatDay } from "@/lib/dates";

/** "Important: due by …" — quick picks (tomorrow, 3 days, a week) or any day. */
export function DueByPicker({ value, today, hrefFor }: { value: string; today: string; hrefFor: { d: string; href: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="font-medium text-ink-2">Important: due by</span>
      {hrefFor.map(({ d, href }, i) => (
        <Link key={d} href={href} className={clsx("rounded-full border px-3 py-1 font-medium", value === d ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-ink-2 hover:border-line-strong")}>
          {i === 0 ? "Tomorrow" : i === 1 ? "3 days" : "A week"}
        </Link>
      ))}
      <DateInput
        value={value}
        min={today}
        onChange={(v) => {
          if (!v) return;
          const p = new URLSearchParams(sp.toString());
          p.set("due", v);
          router.push(`/reports?${p}`);
        }}
        size="sm"
        className="w-[150px]"
        aria-label="Due by"
      />
      <span className="text-muted">{formatDay(value)}</span>
    </div>
  );
}
