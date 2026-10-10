/**
 * Spaces — the workflow builder (no code needed): spaces with members and privacy, their own statuses, folders,
 * lists, custom columns, tasks and subtasks, comments, a clock on "in progress" statuses and automations.
 *
 * Who can do what in a space:
 *  - manage (statuses, columns, lists, members, automations): "Build workflows" (Settings → Access), the space's
 *    admins, or whoever created it;
 *  - see: everyone for a public space; members (and "See every space") for a private one;
 *  - work (create / change tasks, comment): anyone who sees it, except members added as viewers.
 * Every change writes a line in the task's own history (system comments) and important ones in the Activity log.
 */
import { and, asc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  automations,
  folders,
  lists,
  spaceFields,
  spaceMembers,
  spaceStatuses,
  spaces,
  users,
  workTaskAssignees,
  workTaskComments,
  workTaskSessions,
  workTaskValues,
  workTasks,
  type Automation,
  type Space,
  type SpaceField,
  type SpaceStatus,
  type WorkTask,
} from "@/db/schema";
import { can } from "@/domain/permissions";
import {
  ACTION_LIST,
  FIELD_TYPES,
  PRIORITIES,
  SPACE_COLORS,
  STATUS_KINDS,
  TRIGGERS,
  isFinishedKind,
  templateByKey,
  type Action,
  type FieldOption,
  type FieldType,
  type Priority,
  type StatusKind,
  type Trigger,
  type TriggerType,
} from "@/domain/spaces";
import { addDays, isValidISODate, todayISO } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import { notify } from "./notify";
import { normalizeUrl, truncate } from "./workflow";

export type SpaceRole = "admin" | "member" | "viewer";
export type SpaceAccess = { see: boolean; work: boolean; manage: boolean; role: SpaceRole | null };

const HEX = /^#[0-9a-fA-F]{6}$/;
const NOT_FOUND = "That space doesn't exist or you can't see it.";
const href = (t: { id: string; spaceId: string }) => `/spaces/${t.spaceId}/t/${t.id}`;

/* ------------------------------------------------------------------ */
/* Access                                                               */
/* ------------------------------------------------------------------ */

export function accessFor(actor: Actor, space: Pick<Space, "isPrivate" | "createdById">, role: SpaceRole | null): SpaceAccess {
  const manage = can.manageWorkflow(actor) || role === "admin" || space.createdById === actor.id;
  const see = manage || can.seeAllSpaces(actor) || !space.isPrivate || !!role;
  const work = see && (manage || role !== "viewer");
  return { see, work, manage, role };
}

async function loadSpace(tx: Tx | typeof db, actor: Actor, spaceId: string) {
  assert(/^[0-9a-f-]{36}$/i.test(spaceId), NOT_FOUND);
  const [space] = await tx.select().from(spaces).where(and(eq(spaces.id, spaceId), isNull(spaces.archivedAt)));
  assert(space, NOT_FOUND);
  const [m] = await tx.select({ role: spaceMembers.role }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, actor.id)));
  const access = accessFor(actor, space, (m?.role as SpaceRole) ?? null);
  assert(access.see, NOT_FOUND);
  return { space, access };
}

async function assertManage(tx: Tx | typeof db, actor: Actor, spaceId: string) {
  const r = await loadSpace(tx, actor, spaceId);
  assert(r.access.manage, "Only this space's admins (or people who build workflows) can change its setup.");
  return r.space;
}

async function assertWork(tx: Tx | typeof db, actor: Actor, spaceId: string) {
  const r = await loadSpace(tx, actor, spaceId);
  assert(r.access.work, "You can see this space but not change it (viewer).");
  return r.space;
}

async function loadTask(tx: Tx, actor: Actor, taskId: string) {
  assert(/^[0-9a-f-]{36}$/i.test(taskId), "Task not found.");
  const [task] = await tx.select().from(workTasks).where(eq(workTasks.id, taskId)).for("update");
  assert(task && !task.archivedAt, "Task not found.");
  const space = await assertWork(tx, actor, task.spaceId);
  return { task, space };
}

/** Spaces this person can see, with open / overdue counts for the sidebar. */
export async function visibleSpaces(actor: Actor) {
  const [all, mine] = await Promise.all([
    db.select().from(spaces).where(isNull(spaces.archivedAt)).orderBy(asc(spaces.position), asc(spaces.createdAt)),
    db.select().from(spaceMembers).where(eq(spaceMembers.userId, actor.id)),
  ]);
  const roleOf = new Map(mine.map((m) => [m.spaceId, m.role as SpaceRole]));
  const visible = all.filter((s) => accessFor(actor, s, roleOf.get(s.id) ?? null).see);
  if (!visible.length) return [];
  const today = todayISO();
  const counts = await db
    .select({
      spaceId: workTasks.spaceId,
      open: sql<number>`count(*) filter (where ${workTasks.completedAt} is null)::int`,
      late: sql<number>`count(*) filter (where ${workTasks.completedAt} is null and ${workTasks.dueDate} < ${today})::int`,
    })
    .from(workTasks)
    .where(and(inArray(workTasks.spaceId, visible.map((s) => s.id)), isNull(workTasks.archivedAt), isNull(workTasks.parentId)))
    .groupBy(workTasks.spaceId);
  return visible.map((s) => {
    const c = counts.find((x) => x.spaceId === s.id);
    return { ...s, role: roleOf.get(s.id) ?? null, access: accessFor(actor, s, roleOf.get(s.id) ?? null), open: c?.open ?? 0, late: c?.late ?? 0 };
  });
}

/* ------------------------------------------------------------------ */
/* Spaces                                                               */
/* ------------------------------------------------------------------ */

export async function createSpace(
  actor: Actor,
  input: { name: string; template?: string | null; color?: string | null; icon?: string | null; description?: string | null; isPrivate?: boolean; memberIds?: string[]; brandId?: string | null },
) {
  assert(can.createSpaces(actor), "Only people allowed to create spaces can do that (Settings → Access).");
  const name = truncate(input.name.trim(), 60);
  assert(name, "Give the space a name.");
  const t = templateByKey(input.template);
  const color = input.color && HEX.test(input.color) ? input.color : t.color;
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(spaces);
    const [s] = await tx
      .insert(spaces)
      .values({ name, color, icon: truncate(input.icon?.trim() || t.icon, 8), description: input.description?.trim().slice(0, 300) || t.description, isPrivate: !!input.isPrivate, brandId: input.brandId || null, position: n, createdById: actor.id })
      .returning();
    const statusRows = await tx
      .insert(spaceStatuses)
      .values(t.statuses.map((x, i) => ({ spaceId: s.id, name: x.name, color: x.color, kind: x.kind, position: i })))
      .returning();
    for (const [i, f] of t.fields.entries())
      await tx.insert(spaceFields).values({ spaceId: s.id, name: f.name, type: f.type, position: i, options: (f.options ?? []).map((label, j) => ({ id: crypto.randomUUID().slice(0, 8), label, color: SPACE_COLORS[j % SPACE_COLORS.length] })) });
    let pos = 0;
    for (const [fi, f] of t.folders.entries()) {
      const [folder] = await tx.insert(folders).values({ spaceId: s.id, name: f.name, position: fi }).returning();
      for (const l of f.lists) await tx.insert(lists).values({ spaceId: s.id, folderId: folder.id, name: l, position: pos++, createdById: actor.id });
    }
    for (const l of t.lists) await tx.insert(lists).values({ spaceId: s.id, name: l, position: pos++, createdById: actor.id });
    if (!t.folders.length && !t.lists.length) await tx.insert(lists).values({ spaceId: s.id, name: "Tasks", position: 0, createdById: actor.id });
    const statusId = (n: string) => statusRows.find((r) => r.name === n)?.id;
    for (const a of t.automations) {
      const trigger: Trigger = { type: a.trigger.type, statusId: a.trigger.status ? (statusId(a.trigger.status) ?? null) : null, priority: a.trigger.priority ?? null };
      const actions = a.actions
        .map((x): Action | null => {
          if (x.type === "set_status" || x.type === "parent_status") {
            const id = statusId(x.status);
            return id ? { type: x.type, statusId: id } : null;
          }
          return x as Action;
        })
        .filter((x): x is Action => !!x);
      await tx.insert(automations).values({ spaceId: s.id, name: a.name, trigger, actions, createdById: actor.id });
    }
    const members = [...new Set([actor.id, ...(input.memberIds ?? [])])];
    const active = await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, members), eq(users.isActive, true)));
    for (const m of active) await tx.insert(spaceMembers).values({ spaceId: s.id, userId: m.id, role: m.id === actor.id ? "admin" : "member" }).onConflictDoNothing();
    await logActivity(tx, actor, { action: "space_created", brandId: s.brandId, summary: `${actor.name} created the space “${name}” (${t.name}${s.isPrivate ? ", private" : ""}).`, meta: { spaceId: s.id } });
    return s;
  });
}

