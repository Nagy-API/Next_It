import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { stages } from "@/db/schema";
import { createItems } from "@/server/items";
import { handOff, setStageDeadline, completeStage } from "@/server/workflow";
import { makeBrand, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (id: string) => db.select().from(stages).where(eq(stages.itemId, id)).orderBy(asc(stages.position));

describe("Hand-off: the sender chooses where the work goes", () => {
  it("Content can send a Reel to Graphic Design instead of Media, with a person and a deadline", async () => {
    const king = await makeUser("King", ["content", "leadership"]); // a lead content creator may also set deadlines
    const gannah = await makeUser("Gannah", ["design"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Cover", type: "reel" }]);
    const [content] = await stagesOf(id);
    const r = await handOff(king, content.id, { target: "design", assigneeId: gannah.id, deadline: "2026-10-05", canvaUrl: "https://canva.link/cover" });
    expect(r.next).toBe("design");
    const all = await stagesOf(id);
    expect(all.map((s) => [s.kind, s.status])).toEqual([
      ["content", "done"],
      ["design", "active"],
      ["social", "waiting"],
    ]);
    expect(all[1]).toMatchObject({ assigneeId: gannah.id, deadline: "2026-10-05", originalDeadline: "2026-10-05" });
  });

  it("without a person, the next team sees it unassigned; Stories can go straight to Social", async () => {
    const king = await makeUser("King", ["content"]);
    await makeUser("Ayman", ["media"]);
    await makeUser("Jana", ["media"]); // two people in Media → nobody is picked by default
    const brand = await makeBrand("VR", king.id);
    const [reel, story] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [
      { title: "Reel", type: "reel" },
      { title: "Post but skip design", type: "static" },
    ]);
    const [c1] = await stagesOf(reel);
    await expect(handOff(king, c1.id, {})).rejects.toThrow(/Canva link/);
    await handOff(king, c1.id, { canvaUrl: "https://canva.link/reel" });
    expect((await stagesOf(reel))[1]).toMatchObject({ kind: "media", status: "active", assigneeId: null });

    const [c2] = await stagesOf(story);
    await handOff(king, c2.id, { target: "social", canvaUrl: "https://canva.link/post" });
    expect((await stagesOf(story)).map((s) => s.kind)).toEqual(["content", "social"]);
  });

  it("Media must attach the Drive link before sending on", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "R", type: "reel" }], { contentReady: true });
    const media = (await stagesOf(id))[1];
    await expect(handOff(ayman, media.id)).rejects.toThrow(/Drive link/);
    await expect(handOff(ayman, media.id, { target: "design" })).rejects.toThrow();
    const r = await handOff(ayman, media.id, { driveUrl: "https://drive.google.com/r" });
    expect(r.next).toBe("social");
  });
});

describe("Deadlines are locked once set", () => {
  it("only managers set deadlines; only an admin can change or remove one; automatic shifts still apply", async () => {
    const king = await makeUser("King", ["content"]);
    const assem = await makeUser("Assem", ["account"]);
    const admin = { ...(await makeUser("Shahenda", ["leadership"])), isAdmin: true };
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "Locked", type: "reel" }]);
    let [content, media] = await stagesOf(id);
    await expect(setStageDeadline(king, content.id, "2026-10-05")).rejects.toThrow(/permission/);
    await setStageDeadline(assem, content.id, "2026-10-05");
    await setStageDeadline(assem, media.id, "2026-10-07");
    await expect(setStageDeadline(assem, media.id, "2026-10-20")).rejects.toThrow(/Only an admin/);
    await expect(setStageDeadline(assem, media.id, null)).rejects.toThrow(/Only an admin/);
    await setStageDeadline(admin, media.id, "2026-10-08");
    [content, media] = await stagesOf(id);
    expect(media.deadline).toBe("2026-10-08");

    // Late content still pushes the locked deadline automatically.
    await completeStage(king, content.id, { now: new Date("2026-10-07T10:00:00Z") });
    [, media] = await stagesOf(id);
    expect(media).toMatchObject({ deadline: "2026-10-10", originalDeadline: "2026-10-08", shiftDays: 2 });
  });
});
