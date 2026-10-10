"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

export type FilterDef = { name: string; label: string; options: { value: string; label: string }[] };

/** Dropdown filters that live in the URL, so any filtered view can be shared or bookmarked. */
export function FilterBar({ filters }: { filters: FilterDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (name: string, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(name, value);
    else p.delete(name);
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  };
  const active = filters.some((f) => sp.get(f.name));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        const v = sp.get(f.name) ?? "";
        return (
          <select
            key={f.name}
            value={v}
            onChange={(e) => set(f.name, e.target.value)}
            aria-label={f.label}
            className={`field field-sm h-9 w-auto cursor-pointer pr-8 ${v ? "border-electric bg-electric-soft font-medium text-[#1d5fd1]" : ""}`}
          >
            <option value="">{f.label}: All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      })}
      {active && (
        <button type="button" onClick={() => router.push(pathname)} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] text-muted hover:bg-surface hover:text-ink">
          <X className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
