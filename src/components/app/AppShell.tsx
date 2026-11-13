"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/brand/Brand";

export const NAV: ReadonlyArray<{ href: string; label: string; icon: string }> = [
  { href: "/", label: "Home", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/crm", label: "Leads", icon: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" },
  { href: "/pipeline", label: "Pipeline", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z" },
  { href: "/campaigns", label: "Campaigns", icon: "M3 11l15-6v14L3 13zM7 13v5" },
  { href: "/import", label: "Import", icon: "M12 3v12M7 10l5 5 5-5M4 19h16" },
  { href: "/scraper", label: "Scraper", icon: "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5" },
  { href: "/settings", label: "Settings", icon: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/crm") return pathname === "/crm" || pathname.startsWith("/crm/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Signed-in layout: sidebar on desktop, top bar + slide-out menu on phones. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);

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

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <Icon d={n.icon} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-slate-200 pt-3 text-sm">
      {email && <p className="truncate px-3 text-xs text-slate-500" title={email}>{email}</p>}
      <button onClick={signOut} className="mt-1 w-full rounded-lg px-3 py-2 text-left font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark size={32} />
          <span className="font-semibold">Lead Daddy</span>
        </Link>
        <div className="flex-1">{nav}</div>
        {footer}
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="font-semibold">Lead Daddy</span>
        </Link>
        <button
          ref={menuButton}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          Menu
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-3 py-4 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="flex items-center gap-2"><LogoMark size={28} /><span className="font-semibold">Lead Daddy</span></span>
              <button onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:text-slate-900">Close</button>
            </div>
            <div className="flex-1">{nav}</div>
            {footer}
          </div>
        </div>
      )}

      <div className="lg:pl-60">{children}</div>
    </div>
  );
}

/** Page header used inside the shell. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function PageBody({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 ${wide ? "max-w-[1400px]" : "max-w-6xl"}`}>{children}</main>;
}
