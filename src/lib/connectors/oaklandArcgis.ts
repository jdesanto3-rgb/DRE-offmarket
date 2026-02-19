import { normalizeAddress } from "@/lib/address";

const BASE_URL =
  "https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1/query";

const PAGE_SIZE = 2000;

export interface OaklandParcel {
  parcel_id: string;
  owner_name: string;
  owner_name_2: string | null;
  address_raw: string;
  address_std: string;
  city: string | null;
  state: string;
  zip: string | null;
  mailing_address: string | null;
  assessed_value: number | null;
  taxable_value: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  structure_desc: string | null;
  class_code: string | null;
}

interface ArcGISFeature {
  attributes: Record<string, unknown>;
}

interface ArcGISResponse {
  features: ArcGISFeature[];
  exceededTransferLimit?: boolean;
}

async function queryPage(
  offset: number,
  where: string
): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where,
    outFields: "PIN,NAME1,NAME2,SITEADDRESS,SITECITY,SITESTATE,SITEZIP5,POSTALADDRESS,ASSESSEDVALUE,TAXABLEVALUE,NUM_BEDS,NUM_BATHS,LIVING_AREA_SQFT,STRUCTURE_DESC,CLASSCODE",
    f: "json",
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    orderByFields: "PIN",
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`ArcGIS query failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function parseFeature(attrs: Record<string, unknown>): OaklandParcel | null {
  const address = attrs.SITEADDRESS as string;
  const pin = attrs.PIN as string;
  if (!address || !pin) return null;

  return {
    parcel_id: pin,
    owner_name: (attrs.NAME1 as string) || "Unknown",
    owner_name_2: (attrs.NAME2 as string) || null,
    address_raw: address,
    address_std: normalizeAddress(address),
    city: (attrs.SITECITY as string) || null,
    state: (attrs.SITESTATE as string) || "MI",
    zip: (attrs.SITEZIP5 as string) || null,
    mailing_address: (attrs.POSTALADDRESS as string) || null,
    assessed_value: (attrs.ASSESSEDVALUE as number) || null,
    taxable_value: (attrs.TAXABLEVALUE as number) || null,
    beds: (attrs.NUM_BEDS as number) || null,
    baths: (attrs.NUM_BATHS as number) || null,
    sqft: (attrs.LIVING_AREA_SQFT as number) || null,
    structure_desc: (attrs.STRUCTURE_DESC as string) || null,
    class_code: (attrs.CLASSCODE as string) || null,
  };
}

// Fetch parcels by city — keeps queries manageable
export async function fetchOaklandParcelsByCity(
  city: string
): Promise<OaklandParcel[]> {
  const parcels: OaklandParcel[] = [];
  let offset = 0;
  let hasMore = true;
  const where = `SITECITY='${city.toUpperCase().replace(/'/g, "''")}'`;

  while (hasMore) {
    const data = await queryPage(offset, where);
    for (const feat of data.features) {
      const p = parseFeature(feat.attributes);
      if (p) parcels.push(p);
    }
    hasMore = data.exceededTransferLimit === true;
    offset += PAGE_SIZE;
  }

  return parcels;
}

// Fetch all residential parcels (class codes 401-499 are residential in MI)
export async function fetchOaklandResidential(): Promise<OaklandParcel[]> {
  const parcels: OaklandParcel[] = [];
  let offset = 0;
  let hasMore = true;
  const where = "CLASSCODE LIKE '4%' AND SITEADDRESS IS NOT NULL";

  while (hasMore) {
    const data = await queryPage(offset, where);
    for (const feat of data.features) {
      const p = parseFeature(feat.attributes);
      if (p) parcels.push(p);
    }
    hasMore = data.exceededTransferLimit === true;
    offset += PAGE_SIZE;

    // Safety limit — Oakland has ~500k parcels, residential is ~350k
    // For MVP, cap at 50k to avoid timeout
    if (parcels.length >= 50000) break;
  }

  return parcels;
}
