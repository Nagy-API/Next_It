/** `npm run db:seed` — first-time data and one-time upgrades (safe to repeat). The logic is in src/server/seed.ts. */
import "dotenv/config";
import { closeDb } from "../src/db";
import { seed } from "../src/server/seed";

seed()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
