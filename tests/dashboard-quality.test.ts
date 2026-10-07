import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { stages } from "@/db/schema";
import { createItems } from "@/server/items";
import { getDashboard } from "@/server/stats";
import { reviewVersion, submitVersion } from "@/server/workflow";
import { makeBrand, makeManager, makeUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

// The test database is never wiped, so each run uses its own month far in the future.
const YEAR = 2100 + Math.floor(Math.random() * 99);
const MONTH = 1 + Math.floor(Math.random() * 12);
const day = (d: number) => `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const at = (d: number) => new Date(`${day(d)}T10:00:00Z`);
const mediaOf = async (id: string) => (await db.select().from(stages).where(eq(stages.itemId, id)).orderBy(asc(stages.position))).find((s) => s.kind === "media")!;

describe("Dashboard month report — quality", () => {
  it("counts changes requested, repeats on the same item, and first-time approvals", async () => {
    const ammar = await makeManager("Ammar", ["content"]);
    const jana = await makeUser("Jana", ["media"]);
    const brand = await makeBrand("QA", ammar.id);
    const [a, b] = await createItems(ammar, { kind: "plan", brandId: brand.id, year: YEAR, month: MONTH }, [
      { title: "A", type: "reel" },
      { title: "B", type: "reel" },
    ], { contentReady: true, now: at(1) });
    for (const id of [a, b]) {
      const shoot = (await db.select().from(stages).where(eq(stages.itemId, id))).find((s) => s.kind === "shooting")!;
      await db.update(stages).set({ status: "done" }).where(eq(stages.id, shoot.id));
      await db.update(stages).set({ status: "active" }).where(eq(stages.id, (await mediaOf(id)).id));
    }
    // A: changes twice, then approved (v3). B: approved first time.
    for (const n of [1, 2]) {
      const v = await submitVersion(jana, (await mediaOf(a)).id, { url: `https://drive.google.com/a${n}`, now: at(5) });
      await reviewVersion(ammar, v.id, { approve: false, note: `fix ${n}`, now: at(5) });
    }
    const a3 = await submitVersion(jana, (await mediaOf(a)).id, { url: "https://drive.google.com/a3", now: at(6) });
    await reviewVersion(ammar, a3.id, { approve: true, now: at(6) });
    const b1 = await submitVersion(jana, (await mediaOf(b)).id, { url: "https://drive.google.com/b1", now: at(6) });
    await reviewVersion(ammar, b1.id, { approve: true, now: at(6) });

    const d = await getDashboard(YEAR, MONTH);
    expect(d.totals).toMatchObject({ changes: 2, itemsWithChanges: 1, repeatedItems: 1, firstTimeRate: 50 });
    expect(d.rows.find((r) => r.brand.id === brand.id)).toMatchObject({ total: 2, changes: 2, extra: 0 });
    expect(d.people.find((p) => p.person.id === jana.id)).toMatchObject({ changesAsked: 2, firstTimeRate: 50 });
  });
});
