import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseWashtenawPdf } from "@/lib/adapters/washtenawPdfAdapter";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const records = await parseWashtenawPdf(buffer);
  const supabase = createServiceClient();
  const runId = crypto.randomUUID();

  let created = 0;
  let matched = 0;
  let signals = 0;
  let errors = 0;

  for (const rec of records) {
    try {
      // Find or create property
      let propertyId: string;

      if (rec.parcel_id) {
        const { data: existing } = await supabase
          .from("properties")
          .select("id")
          .eq("county", "WASHTENAW")
          .eq("parcel_id", rec.parcel_id)
          .limit(1);

        if (existing && existing.length > 0) {
          propertyId = existing[0].id;
          matched++;
          await supabase
            .from("properties")
            .update({ source_last_seen_at: new Date().toISOString() })
            .eq("id", propertyId);
        } else {
          const { data: newProp, error: propErr } = await supabase
            .from("properties")
            .insert({
              county: "WASHTENAW",
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
      } else {
        const { data: existing } = await supabase
          .from("properties")
          .select("id")
          .eq("county", "WASHTENAW")
          .eq("address_std", rec.address_std)
          .limit(1);

        if (existing && existing.length > 0) {
          propertyId = existing[0].id;
          matched++;
        } else {
          const { data: newProp, error: propErr } = await supabase
            .from("properties")
            .insert({
              county: "WASHTENAW",
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
      }

      // Insert tax signal
      await supabase.from("tax_signals").insert({
        property_id: propertyId,
        signal_type: rec.signal_type,
        stage: rec.stage,
        tax_year: rec.tax_year,
        amount_due: rec.amount_due,
        source_name: "washtenaw_pdf",
        source_run_id: runId,
        source_run_date: new Date().toISOString().split("T")[0],
        raw_excerpt: rec.raw_excerpt,
      });
      signals++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    run_id: runId,
    total: records.length,
    created,
    matched,
    signals,
    errors,
  });
}
