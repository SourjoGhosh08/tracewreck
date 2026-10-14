import { NextResponse } from "next/server";
import { seedDatabase } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  const records = seedDatabase();
  return NextResponse.json({ seeded: records.length, runIds: records.map((run) => run.id) }, { status: 201 });
}
