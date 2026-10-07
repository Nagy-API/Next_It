/** Excel reports (Dashboard for a month, one person's numbers). Built with exceljs, styled with the company name. */
import "server-only";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentPlans, users } from "@/db/schema";
import { STAGE_META, TEAM_META, TYPE_META, finalLabel } from "@/domain/workflow";
import { cairoDate, formatDateTime, monthLabel, monthRange, todayISO } from "@/lib/dates";
import { getDashboard, personPerMonth } from "./stats";
import { BRAND as brand } from "@/config/brand";
import { getPersonCompletions, getPersonWork, getWorkItems, type WorkItem } from "./queries";

const NAVY = `FF${brand.colors.dark.slice(1).toUpperCase()}`;
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "report";
const BLUE = `FF${brand.colors.primary.slice(1).toUpperCase()}`;
const SOFT = "FFEFF5FF";

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns;
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle" };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

function zebra(ws: ExcelJS.Worksheet) {
  ws.eachRow((row, i) => {
    if (i > 1 && i % 2 === 0) row.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } }));
  });
}

function pct(done: number, total: number) {
  return total ? done / total : null;
}

function link(url: string | null | undefined, text: string) {
  return url ? { text, hyperlink: url } : "";
}

function itemRow(i: WorkItem) {
  const cur = i.current;
  const st = (k: string) => i.stages.find((s) => s.kind === k);
  const content = st("content");
  const versions = i.versions;
  const lastApproved = [...versions].reverse().find((v) => v.status === "approved");
  return {
    brand: i.brand?.name ?? (i.project ? `${i.project.clientName} · ${i.project.name}` : ""),
    slide: i.slideNumber ?? "",
    title: i.title,
    type: TYPE_META[i.type].label,
    posting: i.postingDate ?? "",
    time: i.postingTime ?? "",
    status: i.cancelledAt ? "Deleted" : i.completedAt ? finalLabel(i.context) : cur ? STAGE_META[cur.kind].label : "",
    progress: cur ? { not_started: "Not started", processing: "In progress", adjusting: "Adjusting", waiting_approval: "Waiting approval" }[cur.progress] : "",
    withWho: cur?.assignee?.name ?? (cur ? `${STAGE_META[cur.kind].label} team` : ""),
    deadline: cur?.deadline ?? "",
    late: cur?.health === "overdue" ? "LATE" : "",
    contentBy: content?.assignee?.name ?? content?.completedBy?.name ?? "",
    contentDone: content?.completedAt ? formatDateTime(content.completedAt) : "",
    shoot: i.shoot.date ? `${i.shoot.date}${i.shoot.time ? ` ${i.shoot.time}` : ""}${i.shoot.duration ? ` · ${i.shoot.duration}` : ""}` : "",
    versions: versions.length || "",
    approved: lastApproved ? `v${lastApproved.number} · ${lastApproved.reviewedBy?.name ?? ""} · ${lastApproved.reviewedAt ? formatDateTime(lastApproved.reviewedAt) : ""}` : "",
    finished: i.completedAt ? formatDateTime(i.completedAt) : "",
    platforms: i.platforms.filter((p) => p.status === "published").map((p) => p.name).join(", "),
    canva: link(i.canvaLink, "Canva"),
    drive: link(i.driveUrl, "Drive"),
  };
}

const ITEM_COLUMNS = [
  { header: "Brand / client", key: "brand", width: 22 },
  { header: "Slide", key: "slide", width: 7 },
  { header: "Title", key: "title", width: 38 },
  { header: "Type", key: "type", width: 10 },
  { header: "Posting date", key: "posting", width: 13 },
  { header: "Time", key: "time", width: 8 },
  { header: "Status / step", key: "status", width: 18 },
  { header: "Progress", key: "progress", width: 16 },
  { header: "With", key: "withWho", width: 18 },
  { header: "Step deadline", key: "deadline", width: 13 },
  { header: "Late", key: "late", width: 7 },
  { header: "Content by", key: "contentBy", width: 14 },
  { header: "Content delivered", key: "contentDone", width: 20 },
  { header: "Shoot", key: "shoot", width: 22 },
  { header: "Versions", key: "versions", width: 9 },
  { header: "Approved", key: "approved", width: 30 },
  { header: "Finished", key: "finished", width: 20 },
  { header: "Live on", key: "platforms", width: 20 },
  { header: "Canva", key: "canva", width: 9 },
  { header: "Drive", key: "drive", width: 9 },
];

