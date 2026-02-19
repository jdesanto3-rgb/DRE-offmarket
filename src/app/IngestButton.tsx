"use client";

import { useState } from "react";

export default function IngestButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleIngest() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/ingest-trigger", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const summary = data.results
          .map((r: Record<string, unknown>) =>
            r.error
              ? `${r.county}: ERROR`
              : `${r.county}: ${r.fetched} fetched, ${r.created} new, ${r.signals || 0} signals`
          )
          .join(" | ");
        setResult(summary);
      } else {
        setResult("Error: " + JSON.stringify(data));
      }
    } catch (err) {
      setResult("Failed: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6">
      <button
        onClick={handleIngest}
        disabled={loading}
        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50 mr-3"
      >
        {loading ? "Pulling county data..." : "Pull County Records Now"}
      </button>
      {result && (
        <div className="mt-2 text-sm bg-green-50 border border-green-200 rounded p-3">
          {result}
        </div>
      )}
    </div>
  );
}
