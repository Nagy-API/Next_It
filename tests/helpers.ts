import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { brands, platforms, users, type Team } from "@/db/schema";

/** Tests never delete data (the activity log is append-only), so every fixture gets a unique suffix. */
export const uid = () => randomBytes(4).toString("hex");

export async function makeUser(name: string, teams: Team[] = []) {
  const [u] = await db
    .insert(users)
    .values({ username: `${name.toLowerCase()}-${uid()}`, name, teams, passwordHash: "x" })
    .returning();
  return { id: u.id, name: u.name };
}

export async function makeBrand(name: string, defaultCreatorId: string) {
  const s = uid();
  const [b] = await db.insert(brands).values({ name: `${name} ${s}`, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${s}`, defaultCreatorId }).returning();
  return b;
}

export async function makePlatform(name: string) {
  const s = uid();
  const [p] = await db.insert(platforms).values({ name: `${name} ${s}`, slug: `${name.toLowerCase()}-${s}` }).returning();
  return p;
}

export async function reloadUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

/** A Date at the given Cairo wall-clock time (Cairo is UTC+3 in October 2026 / UTC+2 in winter; tests use midday to be safe). */
export const cairoNoon = (iso: string) => new Date(`${iso}T10:00:00Z`);
