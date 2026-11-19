'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

// Internal console for the sales & lead-qualification calling bot.
// Everything here calls /api/callbot/* with the admin key in x-callbot-key.

type Tab = 'rehearse' | 'dial' | 'leads';

interface PlaybookLite {
  id: string;
  name: string;
  agentName: string;
  defaultLanguage: string;
  languages: { code: string; name: string }[];
  fields: { key: string; question: string }[];
}
interface Turn { role: 'bot' | 'prospect'; text: string }
interface LeadResult { score: number; tier: string; disqualifiedReason?: string; missingRequired: string[] }
interface Summary { summary: string; nextStep: string; sentiment: string }

const TIER_STYLE: Record<string, string> = {
  hot: 'bg-red-100 text-red-800',
  warm: 'bg-amber-100 text-amber-800',
  cold: 'bg-sky-100 text-sky-800',
  disqualified: 'bg-gray-200 text-gray-700',
};

function readKey(): string {
  try { return sessionStorage.getItem('callbot_key') || ''; } catch { return ''; }
}

export default function CallbotConsole() {
  const [key, setKey] = useState('');
  const [tab, setTab] = useState<Tab>('rehearse');
  const [playbooks, setPlaybooks] = useState<PlaybookLite[]>([]);
  const [playbookId, setPlaybookId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setKey(readKey()); }, []);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-callbot-key': key, ...(init?.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }, [key]);

  useEffect(() => {
    if (!key) return;
    api('/api/callbot/playbooks')
      .then((j) => { setPlaybooks(j.playbooks); setPlaybookId((id) => id || j.playbooks[0]?.id || ''); setError(''); })
      .catch((e) => setError(e.message));
  }, [key, api]);

  function saveKey(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get('key') || '').trim();
    try { sessionStorage.setItem('callbot_key', v); } catch { /* private mode */ }
    setKey(v);
  }

  if (!key || (error && !playbooks.length)) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] px-4 py-16">
        <form onSubmit={saveKey} className="mx-auto max-w-sm rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Calling bot console</h1>
          <p className="mt-1 text-sm text-gray-600">Enter the CALLBOT_ADMIN_KEY set on the server.</p>
          <input name="key" type="password" autoComplete="off" defaultValue={key} className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <button className="mt-4 w-full rounded-lg bg-[#4f6f52] py-2 text-sm font-medium text-white hover:bg-[#405b43]">Continue</button>
        </form>
      </main>
    );
  }

  const pb = playbooks.find((p) => p.id === playbookId);

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Sales calling bot</h1>
          <select value={playbookId} onChange={(e) => setPlaybookId(e.target.value)} className="max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </header>
        <nav className="mt-5 flex gap-1 rounded-xl bg-white p-1 shadow-sm">
          {(['rehearse', 'dial', 'leads'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize ${tab === t ? 'bg-[#4f6f52] text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {t === 'rehearse' ? 'Rehearse' : t === 'dial' ? 'Call leads' : 'Leads'}
            </button>
          ))}
        </nav>
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          {tab === 'rehearse' && pb && <Rehearse key={pb.id} pb={pb} api={api} />}
          {tab === 'dial' && pb && <Dial pb={pb} api={api} />}
          {tab === 'leads' && <Leads api={api} />}
        </section>
      </div>
    </main>
  );
}

type Api = (path: string, init?: RequestInit) => Promise<any>;

