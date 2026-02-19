import { normalizeAddress } from "@/lib/address";

// BS&A Online is used by Washtenaw (uid=2075) and Livingston (uid=1085)
// for delinquent tax lookups. We query their public search endpoints.

const BSA_BASE = "https://bsaonline.com";

export interface DelinquentRecord {
  parcel_id: string;
  address_raw: string;
  address_std: string;
  owner_name: string | null;
  county: string;
  tax_year: number | null;
  amount_due: number | null;
  description: string | null;
}

interface BSASearchResult {
  ParcelNumber?: string;
  SitusAddress?: string;
  OwnerName?: string;
  TaxYear?: number;
  TotalDue?: number;
  Description?: string;
}

const COUNTY_UIDS: Record<string, string> = {
  WASHTENAW: "2075",
  LIVINGSTON: "1085",
};

// BS&A exposes a search API that returns JSON for delinquent tax records
async function searchBSA(
  uid: string,
  searchText: string
): Promise<BSASearchResult[]> {
  const url = `${BSA_BASE}/OnlinePayment/OnlinePaymentSearch`;
  const params = new URLSearchParams({
    PaymentApplicationType: "5", // delinquent taxes
    uid,
    SearchText: searchText,
    SearchBy: "0", // search by parcel
  });

  const res = await fetch(`${url}?${params.toString()}`, {
    headers: {
      Accept: "application/json, text/html",
      "User-Agent": "DRE-OffMarket/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`BS&A search failed: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // BS&A may return HTML or JSON depending on the endpoint
  if (contentType.includes("application/json")) {
    return res.json();
  }

  // If HTML, parse the table rows
  const html = await res.text();
  return parseBSAHtml(html);
}

function parseBSAHtml(html: string): BSASearchResult[] {
  const results: BSASearchResult[] = [];

  // Look for table rows with parcel data
  // Pattern: parcel number, address, owner, amount
  const rowPattern = /data-parcel-number="([^"]+)"[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;

  while ((match = rowPattern.exec(html)) !== null) {
    const parcelNum = match[1];
    if (parcelNum) {
      results.push({
        ParcelNumber: parcelNum.trim(),
        SitusAddress: extractTableCell(html, match.index, 1),
        OwnerName: extractTableCell(html, match.index, 2),
      });
    }
  }

  // Fallback: look for any parcel-number-like strings
  if (results.length === 0) {
    const parcelPattern = /(\d{2}-\d{2}-\d{3}-\d{3})/g;
    let parcelMatch;
    const seen = new Set<string>();
    while ((parcelMatch = parcelPattern.exec(html)) !== null) {
      const pid = parcelMatch[1];
      if (!seen.has(pid)) {
        seen.add(pid);
        results.push({ ParcelNumber: pid });
      }
    }
  }

  return results;
}

function extractTableCell(
  html: string,
  startIdx: number,
  cellNum: number
): string | undefined {
  let pos = startIdx;
  for (let i = 0; i < cellNum; i++) {
    const tdStart = html.indexOf("<td", pos + 1);
    if (tdStart === -1) return undefined;
    pos = tdStart;
  }
  const contentStart = html.indexOf(">", pos) + 1;
  const contentEnd = html.indexOf("</td>", contentStart);
  if (contentEnd === -1) return undefined;
  return html.substring(contentStart, contentEnd).replace(/<[^>]+>/g, "").trim();
}

export async function fetchDelinquentParcels(
  county: string
): Promise<DelinquentRecord[]> {
  const uid = COUNTY_UIDS[county.toUpperCase()];
  if (!uid) {
    throw new Error(`No BS&A UID configured for county: ${county}`);
  }

  const records: DelinquentRecord[] = [];

  // BS&A doesn't support wildcard search for all records.
  // We search by common street name prefixes to cast a wide net.
  const searchTerms = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
    "U", "V", "W", "X", "Y", "Z",
  ];

  const seen = new Set<string>();

  for (const term of searchTerms) {
    try {
      const results = await searchBSA(uid, term);
      for (const r of results) {
        const pid = r.ParcelNumber;
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);

        const address = r.SitusAddress || "";
        records.push({
          parcel_id: pid,
          address_raw: address,
          address_std: address ? normalizeAddress(address) : pid,
          owner_name: r.OwnerName || null,
          county: county.toUpperCase(),
          tax_year: r.TaxYear || null,
          amount_due: r.TotalDue || null,
          description: r.Description || null,
        });
      }

      // Rate limit — be respectful
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Skip failed searches, continue with next term
      continue;
    }
  }

  return records;
}
