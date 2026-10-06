/**
 * Seeds NEXORA's real starting state:
 *  - the team (from the operations brief),
 *  - the six recurring brands and their default content creators (names confirmed against the workbook tabs),
 *  - the four starting platforms,
 *  - Vanilla Roza's October 2026 plan exactly as it exists in "Content tracker.xlsx".
 *
 * Runs on every start (src/instrumentation.ts and `npm run db:seed`): seeds only an empty database; on an
 * existing one it applies the one-time upgrades below and never overwrites what people changed in Settings.
 */
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, brands, platforms, users, type Team } from "@/db/schema";
import { createItems, type NewItemRow } from "./items";
import { verify } from "@node-rs/argon2";
import { hashPassword, slugify } from "./admin";
import { logActivity } from "./activity";
import { guessTypeFromTitle } from "@/domain/workflow";
import { importTracker } from "./tracker-import";

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "Nexora@2026";

/** Managers: Shahenda (CEO), Ammar, Ayman and Assem. Gannah (design) and Jana (editing) are in the Media Production department. */
const MANAGERS = ["shahenda", "ammar", "ayman", "assem", "king"];
const TEAM: { username: string; name: string; title: string; teams: Team[]; isAdmin?: boolean }[] = [
  { username: "shahenda", name: "Shahenda", title: "CEO", teams: ["leadership", "social"], isAdmin: true },
  { username: "assem", name: "Assem", title: "Account Manager", teams: ["account"] },
  { username: "ammar", name: "Ammar", title: "Content Lead", teams: ["content"] },
  // King is also IT: full access (admin + manager), same position.
  { username: "king", name: "King", title: "Content Creator", teams: ["content"], isAdmin: true },
  { username: "kemo", name: "Kemo", title: "Content Creator", teams: ["content"] },
  { username: "ayman", name: "Ayman", title: "Media Production Lead", teams: ["media"] },
  { username: "jana", name: "Jana", title: "Video Editor · Media Production", teams: ["media"] },
  { username: "gannah", name: "Gannah", title: "Graphic Designer · Media Production", teams: ["design"] },
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
  console.log(`✓ Added Gannah (Graphic Design) — first password is SEED_DEFAULT_PASSWORD`);
}

/**
 * Installs from before per-team brand defaults: give every brand Gannah for design and Esraa for social,
 * once. Runs only if it never ran before, so a later "Whole team" choice in Settings is never overwritten.
 */
async function fillTeamDefaults() {
  const [done] = await db.select({ id: activityLog.id }).from(activityLog).where(eq(activityLog.action, "brand_team_defaults")).limit(1);
  if (done) return;
  const [gannah] = await db.select({ id: users.id }).from(users).where(eq(users.username, "gannah"));
  const [esraa] = await db.select({ id: users.id }).from(users).where(eq(users.username, "esraa"));
  if (!gannah && !esraa) return;
  if (gannah) await db.update(brands).set({ defaultDesignId: gannah.id }).where(isNull(brands.defaultDesignId));
  if (esraa) await db.update(brands).set({ defaultSocialId: esraa.id }).where(isNull(brands.defaultSocialId));
  await logActivity(db, null, { action: "brand_team_defaults", summary: "Brand defaults set: Graphic Design → Gannah, Social → Esraa (change them in Settings → Brands)." });
  console.log("✓ Brand defaults set: Graphic Design → Gannah, Social → Esraa");
}

/**
 * Installs from before managers / pre-production: mark the managers, set Gannah's and Jana's titles,
 * and give every brand Ayman for shooting and Jana for editing. Once only (never overwrites later choices).
 */
/** King is IT: full access (admin + manager) on existing installs too, keeping his title and team. Once only. */
async function kingFullAccess() {
  const [done] = await db.select({ id: activityLog.id }).from(activityLog).where(eq(activityLog.action, "king_full_access")).limit(1);
  if (done) return;
  const [king] = await db.select({ id: users.id }).from(users).where(eq(users.username, "king"));
  if (!king) return;
  await db.update(users).set({ isAdmin: true, isManager: true }).where(eq(users.id, king.id));
  await logActivity(db, null, { action: "king_full_access", subjectUserId: king.id, summary: "King (IT) now has full access: admin and manager." });
  console.log("✓ King has full access (admin + manager)");
}

/**
 * Anyone still using the shared starting password must pick their own at the next sign-in. Checked once
 * per start (cheap: a handful of accounts), so it also covers people an admin creates with a temporary one.
 */
async function forceOwnPasswords() {
  if (process.env.SEED_FORCE_PASSWORD_CHANGE === "0") return;
  const all = await db.select({ id: users.id, hash: users.passwordHash, must: users.mustChangePassword, changed: users.passwordChangedAt }).from(users);
  let n = 0;
  for (const u of all) {
    if (u.must || u.changed) continue;
    if (await verify(u.hash, PASSWORD).catch(() => false)) {
      await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, u.id));
      n++;
    }
  }
  if (n) console.log(`✓ ${n} account(s) still on the starting password will be asked to choose their own at sign-in`);
}

