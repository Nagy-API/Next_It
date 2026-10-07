import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { contentItems, contentPlans, notifications, stages } from "@/db/schema";
import { createExtraTasks } from "@/server/items";
import { getBrandMonths, getWorkItems, reviewsFor } from "@/server/queries";
import { reviewVersion, submitVersion } from "@/server/workflow";
import { isNewTask, isNewWork } from "@/domain/workflow";
import { makeBrand, makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (itemId: string) => db.select().from(stages).where(eq(stages.itemId, itemId)).orderBy(asc(stages.position));

describe("Give a task for a brand → extra work in that brand", () => {
  it("creates an item in this month's plan, starting at the chosen step, with the person and the deadline", async () => {
    const shahenda = await makeUser("Shahenda", ["leadership"], true, true);
    const ammar = await makeManager("Ammar", ["content"]);
    const jana = await makeUser("Jana", ["media"]);
    const brand = await makeBrand("NX", ammar.id);
    const now = new Date("2026-10-07T09:00:00Z");

    const [id] = await createExtraTasks(
      shahenda,
      { title: "Teaser cut", notes: "First 3 shots", assigneeIds: [jana.id], brandId: brand.id, step: "media", type: "reel", dueDate: "2026-10-09" },
      { now },
    );
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(item.extraRequestedById).toBe(shahenda.id);
    const [plan] = await db.select().from(contentPlans).where(eq(contentPlans.id, item.planId!));
    expect([plan.brandId, plan.year, plan.month]).toEqual([brand.id, 2026, 10]);

    // Editing only: the steps before it are skipped; it's with Jana now, due on the 9th.
    const all = await stagesOf(id);
    expect(all.map((s) => s.kind)).toEqual(["media", "social"]);
    expect(all[0]).toMatchObject({ status: "active", assigneeId: jana.id, deadline: "2026-10-09" });
    const notes = await db.select().from(notifications).where(eq(notifications.userId, jana.id));
    expect(notes.some((n) => n.kind === "new_task" && n.itemId === id)).toBe(true);

    // Counted on its own, not inside the plan.
    const month = (await getBrandMonths(brand.id)).find((m) => m.year === 2026 && m.month === 10)!;
    expect(month).toMatchObject({ total: 0, extra: 1, extraDone: 0 });

    // Normal flow: Jana sends v1; the brand's content creator approves it — a manager outside Content can't.
    const v1 = await submitVersion(jana, all[0].id, { url: "https://drive.google.com/teaser-v1" });
    const [w] = await getWorkItems({ ids: [id] });
    expect(w.extra?.by?.id).toBe(shahenda.id);
    expect(w.reviewerId).toBe(ammar.id);
    expect(reviewsFor([w], ammar)).toHaveLength(1);
    const ayman = await makeManager("Ayman", ["media"]);
    expect(reviewsFor([w], ayman)).toHaveLength(0);
    await expect(reviewVersion(ayman, v1.id, { approve: true })).rejects.toThrow(/Content creators/);
    await reviewVersion(ammar, v1.id, { approve: true });
    expect((await stagesOf(id)).map((s) => s.status)).toEqual(["done", "active"]);
  });

  it("refuses a step the type doesn't have, and people who aren't managers", async () => {
    const boss = await makeManager("Boss", ["leadership"]);
    const kemo = await makeUser("Kemo", ["content"]);
    const brand = await makeBrand("BL", kemo.id);
    await expect(createExtraTasks(boss, { title: "X", assigneeIds: [kemo.id], brandId: brand.id, step: "design", type: "reel" })).rejects.toThrow(/no Graphic Design step/);
    await expect(createExtraTasks(kemo, { title: "X", assigneeIds: [kemo.id], brandId: brand.id, step: "content", type: "reel" })).rejects.toThrow(/Only managers/);
    const [id] = await createExtraTasks(boss, { title: "Carousel", assigneeIds: [kemo.id], brandId: brand.id, step: "content", type: "carousel" });
    expect((await stagesOf(id)).map((s) => s.kind)).toEqual(["content", "design", "social"]);
  });
});

describe("New work is shown first", () => {
  it("is new for 3 days while not started", () => {
    const now = new Date("2026-10-07T12:00:00Z").getTime();
    const at = (h: number) => new Date(now - h * 3_600_000);
    expect(isNewWork({ current: { activatedAt: at(5), progress: "not_started" } }, now)).toBe(true);
    expect(isNewWork({ current: { activatedAt: at(5), progress: "processing" } }, now)).toBe(false);
    expect(isNewWork({ current: { activatedAt: at(80), progress: "not_started" } }, now)).toBe(false);
    expect(isNewTask({ doneAt: null, createdAt: at(1) }, now)).toBe(true);
    expect(isNewTask({ doneAt: at(0), createdAt: at(1) }, now)).toBe(false);
  });
});
