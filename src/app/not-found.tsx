import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";
import { Button } from "@/components/ui/button";
import { brandCta } from "@/components/ui/styles";

export const metadata = { title: "Page not found" };

// Next.js sends this with a real 404 status code.
export default function NotFound() {
  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mb-8 flex justify-center"><Logo /></div>
          <FileQuestion aria-hidden className="mx-auto size-16 text-slate-300" />
          <p className="mt-4 text-caption font-semibold uppercase tracking-wider text-indigo-600">Error 404</p>
          <h1 className="mt-2 text-h1 font-bold">We Can&apos;t Find That Page</h1>
          <p className="mt-2 text-body text-slate-600">The link may be old, or the page may have moved.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild className={brandCta}><Link href="/">Go to Lead Daddy</Link></Button>
            <Button asChild variant="outline"><Link href="/login">Sign In</Link></Button>
          </div>
          <LegalLinks className="mt-12" />
        </div>
      </main>
    </PublicShell>
  );
}