export async function updateSpace(actor: Actor, spaceId: string, input: { name?: string; color?: string; icon?: string | null; description?: string | null; isPrivate?: boolean; brandId?: string | null }) {
  return db.transaction(async (tx) => {
    const s = await assertManage(tx, actor, spaceId);
    const set: Partial<typeof spaces.$inferInsert> = {};
    if (input.name !== undefined) {
      const n = truncate(input.name.trim(), 60);
      assert(n, "Give the space a name.");
      set.name = n;
    }
    if (input.color !== undefined) {
      assert(HEX.test(input.color), "Pick a colour.");
      set.color = input.color;
    }
    if (input.icon !== undefined) set.icon = truncate(input.icon?.trim() || "", 8) || null;
    if (input.description !== undefined) set.description = input.description?.trim().slice(0, 300) || null;
    if (input.isPrivate !== undefined) set.isPrivate = input.isPrivate;
    if (input.brandId !== undefined) set.brandId = input.brandId || null;
    if (!Object.keys(set).length) return;
    await tx.update(spaces).set(set).where(eq(spaces.id, spaceId));
    await logActivity(tx, actor, { action: "space_updated", brandId: set.brandId ?? s.brandId, summary: `${actor.name} updated the space “${set.name ?? s.name}” (${Object.keys(set).join(", ")}).`, meta: { spaceId } });
  });
}

export async function archiveSpace(actor: Actor, spaceId: string) {
  return db.transaction(async (tx) => {
    const s = await assertManage(tx, actor, spaceId);
    await tx.update(spaces).set({ archivedAt: new Date() }).where(eq(spaces.id, spaceId));
    await tx.update(workTaskSessions).set({ endedAt: new Date(), endReason: "archived" }).where(and(isNull(workTaskSessions.endedAt), inArray(workTaskSessions.taskId, tx.select({ id: workTasks.id }).from(workTasks).where(eq(workTasks.spaceId, spaceId)))));
    await logActivity(tx, actor, { action: "space_archived", summary: `${actor.name} archived the space “${s.name}”. Its tasks and history are kept.`, meta: { spaceId } });
  });
}

/** role null removes them. Keeps at least one admin. */
export async function setSpaceMember(actor: Actor, spaceId: string, userId: string, role: SpaceRole | null) {
  assert(role === null || ["admin", "member", "viewer"].includes(role), "Pick a role.");
  return db.transaction(async (tx) => {
    const s = await assertManage(tx, actor, spaceId);
    const [u] = await tx.select({ name: users.name, isActive: users.isActive }).from(users).where(eq(users.id, userId));
    assert(u, "Person not found.");
    if (role === null || role !== "admin") {
      const admins = await tx.select({ userId: spaceMembers.userId }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.role, "admin"), ne(spaceMembers.userId, userId)));
      const [cur] = await tx.select().from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));
      assert(cur?.role !== "admin" || admins.length > 0 || can.manageWorkflow(actor), "Keep at least one admin in the space.");
    }
    if (role === null) await tx.delete(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));
    else {
      assert(u.isActive, "That account is inactive.");
      await tx.insert(spaceMembers).values({ spaceId, userId, role }).onConflictDoUpdate({ target: [spaceMembers.spaceId, spaceMembers.userId], set: { role } });
      await notify(tx, actor, [userId], { kind: "task", title: `You were added to the space ${s.name}`, body: role === "viewer" ? "As a viewer" : role === "admin" ? "As an admin" : null, href: `/spaces/${spaceId}` });
    }
    await logActivity(tx, actor, { action: "space_member", subjectUserId: userId, summary: role ? `${actor.name} added ${u.name} to “${s.name}” as ${role}.` : `${actor.name} removed ${u.name} from “${s.name}”.`, meta: { spaceId } });
  });
}

/* ------------------------------------------------------------------ */
/* Statuses, folders, lists, fields                                     */
/* ------------------------------------------------------------------ */

export async function saveStatus(actor: Actor, spaceId: string, input: { id?: string | null; name: string; color: string; kind: StatusKind }) {
  const name = truncate(input.name.trim(), 30);
  assert(name, "Name the status.");
  assert(HEX.test(input.color), "Pick a colour.");
  assert(input.kind in STATUS_KINDS, "Pick what the status means.");
  return db.transaction(async (tx) => {
    await assertManage(tx, actor, spaceId);
    const all = await tx.select().from(spaceStatuses).where(and(eq(spaceStatuses.spaceId, spaceId), isNull(spaceStatuses.archivedAt)));
    assert(!all.some((x) => x.id !== input.id && x.name.toLowerCase() === name.toLowerCase()), `There's already a status called “${name}”.`);
    if (input.id) {
      const cur = all.find((x) => x.id === input.id);
      assert(cur, "Status not found.");
      if (cur.kind !== input.kind) assert(all.some((x) => x.id !== cur.id && x.kind === "open") || input.kind === "open", "Keep at least one “Not started” status.");
      await tx.update(spaceStatuses).set({ name, color: input.color, kind: input.kind }).where(eq(spaceStatuses.id, input.id));
      // Finished-ness follows the meaning.
      if (isFinishedKind(cur.kind) !== isFinishedKind(input.kind))
        await tx.update(workTasks).set({ completedAt: isFinishedKind(input.kind) ? new Date() : null }).where(eq(workTasks.statusId, input.id));
    } else {
      assert(all.length < 20, "A space can have up to 20 statuses.");
      // New statuses go before the finished ones.
      const pos = input.kind === "done" || input.kind === "closed" ? all.length : all.filter((x) => !isFinishedKind(x.kind)).length;
      for (const x of all.filter((x) => x.position >= pos)) await tx.update(spaceStatuses).set({ position: x.position + 1 }).where(eq(spaceStatuses.id, x.id));
      await tx.insert(spaceStatuses).values({ spaceId, name, color: input.color, kind: input.kind, position: pos });
    }
  });
}

export async function moveStatus(actor: Actor, statusId: string, dir: -1 | 1) {
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(spaceStatuses).where(eq(spaceStatuses.id, statusId));
    assert(st, "Status not found.");
    await assertManage(tx, actor, st.spaceId);
    const all = await tx.select().from(spaceStatuses).where(and(eq(spaceStatuses.spaceId, st.spaceId), isNull(spaceStatuses.archivedAt))).orderBy(asc(spaceStatuses.position));
    const i = all.findIndex((x) => x.id === statusId);
    const j = i + dir;
    if (j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    for (const [k, x] of all.entries()) await tx.update(spaceStatuses).set({ position: k }).where(eq(spaceStatuses.id, x.id));
  });
}

