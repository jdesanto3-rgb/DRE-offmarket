import { NextResponse } from "next/server";
import { discoverRegridFields } from "@/lib/connectors/regridCities";

// GET /api/debug/regrid-fields
// Returns the raw field names from the first Livingston County record in Regrid.
// Run this after setting REGRID_API_TOKEN in Vercel to verify field mapping
// before triggering a full ingest.
export async function GET() {
  try {
    const fields = await discoverRegridFields();
    return NextResponse.json({ ok: true, fields });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
