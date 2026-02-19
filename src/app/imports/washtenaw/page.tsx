"use client";

import { useState } from "react";

export default function WashtenawPdfImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/imports/washtenaw-pdf", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <a href="/" className="text-blue-600 hover:underline text-sm">&larr; Dashboard</a>
      <h1 className="text-2xl font-bold mt-4 mb-6">Import Washtenaw Tax/Foreclosure PDF</h1>

      <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">PDF File</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Upload Washtenaw County tax delinquency or foreclosure notice PDFs.
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Processing PDF..." : "Upload & Parse"}
        </button>
      </form>

      {result && (
        <div className="mt-4 bg-gray-50 border rounded-lg p-4 text-sm">
          <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