async function managersAndMediaDefaults() {
  const [done] = await db.select({ id: activityLog.id }).from(activityLog).where(eq(activityLog.action, "managers_media_defaults")).limit(1);
  if (done) return;
  const all = await db.select({ id: users.id, username: users.username }).from(users);
  const id = (u: string) => all.find((x) => x.username === u)?.id;
  for (const u of MANAGERS) if (id(u)) await db.update(users).set({ isManager: true }).where(eq(users.username, u));
  for (const t of TEAM.filter((x) => x.username === "gannah" || x.username === "jana")) {
    if (id(t.username)) await db.update(users).set({ title: t.title }).where(eq(users.username, t.username));
  }
  if (id("ayman")) await db.update(brands).set({ defaultShootId: id("ayman") }).where(isNull(brands.defaultShootId));
  if (id("jana")) await db.update(brands).set({ defaultMediaId: id("jana") }).where(isNull(brands.defaultMediaId));
  await logActivity(db, null, {
    action: "managers_media_defaults",
    summary: "Managers: Shahenda, Ammar, Ayman, Assem. Brand defaults: Shooting → Ayman, Editing → Jana (change them in Settings → Brands).",
  });
  console.log("✓ Managers set (Shahenda, Ammar, Ayman, Assem); Shooting → Ayman, Editing → Jana");
}

export async function seed() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) {
    console.log("Database already has users — skipping the initial seed.");
    // One-time upgrades for NEXORA's own install only (never for another company's).
    const [nexora] = await db.select({ id: users.id }).from(users).where(eq(users.username, "shahenda"));
    if (nexora) {
      await fixDesignTeam();
      await fillTeamDefaults();
      await managersAndMediaDefaults();
      await kingFullAccess();
      if (process.env.SEED_TRACKER !== "0") await importTracker();
    }
    await forceOwnPasswords();
    return;
  }
  if (process.env.SEED_DEMO === "0") return seedEmpty();
  const passwordHash = await hashPassword(PASSWORD);
  const created = await db
    .insert(users)
    .values(
      TEAM.map((u) => ({
        ...u,
        isAdmin: !!u.isAdmin,
        isManager: MANAGERS.includes(u.username),
        passwordHash,
        mustChangePassword: process.env.SEED_FORCE_PASSWORD_CHANGE !== "0",
        createdAt: new Date("2026-09-01T07:00:00Z"),
      })),
    )
    .returning();
  const byUsername = new Map(created.map((u) => [u.username, u]));
  const ceo = byUsername.get("shahenda")!;
  await logActivity(db, null, { action: "system_seeded", summary: `NEXORA workspace created with ${created.length} team accounts.` });

  await db.insert(platforms).values(PLATFORMS.map((name, i) => ({ name, slug: slugify(name), sortOrder: i })));

  const brandRows = await db
    .insert(brands)
    .values(
      BRANDS.map((b) => ({
        name: b.name,
        slug: slugify(b.name),
        color: b.color,
        defaultCreatorId: byUsername.get(b.creator)!.id,
        // Ayman shoots, Jana edits, Gannah designs and Esraa runs social for every brand (all changeable per brand and per item).
        defaultShootId: byUsername.get("ayman")!.id,
        defaultMediaId: byUsername.get("jana")!.id,
        defaultDesignId: byUsername.get("gannah")!.id,
        defaultSocialId: byUsername.get("esraa")!.id,
        createdAt: new Date("2026-09-01T07:00:00Z"),
      })),
    )
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
  console.log("  Every account's first password is SEED_DEFAULT_PASSWORD; each person must choose their own at first sign-in.");
  await logActivity(db, null, { action: "brand_team_defaults", summary: "Brand defaults set: Graphic Design → Gannah, Social → Esraa." });
  await logActivity(db, null, { action: "managers_media_defaults", summary: "Managers: Shahenda, Ammar, Ayman, Assem. Shooting → Ayman, Editing → Jana." });
  await logActivity(db, null, { action: "king_full_access", summary: "King (IT) has full access: admin and manager." });
  // Every brand's plan from the Excel tracker, each item at its real step (once; SEED_TRACKER=0 skips it).
  if (process.env.SEED_TRACKER !== "0") await importTracker();
}

/**
 * A clean start for another company (SEED_DEMO=0): one admin account and the usual platforms.
 * Name, colours and logo come from src/config/brand.ts.
 */
async function seedEmpty() {
  const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const name = process.env.ADMIN_NAME || "Admin";
  const [admin] = await db
    .insert(users)
    .values({ username, name, title: "Admin", teams: ["leadership"], isAdmin: true, isManager: true, mustChangePassword: true, passwordHash: await hashPassword(PASSWORD) })
    .returning();
  await db.insert(platforms).values(PLATFORMS.map((p, i) => ({ name: p, slug: slugify(p), sortOrder: i })));
  await logActivity(db, null, { action: "system_seeded", subjectUserId: admin.id, summary: `Workspace created with the admin account ${name}.` });
  console.log(`✓ Empty workspace ready. Sign in as ${username} with SEED_DEFAULT_PASSWORD and add brands and people in Settings.`);
}
