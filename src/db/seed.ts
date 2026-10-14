import { getDb } from "./client";
import { runs } from "./schema";
import { seedRuns } from "./seed-data";

export function seedDatabase() {
  const db = getDb();
  db.transaction((transaction) => {
    transaction.delete(runs).run();
    transaction.insert(runs).values(seedRuns).run();
  });
  return seedRuns;
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const seeded = seedDatabase();
  console.log(`Seeded ${seeded.length} AgentPostmortem runs.`);
}
