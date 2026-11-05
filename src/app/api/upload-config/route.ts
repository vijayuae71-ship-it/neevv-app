import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Where the browser should send long-running uploads (drawing analysis). Firebase Hosting ends proxied
 * requests after 60 s; the Cloud Run service's own address allows the full request timeout.
 */
export async function GET() {
  const url = process.env.RUN_URL;
  return NextResponse.json({ directUrl: url && /^https:\/\/[\w.-]+\.run\.app$/.test(url) ? url : null }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
