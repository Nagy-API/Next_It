import { getCurrentUser } from "@/server/auth";
import { can } from "@/domain/permissions";
import { addDays, isValidISODate, todayISO } from "@/lib/dates";
import { reportWorkbook, workbookResponse } from "@/server/export";

/** Excel of the Reports page (managers): People or Brands for a day / week / month. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can.seeReports(user)) return new Response("Only managers can export reports.", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const t = todayISO();
  const from = isValidISODate(sp.get("from")) ? sp.get("from")! : t;
  const to = isValidISODate(sp.get("to")) && sp.get("to")! >= from ? sp.get("to")! : from;
  const due = isValidISODate(sp.get("due")) ? sp.get("due")! : addDays(t, 3);
  if (from < addDays(t, -400)) return new Response("Pick a shorter period.", { status: 400 });
  const { wb, filename } = await reportWorkbook(sp.get("view") === "brands" ? "brands" : "people", from, to, due);
  return workbookResponse(wb, filename);
}
