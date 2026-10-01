/** `npm run db:migrate` — applies the migrations (the server also does this itself on start). */
import "dotenv/config";
import { closeDb } from "../src/db";
import { migrateDatabase } from "../src/server/setup";

migrateDatabase()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
