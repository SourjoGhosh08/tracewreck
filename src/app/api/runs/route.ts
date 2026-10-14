import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { seedDatabase } from "@/db/seed";
import { getDb } from "@/db/client";
import { runs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const records = getDb().select().from(runs).orderBy(desc(runs.startedAt)).all();
  return NextResponse.json({ runs: records });
}

export async function POST() {
  const records = seedDatabase();
  return NextResponse.json({ seeded: records.length, runIds: records.map((run) => run.id) }, { status: 201 });
}
