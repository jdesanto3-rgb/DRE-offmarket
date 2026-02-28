import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ingestOakland, ingestLivingston, ingestDelinquent, ingestHowell, ingestBrighton } from "@/lib/connectors/ingestCounties";

export const maxDuration = 300; // 5 min max for Vercel

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results = [];

  // 1. LIVINGSTON — city-level via Michigan open parcel (no auth required)
  try {
    const howell = await ingestHowell(supabase);
    results.push(howell);
  } catch (err) {
    results.push({ county: "LIVINGSTON", source: "mcgi_howell", error: String(err) });
  }
  try {
    const brighton = await ingestBrighton(supabase);
    results.push(brighton);
  } catch (err) {
    results.push({ county: "LIVINGSTON", source: "mcgi_brighton", error: String(err) });
  }
  try {
    const livingstonDelinquent = await ingestDelinquent(supabase, "LIVINGSTON");
    results.push(livingstonDelinquent);
  } catch (err) {
    results.push({ county: "LIVINGSTON", source: "bsa_delinquent", error: String(err) });
  }

  // 2. Washtenaw — secondary
  try {
    const washtenaw = await ingestDelinquent(supabase, "WASHTENAW");
    results.push(washtenaw);
  } catch (err) {
    results.push({ county: "WASHTENAW", error: String(err) });
  }

  // 3. Oakland — secondary (large dataset, runs last)
  try {
    const oakland = await ingestOakland(supabase);
    results.push(oakland);
  } catch (err) {
    results.push({ county: "OAKLAND", error: String(err) });
  }

  return NextResponse.json({ ok: true, results });
}
