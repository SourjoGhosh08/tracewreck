import { NextResponse } from "next/server";
import { demoResetEnabled, resetAndSeedDatabase } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!demoResetEnabled()) {
    return NextResponse.json({ error: "Demo reset is disabled. Set ALLOW_DEMO_RESET=true for an explicit local reset." }, { status: 403 });
  }
  const records = resetAndSeedDatabase();
  return NextResponse.json({ seeded: records.length, runIds: records.map((run) => run.id) }, { status: 201 });
}
