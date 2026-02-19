import Papa from "papaparse";
import { normalizeAddress } from "@/lib/address";

export interface PreforeclosureRecord {
  address_raw: string;
  address_std: string;
  parcel_id: string | null;
  filing_date: string | null;
  case_number: string | null;
  county: string;
}

function findCol(row: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    const lower = k.toLowerCase().replace(/[_\s]/g, "");
    for (const col of Object.keys(row)) {
      if (col.toLowerCase().replace(/[_\s]/g, "") === lower) {
        return row[col]?.trim() || null;
      }
    }
  }
  return null;
}

export function parsePreforeclosureCsv(
  csvText: string,
  defaultCounty: string
): PreforeclosureRecord[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const results: PreforeclosureRecord[] = [];

  for (const row of parsed.data) {
    const address_raw =
      findCol(row, "Address", "PropertyAddress", "SitusAddress") || "";
    if (!address_raw) continue;

    results.push({
      address_raw,
      address_std: normalizeAddress(address_raw),
      parcel_id: findCol(row, "ParcelID", "APN", "ParcelNumber"),
      filing_date: findCol(row, "FilingDate", "DateFiled", "RecordDate"),
      case_number: findCol(row, "CaseNumber", "Case", "CaseNo"),
      county: findCol(row, "County") || defaultCounty,
    });
  }

  return results;
}
