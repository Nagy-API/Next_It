/**
 * The Shoot schedule: every planned shoot in one place, so everyone knows what is shot each day, from when to
 * when, who goes and what's needed. Two sources:
 *  - content items' own shoots (content_items.shoot_*, planned on the Pre-production step);
 *  - extra shoot slots (table `shoots`): an event, a video outside the plan, a client job. Several slots can share a
 *    day (Blissify 2–4 pm, OG Hub 6–10 pm). When a slot is marked "Shot", it can go to someone for editing.
 */
import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { brands, contentItems, contentPlans, projects, clients, shoots, stages, tasks, users, type Shoot } from "@/db/schema";
import { can } from "@/domain/permissions";
import { shootSpan } from "@/domain/shoot";
import { addDays, cairoDate, formatDay, isValidISODate, isValidTime, monthLabel, todayISO } from "@/lib/dates";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import { ensurePlanTx } from "./items";
import { brandLogoSrc } from "./queries";
import { notify } from "./notify";
import { defaultAssigneeTx, truncate } from "./workflow";

export type ShootEntry = {
  kind: "item" | "slot";
  id: string;
  title: string;
  brand: { id: string; name: string; color: string; logoUrl: string | null; slug: string } | null;
  where: string;
  day: string;
  start: string | null;
  end: string | null;
  location: string | null;
  people: number | null;
  rentals: string | null;
  rentalsReady: boolean;
  purchases: string | null;
  purchasesReady: boolean;
  notes: string | null;
  crew: { id: string; name: string }[];
  /** The person responsible: the shooting step's person, else who planned the slot. */
  owner: { id: string; name: string } | null;
  status: "planned" | "shot" | "cancelled";
  after: "none" | "edit";
  editor: { id: string; name: string } | null;
  href: string;
  /** Raw slot (for editing), slots only. */
  slot?: Shoot;
};

const NOT_ALLOWED = "Only people who plan shoots can change the shoot schedule.";

