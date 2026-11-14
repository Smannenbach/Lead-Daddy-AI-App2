import type { Metadata } from "next";
import Workspace from "@/components/crm/Workspace";

export const metadata: Metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return <Workspace title="Pipeline" initialViewId="pipeline" />;
}
