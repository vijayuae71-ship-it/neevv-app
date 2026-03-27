'use client';

import React, { useState, useMemo } from 'react';
import { Layout, Room, RoomInterior, FurnitureItem } from '../types';

/* ───────────────────── constants ───────────────────── */
const SC = 50;          // 1 m = 50 px
const MARGIN = 60;
const WALL_THICK = 0.23; // 230 mm
const FONT = 'monospace';
const WT = WALL_THICK * SC; // wall thickness in px

/* ───────────────────── types ───────────────────── */
interface Props { layout: Layout; rooms: RoomInterior[]; }
type DrawingTab = 'furniture' | 'ceiling' | 'electrical' | 'woodwork' | 'flooring';

interface PlacedFurniture extends FurnitureItem {
  px: number; py: number; rotation: number;
  wPx: number; dPx: number;
}

/* ───────────────────── helpers ───────────────────── */
const mm = (v: number) => `${Math.round(v)}`;
const m2mm = (v: number) => Math.round(v * 1000);
const mToLabel = (v: number) => `${m2mm(v)}`;

function getInterior(room: Room, rooms: RoomInterior[]): RoomInterior | undefined {
  return rooms.find(r => r.roomId === room.id) || rooms.find(r => r.roomName === room.name);
}

/* ═══════════════════════════════════════════════════════
   ROOM OUTLINES — thick walls, hatching, doors, windows
   ═══════════════════════════════════════════════════════ */
function RoomOutlines({ room, ox, oy }: { room: Room; ox: number; oy: number }) {
  const W = room.width * SC;
  const D = room.depth * SC;
  const wt = WT;
  const elements: React.ReactElement[] = [];
  const rt = room.type as string;

  // Outer wall rect
  elements.push(
    <rect key="outer" x={ox} y={oy} width={W} height={D}
      fill="none" stroke="#111" strokeWidth={2.8} />
  );

  // Inner wall rect
  elements.push(
    <rect key="inner" x={ox + wt} y={oy + wt} width={W - 2 * wt} height={D - 2 * wt}
      fill="none" stroke="#111" strokeWidth={1.2} />
  );

  // Wall hatching on all 4 walls
  const hatchId = `hatch-${room.id}`;
  elements.push(
    <defs key="hatch-defs">
      <pattern id={hatchId} width={5} height={5} patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={5} stroke="#666" strokeWidth={0.5} />
      </pattern>
    </defs>
  );

  // Top wall
  elements.push(<rect key="ht" x={ox} y={oy} width={W} height={wt} fill={`url(#${hatchId})`} stroke="none" />);
  // Bottom wall
  elements.push(<rect key="hb" x={ox} y={oy + D - wt} width={W} height={wt} fill={`url(#${hatchId})`} stroke="none" />);
  // Left wall
  elements.push(<rect key="hl" x={ox} y={oy} width={wt} height={D} fill={`url(#${hatchId})`} stroke="none" />);
  // Right wall
  elements.push(<rect key="hr" x={ox + W - wt} y={oy} width={wt} height={D} fill={`url(#${hatchId})`} stroke="none" />);

  // ── Door Opening ──
  const doorW = 0.9 * SC; // 900mm
  const doorPos = getDoorPosition(rt, W, D, wt);
  if (doorPos) {
    const { x: dx, y: dy, w: dw, h: dh, arcCx, arcCy, arcR, arcStart, arcEnd, wall } = doorPos;
    // Clear wall area for door
    elements.push(
      <rect key="door-clear" x={ox + dx} y={oy + dy} width={dw} height={dh} fill="#fff" stroke="none" />
    );
    // Door threshold lines
    if (wall === 'bottom' || wall === 'top') {
      elements.push(<line key="door-l1" x1={ox + dx} y1={oy + dy} x2={ox + dx} y2={oy + dy + dh} stroke="#111" strokeWidth={1.8} />);
      elements.push(<line key="door-l2" x1={ox + dx + dw} y1={oy + dy} x2={ox + dx + dw} y2={oy + dy + dh} stroke="#111" strokeWidth={1.8} />);
    } else {
      elements.push(<line key="door-l1" x1={ox + dx} y1={oy + dy} x2={ox + dx + dw} y2={oy + dy} stroke="#111" strokeWidth={1.8} />);
      elements.push(<line key="door-l2" x1={ox + dx} y1={oy + dy + dh} x2={ox + dx + dw} y2={oy + dy + dh} stroke="#111" strokeWidth={1.8} />);
    }
    // Door arc swing
    const arcPath = describeArc(ox + arcCx, oy + arcCy, arcR, arcStart, arcEnd);
    elements.push(<path key="door-arc" d={arcPath} fill="none" stroke="#111" strokeWidth={0.8} strokeDasharray="3,2" />);
    // Door leaf
    const leafPath = doorLeafLine(ox + arcCx, oy + arcCy, arcR, arcStart);
    elements.push(<line key="door-leaf" x1={ox + arcCx} y1={oy + arcCy} x2={leafPath.x} y2={leafPath.y} stroke="#111" strokeWidth={1.5} />);
  }

  // ── Window Opening ──
  const winSpec = getWindowSpec(rt, W, D, wt);
  if (winSpec) {
    const { x: wx, y: wy, w: ww, h: wh, wall: wWall } = winSpec;
    // Clear wall for window
    elements.push(<rect key="win-clear" x={ox + wx} y={oy + wy} width={ww} height={wh} fill="#fff" stroke="none" />);
    // Two parallel lines (glass)
    if (wWall === 'top' || wWall === 'bottom') {
      const midY = wy + wh / 2;
      elements.push(<line key="win-g1" x1={ox + wx} y1={oy + midY - 1.5} x2={ox + wx + ww} y2={oy + midY - 1.5} stroke="#111" strokeWidth={1} />);
      elements.push(<line key="win-g2" x1={ox + wx} y1={oy + midY + 1.5} x2={ox + wx + ww} y2={oy + midY + 1.5} stroke="#111" strokeWidth={1} />);
      // Cross pattern between glass lines
      const step = 8;
      for (let i = 0; i * step < ww; i++) {
        const cx = wx + i * step + step / 2;
        if (cx < wx + ww) {
          elements.push(<line key={`win-x-${i}`} x1={ox + cx - 2} y1={oy + midY - 1.5} x2={ox + cx + 2} y2={oy + midY + 1.5} stroke="#111" strokeWidth={0.5} />);
        }
      }
    } else {
      const midX = wx + ww / 2;
      elements.push(<line key="win-g1" x1={ox + midX - 1.5} y1={oy + wy} x2={ox + midX - 1.5} y2={oy + wy + wh} stroke="#111" strokeWidth={1} />);
      elements.push(<line key="win-g2" x1={ox + midX + 1.5} y1={oy + wy} x2={ox + midX + 1.5} y2={oy + wy + wh} stroke="#111" strokeWidth={1} />);
      const step = 8;
      for (let i = 0; i * step < wh; i++) {
        const cy = wy + i * step + step / 2;
        if (cy < wy + wh) {
          elements.push(<line key={`win-x-${i}`} x1={ox + midX - 1.5} y1={oy + cy - 2} x2={ox + midX + 1.5} y2={oy + cy + 2} stroke="#111" strokeWidth={0.5} />);
        }
      }
    }
    // Window end lines
    if (wWall === 'top' || wWall === 'bottom') {
      elements.push(<line key="win-e1" x1={ox + wx} y1={oy + wy} x2={ox + wx} y2={oy + wy + wh} stroke="#111" strokeWidth={1.2} />);
      elements.push(<line key="win-e2" x1={ox + wx + ww} y1={oy + wy} x2={ox + wx + ww} y2={oy + wy + wh} stroke="#111" strokeWidth={1.2} />);
    } else {
      elements.push(<line key="win-e1" x1={ox + wx} y1={oy + wy} x2={ox + wx + ww} y2={oy + wy} stroke="#111" strokeWidth={1.2} />);
      elements.push(<line key="win-e2" x1={ox + wx} y1={oy + wy + wh} x2={ox + wx + ww} y2={oy + wy + wh} stroke="#111" strokeWidth={1.2} />);
    }
  }

  // Room label
  elements.push(
    <text key="label" x={ox + W / 2} y={oy + D / 2} textAnchor="middle"
      dominantBaseline="central" fontSize={8} fontFamily={FONT} fontWeight="bold" fill="#222">
      {room.name.toUpperCase()}
    </text>
  );
  elements.push(
    <text key="size" x={ox + W / 2} y={oy + D / 2 + 11} textAnchor="middle"
      fontSize={6.5} fontFamily={FONT} fill="#555">
      {mToLabel(room.width)} × {mToLabel(room.depth)}
    </text>
  );

  return <g>{elements}</g>;
}

