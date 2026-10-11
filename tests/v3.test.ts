import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { attachments, contentItems, contentPlans, notifications, stages } from "@/db/schema";
import { addLink, attachmentsFor, readAttachment, removeAttachment, saveFile } from "@/server/attachments";
import { createNote, deleteNote, myNotes, saveNote } from "@/server/notebook";
import { deleteChatMessage, getChatMessages, postChatMessage } from "@/server/chat";
import { myDay, thankFor } from "@/server/fun";
import { createItems } from "@/server/items";
import { setShootDetails } from "@/server/workflow";
import { makeBrand, makeManager, makeUser, uid } from "./helpers";

const png = (name = "pic.png") => new File([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")], name, { type: "image/png" });

beforeAll(() => {
  process.env.FILES_DIR = path.join(os.tmpdir(), `nexora-test-files-${uid()}`);
});
afterAll(async () => {
  await closeDb();
});

describe("My notebook", () => {
  it("is private: only the owner reads, changes, deletes or opens its files — not even an admin", async () => {
    const me = await makeUser("Gannah", ["design"]);
    const admin = await makeUser("Shahenda", ["leadership"], true, true);
    const note = await createNote(me, { title: "Ideas", body: "A reel about hair" });
    await saveNote(me, note.id, { body: "Two reels", color: "#3b82f6", pinned: true });
    const file = await saveFile(me, png(), { privateNoteId: note.id });
    await addLink(me, { url: "https://example.com/ref", privateNoteId: note.id });

    const mine = await myNotes(me.id);
    expect(mine[0]).toMatchObject({ id: note.id, title: "Ideas", body: "Two reels", color: "#3b82f6", pinned: true });
    expect(mine[0].files.length).toBe(2);
    expect(await myNotes(admin.id)).not.toContainEqual(expect.objectContaining({ id: note.id }));

    await expect(saveNote(admin, note.id, { body: "x" })).rejects.toThrow(/not found/i);
    await expect(deleteNote(admin, note.id)).rejects.toThrow(/not found/i);
    await expect(saveFile(admin, png(), { privateNoteId: note.id })).rejects.toThrow();
    await expect(removeAttachment(admin, file.id)).rejects.toThrow(/isn't yours/);
    expect(await readAttachment(file.id, admin.id)).toBeNull();
    expect(await readAttachment(file.id, me.id)).not.toBeNull();

    await deleteNote(me, note.id);
    expect((await myNotes(me.id)).some((n) => n.id === note.id)).toBe(false);
  });
});

describe("Month links and files", () => {
  it("a month plan takes more links and files; only people who edit content add them", async () => {
    const king = await makeManager("King", ["content"]);
    const esraa = await makeUser("Esraa", ["social"]);
    const brand = await makeBrand("VR", king.id);
    await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 12 }, [{ title: "Reel", type: "reel" }]);
    const [plan] = await db.select().from(contentPlans).where(and(eq(contentPlans.brandId, brand.id), eq(contentPlans.month, 12)));
    await addLink(king, { url: "https://www.canva.com/design/abc", planId: plan.id });
    await saveFile(king, png("brief.png"), { planId: plan.id });
    await expect(addLink(esraa, { url: "https://example.com", planId: plan.id })).rejects.toThrow();
    const files = (await attachmentsFor({ planIds: [plan.id] })).get(plan.id) ?? [];
    expect(files.map((f) => f.name).sort()).toEqual(["brief.png", "canva.com"]);
  });
});

describe("Chat files", () => {
  it("a message carries pictures and files; deleting it takes them away", async () => {
    const me = await makeUser("Jana", ["media"]);
    const other = await makeUser("Ayman", ["media"]);
    const pending = await saveFile(me, png());
    const someoneElses = await saveFile(other, png("theirs.png"));
    const m = await postChatMessage(me, { body: "", attachmentIds: [pending.id, someoneElses.id] });
    const list = await getChatMessages({ limit: 200 });
    const got = list.find((x) => x.id === m.id)!;
    // Only my own waiting file is linked.
    expect(got.files.map((f) => f.id)).toEqual([pending.id]);
    await expect(postChatMessage(me, { body: "  " })).rejects.toThrow(/Write a message/);
    await expect(deleteChatMessage(other, m.id)).rejects.toThrow(/your own/);
    await deleteChatMessage(me, m.id);
    const [a] = await db.select().from(attachments).where(eq(attachments.id, pending.id));
    expect(a.deletedAt).not.toBeNull();
    expect(await readAttachment(pending.id, other.id)).toBeNull();
  });
});

describe("Thank you, my day, and cancelling a shoot day", () => {
  it("thanks once a day, counts my day, and a cancelled shoot day goes back to waiting", async () => {
    const king = await makeManager("King", ["content"]);
    const ayman = await makeManager("Ayman", ["media"]);
    const brand = await makeBrand("VR", king.id);
    const [id] = await createItems(king, { kind: "plan", brandId: brand.id, year: 2026, month: 10 }, [{ title: `Reel ${uid()}`, type: "reel" }], { contentReady: true });

    expect((await thankFor(ayman, { itemId: id, toId: king.id })).again).toBe(false);
    expect((await thankFor(ayman, { itemId: id, toId: king.id })).again).toBe(true);
    await expect(thankFor(king, { itemId: id, toId: king.id })).rejects.toThrow();
    const n = await db.select().from(notifications).where(and(eq(notifications.userId, king.id), eq(notifications.itemId, id)));
    expect(n.filter((x) => x.title === "Ayman says thank you").length).toBe(1);

    const day = await myDay(king.id);
    expect(day.steps).toBeGreaterThanOrEqual(1);
    expect(day.streak).toBeGreaterThanOrEqual(1);

    await setShootDetails(ayman, id, { shootDate: "2026-10-12", shootTime: "10:00", shootEndTime: "12:00" });
    const shootStage = async () => (await db.select().from(stages).where(and(eq(stages.itemId, id), eq(stages.kind, "shooting"))))[0];
    expect((await shootStage()).progress).toBe("scheduled");
    await setShootDetails(ayman, id, { shootDate: null, shootTime: null, shootEndTime: null, shootDuration: null });
    const s = await shootStage();
    expect(s.progress).toBe("not_started");
    expect(s.scheduledFor).toBeNull();
    const [i] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(i.shootDate).toBeNull();
  });
});
