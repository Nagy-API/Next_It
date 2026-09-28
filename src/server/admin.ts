/** Brands, clients, projects, platforms and people. All changes are logged. */
import { and, eq, ilike, ne, sql } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { db } from "@/db";
import { brands, clients, companySettings, platforms, projects, sessions, users, type Team, TEAMS } from "@/db/schema";
import { TEAM_META } from "@/domain/workflow";
import { logActivity, type Actor } from "./activity";
import { UserError, assert } from "./errors";
import { can, isManager } from "@/domain/permissions";

const ADMIN_ONLY = "Only an admin can change settings.";

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

async function uniqueSlug(table: typeof brands | typeof clients | typeof platforms, base: string, exceptId?: string) {
  let slug = slugify(base);
  for (let i = 2; ; i++) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(exceptId ? and(eq(table.slug, slug), ne(table.id, exceptId)) : eq(table.slug, slug));
    if (!rows.length) return slug;
    slug = `${slugify(base)}-${i}`;
  }
}

const BRAND_COLORS = ["#3B82F6", "#E0569B", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#EF4444", "#84CC16", "#F97316", "#14B8A6"];

/* ------------------------------ Brands ------------------------------ */

export async function createBrand(actor: Actor, input: { name: string; defaultCreatorId?: string | null; color?: string | null }) {
  assert(can.manageBrands(actor), ADMIN_ONLY);
  const name = input.name.trim();
  assert(name, "Brand name is required.");
  const [dupe] = await db.select({ id: brands.id }).from(brands).where(ilike(brands.name, name));
  assert(!dupe, `A brand called “${name}” already exists.`);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(brands);
  const slug = await uniqueSlug(brands, name);
  return db.transaction(async (tx) => {
    const [b] = await tx
      .insert(brands)
      .values({ name, slug, defaultCreatorId: input.defaultCreatorId || null, color: input.color || BRAND_COLORS[count % BRAND_COLORS.length] })
      .returning();
    await logActivity(tx, actor, { action: "brand_created", brandId: b.id, summary: `${actor.name} created the brand ${name}.` });
    return b;
  });
}

export async function updateBrand(
  actor: Actor,
  brandId: string,
  input: {
    name?: string;
    defaultCreatorId?: string | null;
    defaultShootId?: string | null;
    defaultMediaId?: string | null;
    defaultDesignId?: string | null;
    defaultSocialId?: string | null;
    color?: string;
    logoUrl?: string | null;
  },
) {
  assert(can.manageBrands(actor), ADMIN_ONLY);
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(brands).where(eq(brands.id, brandId)).for("update");
    assert(b, "Brand not found.");
    if (input.name !== undefined && input.name.trim() !== b.name) {
      const name = input.name.trim();
      assert(name, "Brand name is required.");
      const [dupe] = await tx.select({ id: brands.id }).from(brands).where(and(ilike(brands.name, name), ne(brands.id, brandId)));
      assert(!dupe, `A brand called “${name}” already exists.`);
      await tx.update(brands).set({ name }).where(eq(brands.id, brandId));
      await logActivity(tx, actor, { action: "brand_updated", brandId, field: "name", oldValue: b.name, newValue: name, summary: `${actor.name} renamed the brand ${b.name} to ${name}.` });
    }
    // Default people per team for this brand.
    const names = await tx.select({ id: users.id, name: users.name }).from(users);
    const nm = (id: string | null) => names.find((u) => u.id === id)?.name ?? null;
    const DEFAULT_FIELDS = [
      ["defaultCreatorId", "content creator"],
      ["defaultShootId", "shooting (pre-production) person"],
      ["defaultMediaId", "editor (post-production)"],
      ["defaultDesignId", "graphic designer"],
      ["defaultSocialId", "social media person"],
    ] as const;
    for (const [field, label] of DEFAULT_FIELDS) {
      const next = input[field];
      if (next === undefined || (next || null) === b[field]) continue;
      const newId = next || null;
      await tx.update(brands).set({ [field]: newId }).where(eq(brands.id, brandId));
      await logActivity(tx, actor, {
        action: "brand_updated",
        brandId,
        subjectUserId: newId,
        field,
        oldValue: nm(b[field]),
        newValue: nm(newId),
        summary: `${actor.name} set the default ${label} for ${b.name} to ${nm(newId) ?? "the whole team"}${b[field] ? ` (was ${nm(b[field])})` : ""}.`,
      });
    }
    if (input.color !== undefined && input.color !== b.color) {
      assert(/^#[0-9a-fA-F]{6}$/.test(input.color), "Color must be a hex value like #3B82F6.");
      await tx.update(brands).set({ color: input.color }).where(eq(brands.id, brandId));
    }
    if (input.logoUrl !== undefined && (input.logoUrl || null) !== b.logoUrl) {
      await tx.update(brands).set({ logoUrl: input.logoUrl || null }).where(eq(brands.id, brandId));
      await logActivity(tx, actor, { action: "brand_updated", brandId, field: "logo", summary: `${actor.name} updated the ${b.name} logo.` });
    }
  });
}

