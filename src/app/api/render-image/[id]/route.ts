import { NextRequest } from 'next/server';
import { MIME, parseRenderRef, readRender } from '@/utils/renderStore';

export const dynamic = 'force-dynamic';

/** Serves a saved AI render (ids are content hashes, so responses never change and cache for a year). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const img = parseRenderRef(params.id);
  if (!img) return new Response('Not found', { status: 404 });
  try {
    const buf = await readRender(img);
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': MIME[img.ext], 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