function styleItemSheet(ws: ExcelJS.Worksheet) {
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const late = row.getCell("late");
    if (late.value === "LATE") late.font = { bold: true, color: { argb: "FFD92D20" } };
    for (const k of ["canva", "drive"]) {
      const c = row.getCell(k);
      if (c.value) c.font = { color: { argb: BLUE }, underline: true };
    }
  });
}

export async function dashboardWorkbook(year: number, month: number) {
  const d = await getDashboard(year, month);
  const plans = await db.select({ id: contentPlans.id }).from(contentPlans).where(and(eq(contentPlans.year, year), eq(contentPlans.month, month)));
  const items = await getWorkItems({ planIds: plans.map((p) => p.id), includeDone: true });
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.appName;
  wb.created = new Date();

  const sum = sheet(wb, "Summary", [
    { header: `${brand.name} · ${d.label}`, key: "k", width: 34 },
    { header: "This month", key: "v", width: 14 },
    { header: d.prevLabel, key: "p", width: 14 },
  ]);
  sum.addRows([
    { k: "Planned items", v: d.totals.total, p: d.totals.prevTotal },
    { k: "Published", v: d.totals.published, p: d.totals.prevPublished },
    { k: "Still in progress", v: d.totals.inProgress, p: "" },
    { k: "Late right now (all brands)", v: d.totals.late, p: "" },
    { k: "Published %", v: pct(d.totals.published, d.totals.total), p: pct(d.totals.prevPublished, d.totals.prevTotal) },
    {},
    ...d.departments.map((t) => ({ k: `${t.label}: done / tasks`, v: `${t.done} / ${t.tasks}`, p: "" })),
    {},
    { k: `Exported ${formatDateTime(new Date())} (Cairo time)`, v: "", p: "" },
  ]);
  sum.getRow(6).eachCell((c) => (c.numFmt = "0%"));

  const brands = sheet(wb, "Brands", [
    { header: "Brand", key: "brand", width: 24 },
    { header: "Planned", key: "total", width: 10 },
    { header: "Published", key: "published", width: 11 },
    { header: "Extra tasks", key: "extra", width: 11 },
    { header: "Changes requested", key: "changes", width: 16 },
    { header: "Sent back", key: "sentBack", width: 10 },
    { header: "In content", key: "content", width: 11 },
    { header: "In production", key: "production", width: 13 },
    { header: "With Social", key: "social", width: 11 },
    { header: "Late now", key: "late", width: 10 },
    { header: "Media done", key: "md", width: 11 },
    { header: "Media tasks", key: "mt", width: 11 },
    { header: "Media %", key: "mp", width: 9 },
    { header: "Design done", key: "dd", width: 11 },
    { header: "Design tasks", key: "dt", width: 11 },
    { header: "Design %", key: "dp", width: 9 },
    { header: "Social done", key: "sd", width: 11 },
    { header: "Social tasks", key: "st", width: 11 },
    { header: "Social %", key: "spc", width: 9 },
  ]);
  for (const r of d.rows) {
    brands.addRow({
      brand: r.brand.name,
      total: r.total,
      published: r.published,
      extra: r.extra,
      changes: r.changes,
      sentBack: r.sentBack,
      content: r.content,
      production: r.production,
      social: r.social,
      late: r.late,
      md: r.media.done,
      mt: r.media.tasks,
      mp: pct(r.media.done, r.media.tasks),
      dd: r.design.done,
      dt: r.design.tasks,
      dp: pct(r.design.done, r.design.tasks),
      sd: r.socialDept.done,
      st: r.socialDept.tasks,
      spc: pct(r.socialDept.done, r.socialDept.tasks),
    });
  }
  for (const k of ["mp", "dp", "spc"]) brands.getColumn(k).numFmt = "0%";
  zebra(brands);

  const people = sheet(wb, "People", [
    { header: "Person", key: "name", width: 18 },
    { header: "Team", key: "team", width: 26 },
    { header: `Done in ${d.label}`, key: "done", width: 16 },
    { header: `Done in ${d.prevLabel}`, key: "prev", width: 16 },
    { header: "Late (first pass)", key: "late", width: 15 },
    { header: "On time %", key: "rate", width: 11 },
    { header: "On them now", key: "open", width: 13 },
    { header: "Late now", key: "lateNow", width: 10 },
  ]);
  for (const p of d.people) {
    people.addRow({
      name: p.person.name,
      team: p.person.teams.map((t) => TEAM_META[t].label).join(", "),
      done: p.done,
      prev: p.donePrev,
      late: p.late,
      rate: p.onTimeRate === null ? "" : p.onTimeRate / 100,
      open: p.openNow,
      lateNow: p.lateNow,
    });
  }
  people.getColumn("rate").numFmt = "0%";
  zebra(people);

  const its = sheet(wb, "Items", ITEM_COLUMNS);
  for (const i of items) its.addRow(itemRow(i));
  styleItemSheet(its);
  zebra(its);

  return { wb, filename: `${fileSafe(brand.name)}-dashboard-${year}-${String(month).padStart(2, "0")}.xlsx` };
}

