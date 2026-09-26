import { addDays, isValidISODate, monthRange, shiftMonth, todayISO, weekRange } from "./dates";

export const RANGES = { week: "This week", month: "This month", last_month: "Last month", last_30: "Last 30 days" } as const;
export type RangeKey = keyof typeof RANGES | "custom";

export function resolveRange(sp: Record<string, string | string[] | undefined>): { key: RangeKey; from: string; to: string } {
  const today = todayISO();
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const key = (get("range") || "month") as RangeKey;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (key === "custom" && isValidISODate(get("from")) && isValidISODate(get("to")) && get("from") <= get("to")) return { key, from: get("from"), to: get("to") };
  if (key === "week") return { key, ...weekRangeTo(today) };
  if (key === "last_month") {
    const p = shiftMonth(y, m, -1);
    const r = monthRange(p.year, p.month);
    return { key, from: r.start, to: r.end };
  }
  if (key === "last_30") return { key, from: addDays(today, -29), to: today };
  const r = monthRange(y, m);
  return { key: "month", from: r.start, to: r.end };
}

function weekRangeTo(today: string) {
  const w = weekRange(today);
  return { from: w.start, to: w.end };
}
