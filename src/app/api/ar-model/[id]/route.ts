import { NextRequest } from 'next/server';
import { Storage } from '@google-cloud/storage';

export const dynamic = 'force-dynamic';

/** Serves a saved AR model to the phone's AR viewer (public, cacheable; ids are content hashes). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id.replace(/\.glb$/, '');
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response('Not found', { status: 404 });
  try {
    const [buf] = await new Storage().bucket(process.env.GCS_BUCKET_NAME || 'neevv-renders').file(`ar-models/${id}.glb`).download();
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'public, max-age=604800, immutable', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
