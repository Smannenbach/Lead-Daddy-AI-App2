import Link from "next/link";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";
import { StatusMessage } from "@/components/ui/Status";

/**
 * Layout for policy pages. The text is NOT written by engineering: every section is a
 * clearly marked placeholder for Steve / counsel to replace with the final wording.
 */
export function LegalPage({ title, sections }: { title: string; sections: Array<{ heading: string; placeholder: string }> }) {
  return (
    <PublicShell>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="Lead Daddy home"><Logo /></Link>
          <Link href="/login" className="text-body font-medium text-indigo-600 hover:text-indigo-700">Sign In</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-body text-slate-500">Last updated: [DATE: Steve to add]</p>
        <StatusMessage tone="warn" className="mt-6">Draft page. The final text is being written and reviewed. Nothing here is the final policy yet.</StatusMessage>
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-bold">{s.heading}</h2>
              <p className="mt-2 rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-body text-slate-500">[{s.placeholder}]</p>
            </section>
          ))}
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white py-6"><LegalLinks /></footer>
    </PublicShell>
  );
}