/** Everything shot between two days (inclusive), in time order. */
export async function getShootSchedule(from: string, to: string): Promise<ShootEntry[]> {
  const [people, brandRows] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ id: brands.id, name: brands.name, color: brands.color, slug: brands.slug, deletedAt: brands.deletedAt, logo: brandLogoSrc }).from(brands),
  ]);
  const nm = (id: string | null | undefined) => (id ? (people.find((p) => p.id === id) ?? null) : null);
  const brandOf = (id: string | null) => {
    const b = id ? brandRows.find((x) => x.id === id) : null;
    return b && !b.deletedAt ? { id: b.id, name: b.name, color: b.color, logoUrl: b.logo, slug: b.slug } : null;
  };
  const itemRows = await db
    .select({ item: contentItems, brandId: contentPlans.brandId, client: clients.name, project: projects.name })
    .from(contentItems)
    .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
    .leftJoin(projects, eq(projects.id, contentItems.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(gte(contentItems.shootDate, from), lte(contentItems.shootDate, to), isNull(contentItems.cancelledAt)));
  const ids = itemRows.map((r) => r.item.id);
  const shootStages = ids.length ? await db.select().from(stages).where(and(inArray(stages.itemId, ids), eq(stages.kind, "shooting"))) : [];
  const out: ShootEntry[] = itemRows.map(({ item, brandId, client, project }) => {
    const st = shootStages.find((s) => s.itemId === item.id);
    const span = shootSpan(item);
    const [start, end] = span.includes("–") ? span.split("–") : [item.shootTime, null];
    const brand = brandOf(brandId);
    return {
      kind: "item",
      id: item.id,
      title: item.title,
      brand,
      where: brand?.name ?? (client ? `${client} · ${project}` : ""),
      day: item.shootDate!,
      start: start ?? null,
      end: end ?? null,
      location: item.shootLocation,
      people: item.shootPeople,
      rentals: item.shootRentals,
      rentalsReady: item.shootRentalsReady,
      purchases: item.shootPurchases,
      purchasesReady: item.shootPurchasesReady,
      notes: item.shootNotes,
      crew: item.shootCrewIds.map((id) => nm(id)).filter((x): x is { id: string; name: string } => !!x),
      owner: nm(st?.assigneeId),
      status: st?.status === "done" ? "shot" : "planned",
      after: "edit",
      editor: null,
      href: `/items/${item.id}`,
    };
  });
  const slots = await db
    .select()
    .from(shoots)
    .where(and(gte(shoots.day, from), lte(shoots.day, to), isNull(shoots.deletedAt)));
  for (const s of slots) {
    const brand = brandOf(s.brandId);
    out.push({
      kind: "slot",
      id: s.id,
      title: s.title,
      brand,
      where: brand?.name ?? "Outside the plan",
      day: s.day,
      start: s.startTime,
      end: s.endTime,
      location: s.location,
      people: s.people,
      rentals: s.rentals,
      rentalsReady: s.rentalsReady,
      purchases: s.purchases,
      purchasesReady: s.purchasesReady,
      notes: s.notes,
      crew: s.crewIds.map((id) => nm(id)).filter((x): x is { id: string; name: string } => !!x),
      owner: nm(s.createdById),
      status: s.status as ShootEntry["status"],
      after: s.after as ShootEntry["after"],
      editor: nm(s.editorId),
      href: s.itemId ? `/items/${s.itemId}` : `/shoots?d=${s.day}&open=${s.id}`,
      slot: s,
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? "99").localeCompare(b.start ?? "99"));
}

/** Reels waiting for a shoot day (their Pre-production step is open and nobody picked a day yet). */
export async function getUnscheduled() {
  const rows = await db
    .select({ id: contentItems.id, title: contentItems.title, postingDate: contentItems.postingDate, brandId: contentPlans.brandId, assigneeId: stages.assigneeId })
    .from(stages)
    .innerJoin(contentItems, eq(contentItems.id, stages.itemId))
    .leftJoin(contentPlans, eq(contentPlans.id, contentItems.planId))
    .where(and(eq(stages.kind, "shooting"), ne(stages.status, "done"), isNull(contentItems.shootDate), isNull(contentItems.cancelledAt)))
    .orderBy(asc(contentItems.postingDate));
  const [people, brandRows] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ id: brands.id, name: brands.name, color: brands.color, slug: brands.slug, deletedAt: brands.deletedAt }).from(brands),
  ]);
  return rows
    .filter((r) => !r.brandId || !brandRows.find((b) => b.id === r.brandId)?.deletedAt)
    .map((r) => ({ ...r, brand: brandRows.find((b) => b.id === r.brandId) ?? null, owner: people.find((p) => p.id === r.assigneeId)?.name ?? null }));
}

type SlotInput = {
  title: string;
  brandId?: string | null;
  day: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  people?: number | null;
  rentals?: string | null;
  rentalsReady?: boolean;
  purchases?: string | null;
  purchasesReady?: boolean;
  notes?: string | null;
  crewIds?: string[];
  after?: "none" | "edit";
  editorId?: string | null;
};

