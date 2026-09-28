import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { brands, contentItems, contentPlans, notifications, stages } from "@/db/schema";
import { addComment, createItems, setPlanLinks } from "@/server/items";
import { handOff, returnToStage, setStageDeadline, setStageProgress } from "@/server/workflow";
import { getNotifications, markNotificationsRead } from "@/server/stats";
import { slideLink } from "@/server/queries";
import { makeBrand, makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (id: string) => db.select().from(stages).where(eq(stages.itemId, id)).orderBy(asc(stages.position));
const notesOf = (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(asc(notifications.createdAt));

describe("Default people per brand", () => {
  it("design work goes to the brand's designer by default, and she is told", async () => {
    const kemo = await makeUser("Kemo", ["content"]);
    const gannah = await makeUser("Gannah", ["design"]);
    await makeUser("Other designer", ["design"]);
    const brand = await makeBrand("Blissify", kemo.id);
    await db.update(brands).set({ defaultDesignId: gannah.id }).where(eq(brands.id, brand.id));

    const [id] = await createItems(kemo, { kind: "plan", brandId: brand.id, year: 2026, month: 11 }, [{ title: "Carousel", type: "carousel" }]);
    const all = await stagesOf(id);
    expect(all[0].assigneeId).toBe(kemo.id); // brand's content creator
    expect(all[1]).toMatchObject({ kind: "design", assigneeId: gannah.id, status: "waiting" });

    await handOff(kemo, all[0].id, { canvaUrl: "https://canva.link/c1" });
    const notes = await notesOf(gannah.id);
    expect(notes.at(-1)).toMatchObject({ kind: "new_task", itemId: id, actorId: kemo.id });
    expect(notes.at(-1)!.title).toMatch(/Carousel/);
    // The person who did the work isn't notified about their own action.
    expect((await notesOf(kemo.id)).filter((n) => n.itemId === id && n.kind === "new_task")).toHaveLength(0);
  });

  it("with nobody chosen, the whole team is notified and whoever starts it claims it", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const jana = await makeUser("Jana", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 11 }, [{ title: "Team reel", type: "reel" }]);
    const [content] = await stagesOf(id);
    await handOff(king, content.id, { canvaUrl: "https://canva.link/r" });
    for (const u of [ayman, jana]) expect((await notesOf(u.id)).some((n) => n.itemId === id && n.kind === "new_task")).toBe(true);

    const media = (await stagesOf(id))[1];
    expect(media.progress).toBe("not_started");
    await expect(setStageProgress(king, media.id, "processing")).rejects.toThrow(/permission/);
    await setStageProgress(jana, media.id, "processing");
    const after = (await stagesOf(id))[1];
    expect(after).toMatchObject({ progress: "processing", assigneeId: jana.id });
    expect(after.progressAt).not.toBeNull();
  });
});

describe("Notifications for the things people wait on", () => {
  it("sent back → the person is told and the step shows Adjusting; deadlines and comments notify too", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const assem = await makeManager("Assem", ["account"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 11 }, [{ title: "Hook", type: "reel" }], { contentReady: true });
    const media = (await stagesOf(id))[1];
    await setStageProgress(ayman, media.id, "processing");

    await setStageDeadline(assem, media.id, "2026-11-05");
    expect((await notesOf(ayman.id)).some((n) => n.kind === "deadline" && n.itemId === id)).toBe(true);

    await returnToStage(ayman, id, "content", "Hook is too long");
    const content = (await stagesOf(id))[0];
    expect(content).toMatchObject({ status: "active", progress: "adjusting", round: 2 });
    const back = (await notesOf(king.id)).filter((n) => n.kind === "sent_back" && n.itemId === id);
    expect(back).toHaveLength(1);
    expect(back[0].body).toMatch(/Hook is too long/);

    await addComment(king, id, "Fixed — check again", { mentionUserId: ayman.id });
    expect((await notesOf(ayman.id)).some((n) => n.kind === "comment" && n.itemId === id)).toBe(true);

    const { unread } = await getNotifications(ayman.id);
    expect(unread).toBeGreaterThanOrEqual(2);
    await markNotificationsRead(ayman.id);
    expect((await getNotifications(ayman.id)).unread).toBe(0);
  });

  it("adding many rows sends one summary per person, not one per row", async () => {
    const king = await makeUser("King", ["content"]);
    const writer = await makeUser("Writer", ["content", "leadership"]);
    const brand = await makeBrand("VR", king.id);
    await createItems(writer, { kind: "plan", brandId: brand.id, year: 2026, month: 12 }, [
      { title: "A", type: "static" },
      { title: "B", type: "static" },
      { title: "C", type: "reel" },
    ]);
    const mine = (await notesOf(king.id)).filter((n) => n.kind === "new_task");
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toMatch(/^3 new tasks/);
  });
});

describe("One Canva link for the month, a slide number per item", () => {
  it("numbers slides automatically, links to the slide, and accepts the month link as the content", async () => {
    const king = await makeUser("King", ["content"]);
    const brand = await makeBrand("VR", king.id);
    const target = { brandId: brand.id, year: 2027, month: 1 };
    await setPlanLinks(king, target, { canvaUrl: "https://www.canva.com/design/DAGx/view", driveFolderUrl: "https://drive.google.com/drive/folders/abc" });
    const ids = await createItems(king, { kind: "plan", ...target }, [
      { title: "One", type: "static" },
      { title: "Two", type: "static" },
    ]);
    const more = await createItems(king, { kind: "plan", ...target }, [{ title: "Three", type: "reel" }]);
    const items = await db.select().from(contentItems).where(eq(contentItems.id, more[0]));
    const firstTwo = await db.select({ n: contentItems.slideNumber }).from(contentItems).where(and(eq(contentItems.planId, items[0].planId!)));
    expect(firstTwo.map((r) => r.n).sort()).toEqual([1, 2, 3]);
    expect(slideLink("https://www.canva.com/design/DAGx/view", 3)).toBe("https://www.canva.com/design/DAGx/view#3");

    // No per-item Canva link needed: the month link counts.
    const [content] = await stagesOf(ids[0]);
    await handOff(king, content.id, {});
    expect((await stagesOf(ids[0]))[0].status).toBe("done");
    const [plan] = await db.select().from(contentPlans).where(eq(contentPlans.id, items[0].planId!));
    expect(plan.driveFolderUrl).toBe("https://drive.google.com/drive/folders/abc");
  });
});
