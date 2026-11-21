import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';
import { isApprovedProfessional } from '@/utils/professional';
import { buildingIFC, floorDXF, planFloors } from '@/utils/planExport';
import type { Layout } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Whether the signed-in account may export plans (drives the button on the page). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuthOptional(request);
  return NextResponse.json({ professional: await isApprovedProfessional(auth.userId) });
}

/**
 * Plan export for approved professionals. Body: { layout (floors, openingsSchedule, buildable size), format: 'dxf' | 'ifc', floor? }.
 * DXF is one file per floor (pass floor); IFC is the whole building.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuthOptional(request);
  if (!rateLimit(getRateLimitKey(auth.userId, request) + ':export', 20, 60 * 1000).allowed) {
    return NextResponse.json({ error: 'Too many exports. Please wait a minute.' }, { status: 429 });
  }
  if (!(await isApprovedProfessional(auth.userId))) {
    return NextResponse.json({ error: 'Plan export is for approved architects and engineers.' }, { status: 403 });
  }
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const layout = body?.layout as Layout | undefined;
  const format = body?.format;
  const ok = layout && Array.isArray(layout.floors) && layout.floors.length > 0 && layout.floors.length <= 5
    && Number.isFinite(layout.buildableWidthM) && Number.isFinite(layout.buildableDepthM)
    && layout.buildableWidthM > 0 && layout.buildableWidthM < 200 && layout.buildableDepthM > 0 && layout.buildableDepthM < 200
    && layout.floors.every((f) => Array.isArray(f.rooms) && f.rooms.length <= 200);
  if (!ok) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  try {
    const floors = planFloors(layout);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'dxf') {
      const idx = Number.isInteger(body.floor) ? body.floor : 0;
      const fl = floors.find((f) => f.floor === idx);
      if (!fl) return NextResponse.json({ error: 'No such floor' }, { status: 400 });
      return new NextResponse(floorDXF(fl), {
        headers: { 'Content-Type': 'application/dxf', 'Content-Disposition': `attachment; filename="neevv-plan-${idx === 0 ? 'ground' : 'floor' + idx}-${stamp}.dxf"` },
      });
    }
    if (format === 'ifc') {
      return new NextResponse(buildingIFC(floors, { name: 'neevv plan', date: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/x-step', 'Content-Disposition': `attachment; filename="neevv-plan-${stamp}.ifc"` },
      });
    }
    return NextResponse.json({ error: 'Unknown format' }, { status: 400 });
  } catch (e) {
    console.error('Plan export failed:', e);
    return NextResponse.json({ error: 'Could not export this plan' }, { status: 500 });
  }
}
