import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite, type PGliteOptions } from "@electric-sql/pglite";

/**
 * Safety for the built-in database (PGlite = PostgreSQL in one process, stored in a folder).
 *
 * PGlite is NOT safe when two processes open the same folder: their writes interleave and the database is
 * corrupted for good ("PANIC: could not locate a valid checkpoint record" → "Aborted()"). Hosts start a new
 * server before the old one has stopped (Hostinger did, on every deploy), so this file guarantees:
 *  1. ONE owner — a lock file next to the folder (<folder>.lock). Others wait; after HANDOFF_AFTER_MS they ask
 *     the owner to hand over (newest process wins, like a deploy should), and the owner closes cleanly and exits.
 *  2. Backups — a copy every BACKUP_EVERY_MS when something changed, in <folder>-backups (last KEEP_BACKUPS).
 *  3. Self-healing — if the folder can't be opened, it's moved aside (never deleted) and the newest backup that
 *     opens is restored. No backup → a fresh database (the broken folder stays for manual recovery).
 */

const HEARTBEAT_MS = 2_000;
const STALE_AFTER_MS = 30_000;
const HANDOFF_AFTER_MS = 10_000;
const BACKUP_EVERY_MS = 10 * 60_000;
const KEEP_BACKUPS = 30;

export const lockFile = (dir: string) => `${dir}.lock`;
const handoffFile = (dir: string) => `${dir}.handoff`;
export const backupsDir = (dir: string) => `${dir}-backups`;

type Owner = { pid: number; host: string; startedAt: number };
const ME: Owner = { pid: process.pid, host: os.hostname(), startedAt: Date.now() };

function readJson(file: string): Owner | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Owner;
  } catch {
    return null;
  }
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false; // ESRCH (gone) or EPERM (another user's process — never ours)
  }
}

const isMe = (o: Owner | null) => !!o && o.pid === ME.pid && o.host === ME.host && o.startedAt === ME.startedAt;

/** A lock is stale when its process is gone (same machine) or it stopped refreshing it (any machine). */
function isStale(file: string, owner: Owner | null) {
  let age = Infinity;
  try {
    age = Date.now() - fs.statSync(file).mtimeMs;
  } catch {
    return true;
  }
  if (!owner) return age > STALE_AFTER_MS;
  if (owner.host === ME.host && !alive(owner.pid)) return true;
  return age > STALE_AFTER_MS;
}

