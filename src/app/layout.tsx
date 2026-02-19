import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DRE Off Market",
  description: "Off-market real estate lead tracker for Michigan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <nav className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
          <a href="/" className="font-bold text-lg">DRE Off Market</a>
          <div className="flex gap-4 text-sm">
            <a href="/imports/propstream" className="hover:text-gray-300">PropStream</a>
            <a href="/imports/preforeclosures" className="hover:text-gray-300">Pre-Foreclosures</a>
            <a href="/imports/washtenaw" className="hover:text-gray-300">Washtenaw PDF</a>
            <a href="/exports" className="hover:text-gray-300">Exports</a>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
