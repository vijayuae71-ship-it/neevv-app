import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, isAuthError } from '@/lib/auth-middleware';
import { getUserUsage } from '@/utils/usageTracker';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (isAuthError(auth)) return auth;

  try {
    const usage = await getUserUsage(auth.userId);
    return NextResponse.json({
      usage,
      limits: {
        drawings: 50,
        renders: 10,
        analyses: 20,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    );
  }
}
