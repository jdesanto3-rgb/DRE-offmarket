import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ingestOakland, ingestDelinquent } from "@/lib/connectors/ingestCounties";
import { runDealHunterAgent } from "@/lib/agents/dealHunterAgent";

export const maxDuration = 300;

export async function POST() {
  const supabase = createServiceClient();
  const results = [];

  // 1. Ingest from all three counties
  try {
    const oakland = await ingestOakland(supabase);
    results.push(oakland);
  } catch (err) {
    results.push({ county: "OAKLAND", error: String(err) });
  }

  try {
    const washtenaw = await ingestDelinquent(supabase, "WASHTENAW");
    results.push(washtenaw);
  } catch (err) {
    results.push({ county: "WASHTENAW", error: String(err) });
  }

  try {
    const livingston = await ingestDelinquent(supabase, "LIVINGSTON");
    results.push(livingston);
  } catch (err) {
    results.push({ county: "LIVINGSTON", error: String(err) });
  }

  // 2. Score everything and detect HOT deals
  try {
    const scoring = await runDealHunterAgent(supabase);
    results.push({ step: "deal_hunter", ...scoring });
  } catch (err) {
    results.push({ step: "deal_hunter", error: String(err) });
  }

  return NextResponse.json({ ok: true, results });
}