function TierBadge({ tier }: { tier: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${TIER_STYLE[tier] || 'bg-gray-100'}`}>{tier}</span>;
}

function Rehearse({ pb, api }: { pb: PlaybookLite; api: Api }) {
  const [state, setState] = useState<any>(null);
  const [result, setResult] = useState<LeadResult | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [name, setName] = useState('Rahul');
  const [startLang, setStartLang] = useState(pb.defaultLanguage);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [err, setErr] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [state]);

  async function call(body: object) {
    setBusy(true); setErr('');
    try {
      const j = await api('/api/callbot/simulate', { method: 'POST', body: JSON.stringify({ playbookId: pb.id, ...body }) });
      setState(j.state); setResult(j.result);
      if (j.summary !== undefined) { setSummary(j.summary); setEnded(true); }
      else if (j.action && j.action !== 'continue') setEnded(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!msg.trim() || busy) return;
    const m = msg; setMsg('');
    await call({ state, message: m });
  }

  const transcript: Turn[] = state?.transcript || [];

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_240px]">
      <div className="min-w-0">
        {!state ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm text-gray-700">Prospect name
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-gray-700">Starts in
              <select value={startLang} onChange={(e) => setStartLang(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                {pb.languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            <button disabled={busy} onClick={() => call({ lead: { name, language: startLang } })} className="rounded-lg bg-[#4f6f52] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Start rehearsal call</button>
            <p className="w-full text-xs text-gray-500">You play the prospect by typing, in any of the playbook&apos;s languages. Switch language mid-call and the bot follows. Same brain as real calls, no phone minutes used.</p>
          </div>
        ) : (
          <>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
              {transcript.map((t, i) => (
                <div key={i} className={`flex ${t.role === 'bot' ? '' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${t.role === 'bot' ? 'bg-white text-gray-900 shadow-sm' : 'bg-[#4f6f52] text-white'}`}>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase opacity-60">{t.role === 'bot' ? pb.agentName : 'Prospect'}</div>
                    <div dir="auto">{t.text}</div>
                  </div>
                </div>
              ))}
              {busy && <div className="text-xs text-gray-500">{pb.agentName} is thinking…</div>}
              <div ref={bottom} />
            </div>
            {!ended ? (
              <form onSubmit={send} className="mt-3 flex gap-2">
                <input dir="auto" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Reply as the prospect…" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" autoFocus />
                <button disabled={busy} className="rounded-lg bg-[#4f6f52] px-4 text-sm font-medium text-white disabled:opacity-50">Send</button>
              </form>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {!summary && <button disabled={busy} onClick={() => call({ state, end: true })} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">End & score</button>}
              <button onClick={() => { setState(null); setResult(null); setSummary(null); setEnded(false); }} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">New rehearsal</button>
            </div>
          </>
        )}
        {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      </div>

      <aside className="space-y-3 text-sm">
        <div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">Lead score</span>
            {result && <TierBadge tier={result.tier} />}
          </div>
          <div className="mt-1 text-3xl font-semibold text-gray-900">{result ? result.score : '–'}</div>
          {result?.disqualifiedReason && <p className="text-xs text-gray-600">{result.disqualifiedReason}</p>}
        </div>
        {state?.language && (
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">Speaking</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">{pb.languages.find((l) => l.code === state.language)?.name || state.language}</span>
          </div>
        )}
        <div>
          <div className="font-semibold text-gray-900">Captured</div>
          <ul className="mt-1 space-y-1">
            {pb.fields.map((f) => (
              <li key={f.key} className="flex justify-between gap-2 border-b border-gray-100 pb-1">
                <span className="text-gray-600">{f.key}</span>
                <span className="truncate text-right font-medium text-gray-900">{state?.captured?.[f.key] !== undefined ? String(state.captured[f.key]) : '·'}</span>
              </li>
            ))}
          </ul>
        </div>
        {summary && (
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="font-semibold text-gray-900">Summary</div>
            <p className="mt-1 text-gray-700">{summary.summary}</p>
            <p className="mt-2 text-gray-700"><span className="font-medium">Next:</span> {summary.nextStep}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function parseLeads(text: string) {
  // One lead per line: name, phone[, email]. A header row is skipped.
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/[,\t]/).map((c) => c.trim()))
    .filter((c) => c.some((x) => /\d{6,}/.test(x)))
    .map((c) => {
      const phone = c.find((x) => /^\+?[\d\s-]{8,}$/.test(x)) || '';
      const email = c.find((x) => x.includes('@'));
      const language = c.find((x) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(x));
      const name = c.find((x) => x !== phone && x !== email && x !== language) || '';
      return { name, phone, email, language, source: 'console' };
    });
}

function Dial({ pb, api }: { pb: PlaybookLite; api: Api }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ignoreHours, setIgnoreHours] = useState(false);
  const [record, setRecord] = useState(false);
  const [out, setOut] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const leads = parseLeads(text);

  async function dial() {
    setBusy(true); setErr(''); setOut([]);
    try {
      const j = await api('/api/callbot/calls', { method: 'POST', body: JSON.stringify({ playbookId: pb.id, leads, ignoreCallingHours: ignoreHours, record }) });
      setOut(j.results);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <label className="text-sm font-medium text-gray-800">Leads, one per line: <span className="font-normal text-gray-600">name, phone in +country format, email and language code (both optional, e.g. hi-IN)</span></label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={'Priya Sharma, +919876543210, hi-IN\nAhmed Khan, +971501234567, ahmed@example.com, ar-AE'} className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm" />
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} /> Record calls</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={ignoreHours} onChange={(e) => setIgnoreHours(e.target.checked)} /> Ignore calling hours (testing)</label>
      </div>
      <p className="mt-2 text-xs text-gray-500">Only call people who gave consent to be contacted. Numbers that opt out are added to the do-not-call list automatically.</p>
      <button disabled={busy || !leads.length} onClick={dial} className="mt-3 rounded-lg bg-[#4f6f52] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? 'Dialing…' : `Call ${leads.length} lead${leads.length === 1 ? '' : 's'}`}
      </button>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      {out.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {out.map((r, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-1">
              <span className="font-mono">{r.phone}</span>
              <span className={r.status === 'dialing' ? 'text-green-700' : 'text-red-700'}>{r.status}{r.error ? `: ${r.error}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Leads({ api }: { api: Api }) {
  const [leads, setLeads] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    setErr('');
    api('/api/callbot/leads').then((j) => setLeads(j.leads)).catch((e) => setErr(e.message));
  }, [api]);
  useEffect(load, [load]);

  const shown = (leads || []).filter((l) => filter === 'all' || l.tier === filter);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {['all', 'hot', 'warm', 'cold', 'disqualified'].map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${filter === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>{t}</button>
        ))}
        <button onClick={load} className="ml-auto rounded-lg border border-gray-300 px-3 py-1 text-sm">Refresh</button>
      </div>
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      {!leads && !err && <p className="mt-3 text-sm text-gray-500">Loading…</p>}
      {leads && !shown.length && <p className="mt-3 text-sm text-gray-500">No leads yet.</p>}
      <ul className="mt-3 divide-y divide-gray-100">
        {shown.map((l) => (
          <li key={l.leadId} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-900">{l.name || 'Unknown'}</span>
              <span className="font-mono text-xs text-gray-500">{l.phone}</span>
              {l.tier && <TierBadge tier={l.tier} />}
              {l.score !== undefined && <span className="text-sm text-gray-700">{l.score}/100</span>}
              {l.optOut && <span className="text-xs text-red-700">opted out</span>}
              <span className="ml-auto text-xs text-gray-500">{l.lastCallAt ? new Date(l.lastCallAt).toLocaleString() : ''}</span>
            </div>
            {l.language && <span className="text-xs text-gray-500">Spoke: {l.language}</span>}
            {l.summary && <p className="mt-1 text-sm text-gray-700">{l.summary}</p>}
            {l.nextStep && <p className="mt-1 text-sm text-gray-700"><span className="font-medium">Next:</span> {l.nextStep}{l.callbackAt ? ` (callback: ${l.callbackAt})` : ''}</p>}
            {l.answers && Object.keys(l.answers).length > 0 && (
              <p className="mt-1 break-words text-xs text-gray-500">{Object.entries(l.answers).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
