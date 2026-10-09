import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { stages } from "@/db/schema";
import { createItems } from "@/server/items";
import { handOff, setStageDeadline, completeStage, submitVersion } from "@/server/workflow";
import { makeBrand, makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (id: string) => db.select().from(stages).where(eq(stages.itemId, id)).orderBy(asc(stages.position));

describe("Hand-off: the sender chooses where the work goes", () => {
  it("Content can send a Reel to Graphic Design instead of Media, with a person and a deadline", async () => {
    const king = await makeManager("King", ["content"]); // a manager may also choose the person and the deadline
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

  it("without a person, the next team sees it unassigned; the content link is optional; anyone picks a teammate or themselves", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    await makeUser("Jana", ["media"]); // two people in Media → nobody is picked by default
    const brand = await makeBrand("VR", king.id);
    const [reel, story] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [
      { title: "Reel", type: "reel" },
      { title: "Post but skip design", type: "static" },
    ]);
    const [c1] = await stagesOf(reel);
    // Not someone from another team (a content creator isn't in Media)…
    const kemo = await makeUser("Kemo", ["content"]);
    await expect(handOff(king, c1.id, { assigneeId: kemo.id })).rejects.toThrow(/Media|yourself/);
    // …but no link is needed (it can be a Google Doc, Drive, or nothing).
    await handOff(king, c1.id, {});
    expect((await stagesOf(reel))[1]).toMatchObject({ kind: "shooting", status: "active", assigneeId: null });

    // Ready posts: straight to Social with the final file, a teammate of that step chosen by a non-manager.
    const esraa = await makeUser("Esraa", ["social"]);
    const [c2] = await stagesOf(story);
    await handOff(king, c2.id, { target: "social", canvaUrl: "https://docs.google.com/document/d/x", driveUrl: "https://drive.google.com/file/d/ready", assigneeId: esraa.id });
    expect((await stagesOf(story)).map((s) => s.kind)).toEqual(["content", "social"]);
    expect((await stagesOf(story))[1]).toMatchObject({ status: "active", assigneeId: esraa.id });
    void ayman;
  });

  it("Shooting goes on to editing; editing is sent as versions for approval", async () => {
    const king = await makeUser("King", ["content"]);
    const ayman = await makeUser("Ayman", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: "R", type: "reel" }], { contentReady: true });
    const shoot = (await stagesOf(id))[1];
    expect((await handOff(ayman, shoot.id)).next).toBe("media");
    const media = (await stagesOf(id))[2];
    await expect(handOff(ayman, media.id)).rejects.toThrow(/Drive link/);
    await expect(handOff(ayman, media.id, { driveUrl: "https://drive.google.com/r" })).rejects.toThrow(/approval/);
    await expect(submitVersion(ayman, media.id, { url: "not a link" })).rejects.toThrow(/doesn't look like a link/);
    const v = await submitVersion(ayman, media.id, { url: "https://drive.google.com/r" });
    expect(v).toMatchObject({ number: 1, status: "pending", submittedById: ayman.id });
  });
});

describe("Deadlines are locked once set", () => {
  it("only managers set deadlines; only an admin can change or remove one; automatic shifts still apply", async () => {
    const king = await makeUser("King", ["content"]);
    const assem = await makeManager("Assem", ["account"]);
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