/* ── Door position helpers ── */
function getDoorPosition(rt: string, W: number, D: number, wt: number) {
  const doorW = 0.9 * SC;
  const centerX = (W - doorW) / 2;
  const centerY = (D - doorW) / 2;

  if (rt === 'toilet') {
    // Door on left wall, centered
    return {
      x: 0, y: centerY, w: wt, h: doorW, wall: 'left' as 'left' | 'bottom' | 'top',
      arcCx: wt, arcCy: centerY, arcR: doorW, arcStart: -90, arcEnd: 0,
    };
  }
  if (rt === 'kitchen') {
    // Door on bottom wall
    return {
      x: centerX, y: D - wt, w: doorW, h: wt, wall: 'bottom' as 'left' | 'bottom' | 'top',
      arcCx: centerX, arcCy: D - wt, arcR: doorW, arcStart: 0, arcEnd: -90,
    };
  }
  // Default: door on bottom wall, left-of-center
  const dx = Math.max(wt + 5, W * 0.2);
  return {
    x: dx, y: D - wt, w: doorW, h: wt, wall: 'bottom' as 'left' | 'bottom' | 'top',
    arcCx: dx, arcCy: D - wt, arcR: doorW, arcStart: 0, arcEnd: -90,
  };
}

/* ── Window spec helpers ── */
function getWindowSpec(rt: string, W: number, D: number, wt: number) {
  if (rt === 'toilet') {
    const winW = 0.6 * SC;
    return { x: (W - winW) / 2, y: 0, w: winW, h: wt, wall: 'top' as 'left' | 'bottom' | 'top' };
  }
  if (rt === 'kitchen') {
    const winW = 0.9 * SC;
    return { x: (W - winW) / 2, y: 0, w: winW, h: wt, wall: 'top' as 'left' | 'bottom' | 'top' };
  }
  if (rt === 'living' || rt === 'dining') {
    const winW = 1.5 * SC;
    return { x: (W - winW) / 2, y: 0, w: winW, h: wt, wall: 'top' as 'left' | 'bottom' | 'top' };
  }
  if (rt === 'balcony' || rt === 'parking' || rt === 'staircase') {
    return null;
  }
  // Bedrooms and others: 1200mm window on top wall
  const winW = 1.2 * SC;
  return { x: (W - winW) / 2, y: 0, w: winW, h: wt, wall: 'top' as 'left' | 'bottom' | 'top' };
}

