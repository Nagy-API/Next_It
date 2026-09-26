import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle or the root db; services accept either. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

const globalForDb = globalThis as unknown as { __nexoraPool?: Pool; __nexoraDb?: DB };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure PostgreSQL.");
  const pool = globalForDb.__nexoraPool ?? new Pool({ connectionString: url, max: 10 });
  globalForDb.__nexoraPool = pool;
  return drizzle({ client: pool, schema });
}

export const db: DB = globalForDb.__nexoraDb ?? (globalForDb.__nexoraDb = create());

export async function closeDb() {
  await globalForDb.__nexoraPool?.end();
  globalForDb.__nexoraPool = undefined;
  globalForDb.__nexoraDb = undefined;
}

export { schema };
