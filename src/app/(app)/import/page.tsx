"use client";

import { PageBody, PageHeader } from "@/components/app/AppShell";
import { ImportCard } from "@/components/app/LeadTools";

export default function ImportPage() {
  return (
    <PageBody>
      <PageHeader title="Import" subtitle="Bring in leads from a spreadsheet saved as CSV." />
      <div className="max-w-2xl"><ImportCard /></div>
    </PageBody>
  );
}
