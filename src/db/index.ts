import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

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

const globalForDb = globalThis as unknown as { __nexoraPool?: Pool; __nexoraPglite?: PGlite; __nexoraDb?: DB };

function create(): DB {
  const mode = databaseMode();
  if (mode.kind === "postgres") {
    const pool = globalForDb.__nexoraPool ?? new Pool({ connectionString: mode.url, max: 10 });
    globalForDb.__nexoraPool = pool;
    return drizzlePg({ client: pool, schema });
  }
  const client = globalForDb.__nexoraPglite ?? new PGlite(mode.dir);
  globalForDb.__nexoraPglite = client;
  return drizzlePglite({ client, schema }) as unknown as DB;
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

/** The built-in (PGlite) database, when that's what's running — used for in-app backups. */
export function localClient(): PGlite | null {
  getDb();
  return globalForDb.__nexoraPglite ?? null;
}

export async function closeDb() {
  await globalForDb.__nexoraPool?.end();
  await globalForDb.__nexoraPglite?.close();
  globalForDb.__nexoraPool = undefined;
  globalForDb.__nexoraPglite = undefined;
  globalForDb.__nexoraDb = undefined;
}

export { schema };
