import { databaseMode, db, openDatabase, startAutomaticBackups } from "@/db";
import { MIGRATIONS } from "@/db/migrations.generated";
import { seed } from "./seed";
import { startAutoPause } from "./auto-pause";
import { startSocialQueue } from "./social-queue";

type Migrator = { dialect: { migrate(m: typeof MIGRATIONS, session: unknown, config: { migrationsFolder: string }): Promise<void> }; session: unknown };

/**
 * Applies the migrations (drizzle/*.sql, embedded in the code by scripts/embed-migrations.mjs so no folder is
 * needed at runtime). Same bookkeeping table as drizzle's migrate(), so it's safe on databases migrated either way.
 */
export async function migrateDatabase() {
  const real = db as unknown as Migrator;
  await real.dialect.migrate(MIGRATIONS, real.session, { migrationsFolder: "" });
  const mode = databaseMode();
  console.log(`✓ Database ready${mode.kind === "local" ? ` (built-in database in ${mode.dir})` : ""}`);
}

/**
 * Makes the database ready: migrations, then seeding an empty database and the one-time upgrades. Safe to repeat.
 * Called by src/instrumentation.ts before the server takes requests, so the app works however the host starts it
 * (`npm start`, plain `next start`, Hostinger's runner…).
 */
export async function prepareDatabase() {
  await openDatabase();
  await migrateDatabase();
  await seed();
  startAutomaticBackups();
  startAutoPause();
  startSocialQueue();
}