/** Removing a status moves its tasks to another one first. */
export async function removeStatus(actor: Actor, statusId: string, moveToId: string) {
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(spaceStatuses).where(eq(spaceStatuses.id, statusId));
    assert(st && !st.archivedAt, "Status not found.");
    const space = await assertManage(tx, actor, st.spaceId);
    const all = await tx.select().from(spaceStatuses).where(and(eq(spaceStatuses.spaceId, st.spaceId), isNull(spaceStatuses.archivedAt)));
    assert(all.length > 2, "A space needs at least two statuses.");
    const to = all.find((x) => x.id === moveToId && x.id !== statusId);
    assert(to, "Pick where its tasks go.");
    assert(all.some((x) => x.id !== statusId && x.kind === "open"), "Keep at least one “Not started” status.");
    const moved = await tx.update(workTasks).set({ statusId: to.id, completedAt: isFinishedKind(to.kind) ? new Date() : null, statusAt: new Date() }).where(eq(workTasks.statusId, statusId)).returning({ id: workTasks.id });
    await tx.update(spaceStatuses).set({ archivedAt: new Date() }).where(eq(spaceStatuses.id, statusId));
    await logActivity(tx, actor, { action: "space_updated", summary: `${actor.name} removed the status “${st.name}” from “${space.name}” (${moved.length} task(s) moved to “${to.name}”).`, meta: { spaceId: st.spaceId } });
  });
}

export async function saveFolder(actor: Actor, spaceId: string, input: { id?: string | null; name: string }) {
  const name = truncate(input.name.trim(), 60);
  assert(name, "Name the folder.");
  return db.transaction(async (tx) => {
    await assertManage(tx, actor, spaceId);
    if (input.id) await tx.update(folders).set({ name }).where(and(eq(folders.id, input.id), eq(folders.spaceId, spaceId)));
    else {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(folders).where(eq(folders.spaceId, spaceId));
      const [f] = await tx.insert(folders).values({ spaceId, name, position: n }).returning();
      return f.id;
    }
  });
}

export async function archiveFolder(actor: Actor, folderId: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(folders).where(eq(folders.id, folderId));
    assert(f, "Folder not found.");
    await assertManage(tx, actor, f.spaceId);
    // Its lists stay, outside any folder.
    await tx.update(lists).set({ folderId: null }).where(eq(lists.folderId, folderId));
    await tx.update(folders).set({ archivedAt: new Date() }).where(eq(folders.id, folderId));
  });
}

export async function saveList(actor: Actor, spaceId: string, input: { id?: string | null; name: string; folderId?: string | null; color?: string | null; description?: string | null }) {
  const name = truncate(input.name.trim(), 60);
  assert(name, "Name the list.");
  return db.transaction(async (tx) => {
    await assertManage(tx, actor, spaceId);
    if (input.folderId) {
      const [f] = await tx.select().from(folders).where(and(eq(folders.id, input.folderId), eq(folders.spaceId, spaceId), isNull(folders.archivedAt)));
      assert(f, "Folder not found.");
    }
    const values = { name, folderId: input.folderId || null, color: input.color && HEX.test(input.color) ? input.color : null, description: input.description?.trim().slice(0, 300) || null };
    if (input.id) {
      await tx.update(lists).set(values).where(and(eq(lists.id, input.id), eq(lists.spaceId, spaceId)));
      return input.id;
    }
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lists).where(eq(lists.spaceId, spaceId));
    const [l] = await tx.insert(lists).values({ spaceId, ...values, position: n, createdById: actor.id }).returning();
    return l.id;
  });
}

export async function archiveList(actor: Actor, listId: string) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(lists).where(eq(lists.id, listId));
    assert(l && !l.archivedAt, "List not found.");
    const s = await assertManage(tx, actor, l.spaceId);
    const others = await tx.select({ id: lists.id }).from(lists).where(and(eq(lists.spaceId, l.spaceId), isNull(lists.archivedAt), ne(lists.id, listId)));
    assert(others.length, "A space needs at least one list.");
    await tx.update(lists).set({ archivedAt: new Date() }).where(eq(lists.id, listId));
    await tx.update(workTasks).set({ archivedAt: new Date() }).where(and(eq(workTasks.listId, listId), isNull(workTasks.archivedAt)));
    await logActivity(tx, actor, { action: "space_updated", summary: `${actor.name} archived the list “${l.name}” in “${s.name}”.`, meta: { spaceId: l.spaceId } });
  });
}

export async function saveField(actor: Actor, spaceId: string, input: { id?: string | null; name: string; type: FieldType; options?: string[] }) {
  const name = truncate(input.name.trim(), 40);
  assert(name, "Name the column.");
  assert(input.type in FIELD_TYPES, "Pick a column type.");
  return db.transaction(async (tx) => {
    await assertManage(tx, actor, spaceId);
    const all = await tx.select().from(spaceFields).where(and(eq(spaceFields.spaceId, spaceId), isNull(spaceFields.archivedAt)));
    assert(!all.some((f) => f.id !== input.id && f.name.toLowerCase() === name.toLowerCase()), `There's already a column called “${name}”.`);
    const cur = input.id ? all.find((f) => f.id === input.id) : null;
    if (input.id) assert(cur, "Column not found.");
    // Keep option ids (and so the values already picked) when labels are edited.
    const old = (cur?.options as FieldOption[] | undefined) ?? [];
    const options: FieldOption[] = (input.options ?? [])
      .map((x) => truncate(x.trim(), 40))
      .filter(Boolean)
      .slice(0, 30)
      .map((label, i) => old.find((o) => o.label === label) ?? { id: crypto.randomUUID().slice(0, 8), label, color: SPACE_COLORS[i % SPACE_COLORS.length] });
    if (input.type === "dropdown" || input.type === "labels") assert(options.length, "Add at least one option (one per line).");
    if (cur) {
      assert(cur.type === input.type, "A column's type can't change. Add a new column instead.");
      await tx.update(spaceFields).set({ name, options }).where(eq(spaceFields.id, cur.id));
    } else {
      assert(all.length < 30, "A space can have up to 30 columns.");
      await tx.insert(spaceFields).values({ spaceId, name, type: input.type, options, position: all.length });
    }
  });
}

export async function archiveField(actor: Actor, fieldId: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(spaceFields).where(eq(spaceFields.id, fieldId));
    assert(f, "Column not found.");
    await assertManage(tx, actor, f.spaceId);
    await tx.update(spaceFields).set({ archivedAt: new Date() }).where(eq(spaceFields.id, fieldId));
  });
}

/* ------------------------------------------------------------------ */
/* The clock on a task                                                  */
/* ------------------------------------------------------------------ */

async function stopClock(tx: Tx, taskId: string, now: Date, reason: string) {
  await tx.update(workTaskSessions).set({ endedAt: now, endReason: reason }).where(and(eq(workTaskSessions.taskId, taskId), isNull(workTaskSessions.endedAt)));
}

async function startClock(tx: Tx, taskId: string, userId: string, now: Date) {
  const open = await tx.select().from(workTaskSessions).where(and(eq(workTaskSessions.taskId, taskId), isNull(workTaskSessions.endedAt)));
  if (open.some((o) => o.userId === userId)) return;
  await stopClock(tx, taskId, now, "status");
  await tx.insert(workTaskSessions).values({ taskId, userId, startedAt: now });
}

/* ------------------------------------------------------------------ */
/* Tasks                                                                */
/* ------------------------------------------------------------------ */

async function statusesOf(tx: Tx, spaceId: string) {
  return tx.select().from(spaceStatuses).where(and(eq(spaceStatuses.spaceId, spaceId), isNull(spaceStatuses.archivedAt))).orderBy(asc(spaceStatuses.position));
}

async function sysNote(tx: Tx, taskId: string, body: string, actorId: string | null, now = new Date()) {
  await tx.insert(workTaskComments).values({ taskId, authorId: actorId, body, system: true, createdAt: now });
}