/* ── Arc path description ── */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (a: number) => (a * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(startAngle));
  const sy = cy + r * Math.sin(toRad(startAngle));
  const ex = cx + r * Math.cos(toRad(endAngle));
  const ey = cy + r * Math.sin(toRad(endAngle));
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} ${sweep} ${ex} ${ey}`;
}

function doorLeafLine(cx: number, cy: number, r: number, angle: number) {
  const toRad = (a: number) => (a * Math.PI) / 180;
  return { x: cx + r * Math.cos(toRad(angle)), y: cy + r * Math.sin(toRad(angle)) };
}

/* ═══════════════════════════════════════════════════════
   DIMENSION CHAINS
   ═══════════════════════════════════════════════════════ */
function DimensionChains({ room, ox, oy }: { room: Room; ox: number; oy: number }) {
  const W = room.width * SC;
  const D = room.depth * SC;
  const offset = 14;
  const tickLen = 4;
  const elements: React.ReactElement[] = [];

  // Bottom dimension (width)
  const by = oy + D + offset;
  elements.push(<line key="db-line" x1={ox} y1={by} x2={ox + W} y2={by} stroke="#333" strokeWidth={0.5} />);
  // Extension lines
  elements.push(<line key="db-ext1" x1={ox} y1={oy + D + 2} x2={ox} y2={by + 4} stroke="#333" strokeWidth={0.4} />);
  elements.push(<line key="db-ext2" x1={ox + W} y1={oy + D + 2} x2={ox + W} y2={by + 4} stroke="#333" strokeWidth={0.4} />);
  // Tick marks (45° slash)
  elements.push(<line key="db-t1" x1={ox - tickLen / 2} y1={by + tickLen / 2} x2={ox + tickLen / 2} y2={by - tickLen / 2} stroke="#333" strokeWidth={0.7} />);
  elements.push(<line key="db-t2" x1={ox + W - tickLen / 2} y1={by + tickLen / 2} x2={ox + W + tickLen / 2} y2={by - tickLen / 2} stroke="#333" strokeWidth={0.7} />);
  // Label
  elements.push(
    <text key="db-txt" x={ox + W / 2} y={by - 2} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#333">
      {mToLabel(room.width)}
    </text>
  );

  // Right dimension (depth)
  const rx = ox + W + offset;
  elements.push(<line key="dr-line" x1={rx} y1={oy} x2={rx} y2={oy + D} stroke="#333" strokeWidth={0.5} />);
  elements.push(<line key="dr-ext1" x1={ox + W + 2} y1={oy} x2={rx + 4} y2={oy} stroke="#333" strokeWidth={0.4} />);
  elements.push(<line key="dr-ext2" x1={ox + W + 2} y1={oy + D} x2={rx + 4} y2={oy + D} stroke="#333" strokeWidth={0.4} />);
  elements.push(<line key="dr-t1" x1={rx - tickLen / 2} y1={oy + tickLen / 2} x2={rx + tickLen / 2} y2={oy - tickLen / 2} stroke="#333" strokeWidth={0.7} />);
  elements.push(<line key="dr-t2" x1={rx - tickLen / 2} y1={oy + D + tickLen / 2} x2={rx + tickLen / 2} y2={oy + D - tickLen / 2} stroke="#333" strokeWidth={0.7} />);
  elements.push(
    <text key="dr-txt" x={rx + 2} y={oy + D / 2} textAnchor="start" fontSize={6} fontFamily={FONT} fill="#333"
      transform={`rotate(90, ${rx + 2}, ${oy + D / 2})`}>
      {mToLabel(room.depth)}
    </text>
  );

  return <g>{elements}</g>;
}

/* ═══════════════════════════════════════════════════════
   CONTEXTUAL FURNITURE PLACEMENT
   ═══════════════════════════════════════════════════════ */
function placeFurnitureContextual(items: FurnitureItem[], room: Room): PlacedFurniture[] {
  const rW = room.width * SC;
  const rD = room.depth * SC;
  const wt = WT;
  const clearance = 0.6 * SC; // 600mm
  const placed: PlacedFurniture[] = [];
  const occupied: { x: number; y: number; w: number; d: number }[] = [];

  const doesOverlap = (x: number, y: number, w: number, d: number) => {
    return occupied.some(o =>
      x < o.x + o.w && x + w > o.x && y < o.y + o.d && y + d > o.y
    );
  };

  const place = (item: FurnitureItem, px: number, py: number, rotation: number) => {
    const wPx = (item.widthMM / 1000) * SC;
    const dPx = (item.depthMM / 1000) * SC;
    const actualW = rotation === 90 || rotation === 270 ? dPx : wPx;
    const actualD = rotation === 90 || rotation === 270 ? wPx : dPx;
    placed.push({ ...item, px, py, rotation, wPx: actualW, dPx: actualD });
    occupied.push({ x: px, y: py, w: actualW, d: actualD });
  };

  // Sort by priority
  const priority: Record<string, number> = {
    bed: 1, kitchen_cabinet: 1, sofa: 2, wardrobe: 3, tv_unit: 4,
    dining_table: 5, study_table: 6, dressing: 7, center_table: 8,
    bookshelf: 9, shoe_rack: 10, pooja_unit: 11, console: 12, side_table: 13,
    crockery: 14, bar_unit: 15,
  };
  const sorted = [...items].sort((a, b) => (priority[a.category] || 20) - (priority[b.category] || 20));

  for (const item of sorted) {
    const wPx = (item.widthMM / 1000) * SC;
    const dPx = (item.depthMM / 1000) * SC;

    let px = wt + 5;
    let py = wt + 5;
    let rotation = 0;

    switch (item.category) {
      case 'bed':
        // Against top wall, centered
        px = (rW - wPx) / 2;
        py = wt + 2;
        break;
      case 'wardrobe':
        // Left wall, near bottom (near door)
        px = wt + 2;
        py = rD - wt - dPx - clearance;
        rotation = 0;
        if (doesOverlap(px, py, wPx, dPx)) {
          // Try right wall
          px = rW - wt - wPx - 2;
          py = wt + 2;
        }
        break;
      case 'sofa':
        // Against bottom wall (facing up toward TV)
        px = (rW - wPx) / 2;
        py = rD - wt - dPx - 5;
        break;
      case 'tv_unit':
        // Against top wall, centered
        px = (rW - wPx) / 2;
        py = wt + 3;
        if (doesOverlap(px, py, wPx, dPx)) {
          py = wt + 3;
          px = wt + 5;
        }
        break;
      case 'center_table' as any:
        // Center of room
        px = (rW - wPx) / 2;
        py = (rD - dPx) / 2;
        break;
      case 'dining_table':
        // Center of room
        px = (rW - wPx) / 2;
        py = (rD - dPx) / 2;
        break;
      case 'kitchen_cabinet':
        // L-shape along top and left wall
        px = wt + 2;
        py = wt + 2;
        break;
      case 'study_table':
        // Against right wall near window (top)
        px = rW - wt - wPx - 3;
        py = wt + clearance;
        if (doesOverlap(px, py, wPx, dPx)) {
          py = rD / 2;
        }
        break;
      case 'dressing':
        // Near wardrobe or right wall
        px = rW - wt - wPx - 3;
        py = rD - wt - dPx - 5;
        if (doesOverlap(px, py, wPx, dPx)) {
          px = wt + 5;
          py = rD / 2;
        }
        break;
      case 'shoe_rack':
        // Near door (bottom wall, left side)
        px = wt + 5;
        py = rD - wt - dPx - 3;
        break;
      case 'bookshelf':
        // Against a side wall
        px = rW - wt - wPx - 3;
        py = rD / 3;
        break;
      case 'pooja_unit':
        // Top right corner (northeast)
        px = rW - wt - wPx - 3;
        py = wt + 3;
        break;
      default:
        // Fallback: find open spot along walls
        px = wt + 5;
        py = wt + occupied.length * (dPx + 5);
        if (py + dPx > rD - wt) {
          py = wt + 5;
          px = wt + occupied.length * (wPx + 5);
        }
    }

    // Clamp within room
    px = Math.max(wt + 1, Math.min(px, rW - wt - wPx - 1));
    py = Math.max(wt + 1, Math.min(py, rD - wt - dPx - 1));

    // If still overlapping, nudge
    let attempts = 0;
    while (doesOverlap(px, py, wPx, dPx) && attempts < 20) {
      py += dPx + 3;
      if (py + dPx > rD - wt) {
        py = wt + 3;
        px += wPx + 3;
      }
      attempts++;
    }
    px = Math.max(wt + 1, Math.min(px, rW - wt - wPx - 1));
    py = Math.max(wt + 1, Math.min(py, rD - wt - dPx - 1));

    place(item, px, py, rotation);
  }

  return placed;
}

/* ═══════════════════════════════════════════════════════
   DETAILED FURNITURE SHAPES
   ═══════════════════════════════════════════════════════ */
function FurnitureShape({ item, ox, oy }: { item: PlacedFurniture; ox: number; oy: number; key?: React.Key }) {
  const x = ox + item.px;
  const y = oy + item.py;
  const w = item.wPx;
  const d = item.dPx;
  const els: React.ReactElement[] = [];

  switch (item.category) {
    case 'bed': {
      // Mattress outline
      els.push(<rect key="mattress" x={x} y={y} width={w} height={d} rx={3} fill="#f5f0e8" stroke="#333" strokeWidth={1.2} />);
      // Headboard
      els.push(<rect key="headboard" x={x} y={y} width={w} height={5} fill="#555" stroke="#333" strokeWidth={1} />);
      // Pillows
      const pillowW = w * 0.35;
      const pillowH = d * 0.12;
      const pillowY = y + 8;
      els.push(<rect key="p1" x={x + w * 0.08} y={pillowY} width={pillowW} height={pillowH} rx={3} fill="#e8e0d0" stroke="#666" strokeWidth={0.6} />);
      els.push(<rect key="p2" x={x + w - w * 0.08 - pillowW} y={pillowY} width={pillowW} height={pillowH} rx={3} fill="#e8e0d0" stroke="#666" strokeWidth={0.6} />);
      // Center line
      els.push(<line key="cl" x1={x + w / 2} y1={y + 8 + pillowH + 4} x2={x + w / 2} y2={y + d - 4} stroke="#aaa" strokeWidth={0.4} strokeDasharray="4,3" />);
      break;
    }
    case 'sofa': {
      // Back rest
      els.push(<rect key="back" x={x} y={y + d - 6} width={w} height={6} rx={2} fill="#bbb" stroke="#333" strokeWidth={1} />);
      // Seat
      els.push(<rect key="seat" x={x + 4} y={y} width={w - 8} height={d - 6} rx={2} fill="#ddd" stroke="#333" strokeWidth={1} />);
      // Cushion divisions
      const cushions = Math.min(3, Math.max(2, Math.round(w / 30)));
      const cw = (w - 8) / cushions;
      for (let i = 1; i < cushions; i++) {
        els.push(<line key={`cd-${i}`} x1={x + 4 + i * cw} y1={y + 2} x2={x + 4 + i * cw} y2={y + d - 8} stroke="#999" strokeWidth={0.5} />);
      }
      // Armrests
      els.push(<rect key="ar-l" x={x} y={y} width={4} height={d - 6} rx={1.5} fill="#aaa" stroke="#333" strokeWidth={0.8} />);
      els.push(<rect key="ar-r" x={x + w - 4} y={y} width={4} height={d - 6} rx={1.5} fill="#aaa" stroke="#333" strokeWidth={0.8} />);
      break;
    }
    case 'dining_table': {
      // Table
      const tableInset = 6;
      els.push(<rect key="table" x={x + tableInset} y={y + tableInset} width={w - 2 * tableInset} height={d - 2 * tableInset} rx={4} fill="#e8dcc8" stroke="#333" strokeWidth={1.2} />);
      // Chairs (small rects around table)
      const chairW = 7;
      const chairD = 5;
      // Top side chairs
      const topChairs = Math.max(2, Math.round((w - 2 * tableInset) / 25));
      for (let i = 0; i < topChairs; i++) {
        const cx = x + tableInset + ((w - 2 * tableInset) / (topChairs + 1)) * (i + 1) - chairW / 2;
        els.push(<rect key={`ct-${i}`} x={cx} y={y} width={chairW} height={chairD} rx={1} fill="#999" stroke="#333" strokeWidth={0.6} />);
      }
      // Bottom side chairs
      for (let i = 0; i < topChairs; i++) {
        const cx = x + tableInset + ((w - 2 * tableInset) / (topChairs + 1)) * (i + 1) - chairW / 2;
        els.push(<rect key={`cb-${i}`} x={cx} y={y + d - chairD} width={chairW} height={chairD} rx={1} fill="#999" stroke="#333" strokeWidth={0.6} />);
      }
      // Side chairs if table is long
      if (d > 40) {
        els.push(<rect key="cl" x={x} y={y + d / 2 - chairW / 2} width={chairD} height={chairW} rx={1} fill="#999" stroke="#333" strokeWidth={0.6} />);
        els.push(<rect key="cr" x={x + w - chairD} y={y + d / 2 - chairW / 2} width={chairD} height={chairW} rx={1} fill="#999" stroke="#333" strokeWidth={0.6} />);
      }
      break;
    }
    case 'wardrobe': {
      // Main body
      els.push(<rect key="body" x={x} y={y} width={w} height={d} fill="#f0e6d2" stroke="#333" strokeWidth={1.2} />);
      // Shutter divisions
      const shutters = Math.max(2, Math.round(w / 25));
      for (let i = 1; i < shutters; i++) {
        els.push(<line key={`sh-${i}`} x1={x + (w / shutters) * i} y1={y} x2={x + (w / shutters) * i} y2={y + d} stroke="#666" strokeWidth={0.7} />);
      }
      // Handles (small circles)
      for (let i = 0; i < shutters; i++) {
        const hx = x + (w / shutters) * i + (w / shutters) / 2;
        els.push(<circle key={`handle-${i}`} cx={hx + 3} cy={y + d / 2} r={1.5} fill="#555" stroke="#333" strokeWidth={0.4} />);
        els.push(<circle key={`handle2-${i}`} cx={hx - 3} cy={y + d / 2} r={1.5} fill="#555" stroke="#333" strokeWidth={0.4} />);
      }
      // Diagonal wood-grain hatching
      for (let i = 0; i < shutters; i++) {
        const sx = x + (w / shutters) * i;
        const sw = w / shutters;
        for (let j = 0; j < 3; j++) {
          const ly = y + d * 0.25 * (j + 1);
          els.push(<line key={`grain-${i}-${j}`} x1={sx + 2} y1={ly} x2={sx + sw - 2} y2={ly - 4} stroke="#c4a87c" strokeWidth={0.3} />);
        }
      }
      break;
    }
    case 'kitchen_cabinet': {
      // L-shape or straight counter
      els.push(<rect key="counter" x={x} y={y} width={w} height={d} fill="#e8dcc8" stroke="#333" strokeWidth={1.2} />);
      // Sink (circle in rect)
      const sinkX = x + w * 0.3;
      const sinkY = y + d * 0.3;
      els.push(<rect key="sink-r" x={sinkX - 8} y={sinkY - 5} width={16} height={10} rx={2} fill="none" stroke="#555" strokeWidth={0.8} />);
      els.push(<circle key="sink-c" cx={sinkX} cy={sinkY} r={4} fill="none" stroke="#555" strokeWidth={0.8} />);
      // Hob (3 circles)
      const hobX = x + w * 0.7;
      const hobY = y + d * 0.4;
      els.push(<circle key="hob1" cx={hobX - 7} cy={hobY} r={4} fill="none" stroke="#555" strokeWidth={0.7} />);
      els.push(<circle key="hob2" cx={hobX + 7} cy={hobY} r={4} fill="none" stroke="#555" strokeWidth={0.7} />);
      els.push(<circle key="hob3" cx={hobX} cy={hobY - 9} r={3.5} fill="none" stroke="#555" strokeWidth={0.7} />);
      // Chimney hood outline
      els.push(<rect key="chimney" x={hobX - 12} y={y} width={24} height={6} fill="none" stroke="#555" strokeWidth={0.6} strokeDasharray="3,2" />);
      break;
    }
    case 'tv_unit': {
      els.push(<rect key="body" x={x} y={y} width={w} height={d} fill="#e0d8cc" stroke="#333" strokeWidth={1} />);
      // Shelf lines
      for (let i = 1; i <= 2; i++) {
        els.push(<line key={`shelf-${i}`} x1={x + 2} y1={y + (d / 3) * i} x2={x + w - 2} y2={y + (d / 3) * i} stroke="#888" strokeWidth={0.5} />);
      }
      // TV screen outline above
      const tvW = w * 0.7;
      els.push(<rect key="tv" x={x + (w - tvW) / 2} y={y - 3} width={tvW} height={2} fill="#222" stroke="#111" strokeWidth={0.6} />);
      break;
    }
    case 'study_table': {
      els.push(<rect key="desk" x={x} y={y} width={w} height={d} rx={1} fill="#e8dcc8" stroke="#333" strokeWidth={1} />);
      // Chair
      els.push(<rect key="chair" x={x + w / 2 - 5} y={y + d + 2} width={10} height={7} rx={2} fill="#aaa" stroke="#333" strokeWidth={0.6} />);
      break;
    }
    case 'center_table' as any: {
      els.push(<rect key="ct" x={x} y={y} width={w} height={d} rx={4} fill="#e0d8cc" stroke="#333" strokeWidth={0.8} />);
      // Cross pattern
      els.push(<line key="cx1" x1={x + 3} y1={y + 3} x2={x + w - 3} y2={y + d - 3} stroke="#ccc" strokeWidth={0.3} />);
      els.push(<line key="cx2" x1={x + w - 3} y1={y + 3} x2={x + 3} y2={y + d - 3} stroke="#ccc" strokeWidth={0.3} />);
      break;
    }
    case 'dressing': {
      els.push(<rect key="body" x={x} y={y} width={w} height={d} fill="#f0e6d2" stroke="#333" strokeWidth={1} />);
      // Mirror (oval)
      els.push(<ellipse key="mirror" cx={x + w / 2} cy={y + d * 0.35} rx={w * 0.3} ry={d * 0.2} fill="#e8f4f8" stroke="#888" strokeWidth={0.6} />);
      break;
    }
    default: {
      els.push(<rect key="generic" x={x} y={y} width={w} height={d} rx={1} fill="#eee" stroke="#333" strokeWidth={0.8} />);
    }
  }

  // Label
  els.push(
    <text key="lbl" x={x + w / 2} y={y + d + 8} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#444">
      {item.name}
    </text>
  );
  els.push(
    <text key="dim" x={x + w / 2} y={y + d + 14} textAnchor="middle" fontSize={4.5} fontFamily={FONT} fill="#888">
      {item.widthMM}×{item.depthMM}
    </text>
  );

  return <g>{els}</g>;
}

/* ═══════════════════════════════════════════════════════
   MATERIAL CALLOUT LEADERS
   ═══════════════════════════════════════════════════════ */
function MaterialCallout({ x, y, label, targetX, targetY }: {
  x: number; y: number; label: string; targetX: number; targetY: number;
}) {
  return (
    <g>
      <line x1={targetX} y1={targetY} x2={x} y2={y} stroke="#555" strokeWidth={0.5} />
      <circle cx={targetX} cy={targetY} r={1.5} fill="#555" />
      <line x1={x} y1={y} x2={x + 30} y2={y} stroke="#555" strokeWidth={0.5} />
      <text x={x + 2} y={y - 3} fontSize={5} fontFamily={FONT} fill="#333">{label}</text>
    </g>
  );
}

/* ═══════════════════════════════════════════════════════
   TITLE BLOCK
   ═══════════════════════════════════════════════════════ */
function TitleBlock({ x, y, title, subtitle }: { x: number; y: number; title: string; subtitle?: string }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x + 220} y2={y} stroke="#111" strokeWidth={1.5} />
      <text x={x} y={y + 14} fontSize={11} fontFamily={FONT} fontWeight="bold" fill="#111">{title}</text>
      {subtitle && (
        <text x={x} y={y + 26} fontSize={7} fontFamily={FONT} fill="#555">{subtitle}</text>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════
   LEGEND
   ═══════════════════════════════════════════════════════ */
function Legend({ x, y, items }: { x: number; y: number; items: { symbol: React.ReactNode; label: string }[] }) {
  return (
    <g>
      <text x={x} y={y} fontSize={7} fontFamily={FONT} fontWeight="bold" fill="#111">LEGEND</text>
      <line x1={x} y1={y + 3} x2={x + 80} y2={y + 3} stroke="#111" strokeWidth={0.5} />
      {items.map((item, i) => (
        <g key={i} transform={`translate(${x}, ${y + 10 + i * 14})`}>
          {item.symbol}
          <text x={16} y={6} fontSize={6} fontFamily={FONT} fill="#333">{item.label}</text>
        </g>
      ))}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════
   FURNITURE LAYOUT PLAN
   ═══════════════════════════════════════════════════════ */
function FurniturePlan({ layout, rooms }: Props) {
  const allRooms = layout.floors.flatMap(f => f.rooms);
  const floor0 = allRooms.filter(r => (r.floor ?? 0) === 0);
  if (floor0.length === 0) return <text x={40} y={40} fontFamily={FONT} fontSize={10}>No rooms found</text>;

  const maxW = Math.max(...floor0.map(r => (r.x + r.width) * SC)) + MARGIN * 2 + 40;
  const maxH = Math.max(...floor0.map(r => (r.y + r.depth) * SC)) + MARGIN * 2 + 80;

  return (
    <svg viewBox={`0 0 ${maxW} ${maxH}`} className="w-full h-auto" style={{ background: '#fff' }}>
      <TitleBlock x={MARGIN} y={12} title="FURNITURE LAYOUT PLAN" subtitle="Scale 1:50 | All dimensions in mm" />
      {floor0.map(room => {
        const ox = room.x * SC + MARGIN;
        const oy = room.y * SC + MARGIN + 40;
        const interior = getInterior(room, rooms);
        const furniture = interior?.furniture || [];
        const placed = placeFurnitureContextual(furniture, room);
        return (
          <g key={room.id}>
            <RoomOutlines room={room} ox={ox} oy={oy} />
            <DimensionChains room={room} ox={ox} oy={oy} />
            {placed.map((item, idx) => (
              <FurnitureShape key={`${item.id}-${idx}`} item={item} ox={ox} oy={oy} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   FALSE CEILING PLAN
   ═══════════════════════════════════════════════════════ */
function CeilingPlan({ layout, rooms }: Props) {
  const allRooms = layout.floors.flatMap(f => f.rooms);
  const floor0 = allRooms.filter(r => (r.floor ?? 0) === 0);
  if (floor0.length === 0) return <text x={40} y={40} fontFamily={FONT} fontSize={10}>No rooms</text>;

  const maxW = Math.max(...floor0.map(r => (r.x + r.width) * SC)) + MARGIN * 2 + 40;
  const svgH = Math.max(...floor0.map(r => (r.y + r.depth) * SC)) + MARGIN * 2 + 200;

  return (
    <svg viewBox={`0 0 ${maxW} ${svgH}`} className="w-full h-auto" style={{ background: '#fff' }}>
      <TitleBlock x={MARGIN} y={12} title="FALSE CEILING PLAN" subtitle="Scale 1:50 | All dimensions in mm" />
      {floor0.map(room => {
        const ox = room.x * SC + MARGIN;
        const oy = room.y * SC + MARGIN + 40;
        const W = room.width * SC;
        const D = room.depth * SC;
        const interior = getInterior(room, rooms);
        const ct = interior?.ceilingType || 'plain';
        const ch = interior?.ceilingHeight || 2.9;

        return (
          <g key={room.id}>
            <RoomOutlines room={room} ox={ox} oy={oy} />
            <DimensionChains room={room} ox={ox} oy={oy} />

            {/* Ceiling representation */}
            {ct === 'plain' && (
              <g>
                <text x={ox + W / 2} y={oy + D / 2 + 20} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#888">
                  PLAIN CEILING @ +{(ch * 1000).toFixed(0)}
                </text>
              </g>
            )}
            {ct === 'false_ceiling_peripheral' && (
              <g>
                {/* Peripheral cove */}
                <rect x={ox + WT + 6} y={oy + WT + 6} width={W - 2 * WT - 12} height={D - 2 * WT - 12}
                  fill="none" stroke="#666" strokeWidth={0.8} strokeDasharray="6,3" />
                <rect x={ox + WT + 16} y={oy + WT + 16} width={W - 2 * WT - 32} height={D - 2 * WT - 32}
                  fill="none" stroke="#999" strokeWidth={0.5} strokeDasharray="4,3" />
                {/* Cove width dimensions */}
                <text x={ox + WT + 11} y={oy + WT + 14} fontSize={5} fontFamily={FONT} fill="#666">225</text>
                {/* Level annotations */}
                <text x={ox + W / 2} y={oy + D / 2 - 5} textAnchor="middle" fontSize={6} fontFamily={FONT} fontWeight="bold" fill="#444">
                  +0 (MAIN)
                </text>
                <text x={ox + WT + 20} y={oy + WT + 28} fontSize={5} fontFamily={FONT} fill="#666">
                  -225mm (COVE)
                </text>
                {/* LED strip dashes */}
                <rect x={ox + WT + 15} y={oy + WT + 15} width={W - 2 * WT - 30} height={D - 2 * WT - 30}
                  fill="none" stroke="#ffcc00" strokeWidth={0.6} strokeDasharray="2,2" />
              </g>
            )}
            {ct === 'false_ceiling_full' && (
              <g>
                <rect x={ox + WT + 4} y={oy + WT + 4} width={W - 2 * WT - 8} height={D - 2 * WT - 8}
                  fill="none" stroke="#666" strokeWidth={1} strokeDasharray="8,3" />
                <text x={ox + W / 2} y={oy + D / 2} textAnchor="middle" fontSize={6} fontFamily={FONT} fontWeight="bold" fill="#444">
                  FULL FALSE CEILING
                </text>
                <text x={ox + W / 2} y={oy + D / 2 + 10} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">
                  -225mm from slab
                </text>
              </g>
            )}
            {ct === 'wooden_ceiling' && (
              <g>
                {/* Wood plank pattern */}
                {Array.from({ length: Math.ceil(D / 12) }).map((_, i) => (
                  <line key={`wp-${i}`} x1={ox + WT + 4} y1={oy + WT + 4 + i * 12}
                    x2={ox + W - WT - 4} y2={oy + WT + 4 + i * 12}
                    stroke="#8B6914" strokeWidth={0.4} />
                ))}
                <text x={ox + W / 2} y={oy + D / 2} textAnchor="middle" fontSize={6} fontFamily={FONT} fontWeight="bold" fill="#5a3e1b">
                  WOODEN CEILING
                </text>
              </g>
            )}

            {/* Light point markers */}
            {interior?.electricalPoints && (
              <g>
                {Array.from({ length: Math.min(interior.electricalPoints.lightPoints, 6) }).map((_, i) => {
                  const cols = Math.min(3, interior!.electricalPoints.lightPoints);
                  const rows = Math.ceil(interior!.electricalPoints.lightPoints / cols);
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const lx = ox + WT + 20 + col * ((W - 2 * WT - 40) / Math.max(1, cols - 1 || 1));
                  const ly = oy + WT + 20 + row * ((D - 2 * WT - 40) / Math.max(1, rows - 1 || 1));
                  return (
                    <g key={`lp-${i}`}>
                      <circle cx={lx} cy={ly} r={3} fill="none" stroke="#333" strokeWidth={0.6} />
                      <line x1={lx - 2} y1={ly} x2={lx + 2} y2={ly} stroke="#333" strokeWidth={0.5} />
                      <line x1={lx} y1={ly - 2} x2={lx} y2={ly + 2} stroke="#333" strokeWidth={0.5} />
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        );
      })}

      {/* Section profile */}
      {(() => {
        const secY = Math.max(...floor0.map(r => (r.y + r.depth) * SC)) + MARGIN + 80;
        const secX = MARGIN;
        const secW = 200;
        const slabTh = 6;
        const dropH = 20;
        return (
          <g key="section">
            <text x={secX} y={secY} fontSize={8} fontFamily={FONT} fontWeight="bold" fill="#111">SECTION PROFILE</text>
            <line x1={secX} y1={secY + 3} x2={secX + secW} y2={secY + 3} stroke="#111" strokeWidth={0.5} />
            {/* Slab */}
            <rect x={secX} y={secY + 15} width={secW} height={slabTh} fill="#ccc" stroke="#333" strokeWidth={1} />
            <text x={secX + secW + 5} y={secY + 20} fontSize={5} fontFamily={FONT} fill="#555">SLAB +0</text>
            {/* Cove drops */}
            <rect x={secX} y={secY + 15 + slabTh} width={30} height={dropH} fill="#ddd" stroke="#333" strokeWidth={0.7} />
            <rect x={secX + secW - 30} y={secY + 15 + slabTh} width={30} height={dropH} fill="#ddd" stroke="#333" strokeWidth={0.7} />
            <text x={secX + secW + 5} y={secY + 15 + slabTh + dropH / 2} fontSize={5} fontFamily={FONT} fill="#555">-225mm</text>
            {/* LED strip */}
            <line x1={secX + 30} y1={secY + 15 + slabTh + dropH - 2} x2={secX + secW - 30} y2={secY + 15 + slabTh + dropH - 2}
              stroke="#ffcc00" strokeWidth={1.5} />
            <text x={secX + secW / 2} y={secY + 15 + slabTh + dropH + 10} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#888">
              LED STRIP (CONCEALED)
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   ELECTRICAL LAYOUT PLAN
   ═══════════════════════════════════════════════════════ */
function ElectricalPlan({ layout, rooms }: Props) {
  const allRooms = layout.floors.flatMap(f => f.rooms);
  const floor0 = allRooms.filter(r => (r.floor ?? 0) === 0);
  if (floor0.length === 0) return <text x={40} y={40} fontFamily={FONT} fontSize={10}>No rooms</text>;

  const maxW = Math.max(...floor0.map(r => (r.x + r.width) * SC)) + MARGIN * 2 + 120;
  const maxH = Math.max(...floor0.map(r => (r.y + r.depth) * SC)) + MARGIN * 2 + 80;

  const legendItems = [
    { symbol: <g><circle cx={5} cy={3} r={3} fill="none" stroke="#d32" strokeWidth={0.8} /><line x1={3} y1={3} x2={7} y2={3} stroke="#d32" strokeWidth={0.6} /></g>, label: 'Switch' },
    { symbol: <g><circle cx={5} cy={3} r={3} fill="none" stroke="#16a" strokeWidth={0.8} /><line x1={2} y1={1} x2={8} y2={5} stroke="#16a" strokeWidth={0.6} /><line x1={2} y1={5} x2={8} y2={1} stroke="#16a" strokeWidth={0.6} /></g>, label: 'Socket' },
    { symbol: <g><circle cx={5} cy={3} r={3} fill="none" stroke="#333" strokeWidth={0.6} /><line x1={3} y1={3} x2={7} y2={3} stroke="#333" strokeWidth={0.5} /><line x1={5} y1={1} x2={5} y2={5} stroke="#333" strokeWidth={0.5} /></g>, label: 'Light Point' },
    { symbol: <g><circle cx={5} cy={3} r={3.5} fill="none" stroke="#070" strokeWidth={0.8} /><text x={5} y={5} textAnchor="middle" fontSize={5} fill="#070">F</text></g>, label: 'Fan Point' },
    { symbol: <g><rect x={2} y={0} width={6} height={6} fill="none" stroke="#c60" strokeWidth={0.8} /><text x={5} y={5} textAnchor="middle" fontSize={5} fill="#c60">AC</text></g>, label: 'AC Point' },
    { symbol: <g><rect x={2} y={0} width={6} height={6} fill="none" stroke="#06c" strokeWidth={0.8} /><text x={5} y={5} textAnchor="middle" fontSize={4} fill="#06c">D</text></g>, label: 'Data Point' },
  ];

  return (
    <svg viewBox={`0 0 ${maxW} ${maxH}`} className="w-full h-auto" style={{ background: '#fff' }}>
      <TitleBlock x={MARGIN} y={12} title="ELECTRICAL LAYOUT PLAN" subtitle="Scale 1:50 | All dimensions in mm" />
      {floor0.map(room => {
        const ox = room.x * SC + MARGIN;
        const oy = room.y * SC + MARGIN + 40;
        const W = room.width * SC;
        const D = room.depth * SC;
        const interior = getInterior(room, rooms);
        const ep = interior?.electricalPoints;
        if (!ep) return <g key={room.id}><RoomOutlines room={room} ox={ox} oy={oy} /><DimensionChains room={room} ox={ox} oy={oy} /></g>;

        const points: { type: string; x: number; y: number; label: string }[] = [];
        let idx = 0;

        // Place electrical points around room perimeter and interior
        // Switches near door (bottom wall, left side)
        for (let i = 0; i < Math.min(ep.switches, 4); i++) {
          points.push({ type: 'switch', x: ox + WT + 10 + i * 12, y: oy + D - WT - 8, label: `S${i + 1}` });
        }
        // Sockets along walls
        const socketPositions = [
          { x: ox + WT + 8, y: oy + D / 2 },
          { x: ox + W - WT - 8, y: oy + D / 2 },
          { x: ox + W / 2, y: oy + WT + 8 },
          { x: ox + W / 2, y: oy + D - WT - 8 },
        ];
        for (let i = 0; i < Math.min(ep.sockets, 4); i++) {
          const pos = socketPositions[i % socketPositions.length];
          points.push({ type: 'socket', x: pos.x + (i >= 4 ? 12 : 0), y: pos.y, label: `P${i + 1}` });
        }
        // Light points - grid
        for (let i = 0; i < Math.min(ep.lightPoints, 6); i++) {
          const cols = Math.min(3, ep.lightPoints);
          const rows = Math.ceil(ep.lightPoints / cols);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const lx = ox + WT + 20 + col * ((W - 2 * WT - 40) / Math.max(1, cols - 1 || 1));
          const ly = oy + WT + 20 + row * ((D - 2 * WT - 40) / Math.max(1, rows - 1 || 1));
          points.push({ type: 'light', x: lx, y: ly, label: `L${i + 1}` });
        }
        // Fan points - center
        for (let i = 0; i < Math.min(ep.fanPoints, 2); i++) {
          points.push({ type: 'fan', x: ox + W / 2 + i * 30, y: oy + D / 2, label: `FAN` });
        }
        // AC points
        for (let i = 0; i < Math.min(ep.acPoints, 2); i++) {
          points.push({ type: 'ac', x: ox + W - WT - 15, y: oy + WT + 10 + i * 20, label: 'AC' });
        }
        // Data points
        for (let i = 0; i < Math.min(ep.dataPoints, 2); i++) {
          points.push({ type: 'data', x: ox + WT + 10 + i * 25, y: oy + WT + 10, label: 'DATA' });
        }

        // DB position (bottom-left)
        const dbX = ox + WT + 5;
        const dbY = oy + D - WT - 20;

        return (
          <g key={room.id}>
            <RoomOutlines room={room} ox={ox} oy={oy} />
            <DimensionChains room={room} ox={ox} oy={oy} />

            {/* Distribution Board */}
            <rect x={dbX} y={dbY} width={10} height={14} fill="#ffe0b2" stroke="#c60" strokeWidth={1} />
            <text x={dbX + 5} y={dbY + 9} textAnchor="middle" fontSize={4} fontFamily={FONT} fontWeight="bold" fill="#c60">DB</text>

            {/* Wiring runs from DB to points */}
            {points.map((pt, i) => (
              <g key={`wire-${i}`}>
                <line x1={dbX + 10} y1={dbY + 7} x2={pt.x} y2={pt.y}
                  stroke={pt.type === 'light' ? '#666' : pt.type === 'socket' ? '#16a' : pt.type === 'switch' ? '#d32' : '#888'}
                  strokeWidth={0.6} strokeDasharray={pt.type === 'light' ? '4,2' : '3,1'} />
              </g>
            ))}

            {/* Point symbols */}
            {points.map((pt, i) => {
              if (pt.type === 'switch') {
                return (
                  <g key={`pt-${i}`}>
                    <circle cx={pt.x} cy={pt.y} r={3.5} fill="#fff" stroke="#d32" strokeWidth={0.9} />
                    <line x1={pt.x - 2} y1={pt.y} x2={pt.x + 2} y2={pt.y} stroke="#d32" strokeWidth={0.7} />
                    <text x={pt.x} y={pt.y - 5} textAnchor="middle" fontSize={4} fontFamily={FONT} fill="#d32">{pt.label}</text>
                  </g>
                );
              }
              if (pt.type === 'socket') {
                return (
                  <g key={`pt-${i}`}>
                    <circle cx={pt.x} cy={pt.y} r={3.5} fill="#fff" stroke="#16a" strokeWidth={0.9} />
                    <line x1={pt.x - 2} y1={pt.y - 2} x2={pt.x + 2} y2={pt.y + 2} stroke="#16a" strokeWidth={0.6} />
                    <line x1={pt.x + 2} y1={pt.y - 2} x2={pt.x - 2} y2={pt.y + 2} stroke="#16a" strokeWidth={0.6} />
                    <text x={pt.x} y={pt.y - 5} textAnchor="middle" fontSize={4} fontFamily={FONT} fill="#16a">{pt.label}</text>
                  </g>
                );
              }
              if (pt.type === 'light') {
                return (
                  <g key={`pt-${i}`}>
                    <circle cx={pt.x} cy={pt.y} r={3} fill="#fff" stroke="#333" strokeWidth={0.7} />
                    <line x1={pt.x - 2} y1={pt.y} x2={pt.x + 2} y2={pt.y} stroke="#333" strokeWidth={0.5} />
                    <line x1={pt.x} y1={pt.y - 2} x2={pt.x} y2={pt.y + 2} stroke="#333" strokeWidth={0.5} />
                  </g>
                );
              }
              if (pt.type === 'fan') {
                return (
                  <g key={`pt-${i}`}>
                    <circle cx={pt.x} cy={pt.y} r={4} fill="#fff" stroke="#070" strokeWidth={0.9} />
                    <text x={pt.x} y={pt.y + 2} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#070">F</text>
                  </g>
                );
              }
              if (pt.type === 'ac') {
                return (
                  <g key={`pt-${i}`}>
                    <rect x={pt.x - 5} y={pt.y - 4} width={10} height={8} fill="#fff" stroke="#c60" strokeWidth={0.9} />
                    <text x={pt.x} y={pt.y + 2} textAnchor="middle" fontSize={4} fontFamily={FONT} fontWeight="bold" fill="#c60">AC</text>
                  </g>
                );
              }
              if (pt.type === 'data') {
                return (
                  <g key={`pt-${i}`}>
                    <rect x={pt.x - 4} y={pt.y - 4} width={8} height={8} fill="#fff" stroke="#06c" strokeWidth={0.9} />
                    <text x={pt.x} y={pt.y + 2} textAnchor="middle" fontSize={4} fontFamily={FONT} fill="#06c">D</text>
                  </g>
                );
              }
              return null;
            })}

            {/* Circuit label on first wiring run */}
            {points.length > 0 && (
              <text x={(dbX + 10 + points[0].x) / 2} y={(dbY + 7 + points[0].y) / 2 - 3}
                fontSize={4} fontFamily={FONT} fill="#888" transform={`rotate(-15, ${(dbX + 10 + points[0].x) / 2}, ${(dbY + 7 + points[0].y) / 2})`}>
                CKT-1
              </text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <Legend
        x={Math.max(...floor0.map(r => (r.x + r.width) * SC)) + MARGIN + 30}
        y={MARGIN + 40}
        items={legendItems}
      />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   WOODWORK DETAILS
   ═══════════════════════════════════════════════════════ */
function drawWardrobe(item: FurnitureItem, ox: number, oy: number): React.ReactElement[] {
  const w = 220;
  const h = 160;
  const els: React.ReactElement[] = [];
  els.push(<rect key="frame" x={ox} y={oy} width={w} height={h} fill="#f5efe3" stroke="#333" strokeWidth={1.5} />);
  // Shutters
  const shutters = Math.max(2, Math.round(item.widthMM / 600));
  const sw = w / shutters;
  for (let i = 0; i < shutters; i++) {
    els.push(<rect key={`s-${i}`} x={ox + i * sw} y={oy} width={sw} height={h} fill="none" stroke="#555" strokeWidth={0.8} />);
    // Handle
    els.push(<circle key={`h-${i}`} cx={ox + i * sw + sw / 2 + 6} cy={oy + h / 2} r={2} fill="#444" />);
    els.push(<circle key={`h2-${i}`} cx={ox + i * sw + sw / 2 - 6} cy={oy + h / 2} r={2} fill="#444" />);
    // Loft separation
    els.push(<line key={`loft-${i}`} x1={ox + i * sw} y1={oy + 25} x2={ox + (i + 1) * sw} y2={oy + 25} stroke="#888" strokeWidth={0.6} />);
  }
  // Dimensions
  els.push(<text key="wd" x={ox + w / 2} y={oy + h + 14} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#333">{item.widthMM} W × {item.depthMM} D × {item.heightMM} H</text>);
  els.push(<text key="wn" x={ox + w / 2} y={oy - 6} textAnchor="middle" fontSize={7} fontFamily={FONT} fontWeight="bold" fill="#111">WARDROBE ELEVATION</text>);
  // Material
  els.push(<text key="wm" x={ox + w / 2} y={oy + h + 24} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">Material: {item.material}</text>);
  return els;
}

function drawKitchen(item: FurnitureItem, ox: number, oy: number): React.ReactElement[] {
  const w = 240;
  const h = 150;
  const els: React.ReactElement[] = [];
  els.push(<text key="kt" x={ox + w / 2} y={oy - 6} textAnchor="middle" fontSize={7} fontFamily={FONT} fontWeight="bold" fill="#111">KITCHEN ELEVATION</text>);
  // Base cabinet
  els.push(<rect key="base" x={ox} y={oy + 70} width={w} height={80} fill="#f0e6d2" stroke="#333" strokeWidth={1.2} />);
  // Base doors
  const baseDoors = 4;
  for (let i = 0; i < baseDoors; i++) {
    const dx = ox + i * (w / baseDoors);
    els.push(<rect key={`bd-${i}`} x={dx + 2} y={oy + 72} width={w / baseDoors - 4} height={76} rx={1} fill="none" stroke="#666" strokeWidth={0.6} />);
    els.push(<circle key={`bh-${i}`} cx={dx + w / baseDoors - 8} cy={oy + 110} r={1.5} fill="#555" />);
  }
  // Countertop
  els.push(<rect key="counter" x={ox - 3} y={oy + 66} width={w + 6} height={5} fill="#ddd" stroke="#333" strokeWidth={0.8} />);
  // Wall cabinet
  els.push(<rect key="wall" x={ox} y={oy} width={w} height={50} fill="#e8dcc8" stroke="#333" strokeWidth={1.2} />);
  for (let i = 0; i < 3; i++) {
    const dx = ox + i * (w / 3);
    els.push(<rect key={`wd-${i}`} x={dx + 3} y={oy + 3} width={w / 3 - 6} height={44} rx={1} fill="none" stroke="#666" strokeWidth={0.6} />);
    els.push(<circle key={`wh-${i}`} cx={dx + w / 3 - 10} cy={oy + 25} r={1.5} fill="#555" />);
  }
  // Backsplash zone
  els.push(<rect key="splash" x={ox} y={oy + 50} width={w} height={16} fill="none" stroke="#aaa" strokeWidth={0.5} strokeDasharray="3,2" />);
  els.push(<text key="st" x={ox + w / 2} y={oy + 60} textAnchor="middle" fontSize={4.5} fontFamily={FONT} fill="#999">BACKSPLASH</text>);
  // Dimensions
  els.push(<text key="kd" x={ox + w / 2} y={oy + h + 14} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#333">{item.widthMM} W × {item.depthMM} D × {item.heightMM} H</text>);
  els.push(<text key="km" x={ox + w / 2} y={oy + h + 24} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">Material: {item.material}</text>);
  return els;
}

function drawTVUnit(item: FurnitureItem, ox: number, oy: number): React.ReactElement[] {
  const w = 200;
  const h = 100;
  const els: React.ReactElement[] = [];
  els.push(<text key="tt" x={ox + w / 2} y={oy - 6} textAnchor="middle" fontSize={7} fontFamily={FONT} fontWeight="bold" fill="#111">TV UNIT ELEVATION</text>);
  // Main body
  els.push(<rect key="body" x={ox} y={oy} width={w} height={h} fill="#f0e6d2" stroke="#333" strokeWidth={1.2} />);
  // TV panel area
  els.push(<rect key="tv" x={ox + 20} y={oy + 5} width={w - 40} height={50} fill="#333" stroke="#111" strokeWidth={0.8} rx={2} />);
  // Shelves
  els.push(<line key="sh1" x1={ox} y1={oy + 60} x2={ox + w} y2={oy + 60} stroke="#888" strokeWidth={0.6} />);
  els.push(<line key="sh2" x1={ox} y1={oy + 80} x2={ox + w} y2={oy + 80} stroke="#888" strokeWidth={0.6} />);
  // Drawers in bottom section
  for (let i = 0; i < 3; i++) {
    const dx = ox + i * (w / 3);
    els.push(<rect key={`dr-${i}`} x={dx + 3} y={oy + 82} width={w / 3 - 6} height={15} rx={1} fill="none" stroke="#666" strokeWidth={0.5} />);
    els.push(<line key={`drh-${i}`} x1={dx + w / 6 - 5} y1={oy + 89} x2={dx + w / 6 + 5} y2={oy + 89} stroke="#888" strokeWidth={0.5} />);
  }
  els.push(<text key="td" x={ox + w / 2} y={oy + h + 14} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#333">{item.widthMM} W × {item.depthMM} D × {item.heightMM} H</text>);
  els.push(<text key="tm" x={ox + w / 2} y={oy + h + 24} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">Material: {item.material}</text>);
  return els;
}

function drawStudyTable(item: FurnitureItem, ox: number, oy: number): React.ReactElement[] {
  const w = 180;
  const h = 100;
  const els: React.ReactElement[] = [];
  els.push(<text key="st" x={ox + w / 2} y={oy - 6} textAnchor="middle" fontSize={7} fontFamily={FONT} fontWeight="bold" fill="#111">STUDY TABLE ELEVATION</text>);
  els.push(<rect key="top" x={ox} y={oy + 50} width={w} height={4} fill="#ddd" stroke="#333" strokeWidth={1} />);
  // Pedestal drawers
  els.push(<rect key="ped" x={ox + w - 45} y={oy + 54} width={42} height={h - 54} fill="#f0e6d2" stroke="#333" strokeWidth={0.8} />);
  for (let i = 0; i < 3; i++) {
    els.push(<rect key={`dr-${i}`} x={ox + w - 43} y={oy + 56 + i * 14} width={38} height={12} rx={1} fill="none" stroke="#666" strokeWidth={0.5} />);
    els.push(<circle key={`dh-${i}`} cx={ox + w - 24} cy={oy + 62 + i * 14} r={1.2} fill="#555" />);
  }
  // Shelves above
  els.push(<rect key="shelf1" x={ox} y={oy + 20} width={w} height={3} fill="none" stroke="#888" strokeWidth={0.6} />);
  els.push(<rect key="shelf2" x={ox} y={oy} width={w} height={3} fill="none" stroke="#888" strokeWidth={0.6} />);
  // Legs
  els.push(<line key="l1" x1={ox + 5} y1={oy + 54} x2={ox + 5} y2={oy + h} stroke="#333" strokeWidth={1} />);
  els.push(<text key="sd" x={ox + w / 2} y={oy + h + 14} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#333">{item.widthMM} W × {item.depthMM} D × {item.heightMM} H</text>);
  els.push(<text key="sm" x={ox + w / 2} y={oy + h + 24} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">Material: {item.material}</text>);
  return els;
}

function drawPujaUnit(item: FurnitureItem, ox: number, oy: number): React.ReactElement[] {
  const w = 120;
  const h = 130;
  const els: React.ReactElement[] = [];
  els.push(<text key="pt" x={ox + w / 2} y={oy - 6} textAnchor="middle" fontSize={7} fontFamily={FONT} fontWeight="bold" fill="#111">POOJA UNIT ELEVATION</text>);
  // Frame with arch top
  els.push(<rect key="frame" x={ox} y={oy + 20} width={w} height={h - 20} fill="#f5efe3" stroke="#333" strokeWidth={1.2} />);
  // Arch
  els.push(<path key="arch" d={`M${ox},${oy + 20} Q${ox + w / 2},${oy - 5} ${ox + w},${oy + 20}`} fill="#f5efe3" stroke="#333" strokeWidth={1.2} />);
  // Shelves
  for (let i = 1; i <= 3; i++) {
    els.push(<line key={`ps-${i}`} x1={ox + 3} y1={oy + 20 + i * 25} x2={ox + w - 3} y2={oy + 20 + i * 25} stroke="#888" strokeWidth={0.6} />);
  }
  // Door on bottom
  els.push(<rect key="door" x={ox + 5} y={oy + h - 25} width={w - 10} height={23} rx={1} fill="none" stroke="#666" strokeWidth={0.7} />);
  els.push(<circle key="dh" cx={ox + w / 2 + 8} cy={oy + h - 13} r={1.5} fill="#555" />);
  els.push(<text key="pd" x={ox + w / 2} y={oy + h + 14} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#333">{item.widthMM} W × {item.depthMM} D × {item.heightMM} H</text>);
  els.push(<text key="pm" x={ox + w / 2} y={oy + h + 24} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">Material: {item.material}</text>);
  return els;
}

function drawGenericWoodwork(item: FurnitureItem, ox: number, oy: number): React.ReactElement[] {
  const w = 160;
  const h = 100;
  const els: React.ReactElement[] = [];
  els.push(<text key="gt" x={ox + w / 2} y={oy - 6} textAnchor="middle" fontSize={7} fontFamily={FONT} fontWeight="bold" fill="#111">{item.name.toUpperCase()} ELEVATION</text>);
  els.push(<rect key="body" x={ox} y={oy} width={w} height={h} fill="#f0e6d2" stroke="#333" strokeWidth={1.2} />);
  // Shelves
  for (let i = 1; i <= 3; i++) {
    els.push(<line key={`gs-${i}`} x1={ox + 2} y1={oy + i * (h / 4)} x2={ox + w - 2} y2={oy + i * (h / 4)} stroke="#888" strokeWidth={0.5} />);
  }
  els.push(<text key="gd" x={ox + w / 2} y={oy + h + 14} textAnchor="middle" fontSize={6} fontFamily={FONT} fill="#333">{item.widthMM} W × {item.depthMM} D × {item.heightMM} H</text>);
  els.push(<text key="gm" x={ox + w / 2} y={oy + h + 24} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">Material: {item.material}</text>);
  return els;
}

function WoodworkDetails({ layout, rooms }: Props) {
  const allRooms = layout.floors.flatMap(f => f.rooms);
  const floor0 = allRooms.filter(r => (r.floor ?? 0) === 0);
  const woodworkItems: { item: FurnitureItem; roomName: string }[] = [];

  floor0.forEach(room => {
    const interior = getInterior(room, rooms);
    if (!interior) return;
    interior.furniture.forEach(f => {
      if (['wardrobe', 'kitchen_cabinet', 'tv_unit', 'study_table', 'pooja_unit', 'bookshelf',
        'shoe_rack', 'crockery', 'bar_unit', 'dressing', 'console'].includes(f.category)) {
        woodworkItems.push({ item: f, roomName: room.name });
      }
    });
  });

  if (woodworkItems.length === 0) {
    return <svg viewBox="0 0 400 100" className="w-full h-auto"><text x={20} y={40} fontFamily={FONT} fontSize={10}>No woodwork items found</text></svg>;
  }

  // Layout items in a grid
  const colW = 280;
  const rowH = 200;
  const cols = 2;
  const rows = Math.ceil(woodworkItems.length / cols);
  const svgW = cols * colW + MARGIN * 2;
  const svgH = rows * rowH + MARGIN + 60;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto" style={{ background: '#fff' }}>
      <TitleBlock x={MARGIN} y={12} title="WOODWORK DETAILS" subtitle="Elevation Views | All dimensions in mm" />
      {woodworkItems.map((wi, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const ox = MARGIN + col * colW + 20;
        const oy = MARGIN + 50 + row * rowH;
        let els: React.ReactElement[] = [];

        switch (wi.item.category) {
          case 'wardrobe': els = drawWardrobe(wi.item, ox, oy); break;
          case 'kitchen_cabinet': els = drawKitchen(wi.item, ox, oy); break;
          case 'tv_unit': els = drawTVUnit(wi.item, ox, oy); break;
          case 'study_table': els = drawStudyTable(wi.item, ox, oy); break;
          case 'pooja_unit': els = drawPujaUnit(wi.item, ox, oy); break;
          default: els = drawGenericWoodwork(wi.item, ox, oy); break;
        }

        return (
          <g key={`ww-${idx}`}>
            <text x={ox} y={oy - 16} fontSize={5.5} fontFamily={FONT} fill="#888">{wi.roomName}</text>
            {els}
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   FLOORING LAYOUT PLAN
   ═══════════════════════════════════════════════════════ */
function FlooringPlan({ layout, rooms }: Props) {
  const allRooms = layout.floors.flatMap(f => f.rooms);
  const floor0 = allRooms.filter(r => (r.floor ?? 0) === 0);
  if (floor0.length === 0) return <text x={40} y={40} fontFamily={FONT} fontSize={10}>No rooms</text>;

  const maxW = Math.max(...floor0.map(r => (r.x + r.width) * SC)) + MARGIN * 2 + 40;
  const maxH = Math.max(...floor0.map(r => (r.y + r.depth) * SC)) + MARGIN * 2 + 80;

  return (
    <svg viewBox={`0 0 ${maxW} ${maxH}`} className="w-full h-auto" style={{ background: '#fff' }}>
      <TitleBlock x={MARGIN} y={12} title="FLOORING LAYOUT PLAN" subtitle="Scale 1:50 | All dimensions in mm" />
      {floor0.map(room => {
        const ox = room.x * SC + MARGIN;
        const oy = room.y * SC + MARGIN + 40;
        const W = room.width * SC;
        const D = room.depth * SC;
        const interior = getInterior(room, rooms);
        const flooring = interior?.flooring;
        const tileSize = 600; // default 600x600
        const tilePx = (tileSize / 1000) * SC;
        const rt = room.type as string;

        return (
          <g key={room.id}>
            <RoomOutlines room={room} ox={ox} oy={oy} />
            <DimensionChains room={room} ox={ox} oy={oy} />

            {/* Tile pattern */}
            <defs>
              <clipPath id={`clip-${room.id}`}>
                <rect x={ox + WT} y={oy + WT} width={W - 2 * WT} height={D - 2 * WT} />
              </clipPath>
            </defs>

            <g clipPath={`url(#clip-${room.id})`}>
              {rt === 'toilet' ? (
                // Smaller tiles for toilet
                (() => {
                  const tPx = (300 / 1000) * SC;
                  const lines: React.ReactElement[] = [];
                  for (let x = ox + WT; x <= ox + W - WT; x += tPx) {
                    lines.push(<line key={`tv-${x}`} x1={x} y1={oy + WT} x2={x} y2={oy + D - WT} stroke="#bbb" strokeWidth={0.3} />);
                  }
                  for (let y = oy + WT; y <= oy + D - WT; y += tPx) {
                    lines.push(<line key={`th-${y}`} x1={ox + WT} y1={y} x2={ox + W - WT} y2={y} stroke="#bbb" strokeWidth={0.3} />);
                  }
                  return <>{lines}</>;
                })()
              ) : rt === 'kitchen' ? (
                // Anti-skid tiles
                (() => {
                  const tPx = tilePx;
                  const lines: React.ReactElement[] = [];
                  for (let x = ox + WT; x <= ox + W - WT; x += tPx) {
                    lines.push(<line key={`kv-${x}`} x1={x} y1={oy + WT} x2={x} y2={oy + D - WT} stroke="#aaa" strokeWidth={0.3} />);
                  }
                  for (let y = oy + WT; y <= oy + D - WT; y += tPx) {
                    lines.push(<line key={`kh-${y}`} x1={ox + WT} y1={y} x2={ox + W - WT} y2={y} stroke="#aaa" strokeWidth={0.3} />);
                  }
                  // Diagonal in each tile
                  for (let tx = ox + WT; tx < ox + W - WT; tx += tPx) {
                    for (let ty = oy + WT; ty < oy + D - WT; ty += tPx) {
                      lines.push(<line key={`kd-${tx}-${ty}`} x1={tx} y1={ty} x2={Math.min(tx + tPx, ox + W - WT)} y2={Math.min(ty + tPx, oy + D - WT)} stroke="#ddd" strokeWidth={0.2} />);
                    }
                  }
                  return <>{lines}</>;
                })()
              ) : (
                // Standard vitrified tiles
                (() => {
                  const lines: React.ReactElement[] = [];
                  for (let x = ox + WT; x <= ox + W - WT; x += tilePx) {
                    lines.push(<line key={`fv-${x}`} x1={x} y1={oy + WT} x2={x} y2={oy + D - WT} stroke="#ccc" strokeWidth={0.3} />);
                  }
                  for (let y = oy + WT; y <= oy + D - WT; y += tilePx) {
                    lines.push(<line key={`fh-${y}`} x1={ox + WT} y1={y} x2={ox + W - WT} y2={y} stroke="#ccc" strokeWidth={0.3} />);
                  }
                  return <>{lines}</>;
                })()
              )}
            </g>

            {/* Starting point marker */}
            <g>
              <line x1={ox + WT + 2} y1={oy + D - WT - 6} x2={ox + WT + 8} y2={oy + D - WT} stroke="#d33" strokeWidth={0.7} />
              <line x1={ox + WT + 8} y1={oy + D - WT - 6} x2={ox + WT + 2} y2={oy + D - WT} stroke="#d33" strokeWidth={0.7} />
              <text x={ox + WT + 5} y={oy + D - WT + 8} textAnchor="middle" fontSize={4} fontFamily={FONT} fill="#d33">START</text>
            </g>

            {/* Tile size annotation */}
            {flooring && (
              <text x={ox + W / 2} y={oy + D / 2 + 22} textAnchor="middle" fontSize={5} fontFamily={FONT} fill="#666">
                {rt === 'toilet' ? '300×300' : '600×600'} {flooring.name?.toUpperCase() || 'VITRIFIED'}
              </text>
            )}

            {/* Room dimensions inside */}
            <text x={ox + W / 2} y={oy + D / 2 + 32} textAnchor="middle" fontSize={5.5} fontFamily={FONT} fill="#444">
              {mToLabel(room.width)} × {mToLabel(room.depth)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
/* ─── Room label helper ─── */
function roomLabel(r: Room): string {
  const t = r.type.charAt(0).toUpperCase() + r.type.slice(1);
  return r.name || t;
}

export default function InteriorDrawings({ layout, rooms }: Props) {
  const [activeTab, setActiveTab] = useState<DrawingTab>('furniture');

  const allRooms = useMemo(() => layout.floors.flatMap(f => f.rooms), [layout]);
  const floor0 = useMemo(() => allRooms.filter(r => (r.floor ?? 0) === 0), [allRooms]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(floor0[0]?.id || '');

  const tabs: { key: DrawingTab; label: string }[] = [
    { key: 'furniture', label: 'Furniture Layout' },
    { key: 'ceiling', label: 'False Ceiling' },
    { key: 'electrical', label: 'Electrical Layout' },
    { key: 'woodwork', label: 'Woodwork Details' },
    { key: 'flooring', label: 'Flooring Layout' },
  ];

  /* Create a single-room layout for per-room rendering */
  const singleRoomLayout = useMemo(() => {
    const room = floor0.find(r => r.id === selectedRoomId);
    if (!room) return layout;
    // Position room at origin for clean rendering
    const centeredRoom = { ...room, x: 0, y: 0 };
    return {
      ...layout,
      floors: [{ floor: 0, floorLabel: 'Ground Floor', rooms: [centeredRoom], columns: [] }],
    };
  }, [layout, floor0, selectedRoomId]);

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ background: '#1a1a2e' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Room selector */}
      <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ background: '#0d1117' }}>
        <span className="text-gray-400 text-xs self-center mr-1">Room:</span>
        {floor0.map(room => (
          <button
            key={room.id}
            onClick={() => setSelectedRoomId(room.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedRoomId === room.id
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {roomLabel(room)}
          </button>
        ))}
      </div>

      {/* Drawing area — one room at a time */}
      <div className="bg-white rounded-lg shadow-lg overflow-auto p-2 border border-gray-200">
        {activeTab === 'furniture' && <FurniturePlan layout={singleRoomLayout} rooms={rooms} />}
        {activeTab === 'ceiling' && <CeilingPlan layout={singleRoomLayout} rooms={rooms} />}
        {activeTab === 'electrical' && <ElectricalPlan layout={singleRoomLayout} rooms={rooms} />}
        {activeTab === 'woodwork' && <WoodworkDetails layout={singleRoomLayout} rooms={rooms} />}
        {activeTab === 'flooring' && <FlooringPlan layout={singleRoomLayout} rooms={rooms} />}
      </div>
    </div>
  );
}
