/**
 * Docs, whiteboards and sheets inside a space (Spaces v2). Their content is plain JSON validated by
 * src/domain/pages.ts — never HTML — so nothing a person types can run as code in someone else's browser.
 *
 * Who: anyone who can work in the space creates and edits pages; viewers only read. Creating, renaming and
 * deleting go to the Activity log; autosaves don't (they happen every few seconds).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { spacePages, users } from "@/db/schema";
import { LIMITS, PAGE_KINDS, cleanContent, contentSize, emptyContent, isPageKind, type PageKind } from "@/domain/pages";
import { pageTemplateByKey } from "@/domain/page-templates";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";
import { loadSpace } from "./spaces";

const NOT_FOUND = "That page doesn't exist or you can't see it.";
const UUID = /^[0-9a-f-]{36}$/i;

/** The pages of these spaces, for the sidebar tree. */
export async function pagesForSpaces(spaceIds: string[]) {
  if (!spaceIds.length) return [];
  return db
    .select({ id: spacePages.id, spaceId: spacePages.spaceId, title: spacePages.title, kind: spacePages.kind, icon: spacePages.icon })
    .from(spacePages)
    .where(and(inArray(spacePages.spaceId, spaceIds), isNull(spacePages.archivedAt)))
    .orderBy(asc(spacePages.position), asc(spacePages.createdAt));
}

async function loadPage(actor: Actor, pageId: string) {
  assert(UUID.test(pageId), NOT_FOUND);
  const [page] = await db.select().from(spacePages).where(eq(spacePages.id, pageId));
  assert(page && !page.archivedAt, NOT_FOUND);
  const { space, access } = await loadSpace(db, actor, page.spaceId);
  return { page, space, access };
}

/** One page to show: content, who changed it last, and what this person may do. */
export async function getPage(actor: Actor, pageId: string) {
  const { page, space, access } = await loadPage(actor, pageId);
  const [by] = page.updatedById ? await db.select({ name: users.name }).from(users).where(eq(users.id, page.updatedById)) : [];
  return { page: { ...page, kind: page.kind as PageKind, content: cleanContent(page.kind as PageKind, page.content) }, space, access, updatedByName: by?.name ?? null };
}

export async function createPage(actor: Actor, input: { spaceId: string; kind: string; title?: string | null; icon?: string | null; template?: string | null }) {
  assert(isPageKind(input.kind), "Pick a doc, a whiteboard or a sheet.");
  const kind = input.kind;
  const tpl = pageTemplateByKey(input.template);
  assert(!input.template || (tpl && tpl.kind === kind), "That template isn't available.");
  const content = cleanContent(kind, tpl ? tpl.build() : emptyContent(kind));
  const title = (input.title?.trim() || tpl?.name || `Untitled ${PAGE_KINDS[kind].label.toLowerCase()}`).slice(0, LIMITS.title);
  return db.transaction(async (tx) => {
    const { space, access } = await loadSpace(tx, actor, input.spaceId);
    assert(access.work, "You can see this space but not add to it (viewer).");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(spacePages).where(and(eq(spacePages.spaceId, space.id), isNull(spacePages.archivedAt)));
    assert(n < 200, "This space already has 200 pages. Delete some first.");
    const [p] = await tx
      .insert(spacePages)
      .values({ spaceId: space.id, kind, title, icon: input.icon?.trim().slice(0, 8) || tpl?.icon || null, content, position: n, createdById: actor.id, updatedById: actor.id })
      .returning();
    await logActivity(tx, actor, { action: "page_created", summary: `${actor.name} added the ${PAGE_KINDS[kind].label.toLowerCase()} “${title}” to “${space.name}”${tpl ? ` (template: ${tpl.name})` : ""}.`, meta: { spaceId: space.id, pageId: p.id } });
    return p;
  });
}

/** Autosave. Returns the time it was saved. */
export async function savePageContent(actor: Actor, pageId: string, raw: unknown) {
  const { page, access } = await loadPage(actor, pageId);
  assert(access.work, "You can read this page but not change it (viewer).");
  const content = cleanContent(page.kind as PageKind, raw);
  assert(contentSize(content) <= LIMITS.bytes, "This page is too big to save. Split it into two pages.");
  const now = new Date();
  await db.update(spacePages).set({ content, updatedById: actor.id, updatedAt: now }).where(eq(spacePages.id, page.id));
  return now;
}

export async function renamePage(actor: Actor, pageId: string, input: { title?: string; icon?: string | null }) {
  const { page, access, space } = await loadPage(actor, pageId);
  assert(access.work, "You can read this page but not change it (viewer).");
  const set: { title?: string; icon?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const t = input.title.trim().slice(0, LIMITS.title);
    assert(t, "Give the page a name.");
    set.title = t;
  }
  if (input.icon !== undefined) set.icon = input.icon?.trim().slice(0, 8) || null;
  await db.transaction(async (tx) => {
    await tx.update(spacePages).set(set).where(eq(spacePages.id, page.id));
    if (set.title && set.title !== page.title) await logActivity(tx, actor, { action: "page_renamed", summary: `${actor.name} renamed “${page.title}” to “${set.title}” in “${space.name}”.`, meta: { spaceId: space.id, pageId: page.id } });
  });
}

export async function duplicatePage(actor: Actor, pageId: string) {
  const { page } = await loadPage(actor, pageId);
  const copy = await createPage(actor, { spaceId: page.spaceId, kind: page.kind, title: `${page.title} (copy)`.slice(0, LIMITS.title), icon: page.icon });
  await db.update(spacePages).set({ content: cleanContent(page.kind as PageKind, page.content) }).where(eq(spacePages.id, copy.id));
  return copy;
}

/** Soft delete (kept for the history). Returns the space id to go back to. */
export async function archivePage(actor: Actor, pageId: string) {
  const { page, access, space } = await loadPage(actor, pageId);
  assert(access.manage || page.createdById === actor.id, "Only whoever created it or the space's admins can delete a page.");
  await db.transaction(async (tx) => {
    await tx.update(spacePages).set({ archivedAt: new Date() }).where(eq(spacePages.id, page.id));
    await logActivity(tx, actor, { action: "page_deleted", summary: `${actor.name} deleted the ${PAGE_KINDS[page.kind as PageKind]?.label.toLowerCase() ?? "page"} “${page.title}” in “${space.name}”.`, meta: { spaceId: space.id, pageId: page.id } });
  });
  return space.id;
}