/** One attempt. True when this process owns the folder now. */
export function tryLock(dir: string): boolean {
  const file = lockFile(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, JSON.stringify(ME), { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  const owner = readJson(file);
  if (isMe(owner)) return true;
  if (!isStale(file, owner)) return false;
  // Take over a dead owner's lock — only if it's still the same stale lock (another waiter may have just won).
  if (JSON.stringify(readJson(file)) !== JSON.stringify(owner)) return false;
  try {
    fs.unlinkSync(file);
    fs.writeFileSync(file, JSON.stringify(ME), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

export function lockOwner(dir: string) {
  return readJson(lockFile(dir));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until this process owns the folder; asks an older owner to hand over after HANDOFF_AFTER_MS. */
export async function acquireLock(dir: string) {
  const started = Date.now();
  let asked = false;
  let told = false;
  for (;;) {
    if (tryLock(dir)) {
      await sleep(150); // a racing waiter could have replaced it in the same instant — confirm
      if (isMe(lockOwner(dir))) {
        if (isMe(readJson(handoffFile(dir)))) fs.rmSync(handoffFile(dir), { force: true });
        return;
      }
    }
    if (!told) {
      told = true;
      console.log(`… The database is open in another server process (pid ${lockOwner(dir)?.pid}) — waiting for it to finish.`);
    }
    if (!asked && Date.now() - started > HANDOFF_AFTER_MS) {
      asked = true;
      fs.writeFileSync(handoffFile(dir), JSON.stringify(ME));
      console.log("… Asking the older server process to hand the database over.");
    }
    await sleep(250);
  }
}

export function releaseLock(dir: string) {
  if (isMe(lockOwner(dir))) fs.rmSync(lockFile(dir), { force: true });
}

/**
 * While we own the folder: keep the lock fresh, and hand over to a newer process that asks for it
 * (close the database cleanly, release, exit — the host starts us again if we're still wanted).
 */
export function keepLock(dir: string, close: () => Promise<void>) {
  const timer = setInterval(async () => {
    const now = new Date();
    try {
      fs.utimesSync(lockFile(dir), now, now);
    } catch {}
    const asker = readJson(handoffFile(dir));
    if (asker && !isMe(asker) && asker.startedAt > ME.startedAt && (asker.host !== ME.host || alive(asker.pid))) {
      clearInterval(timer);
      console.log(`↪ A newer server process (pid ${asker.pid}) is taking over the database — closing it here cleanly.`);
      try {
        await close();
      } finally {
        releaseLock(dir);
        process.exit(0);
      }
    }
  }, HEARTBEAT_MS);
  timer.unref();
  process.once("exit", () => releaseLock(dir));
  return () => clearInterval(timer);
}

function listBackups(dir: string) {
  const folder = backupsDir(dir);
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((f) => /^ops-backup-.*\.tar\.gz$/.test(f))
    .sort()
    .reverse()
    .map((f) => path.join(folder, f));
}

async function openAndCheck(dir: string, options?: PGliteOptions) {
  const client = new PGlite(dir, options);
  await client.waitReady;
  await client.query("select 1");
  return client;
}

/** Opens the folder; if it's corrupted, moves it aside and restores the newest working backup. */
export async function openWithRecovery(dir: string): Promise<PGlite> {
  try {
    return await openAndCheck(dir);
  } catch (err) {
    if (!fs.existsSync(dir) || !/Aborted|PANIC|checkpoint/i.test(String((err as Error)?.message ?? err))) throw err;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const broken = `${dir}.broken-${stamp}`;
    fs.renameSync(dir, broken);
    console.error(`✗ The built-in database could not be opened (${(err as Error).message}). Moved it to ${broken} (kept, not deleted).`);
  }
  for (const file of listBackups(dir)) {
    try {
      const client = await openAndCheck(dir, { loadDataDir: new Blob([fs.readFileSync(file)]) });
      console.error(`✓ Restored the database from the backup ${path.basename(file)}.`);
      return client;
    } catch (err) {
      console.error(`✗ Backup ${path.basename(file)} didn't open (${(err as Error).message}) — trying an older one.`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  console.error("✗ No usable backup was found — starting a fresh database.");
  return openAndCheck(dir);
}

/** Writes a backup file (a .tar.gz of the folder, the same format as Settings → Download a backup). */
export async function writeBackup(client: PGlite, dir: string) {
  const folder = backupsDir(dir);
  fs.mkdirSync(folder, { recursive: true });
  const blob = await client.dumpDataDir("gzip");
  const name = `ops-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`;
  const tmp = path.join(folder, `.${name}.tmp`);
  fs.writeFileSync(tmp, Buffer.from(await blob.arrayBuffer()));
  fs.renameSync(tmp, path.join(folder, name));
  for (const old of listBackups(dir).slice(KEEP_BACKUPS)) fs.rmSync(old, { force: true });
  return name;
}

/** Backs up now if the newest backup is older than BACKUP_EVERY_MS, then every BACKUP_EVERY_MS when the work changed. */
export function scheduleBackups(client: PGlite, dir: string) {
  let last = "";
  const fingerprint = async () => {
    const { rows } = await client.query<{ c: number; m: string | null }>("select count(*)::int as c, max(at)::text as m from activity_log");
    return `${rows[0].c}|${rows[0].m}`;
  };
  const run = async (force: boolean) => {
    try {
      const now = await fingerprint();
      if (!force && now === last) return;
      const name = await writeBackup(client, dir);
      last = now;
      console.log(`✓ Backup saved: ${path.join(backupsDir(dir), name)}`);
    } catch (err) {
      console.error("✗ Automatic backup failed:", (err as Error).message);
    }
  };
  const newest = listBackups(dir)[0];
  const newestAge = newest ? Date.now() - fs.statSync(newest).mtimeMs : Infinity;
  if (newestAge > BACKUP_EVERY_MS) void run(true);
  else void fingerprint().then((f) => (last = f), () => {});
  const timer = setInterval(() => void run(false), BACKUP_EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