async function assigneesOf(tx: Tx, taskId: string) {
  return (await tx.select({ userId: workTaskAssignees.userId }).from(workTaskAssignees).where(eq(workTaskAssignees.taskId, taskId))).map((r) => r.userId);
}

/** Make sure everyone assigned can see a private space (they become members). */
async function ensureMembers(tx: Tx, space: Space, userIds: string[]) {
  if (!space.isPrivate) return;
  for (const u of userIds) await tx.insert(spaceMembers).values({ spaceId: space.id, userId: u, role: "member" }).onConflictDoNothing();
}

type Event = { type: TriggerType; task: WorkTask; statusId?: string; priority?: string | null };

export async function createWorkTask(
  actor: Actor,
  input: { listId: string; title: string; parentId?: string | null; statusId?: string | null; assigneeIds?: string[]; priority?: string | null; dueDate?: string | null; startDate?: string | null; description?: string | null },
  now = new Date(),
) {
  const title = truncate(input.title.trim(), 300);
  assert(title, "Write the task.");
  return db.transaction(async (tx) => {
    const [list] = await tx.select().from(lists).where(and(eq(lists.id, input.listId), isNull(lists.archivedAt)));
    assert(list, "List not found.");
    const space = await assertWork(tx, actor, list.spaceId);
    return createTaskTx(tx, actor, space, list.id, { ...input, title }, now, 0);
  });
}

