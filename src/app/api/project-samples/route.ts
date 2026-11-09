import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';
import { ownedProject, validProjectId } from '@/utils/projectAssets';
import { SAMPLE_ITEMS } from '@/utils/sampleSpecs';

export const dynamic = 'force-dynamic';

/** A room's sample prices: { roomId: { roomName, samples: { floor: { label, rate, qty? } } } } */
type RoomSamples = Record<string, { roomName: string; samples: Record<string, { label: string; rate: number; qty?: number }> }>;
const KEYS = new Set(SAMPLE_ITEMS.map((s) => s.key));

/** Keeps only well-formed sample prices (known items, sane numbers and text). */
function clean(input: unknown): RoomSamples | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, any>).slice(0, 60);
  const out: RoomSamples = {};
  for (const [roomId, v] of entries) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(roomId) || !v || typeof v.samples !== 'object') continue;
    const samples: RoomSamples[string]['samples'] = {};
    for (const [key, s] of Object.entries(v.samples as Record<string, any>)) {
      if (!KEYS.has(key) || !s || typeof s !== 'object') continue;
      const rate = Number(s.rate);
      if (!(rate > 0 && rate < 10_000_000)) continue;
      const qty = s.qty === undefined ? undefined : Math.min(500, Math.max(1, Math.round(Number(s.qty) || 1)));
      samples[key] = { label: String(s.label ?? '').slice(0, 140), rate: Math.round(rate * 100) / 100, ...(qty ? { qty } : {}) };
    }
    if (Object.keys(samples).length) out[roomId] = { roomName: String(v.roomName ?? '').slice(0, 80), samples };
  }
  return out;
}

/** The customer's sample prices on a saved project (owner only). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuthOptional(request);
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!validProjectId(projectId)) return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  try {
    const ref = await ownedProject(auth.userId, projectId);
    if (!ref) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const snap = await ref.get();
    return NextResponse.json({ success: true, rooms: snap.data()?.interiorSamples ?? {} });
  } catch (e) {
    console.error('Load samples failed:', e);
    return NextResponse.json({ error: 'Could not load prices' }, { status: 500 });
  }
}

/** Saves the customer's sample prices on the project (replaces the set). */
export async function POST(request: NextRequest) {
  const auth = await verifyAuthOptional(request);
  if (!rateLimit(getRateLimitKey(auth.userId, request) + ':samples', 30, 60 * 1000).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  try {
    const { projectId, rooms } = await request.json();
    if (!validProjectId(projectId)) return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
    const data = clean(rooms);
    if (!data) return NextResponse.json({ error: 'Invalid prices' }, { status: 400 });
    const ref = await ownedProject(auth.userId, projectId);
    if (!ref) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    await ref.set({ interiorSamples: data, interiorSamplesUpdatedAt: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ success: true, rooms: Object.keys(data).length });
  } catch (e) {
    console.error('Save samples failed:', e);
    return NextResponse.json({ error: 'Could not save prices' }, { status: 500 });
  }
}
