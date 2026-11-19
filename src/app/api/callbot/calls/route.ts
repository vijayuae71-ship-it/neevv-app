import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/callbot/admin';
import { getPlaybook, withinCallingHours } from '@/lib/callbot/playbook';
import { isDoNotCall, recordPendingLead, saveCall } from '@/lib/callbot/store';
import { newCallState } from '@/lib/callbot/session';
import { createOutboundCall, isE164 } from '@/lib/callbot/twilio';
import type { LeadInput } from '@/lib/callbot/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Start outbound qualification calls.
 * POST { playbookId, leads: [{ name, phone: "+9198...", language?: "hi-IN", email?, source?, known?, notes? }], record?, ignoreCallingHours? }
 * Header: x-callbot-key
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const leads: LeadInput[] = Array.isArray(body?.leads) ? body.leads : [];
  if (!leads.length) return NextResponse.json({ error: 'leads[] is required' }, { status: 400 });
  if (leads.length > 50) return NextResponse.json({ error: 'At most 50 leads per request' }, { status: 400 });

  const pb = getPlaybook(body.playbookId);
  if (!body.ignoreCallingHours && !withinCallingHours(pb)) {
    return NextResponse.json(
      { error: `Outside calling hours (${pb.callingHours?.start}-${pb.callingHours?.end} ${pb.callingHours?.timezone})` },
      { status: 409 },
    );
  }

  const results: { phone: string; status: string; callId?: string; error?: string }[] = [];
  for (const raw of leads) {
    const lead: LeadInput = { ...raw, phone: String(raw.phone || '').replace(/[\s()-]/g, '') };
    if (!isE164(lead.phone)) {
      results.push({ phone: lead.phone, status: 'skipped', error: 'Phone must be E.164, e.g. +919876543210' });
      continue;
    }
    if (await isDoNotCall(lead.phone)) {
      results.push({ phone: lead.phone, status: 'skipped', error: 'On do-not-call list' });
      continue;
    }
    const ref = randomUUID();
    try {
      await saveCall(newCallState(pb, ref, lead, 'outbound', process.env.CALLBOT_RELAY_URL ? 'relay' : 'gather'));
      const q = `?ref=${ref}`;
      const { sid } = await createOutboundCall({
        to: lead.phone,
        voicePath: `/api/callbot/voice${q}`,
        statusPath: `/api/callbot/status${q}`,
        record: !!body.record,
      });
      await recordPendingLead(lead, pb.id, ref);
      results.push({ phone: lead.phone, status: 'dialing', callId: ref + ':' + sid });
    } catch (err: any) {
      results.push({ phone: lead.phone, status: 'failed', error: err?.message || 'unknown error' });
    }
    // Gentle pacing so a batch doesn't trip Twilio's calls-per-second limit.
    await new Promise((r) => setTimeout(r, 1100));
  }
  return NextResponse.json({ playbookId: pb.id, results });
}
