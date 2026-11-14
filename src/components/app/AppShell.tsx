"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Home, KanbanSquare, LogOut, Megaphone, ScanSearch, Settings, Users, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, LogoMark } from "@/components/brand/Brand";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { dangerOutline, headerBtn } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_GROUPS: ReadonlyArray<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/crm", label: "Leads", icon: Users },
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
    ],
  },
  { label: "Outreach", items: [{ href: "/campaigns", label: "Campaigns", icon: Megaphone }] },
  {
    label: "Data",
    items: [
      { href: "/import", label: "Import", icon: Download },
      { href: "/scraper", label: "Scraper", icon: ScanSearch },
    ],
  },
  { label: "Account", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];
export const NAV: ReadonlyArray<NavItem> = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/crm") return pathname === "/crm" || pathname.startsWith("/crm/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Header title for the current route. */
export function pageTitle(pathname: string): string {
  if (/^\/crm\/[^/]+$/.test(pathname)) return "Lead";
  return NAV.find((n) => isActive(pathname, n.href))?.label ?? "Lead Daddy";
}

function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Lead Daddy">
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <LogoMark size={32} />
                <span className="font-bold text-slate-900">Lead Daddy</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-5">
        {NAV_GROUPS.map((g) => (
          <SidebarGroup key={g.label} className="py-0">
            <SidebarGroupLabel className="text-label font-semibold uppercase text-slate-500">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((n) => {
                  const active = isActive(pathname, n.href);
                  return (
                    <SidebarMenuItem key={n.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={n.label}
                        className="h-9 text-body font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow [&>svg]:size-5"
                      >
                        <Link href={n.href} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined}>
                          <n.icon aria-hidden="true" />
                          <span>{n.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {email && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip={email} className="cursor-default hover:bg-transparent">
                <Avatar name={email} size={28} />
                <span className="truncate text-caption text-slate-600">{email}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Signed-in layout on shadcn Sidebar: collapsible white sidebar (icons when collapsed,
 * a sheet on phones), sticky white header with the page title and Sign Out.
 * `defaultOpen` comes from the sidebar_state cookie, read on the server.
 */
export default function AppShell({ children, defaultOpen = true }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a href="#main" className="sr-only z-50 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to Content
      </a>
      <AppSidebar email={email} />
      <SidebarInset className="min-w-0 bg-slate-50">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className={cn("size-8 border border-slate-200 text-slate-600 [&_svg]:size-3.5", headerBtn)} aria-label="Toggle Sidebar" />
            <h1 className="truncate text-page-title font-bold">{pageTitle(pathname)}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className={cn("text-caption text-slate-600 [&_svg]:size-3.5", dangerOutline, "border-slate-200 text-slate-600")}>
            <LogOut aria-hidden />
            Sign Out
          </Button>
        </header>
        <div id="main" tabIndex={-1} className="outline-none">{children}</div>
      </SidebarInset>
      <Toaster position="bottom-right" richColors={false} closeButton />
    </SidebarProvider>
  );
}

/** Intro line and page actions under the header (the title itself lives in the header). */
export function PageHeader({ subtitle, actions }: { title?: string; subtitle?: string; actions?: React.ReactNode }) {
  if (!subtitle && !actions) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {subtitle ? <p className="text-body text-slate-600">{subtitle}</p> : <span />}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function PageBody({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full px-4 py-6 sm:px-6 ${wide ? "max-w-[1400px]" : "max-w-6xl"}`}>{children}</main>;
}
