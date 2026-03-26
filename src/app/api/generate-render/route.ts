import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GCS_BUCKET = process.env.GCS_BUCKET_NAME || 'neevv-renders';

const MODELS: Record<string, string> = {
  'nano-banana': 'gemini-2.5-flash-image',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
};

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'nano-banana', projectId, renderType } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const modelId = MODELS[model] || MODELS['nano-banana'];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;

    // V2 and Pro models require both TEXT and IMAGE modalities
    const responseModalities = model === 'nano-banana' ? ['IMAGE'] : ['TEXT', 'IMAGE'];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return NextResponse.json(
        { error: 'Gemini API call failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract image from response
    let imageData: string | null = null;
    let mimeType = 'image/png';

    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }
    }

    if (!imageData) {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    // Upload to Google Cloud Storage
    const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
    const bucket = storage.bucket(GCS_BUCKET);
    const timestamp = Date.now();
    const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
    const filename = `renders/${projectId || 'anonymous'}/${renderType || 'render'}_${timestamp}.${ext}`;
    
    const file = bucket.file(filename);
    const buffer = Buffer.from(imageData, 'base64');
    
    await file.save(buffer, {
      contentType: mimeType,
      metadata: { cacheControl: 'public, max-age=31536000' },
    });

    // Make the file publicly accessible
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${filename}`;

    return NextResponse.json({
      success: true,
      imageUrl: publicUrl,
      filename,
      size: buffer.length,
      mimeType,
    });
  } catch (error: any) {
    console.error('Render generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
