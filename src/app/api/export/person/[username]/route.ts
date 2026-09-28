import { getCurrentUser } from "@/server/auth";
import { isManager } from "@/domain/permissions";
import { personWorkbook, workbookResponse } from "@/server/export";

/** Excel report for one person: month by month, finished steps, work on them now. Yourself, or anyone for managers. */
export async function GET(_: Request, ctx: RouteContext<"/api/export/person/[username]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const { username } = await ctx.params;
  if (username !== user.username && !isManager(user)) return new Response("You can only export your own report.", { status: 403 });
  const r = await personWorkbook(username);
  if (!r) return new Response("Not found.", { status: 404 });
  return workbookResponse(r.wb, r.filename);
}
