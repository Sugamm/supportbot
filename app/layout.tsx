import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupportBot Evals",
  description: "A fake customer-support AI, and the evals that keep it honest.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Loaded via <link> rather than next/font so a machine with no network
            still renders (it falls back to the system stack in globals.css). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
