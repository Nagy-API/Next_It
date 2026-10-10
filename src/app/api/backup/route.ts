import { getCurrentUser } from "@/server/auth";
import { databaseMode, localClient } from "@/db";
import { logActivity } from "@/server/activity";
import { db } from "@/db";
import { can } from "@/domain/permissions";

/**
 * Admins: download a full backup of the built-in database (a .tar.gz of its data folder).
 * Taken inside the running app, so it's consistent. For a PostgreSQL server use `pg_dump` instead (see docs/DEPLOY-HOSTINGER.md).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can.downloadBackup(user)) return new Response("Only admins can download backups.", { status: 403 });
  if (databaseMode().kind !== "local") return new Response("This install uses a PostgreSQL server — back it up with pg_dump.", { status: 400 });
  const client = localClient()!;
  const file = await client.dumpDataDir("gzip");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  await logActivity(db, { id: user.id, name: user.name }, { action: "backup_downloaded", summary: `${user.name} downloaded a full backup.` });
  return new Response(file, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="ops-backup-${stamp}.tar.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
