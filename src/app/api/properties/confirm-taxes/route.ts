import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { property_id, confirmed_status, delinquent_years, amount_due_total } = body;

  if (!property_id) {
    return NextResponse.json({ error: "property_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase.from("tax_confirmations").insert({
    property_id,
    confirmed_status: confirmed_status || "confirmed_delinquent",
    delinquent_years: delinquent_years || null,
    amount_due_total: amount_due_total || null,
    as_of_date: new Date().toISOString().split("T")[0],
    source_name: "manual_confirmation",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update property lead status
  await supabase
    .from("properties")
    .update({ lead_status: "researching" })
    .eq("id", property_id);

  return NextResponse.json({ ok: true });
}
