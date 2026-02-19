"use client";

import { useState } from "react";

export default function IngestButton() {
  const [status, setStatus] = useState<"idle" | "started" | "error">("idle");

  async function handleIngest() {
    setStatus("started");
    try {
      // Fire and forget — don't await the full response
      fetch("/api/ingest-trigger", { method: "POST" });
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mb-6 flex items-center gap-3">
      <button
        onClick={handleIngest}
        disabled={status === "started"}
        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50"
      >
        {status === "started" ? "Running in background..." : "Pull County Records"}
      </button>
      {status === "started" && (
        <span className="text-sm text-gray-500">
          Ingestion running — refresh the page in a few minutes to see new deals.
        </span>
      )}
      {status === "error" && (
        <span className="text-sm text-red-500">Failed to start ingestion.</span>
      )}
    </div>
  );
}
