import { cookies } from "next/headers";
import AppShell from "@/components/app/AppShell";

// Every signed-in page shares the sidebar layout. Access is enforced by src/proxy.ts
// (pages) and requireUser() (API). The sidebar's open/collapsed state is a cookie set by
// shadcn's SidebarProvider; reading it here avoids a flash on load.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = (await cookies()).get("sidebar_state")?.value;
  return <AppShell defaultOpen={state !== "false"}>{children}</AppShell>;
}
