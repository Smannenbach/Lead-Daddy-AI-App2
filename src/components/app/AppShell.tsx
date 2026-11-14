"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Download,
  Home,
  KanbanSquare,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, LogoMark } from "@/components/brand/Brand";

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

// Collapsed sidebar preference: a per-browser convenience, never required.
const COLLAPSE_KEY = "ld.sidebar.collapsed";
const listeners = new Set<() => void>();
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    /* storage blocked: keep the in-memory choice only */
  }
  listeners.forEach((l) => l());
}

function NavList({ pathname, collapsed, onNavigate }: { pathname: string; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          {!collapsed && <p className="mb-1 px-3 text-label font-semibold uppercase text-slate-500">{g.label}</p>}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const active = isActive(pathname, n.href);
              const Icon = n.icon;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? n.label : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium ${collapsed ? "justify-center" : ""} ${
                      active ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    {collapsed ? <span className="sr-only">{n.label}</span> : n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Signed-in layout: collapsible white sidebar, sticky white header, scrolling slate-50 main. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const collapsed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readCollapsed,
    () => false,
  );

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const title = pageTitle(pathname);
  const width = collapsed ? "lg:w-[72px]" : "lg:w-60";
  const offset = collapsed ? "lg:pl-[72px]" : "lg:pl-60";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#main" className="sr-only z-50 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to Content
      </a>

      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 hidden flex-col border-r border-slate-200 bg-white px-3 py-4 lg:flex ${width}`}>
        <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "justify-between gap-2 px-2"}`}>
          <Link href="/" className="flex items-center gap-2.5" aria-label="Lead Daddy home">
            <LogoMark size={32} />
            {!collapsed && <span className="font-bold">Lead Daddy</span>}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList pathname={pathname} collapsed={collapsed} />
        </div>
        <div className="border-t border-slate-200 pt-3">
          {!collapsed && email && (
            <div className="mb-2 flex items-center gap-2 px-2">
              <Avatar name={email} size={28} />
              <p className="truncate text-caption text-slate-600" title={email}>{email}</p>
            </div>
          )}
          <button
            onClick={() => writeCollapsed(!collapsed)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${collapsed ? "justify-center" : ""}`}
            aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            title={collapsed ? "Expand Sidebar" : undefined}
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-5" /> : <PanelLeftClose aria-hidden className="size-5" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Phone overlay sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-3 py-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <span className="flex items-center gap-2.5"><LogoMark size={28} /><span className="font-bold">Lead Daddy</span></span>
              <button onClick={() => setOpen(false)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900" aria-label="Close Menu">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto"><NavList pathname={pathname} collapsed={false} onNavigate={() => setOpen(false)} /></div>
            {email && (
              <div className="flex items-center gap-2 border-t border-slate-200 px-2 pt-3">
                <Avatar name={email} size={28} />
                <p className="truncate text-caption text-slate-600">{email}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={offset}>
        {/* Sticky header: page title + account action */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              ref={menuButton}
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label="Open Menu"
              className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 lg:hidden"
            >
              <Menu aria-hidden className="size-4" />
            </button>
            <Link href="/" className="lg:hidden" aria-label="Lead Daddy home"><LogoMark size={28} /></Link>
            <h1 className="truncate text-page-title font-bold">{title}</h1>
          </div>
          <button
            onClick={signOut}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-caption font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 [&_svg]:size-3.5"
          >
            <LogOut aria-hidden />
            Sign Out
          </button>
        </header>
        <div id="main" tabIndex={-1} className="outline-none">{children}</div>
      </div>
    </div>
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
