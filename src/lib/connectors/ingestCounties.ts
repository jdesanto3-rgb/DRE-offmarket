import { SupabaseClient } from "@supabase/supabase-js";
import { fetchOaklandResidential, OaklandParcel } from "./oaklandArcgis";
import { fetchDelinquentParcels, DelinquentRecord } from "./bsaDelinquent";
import { normalizeAddress } from "@/lib/address";

interface IngestResult {
  county: string;
  source: string;
  fetched: number;
  created: number;
  updated: number;
  signals: number;
  contacts: number;
  errors: number;
}

async function upsertProperty(
  supabase: SupabaseClient,
  county: string,
  parcelId: string | null,
  addressRaw: string,
  addressStd: string,
  city?: string | null,
  zip?: string | null
): Promise<string | null> {
  // Try to find existing
  let existing;
  if (parcelId) {
    const { data } = await supabase
      .from("properties")
      .select("id")
      .eq("county", county)
      .eq("parcel_id", parcelId)
      .limit(1);
    existing = data?.[0];
  }

  if (!existing) {
    const { data } = await supabase
      .from("properties")
      .select("id")
      .eq("county", county)
      .eq("address_std", addressStd)
      .limit(1);
    existing = data?.[0];
  }

  if (existing) {
    await supabase
      .from("properties")
      .update({ source_last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: newProp, error } = await supabase
    .from("properties")
    .insert({
      county,
      parcel_id: parcelId,
      address_raw: addressRaw,
      address_std: addressStd,
      city: city || null,
      state: "MI",
      zip: zip || null,
    })
    .select("id")
    .single();

  if (error) return null;
  return newProp.id;
}

export async function ingestOakland(
  supabase: SupabaseClient
): Promise<IngestResult> {
  const result: IngestResult = {
    county: "OAKLAND",
    source: "arcgis",
    fetched: 0,
    created: 0,
    updated: 0,
    signals: 0,
    contacts: 0,
    errors: 0,
  };

  let parcels: OaklandParcel[];
  try {
    parcels = await fetchOaklandResidential();
  } catch (err) {
    result.errors++;
    return result;
  }

  result.fetched = parcels.length;

  for (const p of parcels) {
    try {
      const { data: existing } = await supabase
        .from("properties")
        .select("id")
        .eq("county", "OAKLAND")
        .eq("parcel_id", p.parcel_id)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from("properties")
          .update({ source_last_seen_at: new Date().toISOString() })
          .eq("id", existing[0].id);
        result.updated++;

        // Upsert contact
        await upsertContact(supabase, existing[0].id, p);
      } else {
        const { data: newProp, error } = await supabase
          .from("properties")
          .insert({
            county: "OAKLAND",
            parcel_id: p.parcel_id,
            address_raw: p.address_raw,
            address_std: p.address_std,
            city: p.city,
            state: "MI",
            zip: p.zip,
          })
          .select("id")
          .single();

        if (error || !newProp) {
          result.errors++;
          continue;
        }
        result.created++;

        await upsertContact(supabase, newProp.id, p);
        result.contacts++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

async function upsertContact(
  supabase: SupabaseClient,
  propertyId: string,
  parcel: OaklandParcel
): Promise<void> {
  if (!parcel.owner_name) return;

  // Check if contact already exists
  const { data: existing } = await supabase
    .from("owner_contacts")
    .select("id")
    .eq("property_id", propertyId)
    .eq("contact_source", "oakland_arcgis")
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabase.from("owner_contacts").insert({
    property_id: propertyId,
    owner_name: parcel.owner_name,
    mailing_address_raw: parcel.mailing_address,
    mailing_address_std: parcel.mailing_address
      ? normalizeAddress(parcel.mailing_address)
      : null,
    contact_source: "oakland_arcgis",
    confidence: 60,
  });
}

export async function ingestDelinquent(
  supabase: SupabaseClient,
  county: string
): Promise<IngestResult> {
  const result: IngestResult = {
    county: county.toUpperCase(),
    source: "bsa_delinquent",
    fetched: 0,
    created: 0,
    updated: 0,
    signals: 0,
    contacts: 0,
    errors: 0,
  };

  let records: DelinquentRecord[];
  try {
    records = await fetchDelinquentParcels(county);
  } catch {
    result.errors++;
    return result;
  }

  result.fetched = records.length;

  for (const rec of records) {
    try {
      const propertyId = await upsertProperty(
        supabase,
        rec.county,
        rec.parcel_id,
        rec.address_raw,
        rec.address_std
      );

      if (!propertyId) {
        result.errors++;
        continue;
      }

      // Check if we already have this signal
      const { data: existingSignal } = await supabase
        .from("tax_signals")
        .select("id")
        .eq("property_id", propertyId)
        .eq("signal_type", "tax_delinquent_list")
        .eq("source_name", "bsa_delinquent")
        .limit(1);

      if (!existingSignal || existingSignal.length === 0) {
        await supabase.from("tax_signals").insert({
          property_id: propertyId,
          signal_type: "tax_delinquent_list",
          tax_year: rec.tax_year,
          amount_due: rec.amount_due,
          source_name: "bsa_delinquent",
          source_run_date: new Date().toISOString().split("T")[0],
          raw_excerpt: rec.description,
        });
        result.signals++;
        result.created++;
      } else {
        result.updated++;
      }

      // Add owner contact if available
      if (rec.owner_name) {
        const { data: existingContact } = await supabase
          .from("owner_contacts")
          .select("id")
          .eq("property_id", propertyId)
          .eq("contact_source", "bsa_delinquent")
          .limit(1);

        if (!existingContact || existingContact.length === 0) {
          await supabase.from("owner_contacts").insert({
            property_id: propertyId,
            owner_name: rec.owner_name,
            contact_source: "bsa_delinquent",
            confidence: 50,
          });
          result.contacts++;
        }
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}
