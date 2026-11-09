import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { cleanAsset, tagAssets, validProjectId } from '@/utils/projectAssets';
import { cachedRender, parseRenderRef, readRender, renderUrl, requestKey, storeRender } from '@/utils/renderStore';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';
import { checkAndIncrementUsage } from '@/utils/usageTracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MODEL = 'gemini-3-pro-image';
const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMG_BYTES = 6 * 1024 * 1024;

/**
 * Up to 3 images as data: URIs, or addresses of earlier renders in this app's own bucket (signed GCS
 * URLs), fetched here so the browser does not need cross-origin access to the bucket.
 */
async function referenceImages(images: unknown): Promise<{ inlineData: { mimeType: string; data: string } }[]> {
  if (images == null) return [];
  if (!Array.isArray(images) || images.length > 3) throw new Error('Up to 3 images can be sent.');
  const bucket = process.env.GCS_BUCKET_NAME;
  const out: { inlineData: { mimeType: string; data: string } }[] = [];
  for (const img of images) {
    if (typeof img !== 'string') throw new Error('Image not accepted.');
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(img);
    if (m) {
      if (m[2].length * 0.75 > MAX_IMG_BYTES) throw new Error('Image too large (max 6 MB).');
      out.push({ inlineData: { mimeType: m[1], data: m[2] } });
      continue;
    }
    const stored = parseRenderRef(img);
    if (stored) {
      const buf = await readRender(stored).catch(() => null);
      if (!buf || buf.length > MAX_IMG_BYTES) throw new Error('The earlier render could not be loaded. Please generate it again.');
      out.push({ inlineData: { mimeType: stored.ext === 'jpg' ? 'image/jpeg' : `image/${stored.ext}`, data: buf.toString('base64') } });
      continue;
    }
    if (bucket && img.startsWith(`https://storage.googleapis.com/${bucket}/renders/`)) {
      const res = await fetch(img);
      const type = (res.headers.get('content-type') || '').split(';')[0];
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok || !IMG_TYPES.includes(type) || buf.length > MAX_IMG_BYTES) throw new Error('The earlier render could not be loaded. Please generate it again.');
      out.push({ inlineData: { mimeType: type, data: buf.toString('base64') } });
      continue;
    }
    throw new Error('Image not accepted.');
  }
  return out;
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuthOptional(request);

  const rateLimitKey = getRateLimitKey(auth.userId, request);
  const limiter = rateLimit(rateLimitKey, 5, 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please wait before generating more renders.', resetIn: limiter.resetIn },
      { status: 429 }
    );
  }

  try {
    const { prompt, renderType, projectId, images, aspectRatio, fresh, asset } = await request.json();
    /** file the result under the customer's project (owner checked); never blocks the render */
    const tag = async (url: string) => {
      if (!validProjectId(projectId)) return;
      const a = cleanAsset({ ...(asset ?? {}), url });
      if (a && (a.kind === 'render' || a.kind === 'interior_render')) await tagAssets(auth.userId, projectId, [a]).catch((e) => console.error('Tag render failed:', e));
    };
    // edits keep the shape of the image being edited (otherwise the model returns a square)
    const ratio = typeof aspectRatio === 'string' && ASPECTS.includes(aspectRatio) ? aspectRatio : undefined;

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json({ success: false, error: 'Service configuration error' }, { status: 500 });
    }

    // optional reference images (edit an earlier render with a customer's material photo), in order
    let imageParts: { inlineData: { mimeType: string; data: string } }[];
    try { imageParts = await referenceImages(images); }
    catch (e: any) { return NextResponse.json({ success: false, error: e?.message || 'Image not accepted' }, { status: 400 }); }

    // the same request (prompt, reference images, shape) is answered from the store: no AI call, no credit
    const key = requestKey({ model: MODEL, prompt: String(prompt), images: imageParts.map(p => p.inlineData.data), ratio });
    if (!fresh) {
      const hit = await cachedRender(key);
      if (hit) { await tag(renderUrl(hit)); return NextResponse.json({ success: true, imageUrl: renderUrl(hit), imageDataUri: renderUrl(hit), cached: true, renderType }); }
    }

    const usage = await checkAndIncrementUsage(auth.userId, 'renders');
    if (!usage.allowed) {
      return NextResponse.json(
        { success: false, error: `Daily render limit reached (${usage.limit}/day). Try again tomorrow.`, remaining: 0 },
        { status: 429 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [...imageParts, { text: prompt }] }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(ratio ? { imageConfig: { aspectRatio: ratio } } : {}),
      },
    });

    if (!response.candidates?.[0]?.content?.parts) {
      return NextResponse.json({ success: false, error: 'No response from AI' }, { status: 500 });
    }

    const parts = response.candidates[0].content.parts;
    let imageDataUri = '';
    let textResponse = '';

    for (const part of parts) {
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        imageDataUri = `data:${mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text) {
        textResponse += part.text;
      }
    }

    if (!imageDataUri) {
      return NextResponse.json({ success: false, error: 'No image generated' }, { status: 500 });
    }

    // keep it: the same request later (or after a reload) is served from the store
    let imageUrl: string | undefined;
    try {
      const [, mime, b64] = /^data:([^;]+);base64,(.*)$/.exec(imageDataUri) ?? [];
      const safe = (v: unknown, d: string) => String(v || d).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
      const img = await storeRender(Buffer.from(b64, 'base64'), mime, key, { userId: String(auth.userId), projectId: safe(projectId, 'anonymous'), renderType: safe(renderType, 'render') });
      imageUrl = renderUrl(img);
      await tag(imageUrl);
    } catch (storeError) {
      console.error('Render store failed (non-fatal):', storeError);
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      imageDataUri: imageUrl || imageDataUri,
      textResponse,
      renderType,
      remaining: usage.remaining,
    });
  } catch (error: any) {
    console.error('Render generation error:', error);
    // never pass the provider's message (billing, keys) to the customer
    const busy = /RESOURCE_EXHAUSTED|429|quota|credits/i.test(String(error?.message));
    return NextResponse.json(
      { success: false, error: busy ? 'AI renders are busy right now. Please try again in a few minutes.' : 'Failed to generate render' },
      { status: busy ? 503 : 500 }
    );
  }
}
