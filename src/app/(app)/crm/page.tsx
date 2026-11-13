import type { Metadata } from "next";
import Workspace from "@/components/crm/Workspace";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return <Workspace title="Leads" />;
}
