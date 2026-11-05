import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';
import { checkAndIncrementUsage } from '@/utils/usageTracker';
import { ROOM_TYPES } from '@/utils/uploadedPlan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Reads a floor-plan drawing (photo, scan, CAD export or PDF) into rooms with positions, doors and windows. */
const SYSTEM = `You read Indian residential architectural drawings (floor plans, sanction drawings, hand sketches, CAD exports) and return the plan as data.

Coordinates: feet, origin at the building's front-left outer corner, with the ROAD SIDE treated as the front (top). If the road is at the bottom or a side of the drawing, rotate your reading so the road side is the front. x runs to the right along the front, y runs away from the road.
- Give every room its position (xFt, yFt = its front-left corner) and its size (widthFt along x, depthFt along y), measured to wall centre lines. Adjacent rooms share edges: one room's x + width equals its neighbour's x. Rooms must not overlap.
- Use the written dimensions when present (convert m/mm/ft-in to decimal feet: 10'6" = 10.5). Where a size is not written, scale it from the drawing against a written dimension. Never invent a room that is not drawn.
- type must be one of the listed types: living/drawing/family rooms → hall; bathroom/WC/toilet → toilet; pooja → puja; sit-out/porch/foyer → entrance; lobby/corridor → passage; car park → parking; wash/utility → utility; store/dress → store.
- Openings: for each door, window and ventilator give the room it belongs to (its exact room name), the wall of that room it is in, its centre position along that wall from the wall's left/front end (feet), and its width. Doors between two rooms belong to the smaller room.
- One entry per storey drawn (Ground Floor, First Floor…). Plot size and setbacks from the site plan or plot dimensions if shown; facing = the compass direction the road side faces (from the north arrow), else your best reading.
- confidence: high when most sizes are written, medium when some are scaled, low for a rough sketch or unreadable scan. notes: short items the customer should check (assumptions, unreadable parts).`;

const n = { type: 'number' } as const;
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['plotWidthFt', 'plotDepthFt', 'facing', 'setbacksFt', 'floors', 'confidence', 'notes'],
  properties: {
    plotWidthFt: n, plotDepthFt: n,
    facing: { type: 'string', enum: ['North', 'South', 'East', 'West'] },
    setbacksFt: { type: 'object', additionalProperties: false, required: ['front', 'rear', 'left', 'right'], properties: { front: n, rear: n, left: n, right: n } },
    floors: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['floorLabel', 'rooms', 'openings'],
      properties: {
        floorLabel: { type: 'string' },
        rooms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'type', 'xFt', 'yFt', 'widthFt', 'depthFt'],
          properties: { name: { type: 'string' }, type: { type: 'string', enum: [...ROOM_TYPES] }, xFt: n, yFt: n, widthFt: n, depthFt: n } } },
        openings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['roomName', 'type', 'wall', 'positionFt', 'widthFt'],
          properties: { roomName: { type: 'string' }, type: { type: 'string', enum: ['door', 'window', 'ventilator'] }, wall: { type: 'string', enum: ['front', 'rear', 'left', 'right'] }, positionFt: n, widthFt: n } } },
      } } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'array', items: { type: 'string' } },
  },
};

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

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, or PDF.' },
        { status: 400 }
      );
    }

    // the model takes images up to 5 MB and PDFs well beyond; keep uploads quick either way
    const isPdf = file.type === 'application/pdf', maxSize = (isPdf ? 20 : 5) * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: isPdf ? 'PDF too large. Maximum size is 20 MB.' : 'Image too large. Maximum size is 5 MB — please resize or export at a lower resolution.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return NextResponse.json({ error: 'Service configuration error' }, { status: 500 });
    }
    const client = new Anthropic();
    const drawing: Anthropic.Messages.ContentBlockParam = mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: base64Data } };

    // server-side fallback: if a safety classifier declines, the API re-runs the request on a fallback model
    const message = await client.beta.messages.stream({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_tokens: 32000,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: [drawing, { type: 'text', text: 'Read this drawing into the plan data.' }] }],
    }).finalMessage();

    if (message.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'This file could not be read as a floor plan. Please upload a clear plan drawing.' }, { status: 422 });
    }
    if (message.stop_reason === 'max_tokens') {
      return NextResponse.json({ error: 'The drawing has too much detail to read in one go. Please upload one floor per file.' }, { status: 422 });
    }
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let extracted: any;
    try { extracted = JSON.parse(text); } catch {
      console.error('Unparseable analysis:', text.slice(0, 200));
      return NextResponse.json({ error: 'Could not read the drawing. Please try a clearer image.' }, { status: 502 });
    }
    const r1 = (v: unknown) => Math.round((Number(v) || 0) * 10) / 10;
    extracted.plotWidthFt = r1(extracted.plotWidthFt); extracted.plotDepthFt = r1(extracted.plotDepthFt);
    for (const f of extracted.floors ?? []) {
      f.rooms = (f.rooms ?? []).map((r: any) => ({ ...r, xFt: r1(r.xFt), yFt: r1(r.yFt), widthFt: r1(r.widthFt), depthFt: r1(r.depthFt) }));
      f.openings = (f.openings ?? []).map((o: any) => ({ ...o, positionFt: r1(o.positionFt), widthFt: r1(o.widthFt) }));
    }

    return NextResponse.json({
      success: true,
      extracted,
      imageBase64: mimeType === 'application/pdf' ? null : `data:${mimeType};base64,${base64Data}`,
      remaining: usage.remaining,
    });
  } catch (error: any) {
    console.error('Drawing analysis error:', error);
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Busy right now — please try again in a minute.' }, { status: 429 });
    if (error instanceof Anthropic.BadRequestError) return NextResponse.json({ error: 'This file could not be read. Please upload a JPG, PNG or PDF of the plan.' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to analyze drawing' }, { status: 500 });
  }
}
