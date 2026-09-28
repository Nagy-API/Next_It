import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Avatar, Badge, ManagerChip } from "@/components/ui";
import { PhotoPicker } from "@/components/photo";
import { TEAM_META } from "@/domain/workflow";
import { requireUser } from "@/server/auth";
import { getPeople } from "@/server/queries";
import { EditUser, NewUserForm, ResetPassword, UserActiveToggle } from "../forms";

export const metadata = { title: "People · Settings" };

export default async function PeopleSettings() {
  const me = await requireUser();
  if (!me.isAdmin) redirect("/settings/account");
  const people = await getPeople({ includeInactive: true });
  const admins = new Set((await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true))).map((u) => u.id));
  const sorted = [...people].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      {me.isAdmin ? (
        <div className="flex justify-end">
          <NewUserForm />
        </div>
      ) : (
        <p className="rounded-lg bg-wait-soft px-3 py-2 text-[13px] text-ink-2">Only Shahenda or IT can create or change accounts.</p>
      )}
      <div className="card divide-y divide-line">
        {sorted.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={p.name} size={34} className={p.isActive ? "" : "opacity-50"} />
            <div className="min-w-[180px] flex-1">
              <div className="flex items-center gap-2 font-medium">
                {p.name}
                {p.isManager && <ManagerChip />}
                {admins.has(p.id) && <Badge tone="blue">Admin</Badge>}
                {!p.isActive && <Badge tone="neutral">Inactive</Badge>}
              </div>
              <div className="text-[12.5px] text-muted">
                @{p.username}
                {p.title && ` · ${p.title}`}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {p.teams.map((t) => (
                <Badge key={t} tone="neutral">
                  {TEAM_META[t].label}
                </Badge>
              ))}
            </div>
            {me.isAdmin && (
              <div className="flex items-center gap-1">
                <PhotoPicker userId={p.id} name={p.name} hasPhoto={!!p.avatarUpdatedAt} compact />
                <EditUser u={{ id: p.id, name: p.name, title: p.title, teams: p.teams, isAdmin: admins.has(p.id), isManager: p.isManager }} />
                <ResetPassword userId={p.id} name={p.name} />
                {p.id !== me.id && <UserActiveToggle userId={p.id} active={p.isActive} />}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[12.5px] text-muted">Deactivated people can&rsquo;t sign in, but everything they worked on stays in the history and insights.</p>
    </div>
  );
}
