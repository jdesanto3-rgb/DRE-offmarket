import { NextResponse } from "next/server";
import { discoverCityFields } from "@/lib/connectors/livingstonCities";

// GET /api/debug/livingston-cities-fields
// Returns the raw field names from the first record in the Michigan open
// parcel service. Use this to verify the field mapping in livingstonCities.ts
// is correct before running a full ingest.
export async function GET() {
  try {
    const fields = await discoverCityFields();
    return NextResponse.json({ ok: true, fields });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