async function createTaskTx(
  tx: Tx,
  actor: Actor,
  space: Space,
  listId: string,
  input: { title: string; parentId?: string | null; statusId?: string | null; assigneeIds?: string[]; priority?: string | null; dueDate?: string | null; startDate?: string | null; description?: string | null },
  now: Date,
  depth: number,
): Promise<WorkTask> {
  const statuses = await statusesOf(tx, space.id);
  const status = (input.statusId && statuses.find((s) => s.id === input.statusId)) || statuses.find((s) => s.kind === "open") || statuses[0];
  if (input.parentId) {
    const [p] = await tx.select().from(workTasks).where(eq(workTasks.id, input.parentId));
    assert(p && p.spaceId === space.id && !p.parentId, "Subtasks go one level deep.");
    listId = p.listId;
  }
  if (input.priority) assert(input.priority in PRIORITIES, "Pick a priority.");
  if (input.dueDate) assert(isValidISODate(input.dueDate), "Invalid due date.");
  if (input.startDate) assert(isValidISODate(input.startDate), "Invalid start date.");
  const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${workTasks.position}), 0)::int` }).from(workTasks).where(eq(workTasks.spaceId, space.id));
  const [task] = await tx
    .insert(workTasks)
    .values({
      spaceId: space.id,
      listId,
      parentId: input.parentId || null,
      title: input.title,
      description: input.description?.trim().slice(0, 10_000) || null,
      statusId: status.id,
      priority: input.priority || null,
      dueDate: input.dueDate || null,
      startDate: input.startDate || null,
      position: max + 1024,
      createdById: actor.id,
      createdAt: now,
      updatedAt: now,
      statusAt: now,
      completedAt: isFinishedKind(status.kind) ? now : null,
    })
    .returning();
  const people = await activeIds(tx, input.assigneeIds ?? []);
  for (const u of people) await tx.insert(workTaskAssignees).values({ taskId: task.id, userId: u }).onConflictDoNothing();
  await ensureMembers(tx, space, people);
  if (status.kind === "active") await startClock(tx, task.id, people.includes(actor.id) || !people.length ? actor.id : people[0], now);
  await sysNote(tx, task.id, `${actor.name} created this task.`, actor.id, now);
  if (people.length) await notify(tx, actor, people, { kind: "task", title: `New task: ${task.title}`, body: `${space.name} · from ${actor.name}`, href: href(task) });
  if (!task.parentId) await logActivity(tx, actor, { action: "space_task_created", brandId: space.brandId, summary: `${actor.name} added “${task.title}” in ${space.name}.`, meta: { spaceId: space.id, taskId: task.id }, at: now });
  await fire(tx, actor, space, { type: "task_created", task }, now, depth);
  if (people.length) await fire(tx, actor, space, { type: "assignee_added", task }, now, depth);
  return task;
}

async function activeIds(tx: Tx, ids: string[]) {
  const clean = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
  if (!clean.length) return [];
  return (await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, clean), eq(users.isActive, true)))).map((r) => r.id);
}

/** Change a task's status (and everything that follows: done time, clock, notes, notifications, automations). */
async function setStatusTx(tx: Tx, actor: Actor, space: Space, task: WorkTask, statusId: string, now: Date, depth: number, by?: string) {
  if (task.statusId === statusId) return task;
  const statuses = await statusesOf(tx, space.id);
  const to = statuses.find((s) => s.id === statusId);
  assert(to, "Pick a status.");
  const from = statuses.find((s) => s.id === task.statusId);
  const [t] = await tx
    .update(workTasks)
    .set({ statusId, statusAt: now, updatedAt: now, completedAt: isFinishedKind(to.kind) ? (task.completedAt ?? now) : null })
    .where(eq(workTasks.id, task.id))
    .returning();
  const people = await assigneesOf(tx, task.id);
  if (to.kind === "active") {
    const who = people.includes(actor.id) || !people.length ? actor.id : people[0];
    if (!people.length) await tx.insert(workTaskAssignees).values({ taskId: task.id, userId: actor.id }).onConflictDoNothing();
    await startClock(tx, task.id, who, now);
  } else await stopClock(tx, task.id, now, isFinishedKind(to.kind) ? "done" : "status");
  await sysNote(tx, task.id, `${by ?? actor.name} moved this from ${from?.name ?? "?"} to ${to.name}.`, by ? null : actor.id, now);
  const audience = to.kind === "review" || isFinishedKind(to.kind) ? [...people, task.createdById] : people;
  await notify(tx, actor, audience, { kind: isFinishedKind(to.kind) ? "finished" : to.kind === "review" ? "review" : "task", title: `${to.name}: ${task.title}`, body: `${space.name} · by ${by ?? actor.name}`, href: href(task) });
  if (!task.parentId) await logActivity(tx, actor, { action: "space_task_status", brandId: space.brandId, field: "status", oldValue: from?.name ?? null, newValue: to.name, summary: `${by ?? actor.name} moved “${task.title}” to ${to.name} (${space.name}).`, meta: { spaceId: space.id, taskId: task.id }, at: now });
  await fire(tx, actor, space, { type: "status_changed", task: t, statusId }, now, depth);
  // The last subtask finished → the parent's "all subtasks are done".
  if (t.parentId && isFinishedKind(to.kind)) {
    const siblings = await tx.select({ statusId: workTasks.statusId }).from(workTasks).where(and(eq(workTasks.parentId, t.parentId), isNull(workTasks.archivedAt)));
    const finished = new Set(statuses.filter((s) => isFinishedKind(s.kind)).map((s) => s.id));
    if (siblings.every((x) => finished.has(x.statusId))) {
      const [parent] = await tx.select().from(workTasks).where(eq(workTasks.id, t.parentId));
      if (parent && !parent.archivedAt) await fire(tx, actor, space, { type: "subtasks_done", task: parent }, now, depth);
    }
  }
  return t;
}

export type TaskPatch = {
  title?: string;
  description?: string | null;
  statusId?: string;
  priority?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  listId?: string;
  assigneeIds?: string[];
};

export async function updateWorkTask(actor: Actor, taskId: string, patch: TaskPatch, now = new Date()) {
  return db.transaction(async (tx) => {
    const { task, space } = await loadTask(tx, actor, taskId);
    let t = task;
    const notes: string[] = [];
    const set: Partial<typeof workTasks.$inferInsert> = {};
    if (patch.title !== undefined) {
      const v = truncate(patch.title.trim(), 300);
      assert(v, "Write the task.");
      if (v !== t.title) {
        set.title = v;
        notes.push(`renamed it to “${v}”`);
      }
    }
    if (patch.description !== undefined && (patch.description?.trim() || null) !== t.description) {
      set.description = patch.description?.trim().slice(0, 10_000) || null;
      notes.push("edited the description");
    }
    if (patch.priority !== undefined && (patch.priority || null) !== t.priority) {
      if (patch.priority) assert(patch.priority in PRIORITIES, "Pick a priority.");
      set.priority = patch.priority || null;
      notes.push(`set the priority to ${patch.priority ? PRIORITIES[patch.priority as Priority].label : "none"}`);
    }
    if (patch.dueDate !== undefined && (patch.dueDate || null) !== t.dueDate) {
      if (patch.dueDate) assert(isValidISODate(patch.dueDate), "Invalid due date.");
      set.dueDate = patch.dueDate || null;
      set.dueFiredAt = null;
      notes.push(patch.dueDate ? `set the due date to ${patch.dueDate}` : "removed the due date");
    }
    if (patch.startDate !== undefined && (patch.startDate || null) !== t.startDate) {
      if (patch.startDate) assert(isValidISODate(patch.startDate), "Invalid start date.");
      set.startDate = patch.startDate || null;
      notes.push(patch.startDate ? `set the start date to ${patch.startDate}` : "removed the start date");
    }
    if (patch.listId !== undefined && patch.listId !== t.listId) {
      assert(!t.parentId, "Subtasks stay with their task.");
      const [l] = await tx.select().from(lists).where(and(eq(lists.id, patch.listId), eq(lists.spaceId, space.id), isNull(lists.archivedAt)));
      assert(l, "List not found.");
      set.listId = l.id;
      notes.push(`moved it to the list ${l.name}`);
      await tx.update(workTasks).set({ listId: l.id }).where(eq(workTasks.parentId, t.id));
    }
    if (Object.keys(set).length) {
      [t] = await tx
        .update(workTasks)
        .set({ ...set, updatedAt: now })
        .where(eq(workTasks.id, t.id))
        .returning();
      await sysNote(tx, t.id, `${actor.name} ${notes.join(", ")}.`, actor.id, now);
    }
    if (patch.assigneeIds !== undefined) t = await setAssigneesTx(tx, actor, space, t, patch.assigneeIds, now, 0);
    if (patch.statusId !== undefined) t = await setStatusTx(tx, actor, space, t, patch.statusId, now, 0);
    if (set.priority !== undefined) await fire(tx, actor, space, { type: "priority_changed", task: t, priority: set.priority }, now, 0);
    const [st] = await tx.select({ kind: spaceStatuses.kind }).from(spaceStatuses).innerJoin(workTasks, eq(workTasks.statusId, spaceStatuses.id)).where(eq(workTasks.id, t.id));
    return { ...t, statusKind: (st?.kind ?? "open") as StatusKind, statusChanged: t.statusId !== task.statusId };
  });
}

async function setAssigneesTx(tx: Tx, actor: Actor, space: Space, task: WorkTask, ids: string[], now: Date, depth: number) {
  const next = await activeIds(tx, ids);
  const cur = await assigneesOf(tx, task.id);
  const added = next.filter((x) => !cur.includes(x));
  const removed = cur.filter((x) => !next.includes(x));
  if (!added.length && !removed.length) return task;
  if (removed.length) await tx.delete(workTaskAssignees).where(and(eq(workTaskAssignees.taskId, task.id), inArray(workTaskAssignees.userId, removed)));
  for (const u of added) await tx.insert(workTaskAssignees).values({ taskId: task.id, userId: u }).onConflictDoNothing();
  await ensureMembers(tx, space, added);
  // A removed person's clock stops.
  if (removed.length) await tx.update(workTaskSessions).set({ endedAt: now, endReason: "reassigned" }).where(and(eq(workTaskSessions.taskId, task.id), isNull(workTaskSessions.endedAt), inArray(workTaskSessions.userId, removed)));
  const names = await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...added, ...removed]));
  const nm = (xs: string[]) => xs.map((x) => names.find((n) => n.id === x)?.name ?? "someone").join(", ");
  await sysNote(tx, task.id, `${actor.name} ${[added.length ? `assigned ${nm(added)}` : "", removed.length ? `removed ${nm(removed)}` : ""].filter(Boolean).join(" and ")}.`, actor.id, now);
  if (added.length) {
    await notify(tx, actor, added, { kind: "assigned", title: `Assigned to you: ${task.title}`, body: `${space.name} · by ${actor.name}`, href: href(task) });
    await fire(tx, actor, space, { type: "assignee_added", task }, now, depth);
  }
  return task;
}

/** Board drag & drop: put a task in a status column, before another task (or at the end). */
export async function moveWorkTask(actor: Actor, taskId: string, input: { statusId: string; beforeId?: string | null }, now = new Date()) {
  return db.transaction(async (tx) => {
    const { task, space } = await loadTask(tx, actor, taskId);
    const t = await setStatusTx(tx, actor, space, task, input.statusId, now, 0);
    const col = await tx
      .select({ id: workTasks.id })
      .from(workTasks)
      .where(and(eq(workTasks.spaceId, space.id), eq(workTasks.statusId, input.statusId), isNull(workTasks.archivedAt), isNull(workTasks.parentId), ne(workTasks.id, t.id)))
      .orderBy(asc(workTasks.position));
    const ids = col.map((c) => c.id);
    const at = input.beforeId ? ids.indexOf(input.beforeId) : -1;
    ids.splice(at < 0 ? ids.length : at, 0, t.id);
    for (const [i, id] of ids.entries()) await tx.update(workTasks).set({ position: (i + 1) * 1024 }).where(eq(workTasks.id, id));
  });
}

export async function setFieldValue(actor: Actor, taskId: string, fieldId: string, raw: unknown) {
  return db.transaction(async (tx) => {
    const { task, space } = await loadTask(tx, actor, taskId);
    const [f] = await tx.select().from(spaceFields).where(and(eq(spaceFields.id, fieldId), eq(spaceFields.spaceId, space.id), isNull(spaceFields.archivedAt)));
    assert(f, "Column not found.");
    const value = await cleanValue(tx, f, raw);
    if (value === null) await tx.delete(workTaskValues).where(and(eq(workTaskValues.taskId, task.id), eq(workTaskValues.fieldId, f.id)));
    else await tx.insert(workTaskValues).values({ taskId: task.id, fieldId: f.id, value }).onConflictDoUpdate({ target: [workTaskValues.taskId, workTaskValues.fieldId], set: { value } });
    await tx.update(workTasks).set({ updatedAt: new Date() }).where(eq(workTasks.id, task.id));
    await sysNote(tx, task.id, `${actor.name} ${value === null ? `cleared ${f.name}` : `set ${f.name}`}.`, actor.id);
  });
}

async function cleanValue(tx: Tx, f: SpaceField, raw: unknown): Promise<unknown> {
  const s = typeof raw === "string" ? raw.trim() : raw;
  if (s === "" || s === null || s === undefined) return null;
  const opts = (f.options as FieldOption[]) ?? [];
  switch (f.type as FieldType) {
    case "text":
      return truncate(String(s), 2000);
    case "number":
    case "money": {
      const n = Number(String(s).replace(/,/g, ""));
      assert(Number.isFinite(n), `${f.name}: write a number.`);
      return n;
    }
    case "date":
      assert(isValidISODate(String(s)), `${f.name}: pick a day.`);
      return String(s);
    case "dropdown":
      assert(opts.some((o) => o.id === s), `${f.name}: pick one of the options.`);
      return s;
    case "labels": {
      const ids = (Array.isArray(s) ? s : String(s).split(",")).map(String).filter((x) => opts.some((o) => o.id === x));
      return ids.length ? [...new Set(ids)] : null;
    }
    case "checkbox":
      return s === true || s === "true" || s === "on" || s === "1" ? true : null;
    case "link": {
      const u = normalizeUrl(String(s));
      assert(u, `${f.name}: paste a web link.`);
      return u;
    }
    case "email":
      assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s)), `${f.name}: that doesn't look like an email.`);
      return String(s).toLowerCase().slice(0, 200);
    case "phone":
      assert(/^[+\d][\d\s()-]{4,24}$/.test(String(s)), `${f.name}: that doesn't look like a phone number.`);
      return String(s);
    case "person": {
      const [u] = await activeIds(tx, [String(s)]);
      assert(u, `${f.name}: pick someone.`);
      return u;
    }
    case "rating": {
      const n = Math.round(Number(s));
      assert(n >= 1 && n <= 5, `${f.name}: 1 to 5.`);
      return n;
    }
    case "progress": {
      const n = Math.round(Number(s));
      assert(n >= 0 && n <= 100, `${f.name}: 0 to 100.`);
      return n;
    }
  }
  return null;
}

