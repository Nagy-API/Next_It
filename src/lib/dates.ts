/**
 * Date handling.
 *
 * - Moments in time (completions, comments, log entries) are stored as timestamptz (UTC).
 * - Calendar days (deadlines, posting dates) are stored as plain `date` strings "YYYY-MM-DD".
 * - Everything is displayed, and "today" is decided, in NEXORA's timezone (Cairo).
 */
export const TIMEZONE = "Africa/Cairo";

const isoFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar day (YYYY-MM-DD) of an instant, in Cairo. */
export function cairoDate(d: Date): string {
  return isoFmt.format(d);
}

export function todayISO(now: Date = new Date()): string {
  return cairoDate(now);
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Same day next month (clamped to the month's last day: Jan 31 → Feb 28). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return toISO(target);
}

/** Whole days from `b` to `a` (a - b). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000);
}

export function isValidISODate(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = parseISO(v);
  return !Number.isNaN(d.getTime()) && toISO(d) === v;
}

export function isValidTime(v: string | null | undefined): v is string {
  return !!v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Saturday-first week (Egyptian convention) containing `iso`. */
export function weekRange(iso: string): { start: string; end: string } {
  const dow = parseISO(iso).getUTCDay(); // 0 = Sunday … 6 = Saturday
  const offset = (dow + 1) % 7; // days since Saturday
  const start = addDays(iso, -offset);
  return { start, end: addDays(start, 6) };
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = toISO(new Date(Date.UTC(year, month, 0)));
  return { start, end };
}

export function monthOf(iso: string): { year: number; month: number } {
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month: m };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(key: string | undefined | null): { year: number; month: number } | null {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return null;
  const [y, m] = key.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { year: y, month: m };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthName(month: number, short = false): string {
  return (short ? MONTHS_SHORT : MONTHS)[month - 1];
}

export function monthLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

export function dayOfWeek(iso: string): number {
  return parseISO(iso).getUTCDay();
}

/** "Sun 11 Oct" (adds the year when it differs from `refYear`). */
export function formatDay(iso: string | null | undefined, opts: { weekday?: boolean; refYear?: number } = {}): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  const parts = [
    opts.weekday === false ? null : DAYS_SHORT[d.getUTCDay()],
    `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`,
  ].filter(Boolean);
  const refYear = opts.refYear ?? Number(todayISO().slice(0, 4));
  if (d.getUTCFullYear() !== refYear) parts.push(String(d.getUTCFullYear()));
  return parts.join(" ");
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "22 Sep 2026, 14:05" in Cairo time. */
export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return dateTimeFmt.format(d);
}

/** "12 min ago", "3 h ago", "Yesterday 14:05", "22 Sep, 14:05". */
export function formatRelative(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 12) return `${hours} h ago`;
  const days = diffDays(todayISO(now), cairoDate(d));
  const time = formatTime(d);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${formatDay(cairoDate(d), { weekday: false })}, ${time}`;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

/** "Due in 3 days", "Due today", "2 days late". */
export function relativeDays(iso: string, today = todayISO()): { days: number; label: string } {
  const days = diffDays(iso, today);
  if (days === 0) return { days, label: "today" };
  if (days === 1) return { days, label: "tomorrow" };
  if (days === -1) return { days, label: "yesterday" };
  if (days > 0) return { days, label: `in ${days} days` };
  return { days, label: `${-days} days ago` };
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "longOffset" });
function cairoOffsetMinutes(at: Date): number {
  const name = offsetFmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT+02:00";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** The instant Cairo's calendar day `iso` begins (handles daylight saving). */
export function startOfCairoDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const guess = new Date(utcMidnight - cairoOffsetMinutes(new Date(utcMidnight)) * 60_000);
  return new Date(utcMidnight - cairoOffsetMinutes(guess) * 60_000);
}

/** Worked time: "35 min", "2h 10m", "1d 3h". */
export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "under 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

/** 09/10/2026 — day first, as everyone in the team writes it. */
export function formatDMY(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** An instant as a datetime-local value in Cairo ("2026-10-05T14:30"). */
export function toCairoLocal(d: Date): string {
  return `${cairoDate(d)}T${formatTime(d)}`;
}

/** A datetime-local value typed in Cairo time → the instant. null when it isn't one. */
export function fromCairoLocal(v: string | null | undefined): Date | null {
  const m = v?.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m || !isValidISODate(m[1])) return null;
  return new Date(startOfCairoDay(m[1]).getTime() + (Number(m[2]) * 60 + Number(m[3])) * 60_000);
}
