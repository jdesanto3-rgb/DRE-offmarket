import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ingestOakland, ingestDelinquent } from "@/lib/connectors/ingestCounties";

export const maxDuration = 300; // 5 min max for Vercel

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results = [];

  // 1. Oakland — ArcGIS parcels
  try {
    const oakland = await ingestOakland(supabase);
    results.push(oakland);
  } catch (err) {
    results.push({ county: "OAKLAND", error: String(err) });
  }

  // 2. Washtenaw — BS&A delinquent
  try {
    const washtenaw = await ingestDelinquent(supabase, "WASHTENAW");
    results.push(washtenaw);
  } catch (err) {
    results.push({ county: "WASHTENAW", error: String(err) });
  }

  // 3. Livingston — BS&A delinquent
  try {
    const livingston = await ingestDelinquent(supabase, "LIVINGSTON");
    results.push(livingston);
  } catch (err) {
    results.push({ county: "LIVINGSTON", error: String(err) });
  }

  return NextResponse.json({ ok: true, results });
}