export async function setBrandActive(actor: Actor, brandId: string, active: boolean) {
  assert(can.manageBrands(actor), ADMIN_ONLY);
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(brands).where(eq(brands.id, brandId)).for("update");
    assert(b, "Brand not found.");
    if (b.isActive === active) return;
    await tx.update(brands).set({ isActive: active, archivedAt: active ? null : new Date() }).where(eq(brands.id, brandId));
    await logActivity(tx, actor, {
      action: active ? "brand_reactivated" : "brand_archived",
      brandId,
      summary: active ? `${actor.name} reactivated ${b.name}.` : `${actor.name} made ${b.name} inactive. Its history stays in the archive.`,
    });
  });
}

/* ------------------------- Clients & projects ------------------------ */

/** Returns the existing client when the name matches (case-insensitive) — no duplicate SINAIs. */
export async function findOrCreateClient(actor: Actor, name: string) {
  assert(can.manageProjects(actor), "Only the Content team or managers can create projects.");
  const n = name.trim();
  assert(n, "Client name is required.");
  const [existing] = await db.select().from(clients).where(ilike(clients.name, n));
  if (existing) return { client: existing, created: false };
  const slug = await uniqueSlug(clients, n);
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(clients).values({ name: n, slug }).returning();
    await logActivity(tx, actor, { action: "client_created", clientId: c.id, summary: `${actor.name} added the one-off client ${n}.` });
    return { client: c, created: true };
  });
}

export async function createProject(actor: Actor, input: { clientId: string; name: string; notes?: string | null; ownerId?: string | null }) {
  assert(can.manageProjects(actor), "Only the Content team or managers can create projects.");
  const name = input.name.trim();
  assert(name, "Project name is required.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(clients).where(eq(clients.id, input.clientId));
    assert(c, "Client not found.");
    const [p] = await tx
      .insert(projects)
      .values({ clientId: c.id, name, notes: input.notes?.trim() || null, ownerId: input.ownerId || null, createdById: actor.id })
      .returning();
    const [owner] = input.ownerId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, input.ownerId)) : [];
    await logActivity(tx, actor, {
      action: "project_created",
      clientId: c.id,
      projectId: p.id,
      subjectUserId: input.ownerId || null,
      summary: `${actor.name} created the project “${name}” for ${c.name}${owner ? `, assigned to ${owner.name}` : ""}.`,
    });
    return p;
  });
}

export async function updateProject(actor: Actor, projectId: string, input: { name?: string; notes?: string | null; ownerId?: string | null }) {
  assert(can.manageProjects(actor), "Only the Content team or managers can edit projects.");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, projectId));
    assert(p, "Project not found.");
    if (input.name !== undefined && input.name.trim() && input.name.trim() !== p.name) {
      await tx.update(projects).set({ name: input.name.trim() }).where(eq(projects.id, projectId));
      await logActivity(tx, actor, { action: "project_updated", clientId: p.clientId, projectId, field: "name", oldValue: p.name, newValue: input.name.trim(), summary: `${actor.name} renamed the project “${p.name}” to “${input.name.trim()}”.` });
    }
    if (input.ownerId !== undefined && (input.ownerId || null) !== p.ownerId) {
      const [owner] = input.ownerId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, input.ownerId)) : [];
      await tx.update(projects).set({ ownerId: input.ownerId || null }).where(eq(projects.id, projectId));
      await logActivity(tx, actor, {
        action: "project_updated",
        clientId: p.clientId,
        projectId,
        field: "owner",
        subjectUserId: input.ownerId || null,
        summary: `${actor.name} assigned the project “${p.name}” to ${owner?.name ?? "nobody"}.`,
      });
    }
    if (input.notes !== undefined && (input.notes?.trim() || null) !== p.notes) {
      await tx.update(projects).set({ notes: input.notes?.trim() || null }).where(eq(projects.id, projectId));
      await logActivity(tx, actor, { action: "project_updated", clientId: p.clientId, projectId, field: "notes", summary: `${actor.name} updated the notes on “${p.name}”.` });
    }
  });
}

/** Delete a project (hidden with all its items; history is kept). Managers, or whoever created it. */
export async function setProjectDeleted(actor: Actor, projectId: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, projectId));
    assert(p, "Project not found.");
    assert(isManager(actor) || p.createdById === actor.id, "Only managers or the person who created it can delete a project.");
    if (!!p.deletedAt === deleted) return;
    await tx.update(projects).set({ deletedAt: deleted ? new Date() : null }).where(eq(projects.id, projectId));
    await logActivity(tx, actor, {
      action: deleted ? "project_deleted" : "project_restored",
      clientId: p.clientId,
      projectId,
      summary: `${actor.name} ${deleted ? "deleted" : "restored"} the project “${p.name}”.`,
    });
  });
}

