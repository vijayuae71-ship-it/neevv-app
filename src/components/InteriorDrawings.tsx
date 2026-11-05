'use client';

import React, { useMemo, useState } from 'react';
import { Layout, ProjectRequirements, RoomInterior } from '../types';
import { Download, AlertTriangle, FileDown, Loader2 } from 'lucide-react';
import { generateProgrammaticDrawing, interiorOptions, sheetNumber } from '@/utils/drawingEngine';
import Room3D from './Room3D';

/**
 * Interior sheets for each room, drawn in code from the locked plan and the customer's selection
 * (same furniture, points and areas as the interior BOQ). No AI involved.
 */
interface Props { layout: Layout; rooms: RoomInterior[]; requirements: ProjectRequirements }

const SHEETS: { key: string; label: string }[] = [
  { key: 'int_furniture', label: 'Furniture Layout' },
  { key: 'int_rcp', label: 'Ceiling (RCP)' },
  { key: 'int_electrical', label: 'Electrical & Lighting' },
  { key: 'int_flooring', label: 'Flooring' },
  { key: 'int_elevations', label: 'Wall Elevations' },
  { key: 'int_woodwork', label: 'Woodwork' },
];
const SKIP = new Set(['staircase', 'passage', 'parking', 'store', 'utility', 'lift', 'shaft']);

const InteriorDrawings: React.FC<Props> = ({ layout, rooms, requirements }) => {
  const allRooms = useMemo(() => layout.floors.flatMap(f => f.rooms).filter(r => !SKIP.has(r.type) && rooms.some(ri => ri.roomId === r.id)), [layout, rooms]);
  const [roomId, setRoomId] = useState(allRooms[0]?.id ?? '');
  const [sheet, setSheet] = useState('int_furniture');
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const interior = rooms.find(r => r.roomId === roomId);
  const room = allRooms.find(r => r.id === roomId);

  const options = useMemo(() => {
    try { return roomId ? interiorOptions(layout, requirements, roomId, interior) : []; } catch { return []; }
  }, [layout, requirements, roomId, interior]);
  const option = Math.min(choice[roomId] ?? 0, Math.max(0, options.length - 1));

  const render = (type: string, rid = roomId, opt = option): { uri: string; error: string | null } => {
    try {
      return { uri: generateProgrammaticDrawing(type, layout, requirements, undefined, null, 'GF', { roomId: rid, interior: rooms.find(r => r.roomId === rid), option: opt }), error: null };
    } catch (e: any) { return { uri: '', error: e?.message || 'Could not draw this sheet' }; }
  };
  const current = useMemo(() => (roomId && sheet !== '3d' ? render(sheet) : { uri: '', error: null }), [roomId, sheet, option, layout, requirements, rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileName = (type: string) => `neevv-${sheetNumber(type, 0)}-${(room?.name || 'room').replace(/\W+/g, '-')}.png`;
  const download = (uri: string, name: string) => { const a = document.createElement('a'); a.href = uri; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

  /** All six sheets of the selected room on A3 pages, printed (or saved as PDF) by the browser. */
  const downloadSet = () => {
    setBusy(true);
    try {
      const imgs = SHEETS.map(s => render(s.key).uri).filter(Boolean);
      const w = window.open('', '_blank'); if (!w) return;
      const title = `neevv interior — ${room?.name ?? 'room'}`;
      w.document.write(`<!doctype html><html><head><title>${title.replace(/</g, '')}</title><style>@page{size:A3 landscape;margin:0}body{margin:0}img{width:420mm;height:297mm;display:block;page-break-after:always}</style></head><body>${imgs.map(u => `<img src="${u}">`).join('')}</body></html>`);
      w.document.close(); w.onload = () => { w.focus(); w.print(); };
    } finally { setBusy(false); }
  };

  if (!allRooms.length) return <div className="p-6 text-sm text-gray-500">No rooms with an interior selection yet.</div>;

  return <div className="p-3 space-y-4">
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500">Room:</p>
      <div className="flex flex-wrap gap-2">{allRooms.map(r => <button key={r.id} onClick={() => setRoomId(r.id)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${roomId === r.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{r.name}</button>)}</div>
    </div>

    {options.length > 1 && <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500">Arrangement — pick the one that suits you (all sheets and the BOQ follow it):</p>
      <div className="flex flex-wrap gap-2">{options.map((o, i) => <button key={i} onClick={() => setChoice(c => ({ ...c, [roomId]: i }))}
        className={`px-3 py-1.5 rounded-lg text-xs text-left transition-colors ${option === i ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'}`}>{o.label}</button>)}</div>
    </div>}

    <div className="flex flex-wrap gap-2">{SHEETS.map(s => <button key={s.key} onClick={() => setSheet(s.key)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sheet === s.key ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{sheetNumber(s.key, 0)} {s.label}</button>)}
      <button onClick={() => setSheet('3d')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sheet === '3d' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>3D view</button></div>

    <div className="flex items-center gap-2">
      <button onClick={() => current.uri && download(current.uri, fileName(sheet))} disabled={!current.uri || sheet === '3d'}
        className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 flex items-center gap-2 text-sm"><Download size={14} /> This sheet (PNG)</button>
      <button onClick={downloadSet} disabled={busy}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} All 6 sheets (print / PDF)</button>
    </div>

    {current.error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2"><AlertTriangle size={16} className="text-red-600" /><span className="text-sm text-red-800">{current.error}</span></div>}
    {options[option]?.omitted.length ? <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-900">
      Doesn&apos;t fit in this room: {options[option].omitted.join(', ')}. Remove it in the mood board or choose a smaller size — the BOQ still lists it until you do.</div> : null}

    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {sheet === '3d' ? (options[option] ? <div className="p-2"><Room3D plan={options[option]} interior={interior} /></div> : <div className="py-24 text-center text-sm text-gray-400">Select a room.</div>)
        : current.uri ? <img src={current.uri} alt={`${sheet} — ${room?.name ?? ''}`} className="w-full h-auto" /> : <div className="py-24 text-center text-sm text-gray-400">Select a room.</div>}
    </div>
    <p className="text-center text-[10px] text-gray-400">Drawn from the locked plan and your selections • PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION</p>
  </div>;
};
export default InteriorDrawings;
