'use client';

import React, { useEffect, useState } from 'react';
import { Download, Lock, Loader2 } from 'lucide-react';
import type { Layout } from '../types';
import { authFetch } from '@/utils/authFetch';

/** Plan export (DXF per floor, IFC for the building) for approved professionals; everyone else sees why. */
export const ProfessionalExport: React.FC<{ layout: Layout }> = ({ layout }) => {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/plan-export').then(r => r.json()).then(d => { if (!cancelled) setAllowed(!!d.professional); }).catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, []);

  const download = async (format: 'dxf' | 'ifc', floor?: number) => {
    const key = `${format}-${floor ?? 'all'}`;
    setBusy(key); setError(null);
    try {
      const minimal = { buildableWidthM: layout.buildableWidthM, buildableDepthM: layout.buildableDepthM, floors: layout.floors, openingsSchedule: layout.openingsSchedule, setbacks: layout.setbacks };
      const res = await authFetch('/api/plan-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: minimal, format, floor }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Export failed (${res.status})`); }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || `neevv-plan.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { setError(e?.message || 'Export failed'); }
    finally { setBusy(null); }
  };

  if (allowed === null) return null;
  if (!allowed) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-[11px] text-gray-600 flex items-start gap-2">
        <Lock size={13} className="mt-0.5 shrink-0" />
        <span>CAD export (DXF and IFC) is for approved architects and engineers. If you are a professional, apply through the beta sign-up form and we will enable it for your account.</span>
      </div>
    );
  }
  const floors = layout.floors;
  const Btn: React.FC<{ k: string; onClick: () => void; children: React.ReactNode }> = ({ k, onClick, children }) => (
    <button onClick={onClick} disabled={!!busy} className="btn btn-xs gap-1 bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 disabled:opacity-60">
      {busy === k ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {children}
    </button>
  );
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-2">
      <div className="text-xs font-semibold text-gray-800">Professional export</div>
      <div className="flex flex-wrap gap-1.5">
        {floors.map(f => (
          <Btn key={f.floor} k={`dxf-${f.floor}`} onClick={() => download('dxf', f.floor)}>DXF — {f.floor === 0 ? 'ground floor' : f.floorLabel}</Btn>
        ))}
        <Btn k="ifc-all" onClick={() => download('ifc')}>IFC — whole building</Btn>
      </div>
      <p className="text-[10px] text-gray-500">DXF opens in AutoCAD, BricsCAD and LibreCAD (millimetres, one file per floor). IFC opens in Revit, ArchiCAD and BIM viewers. Preliminary: walls are drawn as centre lines and are not yet cut at openings.</p>
      {error && <p className="text-[11px] text-red-700">{error}</p>}
    </div>
  );
};

export default ProfessionalExport;