/* ------------------------------ Platforms ---------------------------- */

export async function createPlatform(actor: Actor, name: string) {
  assert(!!actor.isAdmin, ADMIN_ONLY);
  const n = name.trim();
  assert(n, "Platform name is required.");
  const [dupe] = await db.select({ id: platforms.id }).from(platforms).where(ilike(platforms.name, n));
  assert(!dupe, `${n} already exists.`);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${platforms.sortOrder}), 0)::int` }).from(platforms);
  const slug = await uniqueSlug(platforms, n);
  return db.transaction(async (tx) => {
    const [p] = await tx.insert(platforms).values({ name: n, slug, sortOrder: max + 1 }).returning();
    await logActivity(tx, actor, { action: "platform_created", summary: `${actor.name} added the platform ${n}.` });
    return p;
  });
}

export async function updatePlatform(actor: Actor, platformId: string, input: { name?: string; isActive?: boolean }) {
  assert(!!actor.isAdmin, ADMIN_ONLY);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(platforms).where(eq(platforms.id, platformId));
    assert(p, "Platform not found.");
    if (input.name !== undefined && input.name.trim() && input.name.trim() !== p.name) {
      await tx.update(platforms).set({ name: input.name.trim() }).where(eq(platforms.id, platformId));
      await logActivity(tx, actor, { action: "platform_updated", field: "name", oldValue: p.name, newValue: input.name.trim(), summary: `${actor.name} renamed the platform ${p.name} to ${input.name.trim()}.` });
    }
    if (input.isActive !== undefined && input.isActive !== p.isActive) {
      await tx.update(platforms).set({ isActive: input.isActive }).where(eq(platforms.id, platformId));
      await logActivity(tx, actor, {
        action: input.isActive ? "platform_enabled" : "platform_disabled",
        summary: `${actor.name} ${input.isActive ? "enabled" : "disabled"} ${p.name}${input.isActive ? "" : " for new content (history is kept)"}.`,
      });
    }
  });
}

/* ------------------------------- People ------------------------------ */

const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

export function validatePassword(pw: string) {
  assert(pw.length >= 8, "Passwords need at least 8 characters.");
  assert(pw.length <= 200, "That password is too long.");
}

export async function hashPassword(pw: string) {
  return hash(pw, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });
}

function cleanTeams(teams: string[] | undefined): Team[] {
  return (teams ?? []).filter((t): t is Team => (TEAMS as readonly string[]).includes(t));
}

export async function createUser(
  actor: Actor,
  input: { username: string; name: string; title?: string | null; teams?: string[]; isAdmin?: boolean; isManager?: boolean; password: string },
) {
  const username = input.username.trim().toLowerCase();
  assert(USERNAME_RE.test(username), "Usernames use 2–32 lowercase letters, numbers, dots, dashes or underscores.");
  const name = input.name.trim();
  assert(name, "Name is required.");
  validatePassword(input.password);
  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  assert(!dupe, `The username “${username}” is taken.`);
  const passwordHash = await hashPassword(input.password);
  const teams = cleanTeams(input.teams);
  return db.transaction(async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({ username, name, title: input.title?.trim() || null, teams, isAdmin: !!input.isAdmin, isManager: !!input.isManager, passwordHash })
      .returning();
    await logActivity(tx, actor, {
      action: "user_created",
      subjectUserId: u.id,
      summary: `${actor.name} created an account for ${name} (${teams.map((t) => TEAM_META[t].label).join(", ") || "no team"}).`,
    });
    return u;
  });
}

export async function updateUser(
  actor: Actor,
  userId: string,
  input: { name?: string; title?: string | null; teams?: string[]; isAdmin?: boolean; isManager?: boolean },
) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    assert(u, "User not found.");
    const set: Partial<typeof users.$inferInsert> = {};
    const changes: string[] = [];
    if (input.name !== undefined && input.name.trim() && input.name.trim() !== u.name) {
      set.name = input.name.trim();
      changes.push(`name → ${set.name}`);
    }
    if (input.title !== undefined && (input.title?.trim() || null) !== u.title) {
      set.title = input.title?.trim() || null;
      changes.push(`title → ${set.title ?? "none"}`);
    }
    if (input.teams !== undefined) {
      const teams = cleanTeams(input.teams);
      if ([...teams].sort().join() !== [...u.teams].sort().join()) {
        set.teams = teams;
        changes.push(`teams → ${teams.map((t) => TEAM_META[t].label).join(", ") || "none"}`);
      }
    }
    if (input.isAdmin !== undefined && input.isAdmin !== u.isAdmin) {
      if (!input.isAdmin) await assertAnotherAdmin(userId);
      set.isAdmin = input.isAdmin;
      changes.push(input.isAdmin ? "granted account administration" : "removed account administration");
    }
    if (input.isManager !== undefined && input.isManager !== u.isManager) {
      set.isManager = input.isManager;
      changes.push(input.isManager ? "made a manager" : "no longer a manager");
    }
    if (!changes.length) return;
    await tx.update(users).set(set).where(eq(users.id, userId));
    await logActivity(tx, actor, { action: "user_updated", subjectUserId: userId, summary: `${actor.name} updated ${u.name}: ${changes.join("; ")}.` });
  });
}

async function assertAnotherAdmin(userId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isAdmin, true), eq(users.isActive, true), ne(users.id, userId)));
  if (count === 0) throw new UserError("Keep at least one active administrator.");
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  assert(!(userId === actor.id && !active), "You can't deactivate your own account.");
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    assert(u, "User not found.");
    if (u.isActive === active) return;
    if (!active && u.isAdmin) await assertAnotherAdmin(userId);
    await tx.update(users).set({ isActive: active, deactivatedAt: active ? null : new Date() }).where(eq(users.id, userId));
    if (!active) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await logActivity(tx, actor, {
      action: active ? "user_reactivated" : "user_deactivated",
      subjectUserId: userId,
      summary: active ? `${actor.name} reactivated ${u.name}'s account.` : `${actor.name} deactivated ${u.name}'s account. Their work history is kept.`,
    });
  });
}

/** Profile photo: a small image data URL (the browser resizes it before upload). null removes it. */
export async function setAvatar(actor: Actor, userId: string, dataUrl: string | null) {
  assert(actor.id === userId || actor.isAdmin, "You can only change your own photo.");
  if (dataUrl) {
    assert(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl), "That file isn't a photo (use JPG or PNG).");
    assert(dataUrl.length < 400_000, "That photo is too big — pick a smaller one.");
  }
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId));
    assert(u, "User not found.");
    await tx.update(users).set({ avatar: dataUrl, avatarUpdatedAt: dataUrl ? new Date() : null }).where(eq(users.id, userId));
    await logActivity(tx, actor, {
      action: "user_updated",
      subjectUserId: userId,
      summary: `${actor.name} ${dataUrl ? "updated" : "removed"} ${actor.id === userId ? "their" : `${u.name}'s`} profile photo.`,
    });
  });
}

export async function setUserPassword(actor: Actor, userId: string, password: string) {
  validatePassword(password);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    assert(u, "User not found.");
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    // Sign the person out everywhere else.
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await logActivity(tx, actor, {
      action: "password_changed",
      subjectUserId: userId,
      summary: actor.id === userId ? `${actor.name} changed their password.` : `${actor.name} reset ${u.name}'s password.`,
    });
  });
}

