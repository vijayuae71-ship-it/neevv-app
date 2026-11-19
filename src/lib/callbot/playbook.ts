import type { CallState, LeadResult, Playbook } from './types';
import neevvHomeowner from './playbooks/neevv-homeowner.json';
import uaeRealEstate from './playbooks/uae-real-estate.json';

// To add a playbook: drop a JSON file in ./playbooks and list it here.
const PLAYBOOKS: Record<string, Playbook> = Object.fromEntries(
  ([neevvHomeowner, uaeRealEstate] as Playbook[]).map((p) => [p.id, p]),
);

export function listPlaybooks(): Playbook[] {
  return Object.values(PLAYBOOKS);
}

export function getPlaybook(id: string | null | undefined): Playbook {
  const pb = (id && PLAYBOOKS[id]) || PLAYBOOKS[process.env.CALLBOT_DEFAULT_PLAYBOOK || ''] || listPlaybooks()[0];
  if (!pb) throw new Error('No callbot playbooks configured');
  return pb;
}

export function fillTemplate(text: string, pb: Playbook, leadName?: string): string {
  return text
    .replace(/\{name\}/g, leadName?.trim() || 'there')
    .replace(/\{agent\}/g, pb.agentName)
    .replace(/\{company\}/g, pb.company);
}

/** Coerce a model-captured value to the field's type. Returns undefined if unusable. */
export function normalizeValue(pb: Playbook, key: string, raw: unknown): string | number | boolean | undefined {
  const field = pb.fields.find((f) => f.key === key);
  if (!field || raw === null || raw === undefined || raw === '') return undefined;
  switch (field.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const s = String(raw).toLowerCase();
      if (['true', 'yes', 'y'].includes(s)) return true;
      if (['false', 'no', 'n'].includes(s)) return false;
      return undefined;
    }
    case 'choice': {
      const s = String(raw);
      return field.options?.some((o) => o.value === s) ? s : undefined;
    }
    default:
      return String(raw).slice(0, 300);
  }
}

/**
 * Deterministic lead scoring. The model only extracts answers; the score comes
 * from the playbook's weights so it is explainable and consistent across calls.
 */
export function scoreLead(pb: Playbook, state: Pick<CallState, 'captured' | 'optOut'>): LeadResult {
  const captured = state.captured || {};
  const breakdown: LeadResult['breakdown'] = [];
  let earned = 0;
  let total = 0;

  for (const f of pb.fields) {
    if (!f.weight) continue;
    const v = captured[f.key];
    let points = 0;
    if (v !== undefined) {
      if (f.type === 'choice') points = f.options?.find((o) => o.value === v)?.points ?? 0;
      else if (f.type === 'boolean') points = v === (f.idealValue ?? true) ? 1 : 0;
      else if (f.type === 'number') {
        const n = Number(v);
        points = f.idealMin ? Math.max(0, Math.min(1, n / f.idealMin)) : n > 0 ? 1 : 0;
      } else points = 1;
    }
    total += f.weight;
    earned += points * f.weight;
    breakdown.push({ key: f.key, value: v, points, weight: f.weight });
  }

  const score = total ? Math.round((earned / total) * 100) : 0;
  const missingRequired = pb.fields.filter((f) => f.required && captured[f.key] === undefined).map((f) => f.key);

  const dq = state.optOut
    ? { reason: 'Asked not to be called' }
    : pb.disqualifiers?.find((d) => captured[d.field] !== undefined && d.values.includes(captured[d.field]));

  const tier: LeadResult['tier'] = dq
    ? 'disqualified'
    : score >= pb.tiers.hot
      ? 'hot'
      : score >= pb.tiers.warm
        ? 'warm'
        : 'cold';

  return { score, tier, disqualifiedReason: dq?.reason, missingRequired, breakdown };
}

/** True if `now` falls inside the playbook's local calling window. */
export function withinCallingHours(pb: Playbook, now = new Date()): boolean {
  const h = pb.callingHours;
  if (!h) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: h.timezone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  if (h.days && !h.days.includes(day)) return false;
  const hhmm = `${get('hour').replace('24', '00')}:${get('minute')}`;
  return hhmm >= h.start && hhmm <= h.end;
}
