import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';
import { checkAndIncrementUsage } from '@/utils/usageTracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ANALYSIS_PROMPT = `You are an expert architectural drawing analyzer. Analyze the uploaded floor plan drawing and extract the following information in JSON format:

{
  "plotWidth": <number in feet>,
  "plotDepth": <number in feet>,
  "facing": "<North|South|East|West>",
  "numFloors": <number>,
  "rooms": [
    {
      "name": "<room name>",
      "type": "<bedroom|kitchen|living|dining|bathroom|toilet|balcony|staircase|parking|store|pooja|utility|passage|sitout|other>",
      "widthFt": <number>,
      "depthFt": <number>
    }
  ],
  "notes": ["<any relevant observations>"]
}

Instructions:
- Convert all dimensions to feet if they are in meters or millimeters
- Identify the facing direction from the north arrow or compass if present
- List ALL rooms/spaces visible in the drawing
- Use standard room type classifications
- If dimensions are unclear, estimate based on proportions and standard sizes
- Return ONLY valid JSON, no markdown or explanation`;

export async function POST(request: NextRequest) {
  // 1. Authenticate (optional during beta)
  const auth = await verifyAuthOptional(request);

  // 2. Rate limit (keyed on userId or anon IP hash)
  const rateLimitKey = getRateLimitKey(auth.userId, request);
  const limiter = rateLimit(rateLimitKey, 10, 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before analyzing more drawings.', resetIn: limiter.resetIn },
      { status: 429 }
    );
  }

  // 3. Usage quota check
  const usage = await checkAndIncrementUsage(auth.userId, 'analyses');
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily analysis limit reached (${usage.limit}/day). Try again tomorrow.`, remaining: 0 },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('drawing') as File;

    if (!file) {
      return NextResponse.json({ error: 'No drawing file provided' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, or PDF.' },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json({ error: 'Service configuration error' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          { text: ANALYSIS_PROMPT },
        ],
      }],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json({ error: 'No analysis result from AI' }, { status: 500 });
    }

    let analysisResult;
    try {
      analysisResult = JSON.parse(text);
    } catch {
      try {
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          analysisResult = JSON.parse(fenceMatch[1].trim());
        } else {
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start !== -1 && end > start) {
            analysisResult = JSON.parse(text.substring(start, end + 1));
          } else {
            throw new Error('No JSON found in response');
          }
        }
      } catch (innerError) {
        console.error('JSON extraction failed:', text.substring(0, 200));
        return NextResponse.json(
          { error: 'Could not parse AI analysis. Please try uploading again.' },
          { status: 500 }
        );
      }
    }

    if (!Array.isArray(analysisResult.rooms)) analysisResult.rooms = [];
    if (!Array.isArray(analysisResult.notes)) analysisResult.notes = [];

    if (analysisResult.plotWidth) analysisResult.plotWidth = Math.round(analysisResult.plotWidth * 10) / 10;
    if (analysisResult.plotDepth) analysisResult.plotDepth = Math.round(analysisResult.plotDepth * 10) / 10;
    analysisResult.rooms = analysisResult.rooms.map((room: any) => ({
      ...room,
      widthFt: Math.round((room.widthFt || 0) * 10) / 10,
      depthFt: Math.round((room.depthFt || 0) * 10) / 10,
    }));

    return NextResponse.json({
      analysis: analysisResult,
      imageDataUri: `data:${mimeType};base64,${base64Data}`,
      remaining: usage.remaining,
    });
  } catch (error: any) {
    console.error('Drawing analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze drawing', details: error.message },
      { status: 500 }
    );
  }
}
