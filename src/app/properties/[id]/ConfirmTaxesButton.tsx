"use client";

import { useState } from "react";

export default function ConfirmTaxesButton({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch("/api/properties/confirm-taxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          confirmed_status: "confirmed_delinquent",
        }),
      });
      if (res.ok) {
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <div className="text-green-600 text-sm font-medium">Taxes confirmed (stubbed)</div>;
  }

  return (
    <button
      onClick={handleConfirm}
      disabled={loading}
      className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
    >
      {loading ? "Confirming..." : "Confirm Taxes (Stub)"}
    </button>
  );
}
