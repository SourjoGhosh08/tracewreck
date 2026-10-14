import { getDb } from "./client";
import { agentRuns, traceSteps } from "./schema";
import { seedRuns } from "./seed-data";

export function seedDatabase() {
  const db = getDb();
  db.transaction((transaction) => {
    transaction.delete(traceSteps).run();
    transaction.delete(agentRuns).run();
    transaction.insert(agentRuns).values(seedRuns.map(({ run }) => run)).run();
    transaction.insert(traceSteps).values(seedRuns.flatMap(({ steps }) => steps)).run();
  });
  return seedRuns.map(({ run }) => run);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const seeded = seedDatabase();
  console.log(`Seeded ${seeded.length} AgentPostmortem runs.`);
}
