import { normalizeAddress } from "@/lib/address";

// Michigan DTMB/MCGI statewide open parcel FeatureServer — no auth required.
// Livingston County FIPS: 093  |  CNTYNAME: 'LIVINGSTON'
const BASE_URL =
  "https://gisago.mcgi.state.mi.us/arcgis/rest/services/OpenData/statewide_parcels/FeatureServer/0/query";

const PAGE_SIZE = 1000;

export type SupportedCity = "HOWELL" | "BRIGHTON";

export interface LivingstonCityParcel {
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

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`ArcGIS query failed: ${res.status} ${res.statusText}`);
  }

  const data: ArcGISResponse = await res.json();
  if (data.error) {
    throw new Error(`ArcGIS error: ${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

/**
 * Fetch one record from the service to inspect available field names.
 * Call /api/debug/livingston-cities-fields after first deploy to verify mapping.
 */
export async function discoverCityFields(): Promise<Record<string, unknown>> {
  const data = await queryPage(0, "1=1");
  if (!data.features?.length) return {};
  return data.features[0].attributes;
}

function parseFeature(
  attrs: Record<string, unknown>,
  city: SupportedCity
): LivingstonCityParcel | null {
  // Michigan SIGMA statewide parcel field names (most common mapping).
  // If fields come back wrong, run /api/debug/livingston-cities-fields
  // and update the fallback chains below.
  const parcelId =
    (attrs.PARCELID as string) ||
    (attrs.PIN as string) ||
    (attrs.PARCEL_ID as string) ||
    null;

  const address =
    (attrs.PROPSTREETCOMBINED as string) ||
    (attrs.SITEADDRESS as string) ||
    (attrs.SITE_ADDRESS as string) ||
    (attrs.PROPSTREET as string) ||
    null;

  if (!parcelId || !address) return null;

  const ownerName =
    (attrs.RESNAME as string) ||
    (attrs.OWN_NAME1 as string) ||
    (attrs.OWNERNAME as string) ||
    "Unknown";

  const ownerName2 =
    (attrs.RESNAME2 as string) ||
    (attrs.OWN_NAME2 as string) ||
    null;

  const zip =
    (attrs.PROPZIP as string) ||
    (attrs.SITEZIP as string) ||
    (attrs.SITEZIP5 as string) ||
    null;

  const mailingAddress =
    (attrs.RESSTREET as string) ||
    (attrs.MAILADDRESS as string) ||
    (attrs.MAIL_ADDRESS as string) ||
    null;

  // Assessed value: AV is standard for SIGMA, SEV is BS&A
  const assessedValue =
    typeof attrs.AV === "number" ? attrs.AV :
    typeof attrs.SEV === "number" ? attrs.SEV :
    typeof attrs.ASSESSEDVALUE === "number" ? attrs.ASSESSEDVALUE :
    null;

  const taxableValue =
    typeof attrs.TV === "number" ? attrs.TV :
    typeof attrs.TAXABLEVALUE === "number" ? attrs.TAXABLEVALUE :
    null;

  const classCode =
    (attrs.PROPCLASSCD as string) ||
    (attrs.CLASSES as string) ||
    (attrs.CLASSCODE as string) ||
    (attrs.CLASS as string) ||
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
 * Fetch all residential parcels for a specific city in Livingston County.
 * Residential = class codes starting with 4 (MI standard).
 */
export async function fetchLivingstonCityParcels(
  city: SupportedCity
): Promise<LivingstonCityParcel[]> {
  const parcels: LivingstonCityParcel[] = [];
  let offset = 0;
  let hasMore = true;

  // CNTYNAME and PROPCITY are standard SIGMA field names.
  // PROPCLASSCD LIKE '4%' = residential. Fall back to 1=1 if class filter errors.
  const where =
    `CNTYNAME = 'LIVINGSTON' AND PROPCITY = '${city}' AND ` +
    `(PROPCLASSCD LIKE '4%' OR CLASSES LIKE '4%' OR CLASSCODE LIKE '4%')`;

  while (hasMore) {
    let data: ArcGISResponse;
    try {
      data = await queryPage(offset, where);
    } catch (err) {
      // If the class-code filter failed, retry with just city filter
      if (offset === 0) {
        const simpleWhere = `CNTYNAME = 'LIVINGSTON' AND PROPCITY = '${city}'`;
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
