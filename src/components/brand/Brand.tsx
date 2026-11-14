import Link from "next/link";

/** The LD mark: indigo to violet gradient tile, white bold initials. The ONLY place the gradient is used (plus avatars). */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 font-bold tracking-tight text-white"
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
      <span className="text-lg font-bold text-slate-900">Lead Daddy</span>
    </span>
  );
}

/** Privacy and Terms links for public pages. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex justify-center gap-4 text-caption text-slate-600 ${className}`}>
      <Link href="/privacy" className="underline-offset-2 hover:text-slate-800 hover:underline">Privacy Policy</Link>
      <Link href="/terms" className="underline-offset-2 hover:text-slate-800 hover:underline">Terms of Service</Link>
    </nav>
  );
}

/** Light slate page shell for the public pages (login, 404, policies). */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">{children}</div>;
}

/** Avatar initials, same gradient as the mark. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
