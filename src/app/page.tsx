import { createServiceClient } from "@/lib/supabase/server";
import IngestButton from "./IngestButton";

const BAND_COLORS: Record<string, string> = {
  HOT: "bg-red-100 text-red-800 border-red-200",
  WARM: "bg-orange-100 text-orange-800 border-orange-200",
  WATCH: "bg-yellow-100 text-yellow-800 border-yellow-200",
  LOW: "bg-gray-100 text-gray-600 border-gray-200",
};

function getBand(score: number) {
  if (score >= 85) return "HOT";
  if (score >= 70) return "WARM";
  if (score >= 50) return "WATCH";
  return "LOW";
}

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createServiceClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("id, address_raw, city, county, deal_score, lead_status, first_hot_at, score_breakdown, created_at")
    .order("deal_score", { ascending: false })
    .limit(100);

  const { data: alerts } = await supabase
    .from("deal_alerts")
    .select("id, property_id, alert_type, created_at")
    .eq("delivered", false)
    .order("created_at", { ascending: false })
    .limit(10);

  const { count: totalProperties } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true });

  const { count: hotCount } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .gte("deal_score", 85);

  const { count: queuedCount } = await supabase
    .from("outreach_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">DRE Off Market Dashboard</h1>

      <IngestButton />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold">{totalProperties ?? 0}</div>
          <div className="text-sm text-gray-500">Total Properties</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{hotCount ?? 0}</div>
          <div className="text-sm text-gray-500">HOT Deals</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">{queuedCount ?? 0}</div>
          <div className="text-sm text-gray-500">Outreach Queued</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-amber-600">{alerts?.length ?? 0}</div>
          <div className="text-sm text-gray-500">New Alerts</div>
        </div>
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-red-800 mb-2">New Deal Alerts</h2>
          {alerts.map((a) => (
            <div key={a.id} className="text-sm text-red-700 py-1">
              {a.alert_type === "newly_hot" ? "🔥" : "📋"} Property {a.property_id.slice(0, 8)}... became {a.alert_type}
              <span className="text-red-400 ml-2">{new Date(a.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Properties Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Address</th>
              <th className="text-left px-4 py-3 font-medium">City</th>
              <th className="text-left px-4 py-3 font-medium">County</th>
              <th className="text-center px-4 py-3 font-medium">Score</th>
              <th className="text-center px-4 py-3 font-medium">Band</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!properties || properties.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  No properties yet. Import data from PropStream, pre-foreclosure lists, or Washtenaw PDFs.
                </td>
              </tr>
            )}
            {properties?.map((p) => {
              const band = getBand(p.deal_score);
              return (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.address_raw}</td>
                  <td className="px-4 py-3 text-gray-600">{p.city || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{p.county}</td>
                  <td className="px-4 py-3 text-center font-bold">{p.deal_score}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${BAND_COLORS[band]}`}>
                      {band}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{p.lead_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/properties/${p.id}`} className="text-blue-600 hover:underline text-xs">View</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
