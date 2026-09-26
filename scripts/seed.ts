/**
 * Seeds NEXORA's real starting state:
 *  - the team (from the operations brief),
 *  - the six recurring brands and their default content creators (names confirmed against the workbook tabs),
 *  - the four starting platforms,
 *  - Vanilla Roza's October 2026 plan exactly as it exists in "Content tracker.xlsx".
 *
 * Refuses to run on a database that already has users (use `npm run db:reset` to start over).
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { brands, platforms, users, type Team } from "../src/db/schema";
import { createItems, type NewItemRow } from "../src/server/items";
import { hashPassword, slugify } from "../src/server/admin";
import { logActivity } from "../src/server/activity";
import { guessTypeFromTitle } from "../src/domain/workflow";

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "Nexora@2026";

const TEAM: { username: string; name: string; title: string; teams: Team[]; isAdmin?: boolean }[] = [
  { username: "shahenda", name: "Shahenda", title: "CEO", teams: ["leadership", "social"], isAdmin: true },
  { username: "assem", name: "Assem", title: "Account Manager", teams: ["account"] },
  { username: "ammar", name: "Ammar", title: "Content Creator", teams: ["content"] },
  { username: "king", name: "King", title: "Content Creator", teams: ["content"] },
  { username: "kemo", name: "Kemo", title: "Content Creator", teams: ["content"] },
  { username: "ayman", name: "Ayman", title: "Media Production", teams: ["media"] },
  { username: "jana", name: "Jana", title: "Media Production", teams: ["media"] },
  { username: "gannah", name: "Gannah", title: "Graphic Designer", teams: ["design"] },
  { username: "esraa", name: "Esraa", title: "Social Media", teams: ["social"] },
];

const BRANDS: { name: string; creator: string; color: string }[] = [
  { name: "Vanilla Roza", creator: "king", color: "#E0569B" },
  { name: "Enlighten by Shahenda", creator: "king", color: "#F59E0B" },
  { name: "NEXORA", creator: "ammar", color: "#3B82F6" },
  { name: "OG Hub", creator: "ammar", color: "#10B981" },
  { name: "Blissify", creator: "kemo", color: "#8B5CF6" },
  { name: "Blissify Academy", creator: "kemo", color: "#06B6D4" },
];

const PLATFORMS = ["Instagram", "TikTok", "Facebook", "LinkedIn"];

/** Vanilla rose tab of the workbook: title, Canva link, posting date. "OFF" rows are rest days, not content. */
const VANILLA_ROZA_OCTOBER: [string, string, string][] = [
  ["Post 01: Coming Soon", "https://canva.link/nl642e8uvkayeis", "2026-10-01"],
  ["The Wall", "https://canva.link/hsg2l47rnlj2lv5", "2026-10-02"],
  ["The Experts", "https://canva.link/cgg7zdyaxs53kjp", "2026-10-04"],
  ["Life Without Vanilla Roza", "https://canva.link/t5n4a1aj2oelpdl", "2026-10-05"],
  ["Carousel 01: Swipe To Complete", "https://canva.link/77nq1cun1dx00p2", "2026-10-06"],
  ["Three Tests", "https://canva.link/90zd14lhp9tpnlz", "2026-10-07"],
  ["100 Hair Problems", "https://canva.link/z98wbmgreijkolx", "2026-10-08"],
  ["Hair Profile", "https://canva.link/lixfubhqqf1hg8v", "2026-10-09"],
  ["Post 02: Talk To Me", "https://canva.link/5gj77kyvu2xbr3f", "2026-10-10"],
  ["The Ampoule", "https://canva.link/fxgdr0zjw5uxt3m", "2026-10-11"],
  ["The Smooth One", "https://canva.link/8bhb2xsx1kdd79s", "2026-10-13"],
  ["Carousel 02: Healthier Hair Choices", "https://canva.link/lkixoq378iwwqaq", "2026-10-14"],
  ["The Shampoo", "https://canva.link/akr7dgrzdtr3l6o", "2026-10-15"],
  ["The Breakage Fix", "https://canva.link/worjialb3gtguwv", "2026-10-16"],
  ["Post 03: Choose What You Trust", "https://canva.link/22oe1viwdivleiq", "2026-10-17"],
  ["The Oil", "https://canva.link/7dcrt4z1gpuzgb3", "2026-10-18"],
  ["Carousel 03: Meet The Routine", "https://canva.link/k8zbn6o8a7oxud6", "2026-10-19"],
  ["The Full Routine", "https://canva.link/n7dnx3fh23g6n96", "2026-10-21"],
  ["UGC Beach Hair Rescue", "https://canva.link/20nvy0az1qh70dj", "2026-10-22"],
  ["Post 04: Take It To The Beach", "https://canva.link/zwg56gb5z939lag", "2026-10-23"],
  ["Unbox And Feel", "https://canva.link/fbrguyynzj26925", "2026-10-24"],
  ["Carousel 04: The Right Order", "https://canva.link/ycf4i5h9otyjip4", "2026-10-25"],
  ["Always In Her Bag", "https://canva.link/22n907098ug9vu2", "2026-10-26"],
  ["Carousel 05: The Reviews Are In", "https://canva.link/r8uy2y1nwuuwjf6", "2026-10-28"],
  ["Which Product For My Hair", "https://canva.link/fkz0y7s8we76pa0", "2026-10-29"],
  ["Post 05: The Step That Changes Everything", "https://canva.link/mybzw54ugg1iexs", "2026-10-30"],
];

