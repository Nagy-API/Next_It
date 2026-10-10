import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { brands, contentItems, contentPlans, stages, tasks } from "@/db/schema";
import { archivePage, createPage, getPage, savePageContent } from "@/server/pages";
import { archiveSpace, archivedSpaces, createSpace, createWorkTask, getSpacePage, restoreSpace, saveField, setFieldValue, setSpaceMember } from "@/server/spaces";
import { createShoot, getShootSchedule, setShootStatus } from "@/server/shoots";
import { deleteBrand, restoreBrand } from "@/server/admin";
import { createItems } from "@/server/items";
import { applyOrder, getOrder, saveOrder } from "@/server/order";
import { PAGE_TEMPLATES } from "@/domain/page-templates";
import { ALL_SPACE_TEMPLATES } from "@/domain/space-templates-extra";
import { cleanContent, type DocContent, type WhiteboardContent } from "@/domain/pages";
import { evaluateFormula, formulaProblem } from "@/domain/field-formula";
import { makeBrand, makeManager, makeUser, uid } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("Template library", () => {
  it("every page template builds content that survives cleaning, with unique keys", () => {
    const keys = new Set<string>();
    for (const t of PAGE_TEMPLATES) {
      expect(keys.has(t.key)).toBe(false);
      keys.add(t.key);
      const c = t.build();
      const clean = cleanContent(t.kind, c);
      expect(JSON.stringify(clean).length).toBeGreaterThan(10);
      if (t.kind === "whiteboard") expect((clean as WhiteboardContent).edges.length).toBe((c as WhiteboardContent).edges.length);
    }
    expect(PAGE_TEMPLATES.length).toBeGreaterThanOrEqual(40);
  });

  it("every space template can finish and has a unique key", () => {
    const keys = ALL_SPACE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of ALL_SPACE_TEMPLATES) expect(t.statuses.some((s) => s.kind === "done" || s.kind === "closed")).toBe(true);
  });
});

describe("Docs, whiteboards and sheets", () => {
  it("creates a page from a template, saves plain text only, and respects viewers", async () => {
    const boss = await makeManager("Shahenda", ["leadership"]);
    const viewer = await makeUser("Viewer", ["social"]);
    const space = await createSpace(boss, { name: "Strategy", template: "blank", isPrivate: true });
    await setSpaceMember(boss, space.id, viewer.id, "viewer");
    const wb = await createPage(boss, { spaceId: space.id, kind: "whiteboard", template: "swot-analysis" });
    const got = await getPage(boss, wb.id);
    expect((got.page.content as WhiteboardContent).nodes.length).toBeGreaterThan(0);

    const doc = await createPage(boss, { spaceId: space.id, kind: "doc", title: "Brief" });
    await savePageContent(boss, doc.id, { blocks: [{ id: "a1", type: "h1", text: "<script>alert(1)</script>" }, { id: "a2", type: "nope", text: 5 }] });
    const saved = (await getPage(boss, doc.id)).page.content as DocContent;
    expect(saved.blocks[0]).toEqual({ id: "a1", type: "h1", text: "<script>alert(1)</script>" }); // stored as text, rendered as text
    expect(saved.blocks[1]).toEqual({ id: "a2", type: "p", text: "" });

    await expect(savePageContent(viewer, doc.id, { blocks: [] })).rejects.toThrow(/viewer/);
    await expect(createPage(viewer, { spaceId: space.id, kind: "doc" })).rejects.toThrow(/viewer/);
    await expect(savePageContent(boss, doc.id, { blocks: [{ id: "x", type: "p", text: "y".repeat(5000) }].concat(Array.from({ length: 1999 }, (_, i) => ({ id: `b${i}`, type: "p", text: "z".repeat(1000) }))) })).rejects.toThrow(/too big/);

    await archivePage(boss, doc.id);
    await expect(getPage(boss, doc.id)).rejects.toThrow();
  });
});

describe("Smart columns", () => {
  it("formula, voting, signature and button", async () => {
    const boss = await makeManager("King", ["content"]);
    const ammar = await makeUser("Ammar", ["content"]);
    const space = await createSpace(boss, { name: "Media buying", template: "media-buying" });
    let page = await getSpacePage(boss, space.id);
    const budget = page.fields.find((f) => f.name === "Budget")!;
    await expect(saveField(boss, space.id, { name: "Bad", type: "formula", config: { formula: "{Nope} * 2" } })).rejects.toThrow(/no column/);
    await saveField(boss, space.id, { name: "With VAT", type: "formula", config: { formula: "{Budget} * 1.14" } });
    await saveField(boss, space.id, { name: "Vote", type: "voting" });
    await saveField(boss, space.id, { name: "Finish", type: "button", config: { action: "done" } });
    const t = await createWorkTask(boss, { listId: page.lists[0].id, title: "Ramadan campaign" });
    await setFieldValue(boss, t.id, budget.id, "1000");
    page = await getSpacePage(boss, space.id);
    const f = (n: string) => page.fields.find((x) => x.name === n)!;
    const task = () => page.tasks.find((x) => x.id === t.id)!;
    expect(task().values[f("With VAT").id]).toBe(1140);

    await setFieldValue(boss, t.id, f("Vote").id, "toggle");
    await setFieldValue(ammar, t.id, f("Vote").id, "toggle");
    await setFieldValue(boss, t.id, f("Vote").id, "toggle");
    page = await getSpacePage(boss, space.id);
    expect(task().values[f("Vote").id]).toEqual([ammar.id]);

    const sig = f("Client sign-off");
    await setFieldValue(ammar, t.id, sig.id, "sign");
    page = await getSpacePage(boss, space.id);
    expect(task().values[sig.id]).toMatchObject({ id: ammar.id, name: "Ammar" });

    await setFieldValue(boss, t.id, f("Finish").id, "");
    page = await getSpacePage(boss, space.id);
    expect(page.statuses.find((s) => s.id === task().statusId)?.kind).toBe("done");
    await expect(setFieldValue(boss, t.id, f("With VAT").id, "5")).rejects.toThrow(/worked out/);
  });

  it("formula parser: maths only", () => {
    expect(evaluateFormula("({A} - {B}) / {A} * 100", (n) => (n === "A" ? 200 : 50))).toBe(75);
    expect(evaluateFormula("{A} * 2", () => null)).toBeNull();
    expect(formulaProblem("alert(1)")).not.toBeNull();
    expect(formulaProblem("{A} +")).not.toBeNull();
  });
});

