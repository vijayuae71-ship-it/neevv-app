'use client';

import React, { useState } from 'react';
import type { RoomInterior, FurnitureItem } from '../types';
import { WALL_TILE_PRESETS, FLOOR_TILE_PRESETS, wallTileBand, floorModule, skirtingMm, KITCHEN_COUNTER_MM } from '@/utils/interiorSpecs';

/**
 * Edit one room's interior. Changes are applied together: the six interior sheets, the 3D view,
 * the interior BOQ and the material list all read the same room record.
 */
interface Props { room: RoomInterior; onApply: (next: RoomInterior) => void; onClose: () => void }

const CEILINGS: { v: RoomInterior['ceilingType']; label: string }[] = [
  { v: 'plain', label: 'Plain (painted slab)' },
  { v: 'false_ceiling_peripheral', label: 'Peripheral false ceiling (cove)' },
  { v: 'false_ceiling_full', label: 'Full false ceiling' },
  { v: 'wooden_ceiling', label: 'Wooden panel ceiling' },
];

export default function InteriorEditPanel({ room, onApply, onClose }: Props) {
  const [r, setR] = useState<RoomInterior>(() => JSON.parse(JSON.stringify(room)));
  const band = wallTileBand(r), kitchen = r.roomType === 'kitchen';
  const tileValue = typeof r.wallTileHeightMm === 'number' ? (r.wallTileHeightMm >= r.ceilingHeight - 50 ? 'full' : String(r.wallTileHeightMm)) : 'default';
  const set = (patch: Partial<RoomInterior>) => setR(prev => ({ ...prev, ...patch }));
  const setFurn = (id: string, patch: Partial<FurnitureItem>) => setR(prev => ({ ...prev, furniture: prev.furniture.map(f => (f.id === id ? { ...f, ...patch } : f)) }));
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const field = 'w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white';

  return (
    <div className="border border-amber-300 bg-amber-50/40 rounded-xl p-4 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Edit — {r.roomName}</h3>
        <span className="text-xs text-gray-500">Drawings, 3D and cost update together</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-gray-600">Wall tiles{kitchen ? ` (dado from counter ${KITCHEN_COUNTER_MM} mm)` : ''}</span>
          <select className={field} value={tileValue}
            onChange={e => { const v = e.target.value; set({ wallTileHeightMm: v === 'default' ? undefined : v === 'full' ? r.ceilingHeight : Number(v) }); }}>
            <option value="default">Room default{band ? ` (${band.full ? 'full height' : `to ${band.toMm} mm`})` : ' (none)'}</option>
            {WALL_TILE_PRESETS.filter(p => !kitchen || p.mm === 'full' || p.mm === 0 || (p.mm as number) > KITCHEN_COUNTER_MM).map(p => (
              <option key={p.label} value={p.mm === 'full' ? 'full' : String(p.mm)}>{p.label}</option>
            ))}
            {tileValue !== 'default' && tileValue !== 'full' && !WALL_TILE_PRESETS.some(p => String(p.mm) === tileValue) && <option value={tileValue}>Custom ({tileValue} mm)</option>}
          </select>
          <input className={field} type="number" placeholder="or custom height in mm" min={0} max={r.ceilingHeight}
            onBlur={e => { if (e.target.value) set({ wallTileHeightMm: num(e.target.value, 0, r.ceilingHeight) }); }} />
        </label>

        <label className="space-y-1">
          <span className="text-gray-600">Floor tile / plank size</span>
          <select className={field} value={r.floorTileSize ?? ''} onChange={e => set({ floorTileSize: e.target.value || undefined })}>
            <option value="">Default ({floorModule({ ...r, floorTileSize: undefined }).label})</option>
            {FLOOR_TILE_PRESETS.map(s => <option key={s} value={s}>{s.replace('x', ' × ')} mm{s === '1200x200' ? ' (wood-look plank)' : ''}</option>)}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-gray-600">Ceiling</span>
          <select className={field} value={r.ceilingType} onChange={e => set({ ceilingType: e.target.value as RoomInterior['ceilingType'] })}>
            {CEILINGS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-gray-600">False ceiling height (mm above floor)</span>
          <input className={field} type="number" min={2400} max={3300} step={50} value={r.ceilingHeight}
            onChange={e => set({ ceilingHeight: num(e.target.value, 2100, 3300) })} disabled={r.ceilingType === 'plain'} />
        </label>

        <label className="space-y-1">
          <span className="text-gray-600">Skirting height (mm)</span>
          <select className={field} value={String(r.skirtingHeightMm ?? 100)} onChange={e => set({ skirtingHeightMm: Number(e.target.value) })} disabled={skirtingMm(r) === 0 && !!band && band.fromMm === 0}>
            {[0, 75, 100, 150].map(v => <option key={v} value={v}>{v === 0 ? 'No skirting' : `${v} mm`}</option>)}
          </select>
          {!!band && band.fromMm === 0 && <span className="text-xs text-gray-500">Walls tiled to the floor — no skirting needed.</span>}
        </label>
      </div>

      <div>
        <p className="text-gray-600 mb-1">Electrical points</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {([['switches', 'Switch boards'], ['sockets', 'Sockets'], ['lightPoints', 'Lights'], ['fanPoints', 'Fans'], ['acPoints', 'AC'], ['dataPoints', 'Data']] as const).map(([k, l]) => (
            <label key={k} className="space-y-0.5"><span className="text-xs text-gray-500">{l}</span>
              <input className={field} type="number" min={0} max={30} value={r.electricalPoints[k]}
                onChange={e => set({ electricalPoints: { ...r.electricalPoints, [k]: num(e.target.value, 0, 30) } })} /></label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-gray-600 mb-1">Furniture & fixtures (size in mm)</p>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {r.furniture.map(f => (
            <div key={f.id} className={`grid grid-cols-[auto,1fr,repeat(3,4.5rem)] gap-2 items-center ${f.defaultSelected === true ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={f.defaultSelected === true} onChange={e => setFurn(f.id, { defaultSelected: e.target.checked })} aria-label={`Include ${f.name}`} />
              <span className="truncate" title={f.name}>{f.name}</span>
              {(['widthMM', 'depthMM', 'heightMM'] as const).map(k => (
                <input key={k} className="border border-gray-300 rounded px-1.5 py-1 text-xs" type="number" min={100} max={6000} value={f[k]} aria-label={`${f.name} ${k.replace('MM', '')}`}
                  onChange={e => setFurn(f.id, { [k]: num(e.target.value, 100, 6000) } as Partial<FurnitureItem>)} />
              ))}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">Columns: width · depth · height. Unticked items are left out of the drawings and the cost.</p>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100">Cancel</button>
        <button onClick={() => { setR(JSON.parse(JSON.stringify(room))); }} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100">Reset</button>
        <button onClick={() => onApply(r)} className="px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600">Apply changes</button>
      </div>
    </div>
  );
}
