import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND_LOGO_BASE64 } from "@/utils/brand";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fcfdfb] text-stone-800">
      <header className="border-b border-[#4f6f52]/15 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="neevv home" className="flex items-center gap-2">
            <img src={BRAND_LOGO_BASE64} alt="neevv" className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link href="/blog" className="text-[#4f6f52] hover:opacity-75">Blog</Link>
            <Link href="/" className="rounded-full bg-[#e8853d] px-4 py-2 text-white transition hover:brightness-95">Start Designing</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-16 border-t border-[#4f6f52]/15 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10 text-center text-sm text-stone-500">
          <p className="font-medium tracking-wide text-[#4f6f52]">Architecture • Structure • MEP • Interiors</p>
          <p className="mx-auto mt-4 max-w-2xl">Information on this blog is for general guidance. Always verify local regulations, site conditions, and costs with qualified professionals.</p>
          <p className="mt-5">© {new Date().getFullYear()} neevv. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
