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

Return ONLY valid JSON with this exact structure (no markdown, no code fences, no explanation — ONLY the JSON object):
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

/** Try to extract a JSON object from a string that may contain markdown fences, explanatory text, etc. */
function extractJSON(raw: string): ExtractedData {
  // Strategy 1: try parsing the whole string directly
  try { return JSON.parse(raw.trim()); } catch { /* continue */ }

  // Strategy 2: extract from markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
  }

  // Strategy 3: find the first { ... } block (greedy)
  const braceStart = raw.indexOf('{');
  const braceEnd = raw.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(raw.slice(braceStart, braceEnd + 1)); } catch { /* continue */ }
  }

  // Strategy 4: strip common prefixes like "Here is the JSON:" or similar
  const stripped = raw.replace(/^[\s\S]*?(?=\{)/, '');
  try { return JSON.parse(stripped); } catch { /* continue */ }

  throw new Error('Could not extract valid JSON from AI response');
}

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
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Vision API error:', errorText);
      return NextResponse.json(
        { error: 'AI analysis failed — please try again', details: errorText },
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
      return NextResponse.json({ error: 'No analysis result from AI — please try again' }, { status: 500 });
    }

    let extracted: ExtractedData;
    try {
      extracted = extractJSON(textResponse);
    } catch {
      console.error('Failed to parse AI response:', textResponse.substring(0, 500));
      return NextResponse.json(
        { error: 'Could not parse AI analysis — please try uploading again', rawResponse: textResponse.substring(0, 200) },
        { status: 500 }
      );
    }

    // Validate and sanitize
    if (!extracted.plotWidthFt || !extracted.plotDepthFt || !extracted.floors?.length) {
      return NextResponse.json(
        { error: 'Incomplete analysis — could not extract dimensions. Please try a clearer image.', extracted },
        { status: 422 }
      );
    }

    // Ensure notes is always an array
    if (!Array.isArray(extracted.notes)) {
      extracted.notes = [];
    }

    // Ensure each floor has rooms array
    extracted.floors = extracted.floors.map(f => ({
      ...f,
      rooms: Array.isArray(f.rooms) ? f.rooms : [],
    }));

    return NextResponse.json({
      success: true,
      extracted,
      imageBase64: `data:${mimeType};base64,${base64}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Drawing analysis error:', msg);
    return NextResponse.json(
      { error: 'Internal server error — please try again', details: msg },
      { status: 500 }
    );
  }
}
