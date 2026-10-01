/**
 * Runs once when the server starts, before it handles any request (Next.js `register`).
 * Hosts like Hostinger run `next start` directly, skipping `npm start` — so the database is migrated
 * and seeded here, otherwise sign-in fails on a fresh install ("relation … does not exist").
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prepareDatabase } = await import("./server/setup");
  await prepareDatabase();
}
