import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';
import { cleanAsset, listAssets, tagAssets, validProjectId } from '@/utils/projectAssets';

export const dynamic = 'force-dynamic';

/** Tag drawings / AR models / renders to the customer's project. Body: { projectId, assets: [...] } (max 60). */
export async function POST(request: NextRequest) {
  const auth = await verifyAuthOptional(request);
  if (!rateLimit(getRateLimitKey(auth.userId, request) + ':assets', 30, 60 * 1000).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  try {
    const { projectId, assets } = await request.json();
    if (!validProjectId(projectId) || !Array.isArray(assets) || assets.length > 60) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const clean = assets.map(cleanAsset).filter((a): a is NonNullable<typeof a> => !!a);
    const n = await tagAssets(auth.userId, projectId, clean);
    return NextResponse.json({ success: true, tagged: n });
  } catch (e) {
    console.error('Tag assets failed:', e);
    return NextResponse.json({ error: 'Could not save to the project' }, { status: 500 });
  }
}

/** The project's register (owner only): ?projectId=… */
export async function GET(request: NextRequest) {
  const auth = await verifyAuthOptional(request);
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!validProjectId(projectId)) return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  try {
    const assets = await listAssets(auth.userId, projectId);
    if (!assets) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ success: true, assets });
  } catch (e) {
    console.error('List assets failed:', e);
    return NextResponse.json({ error: 'Could not load the project' }, { status: 500 });
  }
}