async function cleanSlot(tx: Tx, input: SlotInput) {
  const title = truncate(input.title.trim(), 200);
  assert(title, "What's being shot? Give it a name.");
  assert(isValidISODate(input.day), "Pick the day.");
  assert(isValidTime(input.startTime) && isValidTime(input.endTime), "Times look like 14:00.");
  assert(input.endTime > input.startTime, "It must end after it starts.");
  if (input.people !== null && input.people !== undefined) assert(Number.isInteger(input.people) && input.people >= 0 && input.people <= 999, "How many people: a whole number.");
  if (input.brandId) {
    const [b] = await tx.select().from(brands).where(eq(brands.id, input.brandId));
    assert(b && !b.deletedAt, "Brand not found.");
  }
  const ids = [...new Set((input.crewIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
  const crew = ids.length ? (await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.isActive, true)))).map((r) => r.id) : [];
  const after = input.after === "edit" ? "edit" : "none";
  let editorId: string | null = null;
  if (after === "edit" && input.editorId) {
    const [e] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.editorId), eq(users.isActive, true)));
    assert(e, "Pick who edits it.");
    editorId = e.id;
  }
  const t = (v: string | null | undefined, n: number) => v?.trim().slice(0, n) || null;
  return {
    title,
    brandId: input.brandId || null,
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
    location: t(input.location, 200),
    people: input.people ?? null,
    rentals: t(input.rentals, 500),
    rentalsReady: !!input.rentals?.trim() && !!input.rentalsReady,
    purchases: t(input.purchases, 500),
    purchasesReady: !!input.purchases?.trim() && !!input.purchasesReady,
    notes: t(input.notes, 2000),
    crewIds: crew,
    after,
    editorId,
  } as const;
}

/** Another slot on the same day overlapping these times with the same people: a friendly warning, not an error. */
export async function clashes(day: string, start: string, end: string, crewIds: string[], exceptId?: string) {
  if (!crewIds.length) return [];
  const all = await getShootSchedule(day, day);
  return all.filter((e) => e.id !== exceptId && e.status !== "cancelled" && e.start && e.end && e.start < end && e.end > start && e.crew.some((c) => crewIds.includes(c.id)));
}

export async function createShoot(actor: Actor, input: SlotInput) {
  assert(can.planShoot(actor), NOT_ALLOWED);
  return db.transaction(async (tx) => {
    const v = await cleanSlot(tx, input);
    const [s] = await tx.insert(shoots).values({ ...v, createdById: actor.id }).returning();
    await logActivity(tx, actor, { action: "shoot_slot_added", brandId: v.brandId, summary: `${actor.name} added a shoot: “${v.title}” on ${formatDay(v.day)} ${v.startTime}–${v.endTime}.`, meta: { shootId: s.id } });
    await notify(tx, actor, v.crewIds, { kind: "deadline", title: `Shoot ${formatDay(v.day)} ${v.startTime}–${v.endTime}: ${v.title}`, body: v.location ? `At ${v.location}` : null, href: `/shoots?d=${v.day}&open=${s.id}` });
    return s;
  });
}

export async function updateShoot(actor: Actor, id: string, input: SlotInput) {
  assert(can.planShoot(actor), NOT_ALLOWED);
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(shoots).where(eq(shoots.id, id)).for("update");
    assert(cur && !cur.deletedAt, "That shoot no longer exists.");
    const v = await cleanSlot(tx, input);
    await tx.update(shoots).set(v).where(eq(shoots.id, id));
    const moved = cur.day !== v.day || cur.startTime !== v.startTime || cur.endTime !== v.endTime;
    await logActivity(tx, actor, {
      action: "shoot_slot_updated",
      brandId: v.brandId,
      summary: moved ? `${actor.name} moved the shoot “${v.title}” to ${formatDay(v.day)} ${v.startTime}–${v.endTime}.` : `${actor.name} updated the shoot “${v.title}”.`,
      meta: { shootId: id },
    });
    const newCrew = v.crewIds.filter((x) => !cur.crewIds.includes(x));
    await notify(tx, actor, moved ? v.crewIds : newCrew, { kind: "deadline", title: `${moved ? "Shoot moved" : "You're on a shoot"}: ${v.title}`, body: `${formatDay(v.day)} ${v.startTime}–${v.endTime}`, href: `/shoots?d=${v.day}&open=${id}` });
  });
}

