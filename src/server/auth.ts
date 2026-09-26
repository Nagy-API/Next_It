import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "./activity";
import { createSession, deleteSession, validateSession, type SessionUser } from "./sessions";

export const SESSION_COOKIE = "nexora_session";

async function setCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  });
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(userId);
  await setCookie(token, expiresAt);
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}

/** The signed-in user for this request (memoised per request), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSession(token);
  if (!result) return null;
  if (result.renewedExpiry) {
    // Cookies can only be written from actions/route handlers; ignore when rendering.
    try {
      await setCookie(token, result.renewedExpiry);
    } catch {}
  }
  return result.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireActor(): Promise<Actor & { user: SessionUser }> {
  const user = await requireUser();
  return { id: user.id, name: user.name, user };
}

export async function requireAdmin(): Promise<Actor & { user: SessionUser }> {
  const actor = await requireActor();
  if (!actor.user.isAdmin) throw new Error("Only account administrators can do that.");
  return actor;
}
