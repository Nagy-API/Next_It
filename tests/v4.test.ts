import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { contentItems, notifications, stages, tasks } from "@/db/schema";
import { createExtraTasks } from "@/server/items";
import { completeStage, handOff } from "@/server/workflow";
import { createTasks, getAllGivenTasks, getTasksToApprove, sendBackTask, setTaskDone } from "@/server/tasks";
import { finalLabel, handoffTargets, routeFor } from "@/domain/workflow";
import { makeBrand, makeManager, makeUser, uid } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const stagesOf = (itemId: string) => db.select().from(stages).where(eq(stages.itemId, itemId)).orderBy(asc(stages.position));

describe("Other work (a brief, a document…)", () => {
  it("routes end with an approval, and the chosen steps come first", () => {
    expect(routeFor("other", "plan")).toEqual(["content", "approval"]);
    expect(handoffTargets("content", "plan", "other")).toEqual(["shooting", "media", "design", "approval"]);
    expect(finalLabel("plan", "other")).toBe("Approved");
  });

  it("a manager gives Other work with chosen steps; the account manager approves it and it's done", async () => {
    const boss = await makeManager("Shahenda", ["leadership"]);
    const king = await makeUser("King", ["content"]);
    const gannah = await makeUser("Gannah", ["design"]);
    const assem = await makeManager("Assem", ["account"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createExtraTasks(boss, {
      title: `Brief ${uid()}`,
      assigneeIds: [king.id],
      brandId: brand.id,
      step: "content",
      type: "other",
      steps: ["design", "content"],
      approverId: assem.id,
    });
    const st = await stagesOf(id);
    expect(st.map((s) => s.kind)).toEqual(["content", "design", "approval"]);
    expect(st[0].assigneeId).toBe(king.id);
    expect(st[2].assigneeId).toBe(assem.id);
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(item.type).toBe("other");
    expect(item.extraRequestedById).toBe(boss.id);

    // The simplest Other work: Content, then approval.
    const [id2] = await createExtraTasks(boss, { title: `Doc ${uid()}`, assigneeIds: [king.id], brandId: brand.id, step: "content", type: "other", steps: ["content"], approverId: assem.id });
    let st2 = await stagesOf(id2);
    await handOff(king, st2[0].id);
    st2 = await stagesOf(id2);
    expect(st2[1]).toMatchObject({ kind: "approval", status: "active", assigneeId: assem.id });
    await expect(completeStage(gannah, st2[1].id)).rejects.toThrow();
    await completeStage(assem, st2[1].id);
    const [done] = await db.select().from(contentItems).where(eq(contentItems.id, id2));
    expect(done.completedAt).not.toBeNull();
  });

  it("an approver must be a manager or in Account Management", async () => {
    const boss = await makeManager("Ammar", ["content"]);
    const king = await makeUser("King", ["content"]);
    const esraa = await makeUser("Esraa", ["social"]);
    const brand = await makeBrand("NX", king.id);
    await expect(createExtraTasks(boss, { title: "Doc", assigneeIds: [king.id], brandId: brand.id, step: "content", type: "other", steps: ["content"], approverId: esraa.id })).rejects.toThrow(/approver/);
  });
});

describe("To-dos with approval and send back", () => {
  it("finished by the person → waits for the approver; changes go back; approved = done", async () => {
    const assem = await makeManager("Assem", ["account"]);
    const king = await makeManager("King", ["content"]);
    const ammar = await makeManager("Ammar", ["content"]);
    const [t] = await createTasks(assem, { title: `Script ${uid()}`, assigneeIds: [king.id], approverId: assem.id });
    expect(t.approverId).toBe(assem.id);

    // King is a manager too, but nobody approves their own work: it goes to Assem.
    const r = await setTaskDone(king, t.id, true);
    expect(r?.submitted).toBe(true);
    let [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.doneAt).toBeNull();
    expect(row.submittedAt).not.toBeNull();
    expect((await getTasksToApprove(assem)).some((x) => x.id === t.id)).toBe(true);
    // Any manager can approve; the person themselves can't.
    expect((await getTasksToApprove(ammar)).some((x) => x.id === t.id)).toBe(true);
    expect((await getTasksToApprove(king)).some((x) => x.id === t.id)).toBe(false);

    await sendBackTask(assem, t.id, "Add the prices");
    [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.submittedAt).toBeNull();
    expect(row.returnNote).toBe("Add the prices");
    const n = await db.select().from(notifications).where(and(eq(notifications.userId, king.id), eq(notifications.kind, "sent_back")));
    expect(n.some((x) => x.title.includes("Script"))).toBe(true);

    await setTaskDone(king, t.id, true);
    await setTaskDone(assem, t.id, true);
    [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.doneAt).not.toBeNull();
    expect(row.approvedById).toBe(assem.id);
    expect(row.doneById).toBe(king.id);
  });

  it("the person can send a task back to whoever gave it; managers see every given task", async () => {
    const boss = await makeManager("Shahenda", ["leadership"]);
    const jana = await makeUser("Jana", ["media"]);
    const other = await makeManager("Ayman", ["media"]);
    const [t] = await createTasks(boss, { title: `Cut ${uid()}`, assigneeIds: [jana.id] });
    const r = await sendBackTask(jana, t.id, "I need the raw files");
    expect(r.toGiver).toBe(true);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.status).toBe("waiting");
    await expect(sendBackTask(jana, t.id, "  ")).rejects.toThrow(/Write/);
    expect((await getAllGivenTasks()).some((x) => x.id === t.id && x.createdByName === boss.name)).toBe(true);
    // Without an approver, ticking done is enough.
    expect((await setTaskDone(jana, t.id, true))?.submitted).toBeUndefined();
    void other;
  });
});
