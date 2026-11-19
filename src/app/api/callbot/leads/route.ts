import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/callbot/admin';
import { listLeads } from '@/lib/callbot/store';

export const dynamic = 'force-dynamic';

/** GET qualified leads, newest call first. Header: x-callbot-key */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ leads: await listLeads() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not load leads' }, { status: 500 });
  }
}
