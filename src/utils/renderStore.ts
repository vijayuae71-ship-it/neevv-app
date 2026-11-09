import { Storage } from '@google-cloud/storage';
import { createHash } from 'crypto';

/**
 * Permanent store for AI renders (server only). Every image is kept in the bucket under its content
 * hash and served by /api/render-image/<id>.<ext>, and each request (model + prompt + reference
 * images + shape) is mapped to the image it produced, so the same request is never paid for twice.
 */
const BUCKET = () => process.env.GCS_BUCKET_NAME || 'neevv-renders';
const bucket = () => new Storage().bucket(BUCKET());

export type StoredImage = { id: string; ext: 'png' | 'jpg' | 'webp' };
const EXT: Record<string, StoredImage['ext']> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const MIME: Record<StoredImage['ext'], string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Public address of a stored render on this site. */
export const renderUrl = (img: StoredImage) => `/api/render-image/${img.id}.${img.ext}`;

/** Parses "<id>.<ext>" (or a URL ending in /api/render-image/<id>.<ext>). */
export function parseRenderRef(ref: string): StoredImage | null {
  const m = /(?:^|\/api\/render-image\/)([a-f0-9]{32})\.(png|jpg|webp)$/.exec(ref);
  return m ? { id: m[1], ext: m[2] as StoredImage['ext'] } : null;
}

/** Cache key for one render request. */
export function requestKey(parts: { model: string; prompt: string; images: string[]; ratio?: string }): string {
  const h = createHash('sha256');
  h.update(`${parts.model}\n${parts.ratio ?? ''}\n${parts.prompt}`);
  for (const img of parts.images) h.update('\n' + createHash('sha256').update(img).digest('hex'));
  return h.digest('hex').slice(0, 40);
}

/** The image an identical earlier request produced, if any. */
export async function cachedRender(key: string): Promise<StoredImage | null> {
  try {
    const [buf] = await bucket().file(`render-cache/${key}.json`).download();
    const v = JSON.parse(buf.toString('utf8'));
    return typeof v?.id === 'string' && /^[a-f0-9]{32}$/.test(v.id) && v.ext in MIME ? { id: v.id, ext: v.ext } : null;
  } catch { return null; }
}

/** Keeps an image (once per content) and remembers it as the answer to `key`. */
export async function storeRender(data: Buffer, mime: string, key: string | null, meta: Record<string, string>): Promise<StoredImage> {
  const ext = EXT[mime] ?? 'png';
  const id = createHash('sha256').update(data).digest('hex').slice(0, 32);
  const file = bucket().file(`renders/${id}.${ext}`);
  const [exists] = await file.exists();
  if (!exists) await file.save(data, { resumable: false, metadata: { contentType: MIME[ext], cacheControl: 'public, max-age=31536000, immutable', metadata: meta } });
  if (key) await bucket().file(`render-cache/${key}.json`).save(JSON.stringify({ id, ext, at: new Date().toISOString() }), { resumable: false, metadata: { contentType: 'application/json' } });
  return { id, ext };
}

/** Bytes of a stored render. */
export async function readRender(img: StoredImage): Promise<Buffer> {
  const [buf] = await bucket().file(`renders/${img.id}.${img.ext}`).download();
  return buf;
}
