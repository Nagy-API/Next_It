import { getCurrentUser } from "@/server/auth";
import { can } from "@/domain/permissions";
import { parseMonthKey, todayISO } from "@/lib/dates";
import { getBrandBySlug } from "@/server/queries";
import { planWorkbook, workbookResponse } from "@/server/export";

/** Excel of one brand's month plan: title, posting date, Canva slide link, final file, step… (?brand=slug&m=YYYY-MM). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can.exportPlan(user)) return new Response("You can't export plans.", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const brand = await getBrandBySlug(String(sp.get("brand") ?? "").slice(0, 80));
  if (!brand) return new Response("Brand not found.", { status: 404 });
  const t = todayISO();
  const m = parseMonthKey(sp.get("m")) ?? { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
  const { wb, filename } = await planWorkbook(brand, m.year, m.month);
  return workbookResponse(wb, filename);
}
