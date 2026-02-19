"use client";

export default function ExportsPage() {
  function downloadCsv(endpoint: string) {
    window.location.href = `/api/exports/${endpoint}`;
  }

  return (
    <div className="max-w-xl">
      <a href="/" className="text-blue-600 hover:underline text-sm">&larr; Dashboard</a>
      <h1 className="text-2xl font-bold mt-4 mb-6">Export Contact Lists</h1>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <p className="text-sm text-gray-600 mb-4">
          Export queued outreach as CSV files with rendered message templates.
          Templates use a neighborly, no-pressure tone.
        </p>

        <button
          onClick={() => downloadCsv("direct-mail")}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded text-sm font-medium"
        >
          Export Direct Mail CSV
        </button>

        <button
          onClick={() => downloadCsv("sms")}
          className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded text-sm font-medium"
        >
          Export SMS CSV
        </button>

        <p className="text-xs text-gray-400">
          Note: SMS export includes rendered message text but does not send messages.
          Twilio integration is not included in MVP.
        </p>
      </div>
    </div>
  );
}
