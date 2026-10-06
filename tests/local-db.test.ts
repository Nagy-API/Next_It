import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { lockFile, lockOwner, openWithRecovery, releaseLock, tryLock, writeBackup } from "@/db/local";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexora-local-"));
/** A process id that certainly isn't running any more. */
const deadPid = () => spawnSync(process.execPath, ["-e", "0"]).pid!;

describe("Built-in database: one process at a time", () => {
  it("only one process owns the folder; a dead owner's lock is taken over", () => {
    const dir = path.join(tmp(), "data");
    expect(tryLock(dir)).toBe(true);
    expect(tryLock(dir)).toBe(true); // same process again
    releaseLock(dir);
    expect(fs.existsSync(lockFile(dir))).toBe(false);

    // Another live process owns it (and keeps it fresh) → we must wait.
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: process.ppid, host: os.hostname(), startedAt: 1 }));
    expect(tryLock(dir)).toBe(false);

    // Its process is gone → stale → ours.
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: deadPid(), host: os.hostname(), startedAt: 1 }));
    expect(tryLock(dir)).toBe(true);
    expect(lockOwner(dir)?.pid).toBe(process.pid);
    releaseLock(dir);
  });

  it("a corrupted database is moved aside (kept) and the newest backup restored", async () => {
    const dir = path.join(tmp(), "data");
    const pg = new PGlite(dir);
    await pg.exec("create table activity_log (at timestamptz default now()); create table notes (v text)");
    await pg.query("insert into notes values ('kept by the backup')");
    await writeBackup(pg, dir);
    await pg.query("insert into notes values ('after the backup')");
    await pg.close();

    fs.rmSync(path.join(dir, "global", "pg_control")); // break it the way a second writer does: no valid checkpoint
    const restored = await openWithRecovery(dir);
    const { rows } = await restored.query<{ v: string }>("select v from notes");
    expect(rows.map((r) => r.v)).toEqual(["kept by the backup"]);
    await restored.close();
    const parent = fs.readdirSync(path.dirname(dir));
    expect(parent.some((f) => f.startsWith("data.broken-"))).toBe(true);
  }, 60_000);
});