export async function archiveWorkTask(actor: Actor, taskId: string, archived = true) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(workTasks).where(eq(workTasks.id, taskId));
    assert(task, "Task not found.");
    const space = await assertWork(tx, actor, task.spaceId);
    assert(task.createdById === actor.id || (await loadSpace(tx, actor, space.id)).access.manage || can.manageWorkflow(actor), "Only whoever created it or the space's admins can delete a task.");
    const now = new Date();
    const ids = [task.id, ...(await tx.select({ id: workTasks.id }).from(workTasks).where(eq(workTasks.parentId, task.id))).map((r) => r.id)];
    await tx.update(workTasks).set({ archivedAt: archived ? now : null }).where(inArray(workTasks.id, ids));
    if (archived) for (const id of ids) await stopClock(tx, id, now, "archived");
    await logActivity(tx, actor, { action: archived ? "space_task_deleted" : "space_task_restored", brandId: space.brandId, summary: `${actor.name} ${archived ? "deleted" : "restored"} “${task.title}” in ${space.name}.`, meta: { spaceId: space.id, taskId } });
    return task;
  });
}

export async function commentOnTask(actor: Actor, taskId: string, body: string) {
  const text = body.trim();
  assert(text, "Write a comment.");
  assert(text.length <= 4000, "That comment is too long.");
  return db.transaction(async (tx) => {
    const { task, space } = await loadTask(tx, actor, taskId);
    await tx.insert(workTaskComments).values({ taskId, authorId: actor.id, body: text });
    const people = await assigneesOf(tx, taskId);
    const { findMentions } = await import("./chat");
    const everyone = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true));
    const mentioned = findMentions(text, everyone);
    await notify(tx, actor, mentioned, { kind: "mention", title: `${actor.name} mentioned you: ${task.title}`, body: truncate(text, 140), href: href(task) });
    await notify(
      tx,
      actor,
      [...people, task.createdById].filter((x) => x && !mentioned.includes(x)),
      { kind: "comment", title: `${actor.name} commented: ${task.title}`, body: truncate(text, 140), href: href(task) },
    );
    void space;
  });
}

export async function deleteTaskComment(actor: Actor, commentId: string) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(workTaskComments).where(eq(workTaskComments.id, commentId));
    assert(c && !c.deletedAt && !c.system, "Comment not found.");
    await loadTask(tx, actor, c.taskId);
    assert(c.authorId === actor.id || can.manageWorkflow(actor), "You can only delete your own comments.");
    await tx.update(workTaskComments).set({ deletedAt: new Date() }).where(eq(workTaskComments.id, commentId));
  });
}

/** The clock button on a task: stop my running clock, or start it (I become assigned if nobody is). */
export async function toggleTaskClock(actor: Actor, taskId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { task, space } = await loadTask(tx, actor, taskId);
    const open = await tx.select().from(workTaskSessions).where(and(eq(workTaskSessions.taskId, taskId), isNull(workTaskSessions.endedAt), eq(workTaskSessions.userId, actor.id)));
    if (open.length) {
      await tx.update(workTaskSessions).set({ endedAt: now, endReason: "paused" }).where(eq(workTaskSessions.id, open[0].id));
      await sysNote(tx, taskId, `${actor.name} paused the clock.`, actor.id, now);
      return false;
    }
    const statuses = await statusesOf(tx, space.id);
    const st = statuses.find((s) => s.id === task.statusId);
    assert(!st || !isFinishedKind(st.kind), "This task is finished. Move it back to a working status first.");
    const people = await assigneesOf(tx, taskId);
    if (!people.includes(actor.id)) await tx.insert(workTaskAssignees).values({ taskId, userId: actor.id }).onConflictDoNothing();
    // Starting the clock on a task that hasn't started moves it to the first "in progress" status.
    const active = statuses.find((s) => s.kind === "active");
    if (st?.kind === "open" && active) await setStatusTx(tx, actor, space, task, active.id, now, 0);
    await startClockFor(tx, taskId, actor.id, now);
    await sysNote(tx, taskId, `${actor.name} started the clock.`, actor.id, now);
    return true;
  });
}

/** Start one person's clock without stopping the others' (several people can work on one task). */
async function startClockFor(tx: Tx, taskId: string, userId: string, now: Date) {
  const open = await tx.select().from(workTaskSessions).where(and(eq(workTaskSessions.taskId, taskId), isNull(workTaskSessions.endedAt), eq(workTaskSessions.userId, userId)));
  if (!open.length) await tx.insert(workTaskSessions).values({ taskId, userId, startedAt: now });
}

/** For attachments: may this person add files to this task? */
export async function assertTaskWork(tx: Tx, actor: Actor, taskId: string) {
  const [task] = await tx.select().from(workTasks).where(eq(workTasks.id, taskId));
  assert(task && !task.archivedAt, "Task not found.");
  await assertWork(tx, actor, task.spaceId);
  return task;
}

/* ------------------------------------------------------------------ */
/* Automations                                                          */
/* ------------------------------------------------------------------ */

export async function saveAutomation(actor: Actor, spaceId: string, input: { id?: string | null; name: string; trigger: Trigger; actions: Action[]; enabled?: boolean }) {
  const name = truncate(input.name.trim(), 80) || "Automation";
  assert(input.trigger?.type in TRIGGERS, "Pick when it runs.");
  assert(input.actions?.length, "Add at least one thing to do.");
  assert(input.actions.length <= 6, "Up to 6 things per automation.");
  return db.transaction(async (tx) => {
    await assertManage(tx, actor, spaceId);
    const statuses = await statusesOf(tx, spaceId);
    const spaceLists = await tx.select().from(lists).where(and(eq(lists.spaceId, spaceId), isNull(lists.archivedAt)));
    if (TRIGGERS[input.trigger.type].needsStatus) assert(statuses.some((s) => s.id === input.trigger.statusId), "Pick the status it waits for.");
    if (input.trigger.listId) assert(spaceLists.some((l) => l.id === input.trigger.listId), "Pick a list of this space.");
    const actions: Action[] = [];
    for (const a of input.actions) {
      assert(ACTION_LIST.includes(a.type), "Unknown action.");
      if (a.type === "set_status" || a.type === "parent_status") assert(statuses.some((s) => s.id === a.statusId), "Pick the status to set.");
      if (a.type === "assign") assert((a.userIds = await activeIds(tx, a.userIds ?? [])).length, "Pick who to assign.");
      if (a.type === "notify" && a.to === "people") assert((a.userIds = await activeIds(tx, a.userIds ?? [])).length, "Pick who to notify.");
      if (a.type === "notify") a.message = a.message?.trim().slice(0, 140) || undefined;
      if (a.type === "set_priority") assert(a.priority in PRIORITIES, "Pick a priority.");
      if (a.type === "set_due_in_days") assert(Number.isInteger(a.days) && a.days >= 0 && a.days <= 365, "Days: 0 to 365.");
      if (a.type === "move_to_list") assert(spaceLists.some((l) => l.id === a.listId), "Pick the list.");
      if (a.type === "add_subtasks") assert((a.titles = (a.titles ?? []).map((x) => truncate(x.trim(), 200)).filter(Boolean).slice(0, 20)).length, "Write the subtasks (one per line).");
      if (a.type === "add_comment") assert((a.text = a.text?.trim().slice(0, 1000) ?? ""), "Write the comment.");
      actions.push(a);
    }
    const values = { name, trigger: { type: input.trigger.type, statusId: input.trigger.statusId || null, listId: input.trigger.listId || null, priority: input.trigger.priority || null }, actions, enabled: input.enabled ?? true };
    if (input.id) await tx.update(automations).set(values).where(and(eq(automations.id, input.id), eq(automations.spaceId, spaceId)));
    else await tx.insert(automations).values({ spaceId, ...values, createdById: actor.id });
    await logActivity(tx, actor, { action: "space_automation", summary: `${actor.name} ${input.id ? "updated" : "added"} the automation “${name}”.`, meta: { spaceId } });
  });
}

