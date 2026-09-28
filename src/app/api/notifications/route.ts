import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getWorkItems } from "@/server/queries";
import { alertsFor, getNotifications } from "@/server/stats";
import { getTasksFor } from "@/server/tasks";

export const dynamic = "force-dynamic";

/** Polled by the bell: stored notifications + live reminders (late, due soon, posting soon). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Signed out" }, { status: 401 });
  const [{ rows, unread }, open, tasks] = await Promise.all([getNotifications(user.id), getWorkItems({}), getTasksFor(user.id)]);
  return NextResponse.json(
    {
      unread,
      notifications: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), read: !!r.readAt })),
      alerts: alertsFor(open, user, tasks),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
