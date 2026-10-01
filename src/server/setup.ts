import { existsSync } from "node:fs";
import path from "node:path";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { databaseMode, db } from "@/db";
import { seed } from "./seed";

/**
 * Makes the database ready: applies migrations (drizzle/*.sql), then seeds an empty database and runs the
 * one-time upgrades. Safe to repeat. Called by src/instrumentation.ts before the server takes requests, so
 * the app works however the host starts it (`npm start`, plain `next start`, Hostinger's runner…).
 */
export async function prepareDatabase() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (!existsSync(migrationsFolder)) throw new Error(`Migrations folder not found: ${migrationsFolder} — start the app from the project folder.`);
  const mode = databaseMode();
  if (mode.kind === "postgres") await migratePg(db, { migrationsFolder });
  else await migratePglite(db as unknown as PgliteDatabase, { migrationsFolder });
  console.log(`✓ Database ready${mode.kind === "local" ? ` (built-in database in ${mode.dir})` : ""}`);
  await seed();
}
