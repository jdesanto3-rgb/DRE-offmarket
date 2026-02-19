import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parsePreforeclosureCsv } from "@/lib/adapters/preforeclosureAdapter";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const county = (formData.get("county") as string) || "WASHTENAW";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const csvText = await file.text();
  const records = parsePreforeclosureCsv(csvText, county);
  const supabase = createServiceClient();

  let created = 0;
  let matched = 0;
  let signals = 0;
  let errors = 0;

  for (const rec of records) {
    try {
      // Find or create property
      const { data: existing } = await supabase
        .from("properties")
        .select("id")
        .eq("county", rec.county.toUpperCase())
        .eq("address_std", rec.address_std)
        .limit(1);

      let propertyId: string;

      if (existing && existing.length > 0) {
        propertyId = existing[0].id;
        matched++;
      } else {
        const { data: newProp, error: propErr } = await supabase
          .from("properties")
          .insert({
            county: rec.county.toUpperCase(),
            parcel_id: rec.parcel_id,
            address_raw: rec.address_raw,
            address_std: rec.address_std,
            state: "MI",
          })
          .select("id")
          .single();

        if (propErr || !newProp) {
          errors++;
          continue;
        }
        propertyId = newProp.id;
        created++;
      }

      // Insert tax signal
      await supabase.from("tax_signals").insert({
        property_id: propertyId,
        signal_type: "pre_foreclosure",
        stage: "lis_pendens",
        source_name: "preforeclosure_csv",
        source_run_date: rec.filing_date || new Date().toISOString().split("T")[0],
        raw_excerpt: rec.case_number
          ? `Case: ${rec.case_number}`
          : null,
      });
      signals++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: records.length,
    created,
    matched,
    signals,
    errors,
  });
}
