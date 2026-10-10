/** Shoot times: "14:00–16:00" from a start and an end (or the older "how long" choice). Pure, no database. */
import { addDays, dayOfWeek, fromCairoLocal } from "@/lib/dates";

export const DURATION_MIN: Record<string, number> = { "30 min": 30, "1 hour": 60, "2 hours": 120, "3 hours": 180, "4 hours": 240, "Half day": 240, "Full day": 480 };

/** "14:00–16:00", from the start and the end time (or the old "how long"). */
export function shootSpan(i: { shootTime: string | null; shootEndTime: string | null; shootDuration: string | null }) {
  const end = i.shootEndTime ?? (i.shootTime && i.shootDuration && DURATION_MIN[i.shootDuration] ? addMinutes(i.shootTime, DURATION_MIN[i.shootDuration]) : null);
  return i.shootTime ? (end ? `${i.shootTime}–${end}` : `from ${i.shootTime}`) : "";
}

export function addMinutes(hhmm: string, m: number) {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + mm + m);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** The shoot's time window as instants (for counting the time of a shoot nobody clocked). */
export function shootWindow(i: { shootDate: string | null; shootTime: string | null; shootEndTime: string | null; shootDuration: string | null }) {
  if (!i.shootDate || !i.shootTime) return null;
  const span = shootSpan(i);
  const end = span.includes("–") ? span.split("–")[1] : null;
  if (!end) return null;
  const start = fromCairoLocal(`${i.shootDate}T${i.shootTime}`);
  const stop = fromCairoLocal(`${i.shootDate}T${end}`);
  return start && stop && stop > start ? { start, end: stop } : null;
}

/** The Saturday that starts this week (the agency's week runs Saturday to Friday). */
export function weekStart(iso: string) {
  return addDays(iso, -((dayOfWeek(iso) + 1) % 7));
}
