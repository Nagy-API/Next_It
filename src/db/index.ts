import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";
import { acquireLock, keepLock, lockOwner, openWithRecovery, releaseLock, scheduleBackups, tryLock } from "./local";

/**
 * Two ways to run the database:
 *  - DATABASE_URL=postgres://…  → a real PostgreSQL server (production, Docker).
 *  - DATABASE_URL=file:<folder> → built-in PostgreSQL (PGlite) stored in that folder. Nothing to install.
 *  - unset → the built-in database in ./local-data (development), or in ~/nexora-ops-data when the server
 *    runs in production — OUTSIDE the app folder, because redeploys replace the app folder.
 * Both speak the same SQL, so the app code is identical.
 */
export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle or the root db; services accept either. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

export const DEFAULT_LOCAL_DATA = "local-data";
export const PRODUCTION_DATA = path.join(os.homedir(), "nexora-ops-data");

export function databaseMode(): { kind: "postgres"; url: string } | { kind: "local"; dir: string } {
  const url = process.env.DATABASE_URL?.trim();
  if (url && /^postgres(ql)?:\/\//.test(url)) return { kind: "postgres", url };
  const dir = url?.startsWith("file:") ? url.slice(5) : process.env.NODE_ENV === "production" ? PRODUCTION_DATA : DEFAULT_LOCAL_DATA;
  return { kind: "local", dir: path.resolve(process.cwd(), dir) };
}

const globalForDb = globalThis as unknown as {
  __nexoraPool?: Pool;
  __nexoraPglite?: PGlite;
  __nexoraDb?: DB;
  __nexoraStop?: (() => void)[];
};

function adoptLocal(client: PGlite, dir: string) {
  globalForDb.__nexoraPglite = client;
  globalForDb.__nexoraStop = [keepLock(dir, () => client.close())];
}

function create(): DB {
  const mode = databaseMode();
  if (mode.kind === "postgres") {
    const pool = globalForDb.__nexoraPool ?? new Pool({ connectionString: mode.url, max: 10 });
    globalForDb.__nexoraPool = pool;
    return drizzlePg({ client: pool, schema });
  }
  if (!globalForDb.__nexoraPglite) {
    // Scripts (migrate, seed) open it directly; the server opens it in openDatabase() (waits for the lock + recovery).
    if (!tryLock(mode.dir)) {
      throw new Error(`The built-in database ${mode.dir} is open in another process (pid ${lockOwner(mode.dir)?.pid}). Stop it first — two processes corrupt it.`);
    }
    adoptLocal(new PGlite(mode.dir), mode.dir);
  }
  return drizzlePglite({ client: globalForDb.__nexoraPglite!, schema }) as unknown as DB;
}

function getDb(): DB {
  return (globalForDb.__nexoraDb ??= create());
}

/**
 * Opened on first use, not on import — `next build` imports server modules in several workers
 * and must not open (or create) the local database folder.
 */
export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * Server start (src/instrumentation.ts): for the built-in database, wait until no other process has the folder open,
 * open it (restoring the newest backup if it's corrupted) and start the automatic backups. See src/db/local.ts.
 */
export async function openDatabase() {
  const mode = databaseMode();
  if (mode.kind !== "local" || globalForDb.__nexoraPglite) return;
  await acquireLock(mode.dir);
  const client = await openWithRecovery(mode.dir);
  adoptLocal(client, mode.dir);
}

export function startAutomaticBackups() {
  const mode = databaseMode();
  const client = globalForDb.__nexoraPglite;
  if (mode.kind === "local" && client) (globalForDb.__nexoraStop ??= []).push(scheduleBackups(client, mode.dir));
}

/** The built-in (PGlite) database, when that's what's running — used for in-app backups. */
export function localClient(): PGlite | null {
  getDb();
  return globalForDb.__nexoraPglite ?? null;
}

export async function closeDb() {
  await globalForDb.__nexoraPool?.end();
  globalForDb.__nexoraStop?.forEach((stop) => stop());
  globalForDb.__nexoraStop = undefined;
  if (globalForDb.__nexoraPglite) {
    await globalForDb.__nexoraPglite.close();
    const mode = databaseMode();
    if (mode.kind === "local") releaseLock(mode.dir);
  }
  globalForDb.__nexoraPool = undefined;
  globalForDb.__nexoraPglite = undefined;
  globalForDb.__nexoraDb = undefined;
}

export { schema };
