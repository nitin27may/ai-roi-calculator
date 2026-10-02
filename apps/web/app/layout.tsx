import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "AI Cost & ROI Studio", description: "Token, cost and ROI calculator for Azure and Snowflake AI workloads (CAD)." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
