"use client";

import { PageBody, PageHeader } from "@/components/app/AppShell";
import { ScrapeCard } from "@/components/app/LeadTools";

export default function ScraperPage() {
  return (
    <PageBody>
      <PageHeader subtitle="Read a public web page and pull out the people on it." />
      <div className="max-w-2xl"><ScrapeCard /></div>
    </PageBody>
  );
}
