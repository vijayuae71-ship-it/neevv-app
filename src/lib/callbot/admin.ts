import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * The callbot admin endpoints (dial, list leads, simulate) are protected by a
 * shared key sent as `x-callbot-key`. Set CALLBOT_ADMIN_KEY to a long random string.
 */
export function requireAdmin(req: Request): NextResponse | null {
  const expected = process.env.CALLBOT_ADMIN_KEY;
  if (!expected) {
    return NextResponse.json({ error: 'CALLBOT_ADMIN_KEY is not configured on the server.' }, { status: 503 });
  }
  const got = req.headers.get('x-callbot-key') || '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid admin key.' }, { status: 401 });
  }
  return null;
}
