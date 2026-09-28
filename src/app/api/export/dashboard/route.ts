import { getCurrentUser } from "@/server/auth";
import { can } from "@/domain/permissions";
import { parseMonthKey, todayISO } from "@/lib/dates";
import { dashboardWorkbook, workbookResponse } from "@/server/export";

/** Excel report of the Dashboard for one month (managers). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can.seeDashboard(user)) return new Response("Only managers can export the dashboard.", { status: 403 });
  const t = todayISO();
  const sel = parseMonthKey(new URL(req.url).searchParams.get("m")) ?? { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
  const { wb, filename } = await dashboardWorkbook(sel.year, sel.month);
  return workbookResponse(wb, filename);
}
