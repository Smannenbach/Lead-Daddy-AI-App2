import type { Metadata } from "next";
import Workspace from "@/components/crm/Workspace";

export const metadata: Metadata = { title: "CRM · LeadDaddy.ai" };

export default function CrmPage() {
  return <Workspace />;
}
