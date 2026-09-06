import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { verifyAuth, isAuthError } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';
import { checkAndIncrementUsage } from '@/utils/usageTracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const auth = await verifyAuth(request);
  if (isAuthError(auth)) return auth;

  // 2. Rate limit (keyed on userId)
  const rateLimitKey = getRateLimitKey(auth.userId, request);
  const limiter = rateLimit(rateLimitKey, 5, 60 * 1000); // 5 renders per minute
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before generating more renders.', resetIn: limiter.resetIn },
      { status: 429 }
    );
  }

  // 3. Usage quota check
  const usage = await checkAndIncrementUsage(auth.userId, 'renders');
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily render limit reached (${usage.limit}/day). Try again tomorrow.`, remaining: 0 },
      { status: 429 }
    );
  }

  try {
    const { prompt, renderType, projectId } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json({ error: 'Service configuration error' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    if (!response.candidates?.[0]?.content?.parts) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
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
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    // Upload to GCS with user-scoped path
    let gcsUrl: string | undefined;
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (bucketName && imageDataUri) {
      try {
        const storage = new Storage();
        const bucket = storage.bucket(bucketName);
        // User-scoped path: renders/{userId}/{projectId}/{type}_{timestamp}.png
        const safeProjectId = (projectId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeRenderType = (renderType || 'render').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `renders/${auth.userId}/${safeProjectId}/${safeRenderType}_${Date.now()}.png`;
        const file = bucket.file(fileName);

        const base64Data = imageDataUri.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        await file.save(buffer, {
          metadata: {
            contentType: 'image/png',
            metadata: {
              userId: auth.userId,
              projectId: safeProjectId,
              renderType: safeRenderType,
            },
          },
        });

        // Signed URL — 1 hour expiry
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000,
        });
        gcsUrl = signedUrl;
      } catch (gcsError) {
        console.error('GCS upload failed (non-fatal):', gcsError);
        // Continue without GCS — return base64 instead
      }
    }

    return NextResponse.json({
      imageDataUri: gcsUrl || imageDataUri,
      textResponse,
      renderType,
      remaining: usage.remaining,
    });
  } catch (error: any) {
    console.error('Render generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate render', details: error.message },
      { status: 500 }
    );
  }
}