/** Shot (optionally sending it to the editor), cancelled, or back to planned. */
export async function setShootStatus(actor: Actor, id: string, status: "planned" | "shot" | "cancelled", now = new Date()) {
  assert(can.planShoot(actor), NOT_ALLOWED);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(shoots).where(eq(shoots.id, id)).for("update");
    assert(s && !s.deletedAt, "That shoot no longer exists.");
    if (s.status === status) return { itemId: s.itemId, taskId: s.taskId };
    let itemId = s.itemId;
    let taskId = s.taskId;
    if (status === "shot" && s.after === "edit" && s.editorId && !s.itemId && !s.taskId) {
      if (s.brandId) {
        // A real item in the brand's plan, starting at editing, with the editor on it.
        const year = Number(s.day.slice(0, 4));
        const month = Number(s.day.slice(5, 7));
        const planId = await ensurePlanTx(tx, actor, s.brandId, year, month);
        const [item] = await tx.insert(contentItems).values({ title: s.title, type: "reel", planId, extraRequestedById: actor.id, createdById: actor.id, createdAt: now }).returning();
        const social = await defaultAssigneeTx(tx, s.brandId, "social");
        await tx.insert(stages).values([
          { itemId: item.id, kind: "media" as const, position: 0, status: "active" as const, activatedAt: now, assigneeId: s.editorId },
          { itemId: item.id, kind: "social" as const, position: 1, status: "waiting" as const, assigneeId: social },
        ]);
        const [b] = await tx.select({ name: brands.name }).from(brands).where(eq(brands.id, s.brandId));
        await logActivity(tx, actor, { action: "item_created", itemId: item.id, brandId: s.brandId, subjectUserId: s.editorId, summary: `${actor.name} sent the shoot “${s.title}” for editing (${b?.name} · ${monthLabel(year, month)}).`, at: now });
        itemId = item.id;
      } else {
        const [t] = await tx
          .insert(tasks)
          .values({ title: `Edit: ${s.title}`, notes: s.notes, assigneeId: s.editorId, createdById: actor.id, dueDate: addDays(cairoDate(now), 2), createdAt: now })
          .returning();
        await tx.update(tasks).set({ seriesId: t.id }).where(eq(tasks.id, t.id));
        taskId = t.id;
      }
      await notify(tx, actor, [s.editorId], { kind: "new_task", title: `To edit: ${s.title}`, body: `Shot on ${formatDay(s.day)} · from ${actor.name}`, itemId, href: itemId ? null : "/my-work#tasks" });
    }
    await tx.update(shoots).set({ status, shotAt: status === "shot" ? now : null, itemId, taskId }).where(eq(shoots.id, id));
    await logActivity(tx, actor, {
      action: `shoot_slot_${status}`,
      brandId: s.brandId,
      summary: status === "shot" ? `${actor.name} marked “${s.title}” as shot.` : status === "cancelled" ? `${actor.name} cancelled the shoot “${s.title}”.` : `${actor.name} put “${s.title}” back to planned.`,
      meta: { shootId: id },
    });
    if (status === "cancelled") await notify(tx, actor, s.crewIds, { kind: "deadline", title: `Shoot cancelled: ${s.title}`, body: `${formatDay(s.day)} ${s.startTime}–${s.endTime}`, href: `/shoots?d=${s.day}` });
    return { itemId, taskId };
  });
}

export async function deleteShoot(actor: Actor, id: string) {
  assert(can.planShoot(actor), NOT_ALLOWED);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(shoots).where(eq(shoots.id, id));
    assert(s && !s.deletedAt, "That shoot no longer exists.");
    await tx.update(shoots).set({ deletedAt: new Date() }).where(eq(shoots.id, id));
    await logActivity(tx, actor, { action: "shoot_slot_deleted", brandId: s.brandId, summary: `${actor.name} deleted the shoot “${s.title}” (${formatDay(s.day)}).`, meta: { shootId: id } });
  });
}

/** Today's and the next shoots on this person (crew or owner), for My tasks and the Overview. */
export async function shootsFor(userId: string | null, days = 7) {
  const today = todayISO();
  const all = await getShootSchedule(today, addDays(today, days));
  return all.filter((e) => e.status === "planned" && (!userId || e.owner?.id === userId || e.crew.some((c) => c.id === userId)));
}
