import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog — neevv",
  description: "Expert guides on house plans, construction costs, Vastu, and building codes in India.",
};

const posts = [
  { href: "/blog/30x40-house-plan-india", category: "House Plans", title: "Complete Guide to 30×40 House Plans in India", description: "Everything you need to know about designing a 30×40 house plan — from NBC setbacks to Vastu tips and real cost estimates.", time: "8 min read" },
  { href: "/blog/vastu-house-plan-guide", category: "Vastu", title: "Vastu House Plan Guide: Principles Every Homeowner Should Know", description: "Learn the key Vastu Shastra principles for room placement, main door direction, kitchen position, and how to balance tradition with modern design.", time: "7 min read" },
  { href: "/blog/house-construction-cost-2026", category: "Cost Guide", title: "House Construction Cost in India (2026): Complete Breakdown", description: "Detailed cost breakdown for building a house in India — from foundation to finishing, material rates, labour costs, and money-saving tips.", time: "9 min read" },
  { href: "/blog/nbc-building-codes-homeowners", category: "Regulations", title: "NBC Building Codes Every Indian Homeowner Should Know", description: "Understand the National Building Code rules that affect your house — setbacks, FSI, coverage, fire safety, and how to stay compliant.", time: "6 min read" },
];

export default function BlogPage() {
  return <section className="mx-auto max-w-6xl px-6 py-16"><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#e8853d]">neevv journal</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-[#4f6f52] md:text-5xl">Build your home with clarity.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">Practical guides for Indian homeowners, from the first sketch to the final handover.</p><div className="mt-12 grid gap-6 md:grid-cols-2">{posts.map((post) => <article key={post.href} className="flex flex-col rounded-2xl border border-[#4f6f52]/15 bg-white p-7 shadow-sm"><span className="w-fit rounded-full bg-[#4f6f52]/10 px-3 py-1 text-xs font-bold text-[#4f6f52]">{post.category}</span><h2 className="mt-5 text-2xl font-bold leading-tight text-[#4f6f52]"><Link href={post.href} className="hover:text-[#e8853d]">{post.title}</Link></h2><p className="mt-4 flex-1 leading-7 text-stone-600">{post.description}</p><div className="mt-6 flex items-center justify-between"><Link href={post.href} className="font-semibold text-[#e8853d]">Read more →</Link><span className="text-sm text-stone-500">{post.time}</span></div></article>)}</div></section>;
}
