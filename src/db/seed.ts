import { getDb } from "./client";
import { agentRuns, traceSteps } from "./schema";
import { seedRuns } from "./seed-data";

export function seedDatabase() {
  const db = getDb();
  const existingRun = db.select({ id: agentRuns.id }).from(agentRuns).limit(1).get();
  if (existingRun) return db.select().from(agentRuns).all();

  return insertSeedData();
}

/** Explicitly replace the local synthetic fixture set. Never use at startup. */
export function resetAndSeedDatabase() {
  const db = getDb();
  db.transaction((transaction) => {
    transaction.delete(traceSteps).run();
    transaction.delete(agentRuns).run();
  });
  return insertSeedData();
}

export function demoResetEnabled() {
  return process.env.ALLOW_DEMO_RESET === "true";
}

function insertSeedData() {
  const db = getDb();
  db.transaction((transaction) => {
    transaction.insert(agentRuns).values(seedRuns.map(({ run }) => run)).run();
    transaction.insert(traceSteps).values(seedRuns.flatMap(({ steps }) => steps)).run();
  });
  return seedRuns.map(({ run }) => run);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const seeded = resetAndSeedDatabase();
  console.log(`Seeded ${seeded.length} TraceWreck runs.`);
}
