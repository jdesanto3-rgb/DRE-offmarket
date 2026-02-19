import pdf from "pdf-parse";
import { normalizeAddress } from "@/lib/address";

export interface WashtenawRecord {
  address_raw: string;
  address_std: string;
  parcel_id: string | null;
  signal_type: string;
  stage: string | null;
  amount_due: number | null;
  tax_year: number | null;
  raw_excerpt: string;
}

// Parses Washtenaw County tax/foreclosure notice PDFs
// Expected format: lines with parcel IDs + addresses + amounts
export async function parseWashtenawPdf(
  buffer: Buffer
): Promise<WashtenawRecord[]> {
  const data = await pdf(buffer);
  const lines = data.text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const records: WashtenawRecord[] = [];

  // Pattern: parcel ID like XX-XX-XXX-XXX followed by address
  const parcelPattern = /(\d{2}-\d{2}-\d{3}-\d{3})/;
  // Amount pattern: $X,XXX.XX
  const amountPattern = /\$[\d,]+\.?\d*/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parcelMatch = line.match(parcelPattern);
    if (!parcelMatch) continue;

    const parcel_id = parcelMatch[1];

    // Try to extract address — typically follows parcel ID on same or next line
    let addressText = line.substring(line.indexOf(parcel_id) + parcel_id.length).trim();
    if (!addressText && i + 1 < lines.length) {
      addressText = lines[i + 1];
    }
    if (!addressText) continue;

    // Clean up address — remove amounts and trailing data
    const amountMatch = addressText.match(amountPattern);
    let amount_due: number | null = null;
    if (amountMatch) {
      amount_due = parseFloat(amountMatch[0].replace(/[$,]/g, ""));
      addressText = addressText.substring(0, addressText.indexOf(amountMatch[0])).trim();
    }

    if (!addressText) continue;

    // Detect signal type from context
    let signal_type = "tax_delinquent_list";
    let stage: string | null = null;
    const contextWindow = lines.slice(Math.max(0, i - 5), i + 1).join(" ").toUpperCase();
    if (contextWindow.includes("SHOW CAUSE")) {
      signal_type = "show_cause_notice";
    } else if (contextWindow.includes("FORFEITURE") || contextWindow.includes("FORFEITED")) {
      signal_type = "forfeited_notice";
      stage = "forfeited";
    } else if (contextWindow.includes("FORECLOSURE")) {
      signal_type = "foreclosure_signal";
      stage = "foreclosure";
    }

    // Extract tax year if present
    let tax_year: number | null = null;
    const yearMatch = contextWindow.match(/20[12]\d/);
    if (yearMatch) {
      tax_year = parseInt(yearMatch[0]);
    }

    records.push({
      address_raw: addressText,
      address_std: normalizeAddress(addressText),
      parcel_id,
      signal_type,
      stage,
      amount_due,
      tax_year,
      raw_excerpt: line,
    });
  }

  return records;
}
