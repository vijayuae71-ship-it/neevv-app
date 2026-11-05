import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'crypto';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';

export const dynamic = 'force-dynamic';

/** Bucket for generated AR models (same bucket as renders). */
const AR_BUCKET = () => process.env.GCS_BUCKET_NAME || 'neevv-renders';
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Saves the customer's house model (GLB built in the browser) so phone AR viewers can load it from a
 * public address: Android Scene Viewer and iOS Quick Look fetch the model themselves and cannot read a
 * browser-only (blob) URL. Content-addressed, so the same design is stored once.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuthOptional(request);
  const limiter = rateLimit(getRateLimitKey(auth.userId, request) + ':ar', 10, 60 * 1000);
  if (!limiter.allowed) return NextResponse.json({ error: 'Too many requests, try again in a minute.' }, { status: 429 });

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length < 20 || buf.length > MAX_BYTES) return NextResponse.json({ error: 'Model size not accepted.' }, { status: 400 });
  if (buf.toString('ascii', 0, 4) !== 'glTF') return NextResponse.json({ error: 'Not a GLB model.' }, { status: 400 });

  const id = createHash('sha256').update(buf).digest('hex').slice(0, 32);
  try {
    const file = new Storage().bucket(AR_BUCKET()).file(`ar-models/${id}.glb`);
    const [exists] = await file.exists();
    if (!exists) await file.save(buf, { resumable: false, metadata: { contentType: 'model/gltf-binary', cacheControl: 'public, max-age=604800, immutable' } });
    return NextResponse.json({ url: `/api/ar-model/${id}` });
  } catch (e) {
    console.error('AR model upload failed:', e);
    return NextResponse.json({ error: 'Could not save the AR model.' }, { status: 502 });
  }
}