describe("Shoot schedule", () => {
  it("two slots on one day, in time order, and a shot one goes to the editor", async () => {
    const ayman = await makeManager("Ayman", ["media"]);
    const jana = await makeUser("Jana", ["media"]);
    const brand = await makeBrand("OG", ayman.id);
    const day = "2026-11-03";
    const u = uid();
    await createShoot(ayman, { title: `Evening event ${u}`, brandId: brand.id, day, startTime: "18:00", endTime: "22:00", after: "edit", editorId: jana.id });
    const s1 = await createShoot(ayman, { title: `Podcast ${u}`, day, startTime: "14:00", endTime: "16:00", notes: "Come in white" });
    await expect(createShoot(ayman, { title: "Bad", day, startTime: "16:00", endTime: "15:00" })).rejects.toThrow(/end after/);
    const list = (await getShootSchedule(day, day)).filter((e) => e.title.endsWith(u));
    expect(list.map((e) => e.start)).toEqual(["14:00", "18:00"]);
    expect(list[0].notes).toBe("Come in white");
    const evening = list[1];
    const r = await setShootStatus(ayman, evening.id, "shot");
    expect(r.itemId).toBeTruthy();
    const [st] = await db.select().from(stages).where(and(eq(stages.itemId, r.itemId!), eq(stages.kind, "media")));
    expect(st.assigneeId).toBe(jana.id);
    expect(st.status).toBe("active");
    // Just shooting: nothing is created.
    const r2 = await setShootStatus(ayman, s1.id, "shot");
    expect(r2.itemId ?? null).toBeNull();
    expect(r2.taskId ?? null).toBeNull();
    expect((await db.select().from(tasks).where(eq(tasks.title, `Edit: Podcast ${u}`))).length).toBe(0);
  });
});

describe("Deleting and restoring", () => {
  it("a brand needs its typed name, takes its items, and comes back with them", async () => {
    const admin = await makeUser("Shahenda", ["leadership"], true, true);
    const brand = await makeBrand("Gone", admin.id);
    await createItems(admin, { kind: "plan", brandId: brand.id, year: 2026, month: 11 }, [{ title: "Reel one", type: "reel" }, { title: "Post two", type: "static" }]);
    await expect(deleteBrand(admin, brand.id, "wrong")).rejects.toThrow(/Type the brand/);
    expect(await deleteBrand(admin, brand.id, brand.name.toUpperCase())).toBe(2);
    const [plan] = await db.select().from(contentPlans).where(eq(contentPlans.brandId, brand.id));
    const items = await db.select().from(contentItems).where(inArray(contentItems.planId, [plan.id]));
    expect(items.every((i) => i.cancelledAt)).toBe(true);
    await restoreBrand(admin, brand.id);
    const back = await db.select().from(contentItems).where(inArray(contentItems.planId, [plan.id]));
    expect(back.every((i) => !i.cancelledAt)).toBe(true);
    const [b] = await db.select().from(brands).where(eq(brands.id, brand.id));
    expect(b.deletedAt).toBeNull();
  });

  it("a space needs its typed name and can be restored", async () => {
    const boss = await makeManager("King", ["content"]);
    const s = await createSpace(boss, { name: "Temp space", template: "personal" });
    await expect(archiveSpace(boss, s.id, "nope")).rejects.toThrow(/Type the space/);
    await archiveSpace(boss, s.id, "temp space");
    expect((await archivedSpaces(boss)).some((x) => x.id === s.id)).toBe(true);
    await restoreSpace(boss, s.id);
    expect((await getSpacePage(boss, s.id)).space.id).toBe(s.id);
  });
});

describe("My own order", () => {
  it("keeps my order and puts unplaced work after it", async () => {
    const me = await makeUser("Gannah", ["design"]);
    const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333"];
    await saveOrder(me, [`item:${ids[2]}`, `item:${ids[0]}`]);
    const order = await getOrder(me.id, ids.map((x) => `item:${x}`));
    const r = applyOrder(ids, (x) => `item:${x}`, order);
    expect(r.custom).toBe(true);
    expect(r.list).toEqual([ids[2], ids[0], ids[1]]);
  });
});
