import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { isLockedOut, passwordProblem, recordAttempt, safeNext, LOCK } from "@/server/security";
import { createUser, setUserPassword, updateUser, setUserActive } from "@/server/admin";
import { makeManager, makeUser, uid } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("Passwords", () => {
  it("rejects weak passwords with a clear reason", () => {
    expect(passwordProblem("short1")).toMatch(/10 characters/);
    expect(passwordProblem("password123")).toMatch(/common/);
    expect(passwordProblem("abcdefghijk")).toMatch(/Mix letters/);
    expect(passwordProblem("king-secret-2026", { username: "king" })).toMatch(/username/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/too simple/);
    expect(passwordProblem("Blue-Harbor-72")).toBeNull();
  });

  it("new accounts and admin resets are temporary; choosing your own clears it", async () => {
    const admin = await makeUser("Admin", ["leadership"], true);
    const u = await createUser(admin, { username: `mona-${uid()}`, name: "Mona", password: "Temporary-Pass-1" });
    expect(u.mustChangePassword).toBe(true);
    await setUserPassword({ id: u.id, name: u.name }, u.id, "Mona-Own-Pass-9");
    let [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row).toMatchObject({ mustChangePassword: false });
    expect(row.passwordChangedAt).not.toBeNull();
    await setUserPassword(admin, u.id, "Reset-By-Admin-3");
    [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.mustChangePassword).toBe(true);
  });
});

describe("Only admins manage accounts (checked inside the server, not just in the screen)", () => {
  it("blocks managers and staff from changing people", async () => {
    const manager = await makeManager("Mgr", ["content"]);
    const staff = await makeUser("Staff", ["social"]);
    await expect(createUser(manager, { username: `x-${uid()}`, name: "X", password: "Temporary-Pass-1" })).rejects.toThrow(/admin/);
    await expect(updateUser(manager, staff.id, { isAdmin: true })).rejects.toThrow(/admin/);
    await expect(setUserActive(staff, manager.id, false)).rejects.toThrow(/admin/);
    await expect(setUserPassword(manager, staff.id, "Sneaky-Pass-11")).rejects.toThrow(/admin/);
  });
});

describe("Sign-in lock-out", () => {
  it(`locks a username after ${LOCK.perUser} failures; a success clears the streak`, async () => {
    const name = `victim-${uid()}`;
    for (let i = 0; i < LOCK.perUser - 1; i++) await recordAttempt(name, "10.0.0.1", false);
    expect(await isLockedOut(name, null)).toBe(false);
    await recordAttempt(name, null, false);
    expect(await isLockedOut(name, null)).toBe(true);
    await recordAttempt(name, null, true);
    expect(await isLockedOut(name, null)).toBe(false);
  });

  it("only allows same-site redirects after sign-in", () => {
    expect(safeNext("/my-work?x=1")).toBe("/my-work?x=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
  });
});
