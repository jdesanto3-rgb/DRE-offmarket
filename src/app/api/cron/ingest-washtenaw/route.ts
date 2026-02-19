import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Stub: In production, this would fetch the latest Washtenaw PDF
  // from a known URL and run it through the PDF adapter.
  // For now, ingest is triggered manually via /imports/washtenaw.

  const supabase = createServiceClient();
  void supabase; // used in future automated fetch

  return NextResponse.json({
    ok: true,
    message: "Washtenaw ingest cron — manual upload required for MVP",
  });
}