export async function personWorkbook(username: string) {
  const [u] = await db.select().from(users).where(eq(users.username, username));
  if (!u) return null;
  const today = todayISO();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const from = monthRange(...(m > 5 ? ([y, m - 5] as const) : ([y - 1, m + 7] as const))).start;
  const [months, completions, work] = await Promise.all([personPerMonth(u.id, y, m, 6), getPersonCompletions(u.id, from, today), getPersonWork(u.id, today)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.appName;

  const mm = sheet(wb, "Month by month", [
    { header: "Month", key: "month", width: 18 },
    { header: "Steps finished", key: "done", width: 15 },
    { header: "Late (first pass)", key: "late", width: 16 },
    { header: "On time %", key: "rate", width: 11 },
  ]);
  for (const p of months) mm.addRow({ month: monthLabel(p.year, p.month), done: p.value, late: p.late, rate: p.value ? (p.value - p.late) / p.value : "" });
  mm.getColumn("rate").numFmt = "0%";
  zebra(mm);

  const done = sheet(wb, "Finished", [
    { header: "Finished at", key: "at", width: 20 },
    { header: "Step", key: "step", width: 18 },
    { header: "Title", key: "title", width: 38 },
    { header: "Brand / client", key: "brand", width: 22 },
    { header: "Deadline", key: "deadline", width: 12 },
    { header: "Late days", key: "late", width: 10 },
    { header: "Round", key: "round", width: 8 },
    { header: "Exception", key: "exc", width: 10 },
  ]);
  for (const c of completions) {
    done.addRow({
      at: formatDateTime(c.completedAt),
      step: STAGE_META[c.kind].label,
      title: c.title,
      brand: c.brandName ?? c.clientName ?? "",
      deadline: c.deadline ?? "",
      late: c.lateDays || "",
      round: c.round,
      exc: c.excused ? "yes" : "",
    });
  }
  zebra(done);

  const open = sheet(wb, "On them now", ITEM_COLUMNS);
  for (const i of work.now) open.addRow(itemRow(i));
  styleItemSheet(open);
  zebra(open);

  return { wb, filename: `${fileSafe(brand.name)}-${u.username}-${cairoDate(new Date())}.xlsx`, name: u.name };
}

export async function workbookResponse(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