export async function setAutomationEnabled(actor: Actor, automationId: string, enabled: boolean | null) {
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(automations).where(eq(automations.id, automationId));
    assert(a && !a.archivedAt, "Automation not found.");
    await assertManage(tx, actor, a.spaceId);
    if (enabled === null) await tx.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, automationId));
    else await tx.update(automations).set({ enabled }).where(eq(automations.id, automationId));
  });
}

/** Run the space's automations for something that just happened. Chains up to 3 levels (no loops). */
async function fire(tx: Tx, actor: Actor, space: Space, ev: Event, now: Date, depth: number) {
  if (depth >= 3) return;
  const rules = (await tx.select().from(automations).where(and(eq(automations.spaceId, space.id), eq(automations.enabled, true), isNull(automations.archivedAt)))) as Automation[];
  for (const r of rules) {
    const trig = r.trigger as Trigger;
    if (trig.type !== ev.type) continue;
    if (trig.statusId && trig.statusId !== ev.statusId) continue;
    if (trig.listId && trig.listId !== ev.task.listId) continue;
    if (trig.priority && trig.priority !== ev.priority) continue;
    const [fresh] = await tx.select().from(workTasks).where(eq(workTasks.id, ev.task.id));
    if (!fresh || fresh.archivedAt) continue;
    let task = fresh;
    const by = `⚡ ${r.name}`;
    await sysNote(tx, task.id, `⚡ Automation “${r.name}” ran.`, null, now);
    for (const a of r.actions as Action[]) task = await runAction(tx, actor, space, task, a, now, depth + 1, by);
    await tx.update(automations).set({ runs: sql`${automations.runs} + 1`, lastRunAt: now }).where(eq(automations.id, r.id));
  }
}

async function runAction(tx: Tx, actor: Actor, space: Space, task: WorkTask, a: Action, now: Date, depth: number, by: string): Promise<WorkTask> {
  switch (a.type) {
    case "set_status":
      return setStatusTx(tx, actor, space, task, a.statusId, now, depth, by);
    case "parent_status": {
      if (!task.parentId) return task;
      const [p] = await tx.select().from(workTasks).where(eq(workTasks.id, task.parentId));
      if (p && !p.archivedAt) await setStatusTx(tx, actor, space, p, a.statusId, now, depth, by);
      return task;
    }
    case "assign": {
      const cur = await assigneesOf(tx, task.id);
      return setAssigneesTx(tx, actor, space, task, [...cur, ...a.userIds], now, depth);
    }
    case "unassign_all":
      await stopClock(tx, task.id, now, "reassigned");
      await tx.delete(workTaskAssignees).where(eq(workTaskAssignees.taskId, task.id));
      await sysNote(tx, task.id, `${by} removed everyone assigned.`, null, now);
      return task;
    case "notify": {
      const to = a.to === "assignees" ? await assigneesOf(tx, task.id) : a.to === "creator" ? [task.createdById] : (a.userIds ?? []);
      await notify(tx, null, to, { kind: "task", title: `${a.message || "Update"}: ${task.title}`, body: `${space.name} · ${by}`, href: href(task) });
      return task;
    }
    case "set_priority": {
      const [t] = await tx.update(workTasks).set({ priority: a.priority, updatedAt: now }).where(eq(workTasks.id, task.id)).returning();
      await sysNote(tx, task.id, `${by} set the priority to ${PRIORITIES[a.priority].label}.`, null, now);
      return t;
    }
    case "set_due_in_days": {
      const due = addDays(todayISO(now), a.days);
      const [t] = await tx.update(workTasks).set({ dueDate: due, dueFiredAt: null, updatedAt: now }).where(eq(workTasks.id, task.id)).returning();
      await sysNote(tx, task.id, `${by} set the due date to ${due}.`, null, now);
      return t;
    }
    case "move_to_list": {
      if (task.parentId || task.listId === a.listId) return task;
      const [t] = await tx.update(workTasks).set({ listId: a.listId, updatedAt: now }).where(eq(workTasks.id, task.id)).returning();
      await tx.update(workTasks).set({ listId: a.listId }).where(eq(workTasks.parentId, task.id));
      await sysNote(tx, task.id, `${by} moved it to another list.`, null, now);
      return t;
    }
    case "add_subtasks": {
      if (task.parentId) return task;
      const have = (await tx.select({ title: workTasks.title }).from(workTasks).where(and(eq(workTasks.parentId, task.id), isNull(workTasks.archivedAt)))).map((r) => r.title.toLowerCase());
      for (const title of a.titles.filter((x) => !have.includes(x.toLowerCase()))) await createTaskTx(tx, actor, space, task.listId, { title, parentId: task.id }, now, depth);
      return task;
    }
    case "add_comment":
      await sysNote(tx, task.id, `${by}: ${a.text}`, null, now);
      return task;
  }
  return task;
}

/** Time-based automations ("the due date passes"), run by the same 5-minute job as the auto pause. */
export async function fireDueAutomations(now = new Date()) {
  const today = todayISO(now);
  const due = await db
    .select({ task: workTasks })
    .from(workTasks)
    .innerJoin(spaces, eq(spaces.id, workTasks.spaceId))
    .where(and(isNull(workTasks.archivedAt), isNull(workTasks.completedAt), isNull(workTasks.dueFiredAt), lt(workTasks.dueDate, today), isNull(spaces.archivedAt)));
  for (const { task } of due) {
    await db.transaction(async (tx) => {
      const [space] = await tx.select().from(spaces).where(eq(spaces.id, task.spaceId));
      await tx.update(workTasks).set({ dueFiredAt: now }).where(eq(workTasks.id, task.id));
      // Changes made by a time-based rule are made in the name of whoever created the task (or the space).
      const ownerId = task.createdById ?? space?.createdById;
      const [owner] = ownerId ? await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, ownerId)) : [];
      if (space && owner) await fire(tx, { id: owner.id, name: owner.name }, space, { type: "due_date_passed", task }, now, 0);
    });
  }
  return due.length;
}

/* ------------------------------------------------------------------ */
/* Reading                                                              */
/* ------------------------------------------------------------------ */

export type TaskView = {
  id: string;
  spaceId: string;
  listId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  statusId: string;
  priority: Priority | null;
  startDate: string | null;
  dueDate: string | null;
  position: number;
  createdAt: Date;
  completedAt: Date | null;
  createdById: string | null;
  assigneeIds: string[];
  values: Record<string, unknown>;
  subtasks: { total: number; done: number };
  comments: number;
  files: number;
  time: { ms: number; running: boolean };
};

