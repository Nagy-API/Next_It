/**
 * Turns the old Excel "Content tracker" into src/server/seed-data/tracker.generated.ts, which the server imports once
 * on start (src/server/tracker-import.ts) — every brand tab, with each item's real state: content delivered, shoot date,
 * editing / design versions (done = approved, waiting approval = sent), and what was posted with its live links.
 *
 *   node scripts/tracker-to-seed.mjs "Content tracker.xlsx"
 *
 * Tabs are matched to brands by name; "OFF" rows (rest days) and the Dashboard tab are skipped.
 */
import fs from "node:fs";
import ExcelJS from "exceljs";

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/tracker-to-seed.mjs "Content tracker.xlsx"');
  process.exit(1);
}

/** Tab name → brand name in the system. */
const TABS = {
  nexora: "NEXORA",
  "og.hub": "OG Hub",
  blissify: "Blissify",
  "blissify academy": "Blissify Academy",
  "vanilla rose": "Vanilla Roza",
  "enlighten by shahenda": "Enlighten by Shahenda",
};
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const text = (v) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString();
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.text !== undefined) return typeof v.text === "object" ? text(v.text) : String(v.text);
    if ("result" in v) return text(v.result);
    return "";
  }
  return String(v);
};
const link = (v) => {
  if (v && typeof v === "object" && v.hyperlink) return v.hyperlink;
  const t = text(v).trim();
  return /^https?:\/\//i.test(t) ? t : null;
};
/** Excel dates → YYYY-MM-DD. A few cells were typed day/month swapped (10/01 for 1 Oct) — fixed when that's clearly the case. */
const day = (v, min) => {
  if (!(v instanceof Date)) return null;
  let d = v;
  if (min && d < min && d.getUTCDate() <= 12) d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCDate() - 1, d.getUTCMonth() + 1));
  return d.toISOString().slice(0, 10);
};
/** Tidy a title: trim, single spaces, drop a stray unmatched quote at either end. */
const cleanTitle = (t) => {
  let s = t.replace(/\s+/g, " ").trim();
  const open = (s.match(/[“"]/g) || []).length;
  const close = (s.match(/[”"]/g) || []).length;
  if (/[”"]$/.test(s) && close > open) s = s.slice(0, -1).trim();
  if (/^[“"]/.test(s) && open > close) s = s.slice(1).trim();
  return s;
};
const status = (v) => {
  const t = text(v).trim().toLowerCase();
  if (!t) return null;
  if (t === "done") return "done";
  if (t.startsWith("waiting")) return "waiting_approval";
  if (t.startsWith("process")) return "processing";
  if (t.startsWith("adjust")) return "adjusting";
  if (t === "posted") return "posted";
  return null;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const out = [];
for (const ws of wb.worksheets) {
  const brand = TABS[ws.name.trim().toLowerCase()];
  if (!brand) continue;
  const items = [];
  let monthName = null;
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const c = (n) => row.getCell(n).value;
    const rawTitle = text(c(2)).trim();
    const posting = day(c(6));
    const stage = text(c(7)).trim().toLowerCase();
    if (rawTitle.toUpperCase() === "OFF") return; // rest day
    if (!posting || !(stage.startsWith("media") || stage.startsWith("graphic"))) return; // empty template row
    const m = text(c(1)).trim().toLowerCase();
    if (MONTHS.includes(m)) monthName = m;
    const minDate = new Date(Date.UTC(Number(posting.slice(0, 4)), Number(posting.slice(5, 7)) - 2, 1));
    const isDesign = stage.startsWith("graphic");
    const title = rawTitle ? cleanTitle(rawTitle) : `Untitled ${isDesign ? "design" : "video"} · ${posting.slice(8)}/${posting.slice(5, 7)}`;
    const lc = title.toLowerCase();
    const type = isDesign ? (/carou?sel/.test(lc) ? "carousel" : "static") : "reel";
    const platforms = Object.fromEntries(
      [["instagram", 21], ["tiktok", 22], ["facebook", 23], ["linkedin", 24]].map(([k, n]) => [k, link(c(n))]).filter(([, v]) => v),
    );
    items.push({
      title,
      type,
      canvaUrl: link(c(3)),
      contentDelivered: day(c(4), minDate),
      contentComment: text(c(5)).trim() || null,
      postingDate: posting,
      shootDate: isDesign ? null : day(c(9), minDate),
      production: isDesign
        ? { status: status(c(13)), url: link(c(15)), delivered: day(c(16), minDate), comment: text(c(17)).trim() || null }
        : { status: status(c(8)), url: link(c(10)), delivered: day(c(11), minDate), comment: text(c(12)).trim() || null },
      posted: status(c(18)) === "posted" ? { date: day(c(19), minDate), platforms } : Object.keys(platforms).length ? { date: null, platforms } : null,
    });
  });
  if (!items.length) continue;
  const first = items[0].postingDate;
  const month = monthName ? MONTHS.indexOf(monthName) + 1 : Number(first.slice(5, 7));
  out.push({ brand, year: Number(first.slice(0, 4)), month, items });
}

const body = `// Generated by scripts/tracker-to-seed.mjs from the Excel content tracker — do not edit by hand.
import type { TrackerBrand } from "../tracker-import";

export const TRACKER: TrackerBrand[] = ${JSON.stringify(out, null, 2)};
`;
fs.mkdirSync("src/server/seed-data", { recursive: true });
fs.writeFileSync("src/server/seed-data/tracker.generated.ts", body);
for (const b of out) console.log(`✓ ${b.brand} ${b.year}-${String(b.month).padStart(2, "0")}: ${b.items.length} items`);
