/**
 * Sign-in protection: lock-outs after repeated failures, the client's IP, and password rules.
 * Kept in one place so the rules are easy to review and change.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

/** 5 wrong passwords for one username within 15 minutes → that username is locked for 15 minutes. */
export const LOCK = { perUser: 5, perIp: 30, windowMinutes: 15 };

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || h.get("x-real-ip") || null)?.slice(0, 64) ?? null;
}

/** Is this username (or this IP) temporarily locked because of too many failed sign-ins? */
export async function isLockedOut(username: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - LOCK.windowMinutes * 60_000);
  const [{ byUser }] = await db
    .select({ byUser: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.username, username), eq(loginAttempts.success, false), gte(loginAttempts.at, since)));
  if (byUser >= LOCK.perUser) return true;
  if (!ip) return false;
  const [{ byIp }] = await db
    .select({ byIp: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gte(loginAttempts.at, since)));
  return byIp >= LOCK.perIp;
}

export async function recordAttempt(username: string, ip: string | null, success: boolean) {
  await db.insert(loginAttempts).values({ username: username.slice(0, 64), ip, success });
  // A successful sign-in clears that username's failure streak.
  if (success) await db.delete(loginAttempts).where(and(eq(loginAttempts.username, username), eq(loginAttempts.success, false)));
  // Housekeeping: keep 30 days of history.
  if (Math.random() < 0.05) await db.delete(loginAttempts).where(lt(loginAttempts.at, new Date(Date.now() - 30 * 86_400_000)));
}

export { passwordProblem, safeNext } from "@/lib/passwords";
