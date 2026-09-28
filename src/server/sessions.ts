/** Session storage. Tokens are random 32-byte values; only their SHA-256 is stored. */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

export const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Opportunistic cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export type SessionUser = Pick<User, "id" | "username" | "name" | "title" | "teams" | "isAdmin" | "isManager"> & { hasAvatar: boolean };

export async function validateSession(token: string): Promise<{ user: SessionUser; renewedExpiry: Date | null } | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: { id: users.id, username: users.username, name: users.name, title: users.title, teams: users.teams, isAdmin: users.isAdmin, isManager: users.isManager, isActive: users.isActive, avatarUpdatedAt: users.avatarUpdatedAt },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row || !row.user.isActive) return null;
  let renewedExpiry: Date | null = null;
  if (row.expiresAt.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * 86_400_000) {
    renewedExpiry = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db.update(sessions).set({ expiresAt: renewedExpiry }).where(eq(sessions.id, id));
  }
  const u = row.user;
  return { user: { id: u.id, username: u.username, name: u.name, title: u.title, teams: u.teams, isAdmin: u.isAdmin, isManager: u.isManager, hasAvatar: !!u.avatarUpdatedAt }, renewedExpiry };
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

// A real hash so unknown usernames take as long as wrong passwords (no user enumeration by timing).
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  return (dummyHash ??= hash(randomBytes(16).toString("hex"), { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 }));
}

export async function checkCredentials(username: string, password: string): Promise<User | null> {
  const [u] = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase()));
  const ok = await verify(u?.passwordHash ?? (await getDummyHash()), password).catch(() => false);
  if (!u || !ok || !u.isActive) return null;
  return u;
}
