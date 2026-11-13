import Link from "next/link";

/** The LD mark: indigo tile with the initials. Used on every public page. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 font-bold tracking-tight text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      LD
    </span>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-semibold text-slate-900">Lead Daddy</span>
    </span>
  );
}

/** Privacy and Terms links for public pages. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex justify-center gap-4 text-xs text-slate-500 ${className}`}>
      <Link href="/privacy" className="underline-offset-2 hover:text-slate-800 hover:underline">Privacy Policy</Link>
      <Link href="/terms" className="underline-offset-2 hover:text-slate-800 hover:underline">Terms of Service</Link>
    </nav>
  );
}

/** Light slate page shell for the public pages (login, 404, policies). */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">{children}</div>;
}
