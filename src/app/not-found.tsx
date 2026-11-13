import Link from "next/link";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";

export const metadata = { title: "Page not found" };

// Next.js sends this with a real 404 status code.
export default function NotFound() {
  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mb-8 flex justify-center"><Logo /></div>
          <p className="text-sm font-semibold text-indigo-600">404</p>
          <h1 className="mt-2 text-2xl font-semibold">We can&apos;t find that page</h1>
          <p className="mt-2 text-sm text-slate-500">The link may be old, or the page may have moved.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Go to Lead Daddy</Link>
            <Link href="/login" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400">Sign in</Link>
          </div>
          <LegalLinks className="mt-12" />
        </div>
      </main>
    </PublicShell>
  );
}
