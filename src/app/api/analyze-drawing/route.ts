import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

interface ExtractedRoom {
  name: string;
  type: string;
  widthFt: number;
  depthFt: number;
}

interface ExtractedData {
  plotWidthFt: number;
  plotDepthFt: number;
  floors: {
    floorLabel: string;
    rooms: ExtractedRoom[];
  }[];
  facing: string;
  notes: string[];
}

const ANALYSIS_PROMPT = `You are an expert architectural plan reader. Analyze this uploaded building drawing/sketch and extract the following information in JSON format.

IMPORTANT: Be precise with dimensions. If dimensions are shown in meters, convert to feet (1m = 3.281ft). If shown in mm, convert to feet.

Return ONLY valid JSON with this exact structure:
{
  "plotWidthFt": <number - overall plot width in feet>,
  "plotDepthFt": <number - overall plot depth in feet>,
  "facing": "<North|South|East|West - determine from drawing orientation, default North if unclear>",
  "floors": [
    {
      "floorLabel": "<Ground Floor|First Floor|etc>",
      "rooms": [
        {
          "name": "<Room name as labeled>",
          "type": "<bedroom|master_bedroom|hall|kitchen|toilet|dining|puja|staircase|parking|balcony|passage|entrance|store|utility>",
          "widthFt": <number>,
          "depthFt": <number>
        }
      ]
    }
  ],
  "notes": ["<any additional observations about the plan>"]
}

Rules:
- Map room names to types: Living Room → hall, Drawing Room → hall, Bathroom/WC/Bath → toilet, Pooja → puja, Car Park → parking, Sit-out → balcony, Lobby/Corridor → passage, Foyer → entrance
- If dimensions are not clearly visible, estimate based on proportions and typical Indian residential sizes
- Include ALL rooms visible in the drawing
- If multiple floors are shown, include each floor separately
- If only one floor is shown, label it "Ground Floor"`;

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('drawing') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No drawing file uploaded' }, { status: 400 });
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // Use Gemini Vision to analyze the drawing
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: ANALYSIS_PROMPT },
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Vision API error:', errorText);
      return NextResponse.json(
        { error: 'AI analysis failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract text response
    let textResponse = '';
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) {
          textResponse += part.text;
        }
      }
    }

    if (!textResponse) {
      return NextResponse.json({ error: 'No analysis result from AI' }, { status: 500 });
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = textResponse;
    const jsonMatch = textResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let extracted: ExtractedData;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse AI response:', textResponse);
      return NextResponse.json(
        { error: 'Could not parse AI analysis', rawResponse: textResponse },
        { status: 500 }
      );
    }

    // Validate and sanitize
    if (!extracted.plotWidthFt || !extracted.plotDepthFt || !extracted.floors?.length) {
      return NextResponse.json(
        { error: 'Incomplete analysis — could not extract dimensions', extracted },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      extracted,
      imageBase64: `data:${mimeType};base64,${base64}`,
    });
  } catch (error: any) {
    console.error('Drawing analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
