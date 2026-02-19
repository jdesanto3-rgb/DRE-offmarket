import { createServiceClient } from "@/lib/supabase/server";
import IngestButton from "./IngestButton";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createServiceClient();

  // Only HOT deals (score >= 85)
  const { data: hotDeals } = await supabase
    .from("properties")
    .select("id, address_raw, city, county, deal_score, lead_status, first_hot_at, score_breakdown")
    .gte("deal_score", 85)
    .order("deal_score", { ascending: false })
    .limit(50);

  // WARM deals (70-84) — secondary list
  const { data: warmDeals } = await supabase
    .from("properties")
    .select("id, address_raw, city, county, deal_score, lead_status")
    .gte("deal_score", 70)
    .lt("deal_score", 85)
    .order("deal_score", { ascending: false })
    .limit(20);

  const { data: alerts } = await supabase
    .from("deal_alerts")
    .select("id, property_id, alert_type, created_at")
    .eq("delivered", false)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch property details for alerts
  const alertPropertyIds = alerts?.map((a) => a.property_id) || [];
  const { data: alertProperties } = alertPropertyIds.length > 0
    ? await supabase
        .from("properties")
        .select("id, address_raw, city, county, deal_score")
        .in("id", alertPropertyIds)
    : { data: [] };

  const alertPropMap = new Map(
    (alertProperties || []).map((p) => [p.id, p])
  );

  const { count: totalProperties } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true });

  const { count: queuedCount } = await supabase
    .from("outreach_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">DRE Off Market</h1>

      <IngestButton />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold">{totalProperties ?? 0}</div>
          <div className="text-sm text-gray-500">Properties Tracked</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{hotDeals?.length ?? 0}</div>
          <div className="text-sm text-gray-500">HOT Deals</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-orange-600">{warmDeals?.length ?? 0}</div>
          <div className="text-sm text-gray-500">WARM Deals</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">{queuedCount ?? 0}</div>
          <div className="text-sm text-gray-500">Outreach Queued</div>
        </div>
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-red-800 mb-2">New Alerts</h2>
          {alerts.map((a) => {
            const prop = alertPropMap.get(a.property_id);
            return (
              <a key={a.id} href={`/properties/${a.property_id}`} className="flex justify-between items-center text-sm text-red-700 py-2 border-b border-red-100 last:border-0 hover:text-red-900">
                <span>
                  {a.alert_type === "newly_hot" ? "🔥" : "📋"}{" "}
                  {prop?.address_raw || a.property_id.slice(0, 8)}
                  {prop?.city && <span className="text-red-400"> · {prop.city}</span>}
                  {prop?.deal_score && <span className="font-bold ml-2">Score: {prop.deal_score}</span>}
                </span>
                <span className="text-red-400 text-xs">{new Date(a.created_at).toLocaleDateString()}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* HOT Deals */}
      <div className="bg-white rounded-lg border overflow-hidden mb-6">
        <div className="bg-red-50 px-4 py-3 border-b border-red-100">
          <h2 className="font-semibold text-red-800">🔥 HOT Deals (Score 85+)</h2>
        </div>
        {(!hotDeals || hotDeals.length === 0) ? (
          <div className="px-4 py-12 text-center text-gray-400">
            No HOT deals yet. Pull county records and run the deal hunter to score properties.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Address</th>
                <th className="text-left px-4 py-3 font-medium">City</th>
                <th className="text-left px-4 py-3 font-medium">County</th>
                <th className="text-center px-4 py-3 font-medium">Score</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Why</th>
                <th className="text-left px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {hotDeals.map((p) => {
                const breakdown = p.score_breakdown as { reasons?: string[] } | null;
                return (
                  <tr key={p.id} className="border-b hover:bg-red-50">
                    <td className="px-4 py-3 font-medium">{p.address_raw}</td>
                    <td className="px-4 py-3 text-gray-600">{p.city || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{p.county}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                        {p.deal_score}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{p.lead_status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                      {breakdown?.reasons?.slice(0, 2).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/properties/${p.id}`} className="text-blue-600 hover:underline text-xs font-medium">View →</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* WARM Deals */}
      {warmDeals && warmDeals.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="bg-orange-50 px-4 py-3 border-b border-orange-100">
            <h2 className="font-semibold text-orange-800">🟠 WARM Deals (Score 70–84)</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Address</th>
                <th className="text-left px-4 py-3 font-medium">City</th>
                <th className="text-left px-4 py-3 font-medium">County</th>
                <th className="text-center px-4 py-3 font-medium">Score</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {warmDeals.map((p) => (
                <tr key={p.id} className="border-b hover:bg-orange-50">
                  <td className="px-4 py-3 font-medium">{p.address_raw}</td>
                  <td className="px-4 py-3 text-gray-600">{p.city || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{p.county}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
                      {p.deal_score}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{p.lead_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/properties/${p.id}`} className="text-blue-600 hover:underline text-xs font-medium">View →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
