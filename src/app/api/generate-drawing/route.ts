import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
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
  const limiter = rateLimit(rateLimitKey, 10, 60 * 1000); // 10 drawings per minute
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before generating more drawings.', resetIn: limiter.resetIn },
      { status: 429 }
    );
  }

  // 3. Usage quota check
  const usage = await checkAndIncrementUsage(auth.userId, 'drawings');
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily drawing limit reached (${usage.limit}/day). Try again tomorrow.`, remaining: 0 },
      { status: 429 }
    );
  }

  try {
    const { prompt, drawingType } = await request.json();

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
      model: 'gemini-3.1-flash-image',
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

    return NextResponse.json({
      imageDataUri,
      textResponse,
      drawingType,
      remaining: usage.remaining,
    });
  } catch (error: any) {
    console.error('Drawing generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate drawing', details: error.message },
      { status: 500 }
    );
  }
}
