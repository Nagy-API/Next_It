import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { comments, itemPlatforms, stages } from "@/db/schema";
import { addComment, createItems, resolveComment, updateItem } from "@/server/items";
import { createBrand } from "@/server/admin";
import { completeStage, handOff, setPlatformState } from "@/server/workflow";
import { makeBrand, makePlatform, makeUser, uid } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (id: string) => db.select().from(stages).where(eq(stages.itemId, id)).orderBy(asc(stages.position));

describe("Things that happen by themselves", () => {
  it("adding the Canva slide delivers the content (time recorded, sent to the right team)", async () => {
    const king = await makeUser("King", ["content"]);
    const brand = await makeBrand("VR", king.id);
    const [withLink, withoutLink] = await createItems(
      king,
      { kind: "plan", brandId: brand.id, year: 2026, month: 10 },
      [
        { title: "Ready", type: "carousel", canvaUrl: "https://canva.link/ready" },
        { title: "Idea only", type: "reel" },
      ],
      { sendWithCanva: true },
    );
    const a = await stagesOf(withLink);
    expect(a.map((s) => [s.kind, s.status])).toEqual([
      ["content", "done"],
      ["design", "active"],
      ["social", "waiting"],
    ]);
    expect(a[0].completedById).toBe(king.id);
    expect(a[0].completedAt).not.toBeNull();

    expect((await stagesOf(withoutLink))[0].status).toBe("active");
    await updateItem(king, withoutLink, { canvaUrl: "https://canva.link/later" });
    const b = await stagesOf(withoutLink);
    expect(b.map((s) => s.status)).toEqual(["done", "active", "waiting"]);
    expect(b[1].kind).toBe("media");
  });

  it("whoever submits an unassigned step gets it; pasting a live link publishes the platform", async () => {
    const king = await makeUser("King", ["content"]);
    const jana = await makeUser("Jana", ["media"]);
    const esraa = await makeUser("Esraa", ["social"]);
    const brand = await makeBrand("VR", king.id);
    const ig = await makePlatform("Instagram");
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "R", type: "reel", canvaUrl: "https://canva.link/r" }], {
      sendWithCanva: true,
      platformIds: [ig.id],
    });
    const media = (await stagesOf(id))[1];
    await handOff(jana, media.id, { driveUrl: "https://drive.google.com/r" });
    expect((await stagesOf(id))[1]).toMatchObject({ assigneeId: jana.id, completedById: jana.id });

    await setPlatformState(esraa, id, ig.id, { date: "2026-10-11" });
    let [row] = await db.select().from(itemPlatforms).where(and(eq(itemPlatforms.itemId, id), eq(itemPlatforms.platformId, ig.id)));
    expect(row.status).toBe("scheduled");
    await setPlatformState(esraa, id, ig.id, { liveUrl: "https://instagram.com/p/r" });
    [row] = await db.select().from(itemPlatforms).where(and(eq(itemPlatforms.itemId, id), eq(itemPlatforms.platformId, ig.id)));
    expect(row.status).toBe("published");
    expect((await stagesOf(id))[2].status).toBe("done");
  });
});

describe("Permissions: each team does its own step", () => {
  it("blocks people from doing other teams' work and from admin settings", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const gannah = await makeUser("Gannah", ["design"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "R", type: "reel", canvaUrl: "https://canva.link/r" }], {
      sendWithCanva: true,
    });
    const media = (await stagesOf(id))[1];
    await expect(completeStage(gannah, media.id, { driveUrl: "https://drive.google.com/x" })).rejects.toThrow(/permission/);
    await expect(updateItem(ayman, id, { title: "Renamed" })).rejects.toThrow(/Content team/);
    await expect(createItems(ayman, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "X", type: "reel" }])).rejects.toThrow(/Content team/);
    await expect(createBrand(king, { name: `New ${uid()}` })).rejects.toThrow(/admin/);
  });
});

describe("Comments with replies", () => {
  it("a comment to someone stays open until they reply or mark it done", async () => {
    const king = await makeUser("King", ["content"]);
    const gannah = await makeUser("Gannah", ["design"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "P", type: "static" }]);
    await addComment(king, id, "Use the pink background please", { mentionUserId: gannah.id });
    const [c] = await db.select().from(comments).where(eq(comments.itemId, id));
    expect(c).toMatchObject({ mentionUserId: gannah.id, resolvedAt: null });
    await addComment(gannah, id, "Done ✅", { parentId: c.id });
    const all = await db.select().from(comments).where(eq(comments.itemId, id));
    const reply = all.find((x) => x.parentId === c.id)!;
    expect(reply.authorId).toBe(gannah.id);
    expect(all.find((x) => x.id === c.id)!.resolvedAt).not.toBeNull();
    await resolveComment(king, c.id, false);
    await expect(resolveComment(await makeUser("Other", ["media"]), c.id)).rejects.toThrow(/permission/);
  });
});
