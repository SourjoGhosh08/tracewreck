import { seedDatabase } from "./seed";

// getDb() creates the schema, and seedDatabase() is a no-op when data exists.
// This keeps a mounted SQLite database intact across container restarts.
const runs = seedDatabase();
console.log(`Database ready with ${runs.length} TraceWreck runs.`);
