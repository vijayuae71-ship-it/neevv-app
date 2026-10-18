'use client';

import React from 'react';
import type { Layout } from '../types';

/**
 * Computed floor plan — drawn directly from the locked planner geometry (no AI).
 * Every room size, opening position and offset shown here is the same data that feeds
 * the working drawings, structure, BBS and BOQ.
 */
const FT = 0.3048;
const FILL: Record<string, string> = {
  toilet: '#e3eef9', kitchen: '#fbeee0', staircase: '#ececec', puja: '#fdf5d6', utility: '#e8f0f8',
  balcony: '#e8f3e8', store: '#f3f3f3', passage: '#fafafa', parking: '#f0f0f0',
};

interface Props { layout: Layout; facing: string; floorIndex?: number; compact?: boolean }

export const PlanSketch: React.FC<Props> = ({ layout, facing, floorIndex, compact = false }) => {
  const floors = floorIndex === undefined ? layout.floors : layout.floors.filter((f) => f.floor === floorIndex);
  const pw = layout.plotWidthM, pd = layout.plotDepthM;
  const W = layout.buildableWidthM, D = layout.buildableDepthM;
  const off = layout.setbacks;
  const s = compact ? 22 : 36;
  const pad = 14, gap = 18, head = 18, road = 18;
  const plotW = pw * s, plotD = pd * s;
  const totalW = pad * 2 + floors.length * plotW + (floors.length - 1) * gap;
  const totalH = pad * 2 + head + plotD + road + 4;
  const ops = layout.openingsSchedule?.openings ?? [];

  return (
    <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" style={{ maxHeight: compact ? 340 : 620, background: '#fff' }} fontFamily="Helvetica, Arial, sans-serif" role="img" aria-label={`${layout.name} computed floor plan`}>
      {floors.map((f, i) => {
        const ox = pad + i * (plotW + gap), oy = pad + head;
        // Road at the bottom, viewed from outside: app x (left→right looking toward the road) is flipped on screen.
        const bx = (x: number, w: number) => ox + (off.right + (W - x - w)) * s;
        const by = (y: number, d: number) => oy + plotD - off.front * s - (y + d) * s;
        const byId = new Map(f.rooms.map((r) => [r.id, r]));
        return (
          <g key={f.floor}>
            <text x={ox} y={oy - 5} fontSize={11} fontWeight={700} fill="#c2410c">{f.floorLabel}</text>
            <rect x={ox} y={oy} width={plotW} height={plotD} fill="#f7f8f5" stroke="#9ca3af" />
            {f.rooms.map((r) => {
              const x = bx(r.x, r.width), y = by(r.y, r.depth), w = r.width * s, h = r.depth * s;
              const small = w < 2.7 * s || h < 2.2 * s;
              const fs0 = compact ? (small ? 5.5 : 7) : (small ? 8 : 10);
              const label = r.type === 'staircase' ? 'Stair' : r.name;
              const fs = Math.min(fs0, (w * 0.92) / Math.max(1, label.length * 0.58));
              return (
                <g key={r.id}>
                  <rect x={x} y={y} width={w} height={h} fill={FILL[r.type] ?? '#ffffff'} stroke="#374151" strokeWidth={1.2} />
                  {r.type === 'staircase' && Array.from({ length: 7 }, (_, k) => (
                    <line key={k} x1={x + w * 0.25 + (k + 1) * (w * 0.7 / 8)} y1={y} x2={x + w * 0.25 + (k + 1) * (w * 0.7 / 8)} y2={y + h} stroke="#a3a3a3" strokeWidth={0.7} />
                  ))}
                  <text x={x + w / 2} y={y + h / 2 - 1} textAnchor="middle" fontSize={fs} fontWeight={700} fill="#1f2937">{label}</text>
                  <text x={x + w / 2} y={y + h / 2 + fs + 1} textAnchor="middle" fontSize={fs * 0.9} fill="#4b5563">
                    {small ? `${Math.round(r.width * 1000)}×${Math.round(r.depth * 1000)}` : `${Math.round(r.width * 1000)} × ${Math.round(r.depth * 1000)} mm`}
                  </text>
                  {!small && !compact && (
                    <text x={x + w / 2} y={y + h / 2 + 2 * fs + 2} textAnchor="middle" fontSize={fs * 0.8} fill="#9ca3af">{(r.width / FT).toFixed(1)}′ × {(r.depth / FT).toFixed(1)}′</text>
                  )}
                </g>
              );
            })}
            {ops.filter((o) => (o.floor ?? 0) === f.floor && o.roomId && o.face && o.positionMm !== undefined).map((o) => {
              const r = byId.get(o.roomId!);
              if (!r) return null;
              const half = (o.widthMm / 1000) * s / 2;
              const p = o.positionMm! / 1000;
              let x1: number, y1: number, x2: number, y2: number;
              if (o.face === 'front' || o.face === 'rear') {
                const cx = bx(r.x + p, 0);
                const yy = o.face === 'front' ? by(r.y, 0) : by(r.y + r.depth, 0);
                x1 = cx - half; x2 = cx + half; y1 = y2 = yy;
              } else {
                const cy = by(r.y + p, 0);
                const xx = o.face === 'left' ? bx(r.x, 0) : bx(r.x + r.width, 0);
                y1 = cy - half; y2 = cy + half; x1 = x2 = xx;
              }
              const isDoor = o.type === 'door';
              return (
                <g key={o.id}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={isDoor ? (o.main ? '#c2410c' : '#ffffff') : o.type === 'window' ? '#2563eb' : '#60a5fa'} strokeWidth={isDoor ? 3.2 : 2.4} />
                </g>
              );
            })}
            <rect x={bx(0, W)} y={by(0, D)} width={W * s} height={D * s} fill="none" stroke="#111827" strokeWidth={2.6} />
            <rect x={ox} y={oy + plotD + 3} width={plotW} height={road - 4} fill="#e5e7eb" />
            <text x={ox + plotW / 2} y={oy + plotD + road - 5} textAnchor="middle" fontSize={8} fill="#374151">ROAD ({facing.toUpperCase()})</text>
          </g>
        );
      })}
    </svg>
  );
};
