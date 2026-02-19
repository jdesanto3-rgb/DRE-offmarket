import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();

  // Fetch queued direct mail with contact + property info
  const { data: queue, error } = await supabase
    .from("outreach_queue")
    .select(`
      id,
      property_id,
      owner_contact_id,
      status,
      properties (address_raw, city, state, zip, deal_score),
      owner_contacts (owner_name, mailing_address_raw, phone)
    `)
    .eq("channel", "direct_mail")
    .eq("status", "queued");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch direct mail template
  const { data: templates } = await supabase
    .from("message_templates")
    .select("body")
    .eq("channel", "direct_mail")
    .limit(1);

  const template = templates?.[0]?.body || "";

  const rows = (queue || []).map((item: Record<string, unknown>) => {
    const prop = item.properties as Record<string, unknown> | null;
    const contact = item.owner_contacts as Record<string, unknown> | null;

    const rendered = template
      .replace(/\{\{owner_name\}\}/g, (contact?.owner_name as string) || "Homeowner")
      .replace(/\{\{your_name\}\}/g, "[YOUR NAME]")
      .replace(/\{\{property_address\}\}/g, (prop?.address_raw as string) || "")
      .replace(/\{\{phone\}\}/g, "[YOUR PHONE]");

    return {
      owner_name: contact?.owner_name || "",
      mailing_address: contact?.mailing_address_raw || "",
      property_address: prop?.address_raw || "",
      city: prop?.city || "",
      state: prop?.state || "MI",
      zip: prop?.zip || "",
      deal_score: prop?.deal_score || 0,
      letter_body: rendered,
    };
  });

  // Build CSV
  if (rows.length === 0) {
    return NextResponse.json({ message: "No queued direct mail" });
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row: Record<string, unknown>) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "").replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(",")
    ),
  ];

  return new NextResponse(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="direct-mail-export-${Date.now()}.csv"`,
    },
  });
}
