import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/callbot/admin';
import { listPlaybooks } from '@/lib/callbot/playbook';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ playbooks: listPlaybooks() });
}
