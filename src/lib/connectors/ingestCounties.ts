import { SupabaseClient } from "@supabase/supabase-js";
import { fetchOaklandResidential, OaklandParcel } from "./oaklandArcgis";
import { fetchLivingstonResidential, LivingstonParcel } from "./livingstonArcgis";
import { fetchLivingstonCityParcels, LivingstonCityParcel, SupportedCity } from "./livingstonCities";
import { fetchDelinquentParcels, DelinquentRecord } from "./bsaDelinquent";
import { normalizeAddress } from "@/lib/address";

interface IngestResult {
  county: string;
  source: string;
  fetched: number;
  upserted: number;
  signals: number;
  contacts: number;
  errors: number;
}

const BATCH_SIZE = 500;

export async function ingestLivingston(
  supabase: SupabaseClient
): Promise<IngestResult> {
  const result: IngestResult = {
    county: "LIVINGSTON",
    source: "arcgis",
    fetched: 0,
    upserted: 0,
    signals: 0,
    contacts: 0,
    errors: 0,
  };

  let parcels: LivingstonParcel[];
  try {
    parcels = await fetchLivingstonResidential();
  } catch (err) {
    console.error("Livingston ArcGIS fetch failed:", err);
    result.errors++;
    return result;
  }

  result.fetched = parcels.length;

  // Batch upsert properties
  for (let i = 0; i < parcels.length; i += BATCH_SIZE) {
    const batch = parcels.slice(i, i + BATCH_SIZE);

    const rows = batch.map((p) => ({
      county: "LIVINGSTON" as const,
      parcel_id: p.parcel_id,
      address_raw: p.address_raw,
      address_std: p.address_std,
      city: p.city || null,
      state: "MI",
      zip: p.zip || null,
      source_last_seen_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("properties")
      .upsert(rows, { onConflict: "county,parcel_id", ignoreDuplicates: false });

    if (error) {
      result.errors += batch.length;
    } else {
      result.upserted += batch.length;
    }
  }

  // Batch upsert contacts
  for (let i = 0; i < parcels.length; i += BATCH_SIZE) {
    const batch = parcels.slice(i, i + BATCH_SIZE);
    const parcelIds = batch.map((p) => p.parcel_id);

    const { data: props } = await supabase
      .from("properties")
      .select("id, parcel_id")
      .eq("county", "LIVINGSTON")
      .in("parcel_id", parcelIds);

    if (!props) continue;

    const idMap = new Map(props.map((p) => [p.parcel_id, p.id]));

    const contactRows = [];
    for (const p of batch) {
      const propId = idMap.get(p.parcel_id);
      if (!propId || !p.owner_name) continue;
      contactRows.push({
        property_id: propId,
        owner_name: p.owner_name,
        mailing_address_raw: p.mailing_address || null,
        mailing_address_std: p.mailing_address
          ? normalizeAddress(p.mailing_address)
          : null,
        contact_source: "livingston_arcgis",
        confidence: 60,
      });
    }

    if (contactRows.length > 0) {
      const { error } = await supabase
        .from("owner_contacts")
        .upsert(contactRows, {
          onConflict: "property_id,contact_source",
          ignoreDuplicates: true,
        });
      if (!error) result.contacts += contactRows.length;
    }
  }

  return result;
}

export async function ingestOakland(
  supabase: SupabaseClient
): Promise<IngestResult> {
  const result: IngestResult = {
    county: "OAKLAND",
    source: "arcgis",
    fetched: 0,
    upserted: 0,
    signals: 0,
    contacts: 0,
    errors: 0,
  };

  let parcels: OaklandParcel[];
  try {
    parcels = await fetchOaklandResidential();
  } catch {
    result.errors++;
    return result;
  }

  result.fetched = parcels.length;

  // Batch upsert properties
  for (let i = 0; i < parcels.length; i += BATCH_SIZE) {
    const batch = parcels.slice(i, i + BATCH_SIZE);

    const rows = batch.map((p) => ({
      county: "OAKLAND" as const,
      parcel_id: p.parcel_id,
      address_raw: p.address_raw,
      address_std: p.address_std,
      city: p.city || null,
      state: "MI",
      zip: p.zip || null,
      source_last_seen_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("properties")
      .upsert(rows, { onConflict: "county,parcel_id", ignoreDuplicates: false });

    if (error) {
      result.errors += batch.length;
    } else {
      result.upserted += batch.length;
    }
  }

  // Batch upsert contacts — fetch property IDs for this batch
  for (let i = 0; i < parcels.length; i += BATCH_SIZE) {
    const batch = parcels.slice(i, i + BATCH_SIZE);
    const parcelIds = batch.map((p) => p.parcel_id);

    const { data: props } = await supabase
      .from("properties")
      .select("id, parcel_id")
      .eq("county", "OAKLAND")
      .in("parcel_id", parcelIds);

    if (!props) continue;

    const idMap = new Map(props.map((p) => [p.parcel_id, p.id]));

    const contactRows = [];
    for (const p of batch) {
      const propId = idMap.get(p.parcel_id);
      if (!propId || !p.owner_name) continue;
      contactRows.push({
        property_id: propId,
        owner_name: p.owner_name,
        mailing_address_raw: p.mailing_address || null,
        mailing_address_std: p.mailing_address
          ? normalizeAddress(p.mailing_address)
          : null,
        contact_source: "oakland_arcgis",
        confidence: 60,
      });
    }

    if (contactRows.length > 0) {
      const { error } = await supabase
        .from("owner_contacts")
        .upsert(contactRows, {
          onConflict: "property_id,contact_source",
          ignoreDuplicates: true,
        });
      if (!error) result.contacts += contactRows.length;
    }
  }

  return result;
}

export async function ingestDelinquent(
  supabase: SupabaseClient,
  county: string
): Promise<IngestResult> {
  const result: IngestResult = {
    county: county.toUpperCase(),
    source: "bsa_delinquent",
    fetched: 0,
    upserted: 0,
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

  // Batch upsert properties
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const rows = batch.map((rec) => ({
      county: rec.county,
      parcel_id: rec.parcel_id,
      address_raw: rec.address_raw,
      address_std: rec.address_std,
      source_last_seen_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("properties")
      .upsert(rows, { onConflict: "county,parcel_id", ignoreDuplicates: false });

    if (error) {
      result.errors += batch.length;
    } else {
      result.upserted += batch.length;
    }
  }

  // Batch upsert tax signals + contacts
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const parcelIds = batch.map((r) => r.parcel_id);

    const { data: props } = await supabase
      .from("properties")
      .select("id, parcel_id")
      .eq("county", county.toUpperCase())
      .in("parcel_id", parcelIds);

    if (!props) continue;

    const idMap = new Map(props.map((p) => [p.parcel_id, p.id]));

    // Tax signals
    const signalRows = [];
    for (const rec of batch) {
      const propId = idMap.get(rec.parcel_id);
      if (!propId) continue;
      signalRows.push({
        property_id: propId,
        signal_type: "tax_delinquent_list",
        tax_year: rec.tax_year,
        amount_due: rec.amount_due,
        source_name: "bsa_delinquent",
        source_run_date: new Date().toISOString().split("T")[0],
        raw_excerpt: rec.description,
      });
    }

    if (signalRows.length > 0) {
      const { error } = await supabase
        .from("tax_signals")
        .upsert(signalRows, {
          onConflict: "property_id,signal_type,source_name",
          ignoreDuplicates: false,
        });
      if (!error) result.signals += signalRows.length;
    }

    // Contacts
    const contactRows = [];
    for (const rec of batch) {
      const propId = idMap.get(rec.parcel_id);
      if (!propId || !rec.owner_name) continue;
      contactRows.push({
        property_id: propId,
        owner_name: rec.owner_name,
        contact_source: "bsa_delinquent",
        confidence: 50,
      });
    }

    if (contactRows.length > 0) {
      const { error } = await supabase
        .from("owner_contacts")
        .upsert(contactRows, {
          onConflict: "property_id,contact_source",
          ignoreDuplicates: true,
        });
      if (!error) result.contacts += contactRows.length;
    }
  }

  return result;
}

async function ingestLivingstonCity(
  supabase: SupabaseClient,
  city: SupportedCity
): Promise<IngestResult> {
  const result: IngestResult = {
    county: "LIVINGSTON",
    source: `mcgi_${city.toLowerCase()}`,
    fetched: 0,
    upserted: 0,
    signals: 0,
    contacts: 0,
    errors: 0,
  };

  let parcels: LivingstonCityParcel[];
  try {
    parcels = await fetchLivingstonCityParcels(city);
  } catch (err) {
    console.error(`Livingston city fetch failed (${city}):`, err);
    result.errors++;
    return result;
  }

  result.fetched = parcels.length;

  for (let i = 0; i < parcels.length; i += BATCH_SIZE) {
    const batch = parcels.slice(i, i + BATCH_SIZE);

    const rows = batch.map((p) => ({
      county: "LIVINGSTON" as const,
      parcel_id: p.parcel_id,
      address_raw: p.address_raw,
      address_std: p.address_std,
      city: p.city,
      state: "MI",
      zip: p.zip || null,
      source_last_seen_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("properties")
      .upsert(rows, { onConflict: "county,parcel_id", ignoreDuplicates: false });

    if (error) {
      result.errors += batch.length;
    } else {
      result.upserted += batch.length;
    }
  }

  for (let i = 0; i < parcels.length; i += BATCH_SIZE) {
    const batch = parcels.slice(i, i + BATCH_SIZE);
    const parcelIds = batch.map((p) => p.parcel_id);

    const { data: props } = await supabase
      .from("properties")
      .select("id, parcel_id")
      .eq("county", "LIVINGSTON")
      .in("parcel_id", parcelIds);

    if (!props) continue;

    const idMap = new Map(props.map((p) => [p.parcel_id, p.id]));

    const contactRows = [];
    for (const p of batch) {
      const propId = idMap.get(p.parcel_id);
      if (!propId || !p.owner_name) continue;
      contactRows.push({
        property_id: propId,
        owner_name: p.owner_name,
        mailing_address_raw: p.mailing_address || null,
        mailing_address_std: p.mailing_address
          ? normalizeAddress(p.mailing_address)
          : null,
        contact_source: `mcgi_${city.toLowerCase()}`,
        confidence: 60,
      });
    }

    if (contactRows.length > 0) {
      const { error } = await supabase
        .from("owner_contacts")
        .upsert(contactRows, {
          onConflict: "property_id,contact_source",
          ignoreDuplicates: true,
        });
      if (!error) result.contacts += contactRows.length;
    }
  }

  return result;
}

export async function ingestHowell(
  supabase: SupabaseClient
): Promise<IngestResult> {
  return ingestLivingstonCity(supabase, "HOWELL");
}

export async function ingestBrighton(
  supabase: SupabaseClient
): Promise<IngestResult> {
  return ingestLivingstonCity(supabase, "BRIGHTON");
}
