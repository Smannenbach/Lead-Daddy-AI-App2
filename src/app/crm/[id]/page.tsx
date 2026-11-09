import type { Metadata } from "next";
import RecordView from "@/components/crm/RecordView";

export const metadata: Metadata = { title: "Lead · LeadDaddy.ai" };

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordView id={id} />;
}
