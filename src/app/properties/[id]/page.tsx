import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ConfirmTaxesButton from "./ConfirmTaxesButton";

export const dynamic = "force-dynamic";

export default async function PropertyDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single();

  if (!property) notFound();

  const { data: signals } = await supabase
    .from("tax_signals")
    .select("*")
    .eq("property_id", id)
    .order("created_at", { ascending: false });

  const { data: contacts } = await supabase
    .from("owner_contacts")
    .select("*")
    .eq("property_id", id);

  const { data: confirmations } = await supabase
    .from("tax_confirmations")
    .select("*")
    .eq("property_id", id)
    .order("confirmed_at", { ascending: false });

  const { data: outreach } = await supabase
    .from("outreach_queue")
    .select("*")
    .eq("property_id", id)
    .order("created_at", { ascending: false });

  const band =
    property.deal_score >= 85
      ? "HOT"
      : property.deal_score >= 70
        ? "WARM"
        : property.deal_score >= 50
          ? "WATCH"
          : "LOW";

  const breakdown = property.score_breakdown as Record<string, unknown> | null;

  return (
    <div className="max-w-3xl">
      <a href="/" className="text-blue-600 hover:underline text-sm">&larr; Dashboard</a>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold">{property.address_raw}</h1>
        <p className="text-gray-500">
          {property.city ? `${property.city}, ` : ""}{property.state} {property.zip || ""}
          &middot; {property.county} County
          {property.parcel_id && ` · Parcel: ${property.parcel_id}`}
        </p>
      </div>

      {/* Score */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-4 mb-3">
          <div className="text-3xl font-bold">{property.deal_score}</div>
          <span className={`px-3 py-1 rounded text-sm font-semibold ${
            band === "HOT" ? "bg-red-100 text-red-800" :
            band === "WARM" ? "bg-orange-100 text-orange-800" :
            band === "WATCH" ? "bg-yellow-100 text-yellow-800" :
            "bg-gray-100 text-gray-600"
          }`}>{band}</span>
          <span className="text-sm text-gray-400 ml-auto">
            Status: <span className="text-gray-700">{property.lead_status}</span>
          </span>
        </div>
        {breakdown && (
          <div className="text-xs text-gray-500 space-y-1">
            {(breakdown as { reasons?: string[] }).reasons?.map((r: string, i: number) => (
              <div key={i}>• {r}</div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Taxes */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-3">Confirm Taxes</h2>
        <ConfirmTaxesButton propertyId={id} />
        {confirmations && confirmations.length > 0 && (
          <div className="mt-3 text-sm">
            <div className="text-green-700 font-medium">
              Last confirmed: {confirmations[0].confirmed_status} on {confirmations[0].as_of_date}
            </div>
            {confirmations[0].amount_due_total && (
              <div className="text-gray-600">Amount due: ${confirmations[0].amount_due_total.toLocaleString()}</div>
            )}
          </div>
        )}
      </div>

      {/* Tax Signals */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-3">Tax Signals ({signals?.length || 0})</h2>
        {(!signals || signals.length === 0) ? (
          <p className="text-gray-400 text-sm">No signals recorded.</p>
        ) : (
          <div className="space-y-2">
            {signals.map((s) => (
              <div key={s.id} className="text-sm border-b pb-2 last:border-0">
                <span className="font-medium">{s.signal_type}</span>
                {s.stage && <span className="text-gray-500"> · {s.stage}</span>}
                {s.amount_due && <span className="text-gray-500"> · ${s.amount_due.toLocaleString()}</span>}
                <span className="text-gray-400 ml-2">{s.source_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Owner Contacts */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-3">Owner Contacts ({contacts?.length || 0})</h2>
        {(!contacts || contacts.length === 0) ? (
          <p className="text-gray-400 text-sm">No contacts on file.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="text-sm border-b pb-2 last:border-0">
                <div className="font-medium">{c.owner_name || "Unknown"}</div>
                {c.phone && <div className="text-gray-600">Phone: {c.phone}</div>}
                {c.email && <div className="text-gray-600">Email: {c.email}</div>}
                {c.mailing_address_raw && <div className="text-gray-600">Mail: {c.mailing_address_raw}</div>}
                <div className="text-gray-400 text-xs">{c.contact_source} · confidence: {c.confidence}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outreach History */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-3">Outreach ({outreach?.length || 0})</h2>
        {(!outreach || outreach.length === 0) ? (
          <p className="text-gray-400 text-sm">No outreach queued.</p>
        ) : (
          <div className="space-y-2">
            {outreach.map((o) => (
              <div key={o.id} className="text-sm border-b pb-2 last:border-0 flex justify-between">
                <span>
                  <span className="font-medium">{o.channel}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                    o.status === "queued" ? "bg-blue-100 text-blue-700" :
                    o.status === "sent" ? "bg-green-100 text-green-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{o.status}</span>
                </span>
                <span className="text-gray-400">{new Date(o.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
