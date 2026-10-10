/**
 * Settings → Access: turn any permission on or off for any person, on top of the defaults by role and team.
 * Only people with "Manage access" can change it, and someone must always keep "Manage access".
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { permissionOverrides, users } from "@/db/schema";
import { PERMISSIONS, PERMISSION_KEYS, allowed, can, defaultAllowed, type PermissionKey } from "@/domain/permissions";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";

export type AccessRow = {
  id: string;
  name: string;
  username: string;
  title: string | null;
  teams: string[];
  isAdmin: boolean;
  isManager: boolean;
  roleLabel: string | null;
  overrides: Record<string, boolean>;
};

export async function getAccess(): Promise<AccessRow[]> {
  const [people, rows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, username: users.username, title: users.title, teams: users.teams, isAdmin: users.isAdmin, isManager: users.isManager, roleLabel: users.roleLabel })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.name),
    db.select().from(permissionOverrides),
  ]);
  return people.map((p) => ({ ...p, teams: p.teams as string[], overrides: Object.fromEntries(rows.filter((r) => r.userId === p.id).map((r) => [r.key, r.allow])) }));
}

/** value: "allow" / "deny" = a change for this person; "default" = back to the rule for their role and team. */
export async function setPermission(actor: Actor, userId: string, key: string, value: "allow" | "deny" | "default") {
  assert(can.manageAccess(actor), "Only people who manage access can change permissions.");
  assert((PERMISSION_KEYS as string[]).includes(key), "Unknown permission.");
  assert(["allow", "deny", "default"].includes(value), "Pick on, off or default.");
  const k = key as PermissionKey;
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    assert(u?.isActive, "Person not found.");
    const before = await tx.select().from(permissionOverrides).where(eq(permissionOverrides.userId, userId));
    const perms = Object.fromEntries(before.map((r) => [r.key, r.allow]));
    const old = allowed({ ...u, perms }, k);
    if (value === "default") delete perms[k];
    else perms[k] = value === "allow";
    const now = allowed({ ...u, perms }, k);

    // Someone must always be able to manage access.
    if (k === "access.manage" && old && !now) {
      const everyone = await tx.select().from(users).where(eq(users.isActive, true));
      const all = await tx.select().from(permissionOverrides);
      const others = everyone.filter((p) => p.id !== userId && allowed({ ...p, perms: Object.fromEntries(all.filter((r) => r.userId === p.id).map((r) => [r.key, r.allow])) }, "access.manage"));
      assert(others.length > 0, "Someone must keep “Manage access”. Give it to another person first.");
    }

    if (value === "default") await tx.delete(permissionOverrides).where(and(eq(permissionOverrides.userId, userId), eq(permissionOverrides.key, k)));
    else
      await tx
        .insert(permissionOverrides)
        .values({ userId, key: k, allow: value === "allow", updatedById: actor.id })
        .onConflictDoUpdate({ target: [permissionOverrides.userId, permissionOverrides.key], set: { allow: value === "allow", updatedById: actor.id, updatedAt: new Date() } });
    if (old === now && value !== "default") return false;
    await logActivity(tx, actor, {
      action: "access_changed",
      subjectUserId: userId,
      field: k,
      oldValue: old ? "on" : "off",
      newValue: now ? "on" : "off",
      summary: `${actor.name} turned “${PERMISSIONS[k].label}” ${now ? "on" : "off"} for ${u.name}${value === "default" ? " (back to the default)" : ""}.`,
    });
    return true;
  });
}

/** Back to the defaults for their role and team (removes every change). */
export async function resetAccess(actor: Actor, userId: string) {
  assert(can.manageAccess(actor), "Only people who manage access can change permissions.");
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  assert(u?.isActive, "Person not found.");
  const rows = await db.select().from(permissionOverrides).where(eq(permissionOverrides.userId, userId));
  if (rows.some((r) => r.key === "access.manage" && r.allow) && !defaultAllowed(u, "access.manage")) {
    // Resetting would take "Manage access" away: same rule as above.
    await setPermission(actor, userId, "access.manage", "default");
  }
  await db.transaction(async (tx) => {
    await tx.delete(permissionOverrides).where(eq(permissionOverrides.userId, userId));
    await logActivity(tx, actor, { action: "access_changed", subjectUserId: userId, summary: `${actor.name} reset ${u.name}'s access to the defaults for their role and team.` });
  });
}
