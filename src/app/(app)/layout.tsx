import AppShell from "@/components/app/AppShell";

// Every signed-in page shares the sidebar layout. Access is enforced by src/proxy.ts
// (pages) and requireUser() (API).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
