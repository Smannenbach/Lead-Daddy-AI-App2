import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadDaddy.ai",
  description: "AI-first outbound platform: scrape, verify, and engage leads by call, SMS, and email",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
