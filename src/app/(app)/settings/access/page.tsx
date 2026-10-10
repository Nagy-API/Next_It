import Link from "next/link";
import { redirect } from "next/navigation";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import { Avatar, ManagerChip } from "@/components/ui";
import { PERMISSIONS, PERMISSION_KEYS, allowed, can, defaultAllowed, type PermissionKey } from "@/domain/permissions";
import { TEAM_META } from "@/domain/workflow";
import type { Team } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getAccess } from "@/server/access";
import { AccessSwitch, ResetAll, UndoChange } from "./switch";

export const metadata = { title: "Access · Settings" };

export default async function AccessSettings({ searchParams }: PageProps<"/settings/access">) {
  const me = await requireUser();
  if (!can.manageAccess(me)) redirect("/settings/account");
  const people = await getAccess();
  const u = (await searchParams).u;
  const person = people.find((p) => p.username === u) ?? people.find((p) => p.id === me.id) ?? people[0];
  const groups = [...new Set(PERMISSION_KEYS.map((k) => PERMISSIONS[k].group))];
  const role = (p: (typeof people)[number]) => (p.isAdmin ? "Admin" : p.isManager ? "Manager" : "Member");
  const changes = (p: (typeof people)[number]) => Object.keys(p.overrides).filter((k) => k in PERMISSIONS && p.overrides[k] !== defaultAllowed(p, k as PermissionKey)).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="card h-fit overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <div className="font-display text-[14px] font-bold">People</div>
          <p className="mt-0.5 text-[12px] text-muted">Pick someone to see and change what they can do.</p>
        </div>
        <nav className="max-h-[60vh] overflow-y-auto p-1.5 lg:max-h-none">
          {people.map((p) => {
            const n = changes(p);
            return (
              <Link
                key={p.id}
                href={`/settings/access?u=${p.username}`}
                scroll={false}
                className={clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors", p.id === person.id ? "bg-electric-soft" : "hover:bg-canvas")}
              >
                <Avatar name={p.name} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {p.roleLabel ? `${p.roleLabel} · ` : ""}
                    {role(p)}
                  </span>
                </span>
                {n > 0 && <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold leading-[18px] text-warn">{n}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <Avatar name={person.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-display text-[18px] font-bold">
              {person.name} {(person.isManager || person.isAdmin || person.roleLabel) && <ManagerChip role={person.roleLabel} className="font-sans" />}
            </div>
            <div className="text-[12.5px] text-muted">
              {role(person)} · {person.teams.map((t) => TEAM_META[t as Team]?.label ?? t).join(", ") || "no team"}
              {person.title ? ` · ${person.title}` : ""}
            </div>
          </div>
          {changes(person) > 0 && <ResetAll userId={person.id} name={person.name} />}
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-electric-soft/70 px-3.5 py-2.5 text-[13px] text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-electric" />
          <span>
            Everyone starts with the defaults for their role and team (admins: everything; managers: managing and numbers). Flip any switch to change it for {person.name} only. Every change is saved
            right away and written in the Activity log.
          </span>
        </p>

        {groups.map((g) => (
          <div key={g} className="card overflow-hidden">
            <div className="border-b border-line bg-[#fafbfd] px-4 py-2.5 font-display text-[13.5px] font-bold">{g}</div>
            <ul className="divide-y divide-line">
              {PERMISSION_KEYS.filter((k) => PERMISSIONS[k].group === g).map((k) => {
                const def = defaultAllowed(person, k);
                const on = allowed({ ...person, perms: person.overrides }, k);
                const changed = k in person.overrides && on !== def;
                return (
                  <li key={k} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-ink">{PERMISSIONS[k].label}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
                        {PERMISSIONS[k].hint && <span>{PERMISSIONS[k].hint}</span>}
                        {changed && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded bg-warn-soft px-1.5 font-semibold text-warn">Changed (default: {def ? "on" : "off"})</span>
                            <UndoChange userId={person.id} perm={k} />
                          </span>
                        )}
                      </div>
                    </div>
                    <AccessSwitch userId={person.id} perm={k} label={`${PERMISSIONS[k].label} for ${person.name}`} on={on} def={def} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
