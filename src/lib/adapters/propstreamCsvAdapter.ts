import Papa from "papaparse";
import { normalizeAddress } from "@/lib/address";

export interface PropStreamRecord {
  address_raw: string;
  address_std: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  parcel_id: string | null;
  equity_percent: number | null;
  estimated_value: number | null;
  last_sale_date: string | null;
  owner_occupied: boolean | null;
  absentee_owner: boolean | null;
  vacant: boolean | null;
  tax_delinquent: boolean | null;
  foreclosure_status: string | null;
  owner_name: string | null;
  mailing_address: string | null;
  phone: string | null;
  email: string | null;
  raw_row: Record<string, unknown>;
}

// Common PropStream column name variations
function findCol(row: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    const lower = k.toLowerCase();
    for (const col of Object.keys(row)) {
      if (col.toLowerCase().replace(/[_\s]/g, "") === lower.replace(/[_\s]/g, "")) {
        return row[col]?.trim() || null;
      }
    }
  }
  return null;
}

function toBool(val: string | null): boolean | null {
  if (!val) return null;
  const v = val.toLowerCase().trim();
  return v === "yes" || v === "true" || v === "1" || v === "y";
}

function toNum(val: string | null): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[$,%]/g, ""));
  return isNaN(n) ? null : n;
}

export function parsePropStreamCsv(csvText: string): PropStreamRecord[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const results: PropStreamRecord[] = [];

  for (const row of parsed.data) {
    const address_raw =
      findCol(row, "PropertyAddress", "Address", "PropertyFullAddress", "SitusAddress") || "";
    if (!address_raw) continue;

    results.push({
      address_raw,
      address_std: normalizeAddress(address_raw),
      city: findCol(row, "City", "SitusCity", "PropertyCity"),
      state: findCol(row, "State", "SitusState", "PropertyState") || "MI",
      zip: findCol(row, "Zip", "ZipCode", "SitusZip", "PropertyZip"),
      parcel_id: findCol(row, "APN", "ParcelNumber", "ParcelID"),
      equity_percent: toNum(findCol(row, "EquityPercent", "Equity%", "EstimatedEquity")),
      estimated_value: toNum(findCol(row, "EstimatedValue", "MarketValue", "AVM")),
      last_sale_date: findCol(row, "LastSaleDate", "SaleDate"),
      owner_occupied: toBool(findCol(row, "OwnerOccupied")),
      absentee_owner: toBool(findCol(row, "AbsenteeOwner", "Absentee")),
      vacant: toBool(findCol(row, "Vacant")),
      tax_delinquent: toBool(findCol(row, "TaxDelinquent", "TaxDefault")),
      foreclosure_status: findCol(row, "ForeclosureStatus", "PreForeclosure"),
      owner_name: findCol(row, "OwnerName", "Owner1FullName", "OwnerFullName"),
      mailing_address: findCol(row, "MailingAddress", "MailingFullAddress", "OwnerAddress"),
      phone: findCol(row, "Phone", "Phone1", "OwnerPhone"),
      email: findCol(row, "Email", "OwnerEmail"),
      raw_row: row as Record<string, unknown>,
    });
  }

  return results;
}