/* ------------------------------ Company ------------------------------ */

const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Name, colours and logos of the company using this system (Settings → Company). `null` resets a field to the default. */
export async function updateCompany(
  actor: Actor,
  input: { name?: string | null; appName?: string | null; adminContact?: string | null; primaryColor?: string | null; darkColor?: string | null; logo?: string | null; mark?: string | null },
) {
  assert(!!actor.isAdmin, ADMIN_ONLY);
  for (const k of ["primaryColor", "darkColor"] as const) {
    const v = input[k];
    if (v) assert(/^#[0-9a-fA-F]{6}$/.test(v), "Colours look like #3B82F6.");
  }
  for (const k of ["logo", "mark"] as const) {
    const v = input[k];
    if (v) {
      assert(IMG.test(v), "Logos must be PNG, JPG or WEBP images.");
      assert(v.length < 1_500_000, "That logo is too big — use one under 1 MB.");
    }
  }
  const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  const set = {
    name: clean(input.name),
    appName: clean(input.appName),
    adminContact: clean(input.adminContact),
    primaryColor: clean(input.primaryColor),
    darkColor: clean(input.darkColor),
    logo: input.logo,
    mark: input.mark,
  };
  const values = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
  return db.transaction(async (tx) => {
    await tx
      .insert(companySettings)
      .values({ id: 1, ...values, updatedAt: new Date() })
      .onConflictDoUpdate({ target: companySettings.id, set: { ...values, updatedAt: new Date() } });
    const changed = Object.keys(values).map((k) => ({ name: "name", appName: "app name", adminContact: "admin contact", primaryColor: "main colour", darkColor: "dark colour", logo: "logo", mark: "icon" })[k]);
    await logActivity(tx, actor, { action: "company_updated", summary: `${actor.name} updated the company branding: ${changed.join(", ")}.` });
  });
}