async function taskViews(rows: WorkTask[], finished: Set<string>, now = new Date()): Promise<TaskView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { attachments } = await import("@/db/schema");
  const [ass, vals, subs, comm, files, sess] = await Promise.all([
    db.select().from(workTaskAssignees).where(inArray(workTaskAssignees.taskId, ids)),
    db.select().from(workTaskValues).where(inArray(workTaskValues.taskId, ids)),
    db.select({ parentId: workTasks.parentId, statusId: workTasks.statusId }).from(workTasks).where(and(inArray(workTasks.parentId, ids), isNull(workTasks.archivedAt))),
    db
      .select({ taskId: workTaskComments.taskId, n: sql<number>`count(*)::int` })
      .from(workTaskComments)
      .where(and(inArray(workTaskComments.taskId, ids), eq(workTaskComments.system, false), isNull(workTaskComments.deletedAt)))
      .groupBy(workTaskComments.taskId),
    db
      .select({ taskId: attachments.workTaskId, n: sql<number>`count(*)::int` })
      .from(attachments)
      .where(and(inArray(attachments.workTaskId, ids), isNull(attachments.deletedAt)))
      .groupBy(attachments.workTaskId),
    db.select().from(workTaskSessions).where(inArray(workTaskSessions.taskId, ids)),
  ]);
  return rows.map((r) => {
    const mySubs = subs.filter((s) => s.parentId === r.id);
    const mySess = sess.filter((s) => s.taskId === r.id);
    return {
      id: r.id,
      spaceId: r.spaceId,
      listId: r.listId,
      parentId: r.parentId,
      title: r.title,
      description: r.description,
      statusId: r.statusId,
      priority: (r.priority as Priority) ?? null,
      startDate: r.startDate,
      dueDate: r.dueDate,
      position: r.position,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      createdById: r.createdById,
      assigneeIds: ass.filter((a) => a.taskId === r.id).map((a) => a.userId),
      values: Object.fromEntries(vals.filter((v) => v.taskId === r.id).map((v) => [v.fieldId, v.value])),
      subtasks: { total: mySubs.length, done: mySubs.filter((s) => finished.has(s.statusId)).length },
      comments: comm.find((c) => c.taskId === r.id)?.n ?? 0,
      files: files.find((c) => c.taskId === r.id)?.n ?? 0,
      time: { ms: mySess.reduce((t, s) => t + ((s.endedAt ?? now).getTime() - s.startedAt.getTime()), 0), running: mySess.some((s) => !s.endedAt) },
    };
  });
}

/** Everything a space page needs. */
export async function getSpacePage(actor: Actor, spaceId: string) {
  const { space, access } = await loadSpace(db, actor, spaceId);
  const [statuses, folderRows, listRows, fields, members, taskRows, autos] = await Promise.all([
    db.select().from(spaceStatuses).where(and(eq(spaceStatuses.spaceId, spaceId), isNull(spaceStatuses.archivedAt))).orderBy(asc(spaceStatuses.position)),
    db.select().from(folders).where(and(eq(folders.spaceId, spaceId), isNull(folders.archivedAt))).orderBy(asc(folders.position)),
    db.select().from(lists).where(and(eq(lists.spaceId, spaceId), isNull(lists.archivedAt))).orderBy(asc(lists.position)),
    db.select().from(spaceFields).where(and(eq(spaceFields.spaceId, spaceId), isNull(spaceFields.archivedAt))).orderBy(asc(spaceFields.position)),
    db.select({ userId: spaceMembers.userId, role: spaceMembers.role, name: users.name }).from(spaceMembers).innerJoin(users, eq(users.id, spaceMembers.userId)).where(and(eq(spaceMembers.spaceId, spaceId), eq(users.isActive, true))),
    db.select().from(workTasks).where(and(eq(workTasks.spaceId, spaceId), isNull(workTasks.archivedAt))).orderBy(asc(workTasks.position)),
    db.select().from(automations).where(and(eq(automations.spaceId, spaceId), isNull(automations.archivedAt))).orderBy(asc(automations.createdAt)),
  ]);
  const finished = new Set(statuses.filter((s) => isFinishedKind(s.kind)).map((s) => s.id));
  const tasks = await taskViews(taskRows, finished);
  return { space, access, statuses, folders: folderRows, lists: listRows, fields, members: members.map((m) => ({ ...m, role: m.role as SpaceRole })), tasks, automations: autos };
}

export type SpacePage = Awaited<ReturnType<typeof getSpacePage>>;

/** One task with its subtasks, comments & history, files and time. */
export async function getTaskPage(actor: Actor, taskId: string) {
  assert(/^[0-9a-f-]{36}$/i.test(taskId), "Task not found.");
  const [row] = await db.select().from(workTasks).where(eq(workTasks.id, taskId));
  assert(row, "Task not found.");
  const page = await getSpacePage(actor, row.spaceId);
  const task = page.tasks.find((t) => t.id === taskId);
  const [archived] = row.archivedAt ? await taskViews([row], new Set()) : [];
  const comments = await db
    .select({ id: workTaskComments.id, body: workTaskComments.body, system: workTaskComments.system, createdAt: workTaskComments.createdAt, authorId: workTaskComments.authorId, authorName: users.name })
    .from(workTaskComments)
    .leftJoin(users, eq(users.id, workTaskComments.authorId))
    .where(and(eq(workTaskComments.taskId, taskId), isNull(workTaskComments.deletedAt)))
    .orderBy(asc(workTaskComments.createdAt));
  const sessions = await db
    .select({ id: workTaskSessions.id, userId: workTaskSessions.userId, name: users.name, startedAt: workTaskSessions.startedAt, endedAt: workTaskSessions.endedAt, endReason: workTaskSessions.endReason })
    .from(workTaskSessions)
    .innerJoin(users, eq(users.id, workTaskSessions.userId))
    .where(eq(workTaskSessions.taskId, taskId))
    .orderBy(asc(workTaskSessions.startedAt));
  return { ...page, task: task ?? archived, archived: !!row.archivedAt, subtasks: page.tasks.filter((t) => t.parentId === taskId), comments, sessions };
}

/** Open space tasks on this person (My tasks), with where they live. */
export async function mySpaceTasks(actor: Actor) {
  const visible = await visibleSpaces(actor);
  if (!visible.length) return [];
  const mine = await db
    .select({ task: workTasks })
    .from(workTasks)
    .innerJoin(workTaskAssignees, eq(workTaskAssignees.taskId, workTasks.id))
    .where(and(eq(workTaskAssignees.userId, actor.id), isNull(workTasks.archivedAt), isNull(workTasks.completedAt), inArray(workTasks.spaceId, visible.map((s) => s.id))));
  if (!mine.length) return [];
  const spaceIds = [...new Set(mine.map((m) => m.task.spaceId))];
  const [statuses, listRows] = await Promise.all([
    db.select().from(spaceStatuses).where(and(inArray(spaceStatuses.spaceId, spaceIds), isNull(spaceStatuses.archivedAt))).orderBy(asc(spaceStatuses.position)),
    db.select().from(lists).where(inArray(lists.spaceId, spaceIds)),
  ]);
  const finished = new Set(statuses.filter((s) => isFinishedKind(s.kind)).map((s) => s.id));
  const views = await taskViews(
    mine.map((m) => m.task),
    finished,
  );
  return views
    .map((t) => ({
      ...t,
      space: visible.find((s) => s.id === t.spaceId)!,
      list: listRows.find((l) => l.id === t.listId) ?? null,
      status: statuses.find((s) => s.id === t.statusId)!,
      statuses: statuses.filter((s) => s.spaceId === t.spaceId),
    }))
    // Soonest due first, then the most urgent.
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.priority ? PRIORITIES[a.priority].rank : 9) - (b.priority ? PRIORITIES[b.priority].rank : 9));
}

export type MySpaceTask = Awaited<ReturnType<typeof mySpaceTasks>>[number];
export type { SpaceStatus };
