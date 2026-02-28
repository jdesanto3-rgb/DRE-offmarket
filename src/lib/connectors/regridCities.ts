import { normalizeAddress } from "@/lib/address";

// Regrid ArcGIS FeatureServer — nationwide parcel data, paid API.
// Token format: your Regrid API token from https://app.regrid.com/api
// Add REGRID_API_TOKEN to your Vercel env vars.
const REGRID_FS_BASE = "https://fs.regrid.com";

const PAGE_SIZE = 500;

export type RegridCity = "HOWELL" | "BRIGHTON";

export interface RegridParcel {
  parcel_id: string;
  owner_name: string;
  owner_name_2: string | null;
  address_raw: string;
  address_std: string;
  city: string;
  state: string;
  zip: string | null;
  mailing_address: string | null;
  assessed_value: number | null;
  taxable_value: number | null;
  class_code: string | null;
}

interface ArcGISFeature {
  attributes: Record<string, unknown>;
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  exceededTransferLimit?: boolean;
  error?: { message: string; code?: number };
}

function getToken(): string {
  const token = process.env.REGRID_API_TOKEN;
  if (!token) throw new Error("REGRID_API_TOKEN env var is not set");
  return token;
}

function layerUrl(): string {
  return `${REGRID_FS_BASE}/${getToken()}/rest/services/premium/FeatureServer/0/query`;
}

async function queryPage(
  offset: number,
  where: string
): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where,
    outFields: "*",
    f: "json",
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    orderByFields: "OBJECTID",
  });

  const res = await fetch(`${layerUrl()}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Regrid query failed: ${res.status} ${res.statusText}`);
  }

  const data: ArcGISResponse = await res.json();
  if (data.error) {
    throw new Error(`Regrid error: ${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

/**
 * Fetch one record to discover actual Regrid field names.
 * Call /api/debug/regrid-fields after first deploy with token set.
 */
export async function discoverRegridFields(): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    where: "state_abbr='MI' AND county='Livingston'",
    outFields: "*",
    f: "json",
    resultRecordCount: "1",
  });
  const res = await fetch(`${layerUrl()}?${params.toString()}`);
  const data: ArcGISResponse = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.features?.[0]?.attributes ?? {};
}

function parseFeature(
  attrs: Record<string, unknown>,
  city: RegridCity
): RegridParcel | null {
  // Regrid field names — standard data dictionary names.
  // Run /api/debug/regrid-fields after first deploy to verify.
  const parcelId =
    (attrs.parcelnumb as string) ||
    (attrs.parcel_id as string) ||
    (attrs.ll_uuid as string) ||
    null;

  const address =
    (attrs.situs_full as string) ||
    (attrs.situs_address as string) ||
    (attrs.address as string) ||
    null;

  if (!parcelId || !address) return null;

  const ownerName =
    (attrs.owner as string) ||
    (attrs.owner_full_name as string) ||
    "Unknown";

  const ownerName2 =
    (attrs.owner2 as string) || null;

  const zip =
    (attrs.situs_zip as string) ||
    (attrs.zip_code as string) ||
    (attrs.zip as string) ||
    null;

  // Mailing address — combine mailadd + mail_city + mail_state + mail_zip
  const mailStreet =
    (attrs.mailadd as string) ||
    (attrs.mail_address as string) ||
    null;
  const mailCity = (attrs.mail_city as string) || null;
  const mailState = (attrs.mail_state2 as string) || (attrs.mail_state as string) || null;
  const mailZip = (attrs.mail_zip as string) || null;
  const mailingAddress = mailStreet
    ? [mailStreet, mailCity, mailState, mailZip].filter(Boolean).join(", ")
    : null;

  // Assessed value: parval = total parcel value; landval + improvval = breakdown
  const assessedValue =
    typeof attrs.parval === "number" ? attrs.parval :
    typeof attrs.assessed_value === "number" ? attrs.assessed_value :
    null;

  const taxableValue =
    typeof attrs.taxable_value === "number" ? attrs.taxable_value :
    typeof attrs.net_av === "number" ? attrs.net_av :
    null;

  const classCode =
    (attrs.usecode as string) ||
    (attrs.usedesc as string) ||
    (attrs.proptype as string) ||
    null;

  return {
    parcel_id: parcelId,
    owner_name: ownerName,
    owner_name_2: ownerName2,
    address_raw: address,
    address_std: normalizeAddress(address),
    city,
    state: "MI",
    zip: zip ? zip.slice(0, 5) : null,
    mailing_address: mailingAddress,
    assessed_value: assessedValue,
    taxable_value: taxableValue,
    class_code: classCode,
  };
}

/**
 * Fetch all residential parcels for a city in Livingston County via Regrid.
 * Residential = usecode starting with "1" (Regrid standard) or SFR/MFR desc.
 */
export async function fetchRegridCityParcels(
  city: RegridCity
): Promise<RegridParcel[]> {
  const parcels: RegridParcel[] = [];
  let offset = 0;
  let hasMore = true;

  // Regrid uses lowercase county/city in most fields
  const cityLower = city.charAt(0) + city.slice(1).toLowerCase(); // "Howell" or "Brighton"

  // Primary query: residential use codes in Livingston County, filtered by city
  const where =
    `state_abbr='MI' AND county='Livingston' AND ` +
    `(situs_city='${cityLower}' OR city2='${city}' OR city='${cityLower}') AND ` +
    `(usecode LIKE '1%' OR proptype='RESIDENTIAL' OR proptype='SFR')`;

  while (hasMore) {
    let data: ArcGISResponse;
    try {
      data = await queryPage(offset, where);
    } catch (err) {
      if (offset === 0) {
        // If residential filter fails, fall back to all parcels in city
        const simpleWhere =
          `state_abbr='MI' AND county='Livingston' AND ` +
          `(situs_city='${cityLower}' OR city2='${city}' OR city='${cityLower}')`;
        data = await queryPage(offset, simpleWhere);
      } else {
        throw err;
      }
    }

    for (const feat of data.features ?? []) {
      const p = parseFeature(feat.attributes, city);
      if (p) parcels.push(p);
    }

    hasMore = data.exceededTransferLimit === true;
    offset += PAGE_SIZE;
  }

  return parcels;
}