/**
 * Early installs seeded Jana in both Media Production and Graphic Design. They are two people:
 * Jana (Media Production, with Ayman) and Gannah (Graphic Design). Fixes that once, and logs it.
 */
async function fixDesignTeam() {
  const [gannah] = await db.select({ id: users.id }).from(users).where(eq(users.username, "gannah"));
  if (gannah) return;
  const [jana] = await db.select().from(users).where(eq(users.username, "jana"));
  const [created] = await db
    .insert(users)
    .values({ username: "gannah", name: "Gannah", title: "Graphic Designer", teams: ["design"], passwordHash: await hashPassword(PASSWORD) })
    .returning();
  await logActivity(db, null, { action: "user_created", subjectUserId: created.id, summary: "Account created for Gannah (Graphic Design)." });
  if (jana?.teams.includes("design")) {
    await db
      .update(users)
      .set({ teams: jana.teams.filter((t) => t !== "design"), title: "Media Production" })
      .where(eq(users.id, jana.id));
    await logActivity(db, null, { action: "user_updated", subjectUserId: jana.id, summary: "Jana's teams → Media Production (Graphic Design is Gannah)." });
  }
  console.log(`✓ Added Gannah (Graphic Design). Initial password: ${PASSWORD}`);
}

export async function seed() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) {
    console.log("Database already has users — skipping the initial seed.");
    await fixDesignTeam();
    return;
  }
  const passwordHash = await hashPassword(PASSWORD);
  const created = await db
    .insert(users)
    .values(TEAM.map((u) => ({ ...u, isAdmin: !!u.isAdmin, passwordHash, createdAt: new Date("2026-09-01T07:00:00Z") })))
    .returning();
  const byUsername = new Map(created.map((u) => [u.username, u]));
  const ceo = byUsername.get("shahenda")!;
  await logActivity(db, null, { action: "system_seeded", summary: `NEXORA workspace created with ${created.length} team accounts.` });

  await db.insert(platforms).values(PLATFORMS.map((name, i) => ({ name, slug: slugify(name), sortOrder: i })));

  const brandRows = await db
    .insert(brands)
    .values(BRANDS.map((b) => ({ name: b.name, slug: slugify(b.name), color: b.color, defaultCreatorId: byUsername.get(b.creator)!.id, createdAt: new Date("2026-09-01T07:00:00Z") })))
    .returning();
  for (const b of brandRows) {
    await logActivity(db, { id: ceo.id, name: ceo.name }, { action: "brand_created", brandId: b.id, summary: `${ceo.name} created the brand ${b.name}.`, at: new Date("2026-09-01T07:00:00Z") });
  }

  // Vanilla Roza · October 2026 — King delivered the whole month's content on 22 Sep (workbook "Content Delivery time").
  const king = byUsername.get("king")!;
  const vr = brandRows.find((b) => b.name === "Vanilla Roza")!;
  const rows: NewItemRow[] = VANILLA_ROZA_OCTOBER.map(([title, canvaUrl, postingDate]) => ({
    title,
    type: guessTypeFromTitle(title) ?? "reel",
    canvaUrl,
    postingDate,
  }));
  await createItems(
    { id: king.id, name: king.name, teams: king.teams },
    { kind: "plan", brandId: vr.id, year: 2026, month: 10 },
    rows,
    { contentReady: true, now: new Date("2026-09-22T15:00:00Z") },
  );

  console.log(`✓ Seeded ${created.length} users, ${brandRows.length} brands, ${PLATFORMS.length} platforms, ${rows.length} Vanilla Roza October items.`);
  console.log(`  Every account's initial password: ${PASSWORD}`);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .then(() => closeDb())
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
