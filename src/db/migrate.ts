import { getDb } from "./client";

// The client creates the small SQLite schema with CREATE TABLE IF NOT EXISTS so a
// fresh checkout can serve the API without a separate migration service.
getDb();
console.log("Database schema is ready.");
