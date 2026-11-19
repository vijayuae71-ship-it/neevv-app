import { createHash } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { CallState, LeadInput, LeadResult } from './types';
import type { CallSummary } from './agent';

// Firestore layout (server-only; client access is denied by firestore.rules):
//   callbot_calls/{callSid}  full call state + transcript
//   callbot_leads/{leadId}   latest qualification result per phone number
//   callbot_dnc/{leadId}     numbers that asked not to be called

const CALLS = 'callbot_calls';
const LEADS = 'callbot_leads';
const DNC = 'callbot_dnc';

export function leadIdFor(phone: string): string {
  return createHash('sha256').update(phone.replace(/[^\d+]/g, '')).digest('hex').slice(0, 20);
}

export async function saveCall(state: CallState): Promise<void> {
  await getAdminDb().collection(CALLS).doc(state.callSid).set(stripUndefined(state));
}

export async function getCall(callSid: string): Promise<CallState | null> {
  const snap = await getAdminDb().collection(CALLS).doc(callSid).get();
  return snap.exists ? (snap.data() as CallState) : null;
}

export async function isDoNotCall(phone: string): Promise<boolean> {
  return (await getAdminDb().collection(DNC).doc(leadIdFor(phone)).get()).exists;
}

export async function addDoNotCall(phone: string, reason: string): Promise<void> {
  await getAdminDb().collection(DNC).doc(leadIdFor(phone)).set({ phone, reason, at: new Date().toISOString() });
}

export async function upsertLead(
  state: CallState,
  result: LeadResult,
  summary: CallSummary | null,
): Promise<void> {
  const ref = getAdminDb().collection(LEADS).doc(state.leadId);
  await ref.set(
    stripUndefined({
      leadId: state.leadId,
      playbookId: state.playbookId,
      name: state.lead.name,
      phone: state.lead.phone,
      email: state.lead.email,
      source: state.lead.source,
      answers: { ...(state.lead.known || {}), ...state.captured },
      score: result.score,
      tier: result.tier,
      disqualifiedReason: result.disqualifiedReason,
      missingRequired: result.missingRequired,
      outcome: state.outcome,
      callbackAt: state.callbackAt,
      optOut: !!state.optOut,
      summary: summary?.summary,
      nextStep: summary?.nextStep,
      sentiment: summary?.sentiment,
      lastCallSid: state.callSid,
      lastCallAt: state.endedAt || new Date().toISOString(),
      direction: state.direction,
      language: state.language,
    }),
    { merge: true },
  );
}

export async function recordPendingLead(lead: LeadInput, playbookId: string, callSid: string): Promise<void> {
  await getAdminDb()
    .collection(LEADS)
    .doc(leadIdFor(lead.phone))
    .set(
      stripUndefined({
        leadId: leadIdFor(lead.phone),
        playbookId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: lead.source,
        language: lead.language,
        lastCallSid: callSid,
        lastDialedAt: new Date().toISOString(),
      }),
      { merge: true },
    );
}

export async function listLeads(limit = 200): Promise<Record<string, unknown>[]> {
  const snap = await getAdminDb().collection(LEADS).orderBy('lastCallAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => d.data());
}

function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
