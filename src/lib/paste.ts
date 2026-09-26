/**
 * Turns a pasted list (from Canva page titles, the old Excel sheet, WhatsApp, anything) into item rows.
 * Each line becomes one item. Within a line we pick out: a link, a date, a time, a type word; the rest is the title.
 */
import type { ContentType } from "@/db/schema";
import { guessTypeFromTitle, parseContentType } from "@/domain/workflow";

export type ParsedRow = { title: string; type: ContentType; postingDate: string; postingTime: string; canvaUrl: string; typeGuessed: boolean };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Finds a date inside a string. Day-first (Egyptian) for numeric dates. `defaultYear/Month` fill gaps. */
export function findDate(s: string, defaultYear: number, defaultMonth: number): { iso: string; match: string } | null {
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
  if (m) {
    const iso = validDate(+m[1], +m[2], +m[3]);
    if (iso) return { iso, match: m[0] };
  }
  m = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/.exec(s);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : defaultYear;
    // Day-first is the local convention; month-first (US Excel exports) wins when only it fits,
    // or when only it lands in the month being planned.
    const dayFirst = validDate(y, +m[2], +m[1]);
    const monthFirst = validDate(y, +m[1], +m[2]);
    const iso = dayFirst && monthFirst ? (+m[2] !== defaultMonth && +m[1] === defaultMonth ? monthFirst : dayFirst) : (dayFirst ?? monthFirst);
    if (iso) return { iso, match: m[0] };
  }
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i.exec(s);
  if (m) {
    const iso = validDate(m[3] ? +m[3] : defaultYear, MONTHS[m[2].toLowerCase()], +m[1]);
    if (iso) return { iso, match: m[0] };
  }
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i.exec(s);
  if (m) {
    const iso = validDate(m[3] ? +m[3] : defaultYear, MONTHS[m[1].toLowerCase()], +m[2]);
    if (iso) return { iso, match: m[0] };
  }
  // "Day 11" or a bare day number in its own cell, e.g. "11"
  m = /(?:^|\t)\s*(?:day\s*)?(\d{1,2})\s*(?:\t|$)/i.exec(s);
  if (m) {
    const iso = validDate(defaultYear, defaultMonth, +m[1]);
    if (iso) return { iso, match: m[0] };
  }
  return null;
}

export function parsePastedList(text: string, defaultYear: number, defaultMonth: number): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (/^(off|day off|—|-)$/i.test(line.replace(/\t/g, " ").trim()) || /^off(\s|\t|$)/i.test(line)) continue;

    let canvaUrl = "";
    const url = /(https?:\/\/\S+|(?:www\.)?canva\.(?:com|link)\/\S+)/i.exec(line);
    if (url) {
      canvaUrl = url[0].replace(/[),.;]+$/, "");
      line = line.replace(url[0], "\t");
    }
    let postingTime = "";
    const time = /\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/i.exec(line);
    if (time) {
      let h = +time[1];
      if (time[3]?.toLowerCase() === "pm" && h < 12) h += 12;
      if (time[3]?.toLowerCase() === "am" && h === 12) h = 0;
      postingTime = `${pad(h)}:${time[2]}`;
      line = line.replace(time[0], "\t");
    }
    // When a line has several dates (e.g. copied Excel rows with delivery + posting date), the last one is the posting date.
    let postingDate = "";
    for (let date = findDate(line, defaultYear, defaultMonth); date; date = findDate(line, defaultYear, defaultMonth)) {
      postingDate = date.iso;
      line = line.replace(date.match, "\t");
    }
    // Explicit type in its own cell/word ("Reel", "Carousel"…)
    let type: ContentType | null = null;
    const cells = line.split(/\t|\s{2,}|\s\|\s|\|/).map((c) => c.trim()).filter(Boolean);
    const titleCells: string[] = [];
    for (const c of cells) {
      const t = parseContentType(c);
      if (t && !type) type = t;
      else titleCells.push(c);
    }
    const title = titleCells
      .join(" ")
      .replace(/^\s*[-•*]\s*/, "")
      .replace(/^\s*\d{1,3}[.)]\s+/, "")
      .trim();
    if (!title) continue;
    const guessed = guessTypeFromTitle(title);
    rows.push({ title, type: type ?? guessed ?? "reel", postingDate, postingTime, canvaUrl, typeGuessed: !type });
  }
  return rows;
}
