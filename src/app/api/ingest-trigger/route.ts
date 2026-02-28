import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ingestOakland, ingestDelinquent, ingestHowell, ingestBrighton } from "@/lib/connectors/ingestCounties";
import { runDealHunterAgent } from "@/lib/agents/dealHunterAgent";

export const maxDuration = 300;

export async function POST() {
  const supabase = createServiceClient();
  const results = [];

  // 1. Livingston — Howell + Brighton via Michigan open parcel
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

  // 2. Washtenaw — delinquent
  try {
    const washtenaw = await ingestDelinquent(supabase, "WASHTENAW");
    results.push(washtenaw);
  } catch (err) {
    results.push({ county: "WASHTENAW", error: String(err) });
  }

  // 3. Oakland — large dataset, runs last
  try {
    const oakland = await ingestOakland(supabase);
    results.push(oakland);
  } catch (err) {
    results.push({ county: "OAKLAND", error: String(err) });
  }

  // 4. Score and detect HOT deals
  try {
    const scoring = await runDealHunterAgent(supabase);
    results.push({ step: "deal_hunter", ...scoring });
  } catch (err) {
    results.push({ step: "deal_hunter", error: String(err) });
  }

  return NextResponse.json({ ok: true, results });
}
