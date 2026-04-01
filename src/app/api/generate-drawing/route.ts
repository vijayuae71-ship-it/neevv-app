import { NextRequest, NextResponse } from 'next/server';
import { buildDrawingPrompt, DrawingType, DRAWING_TYPES } from '../../../utils/drawingPrompts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;

interface GenerateDrawingRequest {
  drawingType: DrawingType;
  layout: any;
  requirements: any;
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'neevv Generation Pro engine is not configured' },
        { status: 500 }
      );
    }

    const body: GenerateDrawingRequest = await request.json();
    const { drawingType, layout, requirements } = body;

    // Rate limiting: 15 drawings per minute per IP
    const { rateLimit: checkRate, getClientIP } = await import('@/utils/rateLimit');
    const clientIP = getClientIP(request);
    const { allowed, remaining, resetIn } = checkRate(clientIP, 15, 60000);
    
    if (!allowed) {
      return Response.json(
        { success: false, error: `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 1000)} seconds.` },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } }
      );
    }

    // Validate drawing type
    const validTypes = DRAWING_TYPES.map((dt) => dt.id);
    if (!validTypes.includes(drawingType)) {
      return NextResponse.json(
        { success: false, error: `Invalid drawing type: ${drawingType}` },
        { status: 400 }
      );
    }

    // Build the prompt
    const prompt = buildDrawingPrompt(drawingType, layout, requirements);

    // Call Gemini API
    const geminiResponse = await fetch(MODEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: drawingType === '3d_exterior' ? '16:9' : '1:1',
          },
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return NextResponse.json(
        {
          success: false,
          error: `neevv Generation Pro returned ${geminiResponse.status}`,
          details: errorText,
        },
        { status: 502 }
      );
    }

    const data = await geminiResponse.json();

    // Extract image from response
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No output from neevv Generation Pro' },
        { status: 502 }
      );
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No drawing data in response' },
        { status: 502 }
      );
    }

    // Find the image part
    const imagePart = parts.find(
      (part: any) => part.inlineData?.mimeType?.startsWith('image/')
    );

    if (!imagePart) {
      // Maybe got text instead of image
      const textPart = parts.find((part: any) => part.text);
      return NextResponse.json(
        {
          success: false,
          error: 'No image generated. Model returned text instead.',
          textResponse: textPart?.text || 'Unknown response',
        },
        { status: 502 }
      );
    }

    const mimeType = imagePart.inlineData.mimeType;
    const base64Data = imagePart.inlineData.data;
    const imageDataUri = `data:${mimeType};base64,${base64Data}`;

    return NextResponse.json({
      success: true,
      imageDataUri,
      prompt,
      drawingType,
    });
  } catch (error: any) {
    console.error('Generate drawing error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
