import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parsePropStreamCsv } from "@/lib/adapters/propstreamCsvAdapter";
import { normalizeAddress } from "@/lib/address";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const county = (formData.get("county") as string) || "WASHTENAW";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const csvText = await file.text();
  const records = parsePropStreamCsv(csvText);
  const supabase = createServiceClient();

  // Create import record
  const { data: importRow, error: importErr } = await supabase
    .from("propstream_imports")
    .insert({
      filename: file.name,
      row_count: records.length,
      raw_mapping: {},
    })
    .select("id")
    .single();

  if (importErr || !importRow) {
    return NextResponse.json(
      { error: "Failed to create import", detail: importErr?.message },
      { status: 500 }
    );
  }

  let matched = 0;
  let created = 0;
  let errors = 0;

  for (const rec of records) {
    try {
      // Upsert property
      const { data: existing } = await supabase
        .from("properties")
        .select("id")
        .eq("county", county.toUpperCase())
        .eq("address_std", rec.address_std)
        .limit(1);

      let propertyId: string;

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
            county: county.toUpperCase(),
            parcel_id: rec.parcel_id,
            address_raw: rec.address_raw,
            address_std: rec.address_std,
            city: rec.city,
            state: rec.state || "MI",
            zip: rec.zip,
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

      // Insert propstream record
      await supabase.from("propstream_records").insert({
        import_id: importRow.id,
        property_id: propertyId,
        address_raw: rec.address_raw,
        city: rec.city,
        state: rec.state,
        zip: rec.zip,
        parcel_id: rec.parcel_id,
        equity_percent: rec.equity_percent,
        estimated_value: rec.estimated_value,
        last_sale_date: rec.last_sale_date,
        owner_occupied: rec.owner_occupied,
        absentee_owner: rec.absentee_owner,
        vacant: rec.vacant,
        tax_delinquent: rec.tax_delinquent,
        foreclosure_status: rec.foreclosure_status,
        raw_row: rec.raw_row,
      });

      // Create tax signal if tax delinquent
      if (rec.tax_delinquent) {
        await supabase.from("tax_signals").insert({
          property_id: propertyId,
          signal_type: "tax_delinquent_list",
          source_name: "propstream",
          source_run_date: new Date().toISOString().split("T")[0],
        });
      }

      // Upsert owner contact
      if (rec.owner_name || rec.phone || rec.mailing_address) {
        await supabase.from("owner_contacts").insert({
          property_id: propertyId,
          owner_name: rec.owner_name,
          mailing_address_raw: rec.mailing_address,
          mailing_address_std: rec.mailing_address
            ? normalizeAddress(rec.mailing_address)
            : null,
          phone: rec.phone,
          email: rec.email,
          contact_source: "propstream",
          confidence: 70,
        });
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    import_id: importRow.id,
    total: records.length,
    created,
    matched,
    errors,
  });
}
