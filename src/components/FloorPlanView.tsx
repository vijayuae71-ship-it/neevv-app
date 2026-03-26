'use client';

import React, { useState } from 'react';
import { Layout, Room, Column, Setbacks } from '../types';
import { Compass, Grid3x3, Ruler, Armchair, ArrowRight, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { BRAND_LOGO_BASE64 } from '../utils/brand';

interface Props {
  layout: Layout;
  vastuEnabled: boolean;
  onProceedToBOQ: () => void;
}

type ViewMode = 'furniture' | 'centerline' | 'dimension' | 'structural';

/* ══════════════════════════════════════════════
   CONSTANTS – Architectural Drawing Standards
   ══════════════════════════════════════════════ */

const SCALE = 50; // pixels per meter – higher for crisp detail
const MARGIN_LEFT = 100;
const MARGIN_TOP = 80;
const MARGIN_RIGHT = 40;
const MARGIN_BOTTOM = 100;
const WALL_T = 4; // wall thickness in SVG px (~230mm at scale)

// Monochrome palette – like a real blueprint
const C = {
  bg: '#FFFFFF',
  wall: '#1a1a1a',
  wallFill: '#2a2a2a',
  dim: '#333333',
  dimLine: '#555555',
  grid: '#cc0000',
  door: '#1a1a1a',
  window: '#1a1a1a',
  furniture: '#888888',
  hatch: '#666666',
  text: '#1a1a1a',
  textLight: '#666666',
  setback: '#999999',
  plotBound: '#444444',
  titleBlock: '#1a1a1a',
};

/* ══════════════════════════════════════════════
   GEOMETRY HELPERS
   ══════════════════════════════════════════════ */

type Side = 'top' | 'bottom' | 'left' | 'right';

interface WallSeg {
  side: Side;
  x1: number; y1: number; x2: number; y2: number;
  midX: number; midY: number;
  length: number;
}

function getWalls(r: Room): WallSeg[] {
  const { x, y, width: w, depth: h } = r;
  return [
    { side: 'top',    x1: x,     y1: y,     x2: x + w, y2: y,     midX: x + w / 2, midY: y,         length: w },
    { side: 'bottom', x1: x,     y1: y + h, x2: x + w, y2: y + h, midX: x + w / 2, midY: y + h,     length: w },
    { side: 'left',   x1: x,     y1: y,     x2: x,     y2: y + h, midX: x,         midY: y + h / 2, length: h },
    { side: 'right',  x1: x + w, y1: y,     x2: x + w, y2: y + h, midX: x + w,     midY: y + h / 2, length: h },
  ];
}

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function sharedWith(wall: WallSeg, room: Room, others: Room[]): Room | null {
  const E = 0.15;
  for (const o of others) {
    if (o.id === room.id) continue;
    for (const ow of getWalls(o)) {
      if (wall.side === 'top' && ow.side === 'bottom' && Math.abs(wall.midY - ow.midY) < E && overlap(wall.x1, wall.x2, ow.x1, ow.x2) > 0.3) return o;
      if (wall.side === 'bottom' && ow.side === 'top' && Math.abs(wall.midY - ow.midY) < E && overlap(wall.x1, wall.x2, ow.x1, ow.x2) > 0.3) return o;
      if (wall.side === 'left' && ow.side === 'right' && Math.abs(wall.midX - ow.midX) < E && overlap(wall.y1, wall.y2, ow.y1, ow.y2) > 0.3) return o;
      if (wall.side === 'right' && ow.side === 'left' && Math.abs(wall.midX - ow.midX) < E && overlap(wall.y1, wall.y2, ow.y1, ow.y2) > 0.3) return o;
    }
  }
  return null;
}

function isExterior(wall: WallSeg, sb: Setbacks, bw: number, bd: number): boolean {
  const E = 0.15;
  const ox = sb.left, oy = sb.front;
  if (wall.side === 'top'    && Math.abs(wall.midY - oy) < E) return true;
  if (wall.side === 'bottom' && Math.abs(wall.midY - (oy + bd)) < E) return true;
  if (wall.side === 'left'   && Math.abs(wall.midX - ox) < E) return true;
  if (wall.side === 'right'  && Math.abs(wall.midX - (ox + bw)) < E) return true;
  return false;
}

function roomDirection(room: Room, pw: number, pd: number): string {
  const cx = room.x + room.width / 2, cy = room.y + room.depth / 2;
  const px = pw / 2, py = pd / 2;
  const ns = cy < py - pd * 0.15 ? 'N' : cy > py + pd * 0.15 ? 'S' : '';
  const ew = cx < px - pw * 0.15 ? 'W' : cx > px + pw * 0.15 ? 'E' : '';
  return (ns + ew) || 'C';
}

function doorWall(room: Room, all: Room[], sb: Setbacks, bw: number, bd: number): WallSeg | null {
  if (room.type === 'parking' || room.type === 'balcony') return null;
  const walls = getWalls(room);
  const hallTypes = ['hall', 'passage', 'entrance', 'dining', 'staircase'];
  for (const w of walls) { const a = sharedWith(w, room, all); if (a && hallTypes.includes(a.type)) return w; }
  for (const w of walls) { const a = sharedWith(w, room, all); if (a && !isExterior(w, sb, bw, bd)) return w; }
  for (const w of walls) { if (sharedWith(w, room, all)) return w; }
  return walls.find(w => w.side === 'bottom') || walls[0];
}

function windowWalls(room: Room, all: Room[], sb: Setbacks, bw: number, bd: number): WallSeg[] {
  if (['staircase', 'parking', 'passage'].includes(room.type)) return [];
  return getWalls(room).filter(w => isExterior(w, sb, bw, bd) && w.length > 1.0);
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */

export const FloorPlanView: React.FC<Props> = ({ layout, vastuEnabled, onProceedToBOQ }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('furniture');
  const [activeFloor, setActiveFloor] = useState(0);
  const [showVastuDetails, setShowVastuDetails] = useState(false);
  const [showNBCDetails, setShowNBCDetails] = useState(false);

  const fl = layout.floors[activeFloor];
  if (!fl) return null;

  const svgW = layout.plotWidthM * SCALE + MARGIN_LEFT + MARGIN_RIGHT;
  const svgH = layout.plotDepthM * SCALE + MARGIN_TOP + MARGIN_BOTTOM;
  const tx = (m: number) => MARGIN_LEFT + m * SCALE;
  const ty = (m: number) => MARGIN_TOP + m * SCALE;

  const modes: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: 'furniture', label: 'Furniture Layout', icon: <Armchair size={14} /> },
    { key: 'centerline', label: 'Centerline Grid', icon: <Grid3x3 size={14} /> },
    { key: 'dimension', label: 'Dimensions', icon: <Ruler size={14} /> },
    { key: 'structural', label: 'Structural Grid', icon: <Grid3x3 size={14} /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ─── TOOLBAR ─── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-base-200 border-b border-base-300 flex-wrap">
        <div className="flex gap-1">
          {modes.map((m) => (
            <button key={m.key} className={`btn btn-xs ${viewMode === m.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode(m.key)}>
              {m.icon}<span className="hidden sm:inline ml-1">{m.label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {layout.floors.length > 1 && (
          <select className="select select-bordered select-xs" value={activeFloor} onChange={(e) => setActiveFloor(Number(e.target.value))}>
            {layout.floors.map((f, i) => (<option key={i} value={i}>{f.floorLabel}</option>))}
          </select>
        )}
      </div>

      {/* ─── SVG DRAWING ─── */}
      <div className="flex-1 overflow-auto p-2" data-drawing="floorplan" style={{ background: '#f8f8f5' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto" style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 280px)', fontFamily: "'Courier New', monospace" }}>
          <defs>
            {/* Wall hatch pattern */}
            <pattern id="wallHatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={C.wall} strokeWidth="0.5" opacity="0.4" />
            </pattern>
            {/* Wet area hatch (diagonal lines) */}
            <pattern id="wetHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke={C.hatch} strokeWidth="0.3" opacity="0.25" />
            </pattern>
            {/* Tile pattern for kitchen */}
            <pattern id="tileHatch" patternUnits="userSpaceOnUse" width="8" height="8">
              <rect width="8" height="8" fill="none" stroke={C.hatch} strokeWidth="0.2" opacity="0.15" />
            </pattern>
          </defs>

          {/* Background – drawing sheet */}
          <rect width={svgW} height={svgH} fill={C.bg} />

          {/* Drawing border – thick outer line */}
          <rect x="4" y="4" width={svgW - 8} height={svgH - 8} fill="none" stroke={C.titleBlock} strokeWidth="1.5" />
          <rect x="8" y="8" width={svgW - 16} height={svgH - 16} fill="none" stroke={C.titleBlock} strokeWidth="0.3" />

          {/* ─── PLOT BOUNDARY ─── dash-dot line */}
          <rect
            x={tx(0)} y={ty(0)}
            width={layout.plotWidthM * SCALE} height={layout.plotDepthM * SCALE}
            fill="none" stroke={C.plotBound} strokeWidth="0.8"
            strokeDasharray="12,3,3,3"
          />

          {/* Setback boundary – thin dashed */}
          <rect
            x={tx(layout.setbacks.left)} y={ty(layout.setbacks.front)}
            width={layout.buildableWidthM * SCALE} height={layout.buildableDepthM * SCALE}
            fill="none" stroke={C.setback} strokeWidth="0.5" strokeDasharray="6,3"
          />

          {/* Setback annotations */}
          <SetbackAnnotations layout={layout} tx={tx} ty={ty} />

          {/* ─── ROOM FILLS (floor patterns) ─── */}
          {fl.rooms.map((room) => {
            const isWet = room.type === 'toilet';
            const isKitchen = room.type === 'kitchen';
            return (
              <rect key={`fill_${room.id}`}
                x={tx(room.x)} y={ty(room.y)}
                width={room.width * SCALE} height={room.depth * SCALE}
                fill={isWet ? 'url(#wetHatch)' : isKitchen ? 'url(#tileHatch)' : 'none'}
              />
            );
          })}

          {/* ─── WALLS (thick double-line) ─── */}
          {fl.rooms.map((room) => (
            <WallDrawing key={`wall_${room.id}`} room={room} allRooms={fl.rooms} tx={tx} ty={ty} scale={SCALE} sb={layout.setbacks} bw={layout.buildableWidthM} bd={layout.buildableDepthM} />
          ))}

          {/* ─── DOORS ─── */}
          {fl.rooms.map((room) => (
            <DoorSymbol key={`door_${room.id}`} room={room} allRooms={fl.rooms} tx={tx} ty={ty} scale={SCALE} sb={layout.setbacks} bw={layout.buildableWidthM} bd={layout.buildableDepthM} />
          ))}

          {/* ─── WINDOWS ─── */}
          {fl.rooms.map((room) => (
            <WindowSymbol key={`win_${room.id}`} room={room} allRooms={fl.rooms} tx={tx} ty={ty} scale={SCALE} sb={layout.setbacks} bw={layout.buildableWidthM} bd={layout.buildableDepthM} />
          ))}

          {/* ─── ROOM LABELS ─── */}
          {fl.rooms.map((room) => {
            const cx = tx(room.x + room.width / 2);
            const cy = ty(room.y + room.depth / 2);
            const area = room.width * room.depth;
            const areaSqFt = area * 10.764;
            const dir = roomDirection(room, layout.plotWidthM, layout.plotDepthM);
            const fontSize = Math.min(9, (room.width * SCALE) / 6);
            return (
              <g key={`label_${room.id}`}>
                {/* Room name – uppercase, architectural convention */}
                <text x={cx} y={cy - 4} textAnchor="middle" fontSize={fontSize} fill={C.text} fontWeight="700" letterSpacing="0.5">
                  {room.name.toUpperCase()}
                </text>
                {/* Area */}
                <text x={cx} y={cy + 6} textAnchor="middle" fontSize={fontSize * 0.75} fill={C.textLight}>
                  {area.toFixed(1)} m² ({areaSqFt.toFixed(0)} sqft)
                </text>
                {/* Direction tag */}
                <text x={cx} y={cy + 14} textAnchor="middle" fontSize={5.5} fill={C.textLight} fontStyle="italic">
                  [{dir}]
                </text>
              </g>
            );
          })}

          {/* ─── FURNITURE (thin hairlines) ─── */}
          {viewMode === 'furniture' && fl.rooms.map((room) => (
            <FurnitureDetail key={`furn_${room.id}`} room={room} tx={tx} ty={ty} scale={SCALE} />
          ))}

          {/* ─── STRUCTURAL COLUMNS ─── */}
          {(viewMode === 'structural' || viewMode === 'centerline') && fl.columns.map((col, i) => (
            <g key={`col_${i}`}>
              <rect x={tx(col.x) - 5} y={ty(col.y) - 5} width={10} height={10} fill={C.wall} stroke={C.wall} strokeWidth="0.5" />
              {/* Cross-hair */}
              <line x1={tx(col.x) - 8} y1={ty(col.y)} x2={tx(col.x) + 8} y2={ty(col.y)} stroke={C.wall} strokeWidth="0.3" />
              <line x1={tx(col.x)} y1={ty(col.y) - 8} x2={tx(col.x)} y2={ty(col.y) + 8} stroke={C.wall} strokeWidth="0.3" />
            </g>
          ))}

          {/* ─── CENTERLINE GRID ─── */}
          {viewMode === 'centerline' && <GridLines columns={fl.columns} tx={tx} ty={ty} svgW={svgW} svgH={svgH} />}

          {/* ─── DIMENSION CHAINS ─── */}
          {viewMode === 'dimension' && (
            <g>
              {fl.rooms.map((room) => <RoomDimensions key={`dim_${room.id}`} room={room} tx={tx} ty={ty} scale={SCALE} />)}
              <OverallDimensions layout={layout} fl={fl} tx={tx} ty={ty} scale={SCALE} />
            </g>
          )}

          {/* ─── NORTH ARROW ─── */}
          <NorthArrow x={svgW - 50} y={45} />

          {/* ─── SCALE BAR ─── */}
          <ScaleBar x={tx(0)} y={svgH - 35} scale={SCALE} />

          {/* ─── TITLE BLOCK ─── */}
          <TitleBlock x={svgW - 220} y={svgH - 55} w={210} h={45} layout={layout} floorLabel={fl.floorLabel} viewMode={viewMode} />

          {/* Overall plot dimensions at edges */}
          <text x={tx(layout.plotWidthM / 2)} y={ty(0) - 20} textAnchor="middle" fontSize="8" fill={C.dim} fontWeight="600">
            {(layout.plotWidthM / 0.3048).toFixed(0)}' - 0" ({layout.plotWidthM.toFixed(2)} m)
          </text>
          <g transform={`rotate(-90, ${tx(0) - 30}, ${ty(layout.plotDepthM / 2)})`}>
            <text x={tx(0) - 30} y={ty(layout.plotDepthM / 2)} textAnchor="middle" fontSize="8" fill={C.dim} fontWeight="600">
              {(layout.plotDepthM / 0.3048).toFixed(0)}' - 0" ({layout.plotDepthM.toFixed(2)} m)
            </text>
          </g>
          {/* Brand watermark */}
          <image
            href={BRAND_LOGO_BASE64}
            x={10} y={10}
            width="100" height="33"
            opacity="0.35"
            preserveAspectRatio="xMidYMid meet"
          />
        </svg>
      </div>

      {/* ─── LEGEND ─── */}
      <div className="flex items-center gap-5 px-4 py-1.5 bg-white border-t border-gray-300" style={{ fontFamily: 'monospace', fontSize: '10px', color: '#333' }}>
        <span className="flex items-center gap-1">
          <svg width="20" height="8"><rect x="0" y="0" width="20" height="8" fill="url(#wallHatch)" stroke="#1a1a1a" strokeWidth="1" /></svg>
          WALL (230mm)
        </span>
        <span className="flex items-center gap-1">
          <svg width="18" height="10">
            <line x1="0" y1="5" x2="3" y2="5" stroke="#1a1a1a" strokeWidth="1.5" />
            <line x1="15" y1="5" x2="18" y2="5" stroke="#1a1a1a" strokeWidth="1.5" />
            <path d="M 3 5 A 8 8 0 0 0 11 0" fill="none" stroke="#1a1a1a" strokeWidth="0.5" />
            <line x1="3" y1="5" x2="3" y2="0" stroke="#1a1a1a" strokeWidth="0.8" />
          </svg>
          DOOR
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8">
            <line x1="0" y1="2" x2="20" y2="2" stroke="#1a1a1a" strokeWidth="0.8" />
            <line x1="0" y1="6" x2="20" y2="6" stroke="#1a1a1a" strokeWidth="0.8" />
            <line x1="5" y1="2" x2="5" y2="6" stroke="#1a1a1a" strokeWidth="0.3" />
            <line x1="10" y1="2" x2="10" y2="6" stroke="#1a1a1a" strokeWidth="0.3" />
            <line x1="15" y1="2" x2="15" y2="6" stroke="#1a1a1a" strokeWidth="0.3" />
          </svg>
          WINDOW
        </span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="#1a1a1a" /><line x1="0" y1="5" x2="10" y2="5" stroke="#1a1a1a" strokeWidth="0.3" /><line x1="5" y1="0" x2="5" y2="10" stroke="#1a1a1a" strokeWidth="0.3" /></svg>
          COLUMN (230×300)
        </span>
        <span className="flex items-center gap-1">
          <svg width="16" height="8"><rect x="0" y="0" width="16" height="8" fill="url(#wetHatch)" stroke="#666" strokeWidth="0.3" /></svg>
          WET AREA
        </span>
      </div>

      {/* ─── INFO PANEL ─── */}
      <div className="p-3 bg-base-200 border-t border-base-300 space-y-2 max-h-60 overflow-y-auto">
        <div className="flex items-center justify-between text-xs">
          <span className="text-base-content/60 font-mono">{layout.name} • {fl.floorLabel}</span>
          <span className="font-medium font-mono">{layout.builtUpAreaSqFt} sq.ft built-up</span>
        </div>

        {vastuEnabled && (
          <div>
            <button className="flex items-center gap-1 text-xs text-primary" onClick={() => setShowVastuDetails(!showVastuDetails)}>
              <Compass size={12} /> Vastu Score: <span className="font-bold">{layout.vastuScore}%</span>
              {showVastuDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showVastuDetails && (
              <div className="mt-1 space-y-0.5">
                {layout.vastuDetails.map((vd, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px] font-mono">
                    {vd.compliant ? <CheckCircle size={10} className="text-success flex-shrink-0" /> : <AlertTriangle size={10} className="text-warning flex-shrink-0" />}
                    <span className="text-base-content/70">{vd.room}</span>
                    <span className="text-base-content/40">→ {vd.actualZone} (ideal: {vd.idealZone})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {layout.nbcIssues.length > 0 && (
          <div>
            <button className="flex items-center gap-1 text-xs text-warning" onClick={() => setShowNBCDetails(!showNBCDetails)}>
              <AlertTriangle size={12} /> {layout.nbcIssues.length} NBC Issue{layout.nbcIssues.length > 1 ? 's' : ''}
              {showNBCDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showNBCDetails && (
              <div className="mt-1 space-y-0.5">
                {layout.nbcIssues.map((issue, i) => (
                  <div key={i} className="text-[10px] text-base-content/60 font-mono">• {issue.room}: {issue.issue}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <button className="btn btn-primary btn-sm w-full" onClick={onProceedToBOQ}>
          Proceed to Material BOQ <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   WALL DRAWING – Double-line thick walls
   ══════════════════════════════════════════════ */

const WallDrawing: React.FC<{
  room: Room; allRooms: Room[];
  tx: (m: number) => number; ty: (m: number) => number;
  scale: number; sb: Setbacks; bw: number; bd: number;
}> = ({ room, allRooms, tx, ty, scale, sb, bw, bd }) => {
  const x = tx(room.x), y = ty(room.y);
  const w = room.width * scale, h = room.depth * scale;
  const t = WALL_T;

  // Draw each wall segment as a thick filled rectangle
  const walls = getWalls(room);
  const segments: React.ReactNode[] = [];

  walls.forEach((wall, i) => {
    const shared = sharedWith(wall, room, allRooms);
    const lineW = shared ? 1 : 2; // thinner for shared walls to avoid double thickness

    switch (wall.side) {
      case 'top':
        segments.push(
          <g key={`wt_${i}`}>
            <rect x={x} y={y - t / 2} width={w} height={t} fill="url(#wallHatch)" stroke={C.wall} strokeWidth={lineW * 0.4} />
          </g>
        );
        break;
      case 'bottom':
        segments.push(
          <g key={`wb_${i}`}>
            <rect x={x} y={y + h - t / 2} width={w} height={t} fill="url(#wallHatch)" stroke={C.wall} strokeWidth={lineW * 0.4} />
          </g>
        );
        break;
      case 'left':
        segments.push(
          <g key={`wl_${i}`}>
            <rect x={x - t / 2} y={y} width={t} height={h} fill="url(#wallHatch)" stroke={C.wall} strokeWidth={lineW * 0.4} />
          </g>
        );
        break;
      case 'right':
        segments.push(
          <g key={`wr_${i}`}>
            <rect x={x + w - t / 2} y={y} width={t} height={h} fill="url(#wallHatch)" stroke={C.wall} strokeWidth={lineW * 0.4} />
          </g>
        );
        break;
    }
  });

  return <g>{segments}</g>;
};

/* ══════════════════════════════════════════════
   DOOR SYMBOL – Gap + leaf + 90° arc
   ══════════════════════════════════════════════ */

const DoorSymbol: React.FC<{
  room: Room; allRooms: Room[];
  tx: (m: number) => number; ty: (m: number) => number;
  scale: number; sb: Setbacks; bw: number; bd: number;
}> = ({ room, allRooms, tx, ty, scale, sb, bw, bd }) => {
  const wall = doorWall(room, allRooms, sb, bw, bd);
  if (!wall) return null;

  const doorM = room.type === 'toilet' ? 0.6 : 0.9;
  const doorPx = doorM * scale;
  const mx = tx(wall.midX), my = ty(wall.midY);
  const t = WALL_T;
  const r = doorPx; // arc radius = door width

  // Door opens inward (into the room)
  switch (wall.side) {
    case 'bottom': {
      const dx = mx - doorPx / 2;
      return (
        <g>
          {/* Clear wall gap */}
          <rect x={dx - 1} y={my - t} width={doorPx + 2} height={t * 2} fill={C.bg} />
          {/* Wall ends (jambs) – small thick marks */}
          <line x1={dx} y1={my - t} x2={dx} y2={my + t} stroke={C.wall} strokeWidth="1.5" />
          <line x1={dx + doorPx} y1={my - t} x2={dx + doorPx} y2={my + t} stroke={C.wall} strokeWidth="1.5" />
          {/* Door leaf – solid line */}
          <line x1={dx} y1={my} x2={dx} y2={my - r} stroke={C.door} strokeWidth="1.2" />
          {/* 90° swing arc */}
          <path d={`M ${dx} ${my - r} A ${r} ${r} 0 0 1 ${dx + r} ${my}`} fill="none" stroke={C.door} strokeWidth="0.5" strokeDasharray="3,1.5" />
        </g>
      );
    }
    case 'top': {
      const dx = mx - doorPx / 2;
      return (
        <g>
          <rect x={dx - 1} y={my - t} width={doorPx + 2} height={t * 2} fill={C.bg} />
          <line x1={dx} y1={my - t} x2={dx} y2={my + t} stroke={C.wall} strokeWidth="1.5" />
          <line x1={dx + doorPx} y1={my - t} x2={dx + doorPx} y2={my + t} stroke={C.wall} strokeWidth="1.5" />
          <line x1={dx} y1={my} x2={dx} y2={my + r} stroke={C.door} strokeWidth="1.2" />
          <path d={`M ${dx} ${my + r} A ${r} ${r} 0 0 0 ${dx + r} ${my}`} fill="none" stroke={C.door} strokeWidth="0.5" strokeDasharray="3,1.5" />
        </g>
      );
    }
    case 'left': {
      const dy = my - doorPx / 2;
      return (
        <g>
          <rect x={mx - t} y={dy - 1} width={t * 2} height={doorPx + 2} fill={C.bg} />
          <line x1={mx - t} y1={dy} x2={mx + t} y2={dy} stroke={C.wall} strokeWidth="1.5" />
          <line x1={mx - t} y1={dy + doorPx} x2={mx + t} y2={dy + doorPx} stroke={C.wall} strokeWidth="1.5" />
          <line x1={mx} y1={dy} x2={mx + r} y2={dy} stroke={C.door} strokeWidth="1.2" />
          <path d={`M ${mx + r} ${dy} A ${r} ${r} 0 0 1 ${mx} ${dy + r}`} fill="none" stroke={C.door} strokeWidth="0.5" strokeDasharray="3,1.5" />
        </g>
      );
    }
    case 'right': {
      const dy = my - doorPx / 2;
      return (
        <g>
          <rect x={mx - t} y={dy - 1} width={t * 2} height={doorPx + 2} fill={C.bg} />
          <line x1={mx - t} y1={dy} x2={mx + t} y2={dy} stroke={C.wall} strokeWidth="1.5" />
          <line x1={mx - t} y1={dy + doorPx} x2={mx + t} y2={dy + doorPx} stroke={C.wall} strokeWidth="1.5" />
          <line x1={mx} y1={dy} x2={mx - r} y2={dy} stroke={C.door} strokeWidth="1.2" />
          <path d={`M ${mx - r} ${dy} A ${r} ${r} 0 0 0 ${mx} ${dy + r}`} fill="none" stroke={C.door} strokeWidth="0.5" strokeDasharray="3,1.5" />
        </g>
      );
    }
  }
};

/* ══════════════════════════════════════════════
   WINDOW SYMBOL – Double line with mullions
   ══════════════════════════════════════════════ */

const WindowSymbol: React.FC<{
  room: Room; allRooms: Room[];
  tx: (m: number) => number; ty: (m: number) => number;
  scale: number; sb: Setbacks; bw: number; bd: number;
}> = ({ room, allRooms, tx, ty, scale, sb, bw, bd }) => {
  const walls = windowWalls(room, allRooms, sb, bw, bd);
  if (!walls.length) return null;

  const t = WALL_T;

  return (
    <g>
      {walls.map((wall, wi) => {
        const winM = room.type === 'toilet' ? 0.5 : Math.min(1.2, wall.length * 0.4);
        const winPx = winM * scale;
        const mx = tx(wall.midX), my = ty(wall.midY);
        const panes = room.type === 'toilet' ? 1 : 2;

        if (wall.side === 'top' || wall.side === 'bottom') {
          const wx = mx - winPx / 2;
          const wy = my;
          return (
            <g key={`win_${wi}`}>
              {/* Clear wall for window */}
              <rect x={wx - 1} y={wy - t} width={winPx + 2} height={t * 2} fill={C.bg} />
              {/* Window frame – 3 parallel lines */}
              <line x1={wx} y1={wy - 2.5} x2={wx + winPx} y2={wy - 2.5} stroke={C.window} strokeWidth="0.8" />
              <line x1={wx} y1={wy} x2={wx + winPx} y2={wy} stroke={C.window} strokeWidth="0.4" />
              <line x1={wx} y1={wy + 2.5} x2={wx + winPx} y2={wy + 2.5} stroke={C.window} strokeWidth="0.8" />
              {/* End caps */}
              <line x1={wx} y1={wy - 2.5} x2={wx} y2={wy + 2.5} stroke={C.window} strokeWidth="0.8" />
              <line x1={wx + winPx} y1={wy - 2.5} x2={wx + winPx} y2={wy + 2.5} stroke={C.window} strokeWidth="0.8" />
              {/* Mullions */}
              {Array.from({ length: panes }, (_, p) => {
                const px = wx + ((p + 1) * winPx) / (panes + 1);
                return <line key={p} x1={px} y1={wy - 2.5} x2={px} y2={wy + 2.5} stroke={C.window} strokeWidth="0.4" />;
              })}
              {/* Glass diagonals */}
              {Array.from({ length: panes + 1 }, (_, p) => {
                const sx = p === 0 ? wx : wx + (p * winPx) / (panes + 1);
                const ex = p === panes ? wx + winPx : wx + ((p + 1) * winPx) / (panes + 1);
                return <line key={`d${p}`} x1={sx} y1={wy - 2} x2={ex} y2={wy + 2} stroke={C.window} strokeWidth="0.2" opacity="0.5" />;
              })}
            </g>
          );
        } else {
          const wx = mx;
          const wy = my - winPx / 2;
          return (
            <g key={`win_${wi}`}>
              <rect x={wx - t} y={wy - 1} width={t * 2} height={winPx + 2} fill={C.bg} />
              <line x1={wx - 2.5} y1={wy} x2={wx - 2.5} y2={wy + winPx} stroke={C.window} strokeWidth="0.8" />
              <line x1={wx} y1={wy} x2={wx} y2={wy + winPx} stroke={C.window} strokeWidth="0.4" />
              <line x1={wx + 2.5} y1={wy} x2={wx + 2.5} y2={wy + winPx} stroke={C.window} strokeWidth="0.8" />
              <line x1={wx - 2.5} y1={wy} x2={wx + 2.5} y2={wy} stroke={C.window} strokeWidth="0.8" />
              <line x1={wx - 2.5} y1={wy + winPx} x2={wx + 2.5} y2={wy + winPx} stroke={C.window} strokeWidth="0.8" />
              {Array.from({ length: panes }, (_, p) => {
                const py = wy + ((p + 1) * winPx) / (panes + 1);
                return <line key={p} x1={wx - 2.5} y1={py} x2={wx + 2.5} y2={py} stroke={C.window} strokeWidth="0.4" />;
              })}
              {Array.from({ length: panes + 1 }, (_, p) => {
                const sy = p === 0 ? wy : wy + (p * winPx) / (panes + 1);
                const ey = p === panes ? wy + winPx : wy + ((p + 1) * winPx) / (panes + 1);
                return <line key={`d${p}`} x1={wx - 2} y1={sy} x2={wx + 2} y2={ey} stroke={C.window} strokeWidth="0.2" opacity="0.5" />;
              })}
            </g>
          );
        }
      })}
    </g>
  );
};

/* ══════════════════════════════════════════════
   FURNITURE – Thin hairline architectural symbols
   ══════════════════════════════════════════════ */

const FurnitureDetail: React.FC<{
  room: Room; tx: (m: number) => number; ty: (m: number) => number; scale: number;
}> = ({ room, tx, ty, scale }) => {
  const x = tx(room.x), y = ty(room.y);
  const w = room.width * scale, h = room.depth * scale;
  const s = C.furniture;
  const sw = '0.4';
  const pad = 6;

  switch (room.type) {
    case 'master_bedroom':
    case 'bedroom': {
      // Double bed (or single for non-master)
      const bw = room.type === 'master_bedroom' ? w * 0.55 : w * 0.45;
      const bh = h * 0.55;
      return (
        <g>
          {/* Bed frame */}
          <rect x={x + pad} y={y + h - bh - pad} width={bw} height={bh} fill="none" stroke={s} strokeWidth={sw} rx="1" />
          {/* Pillows */}
          <rect x={x + pad + 2} y={y + h - bh - pad + 2} width={bw / 2 - 3} height={bh * 0.15} fill="none" stroke={s} strokeWidth="0.3" rx="1" />
          <rect x={x + pad + bw / 2 + 1} y={y + h - bh - pad + 2} width={bw / 2 - 3} height={bh * 0.15} fill="none" stroke={s} strokeWidth="0.3" rx="1" />
          {/* Side table */}
          <rect x={x + pad + bw + 3} y={y + h - bh - pad} width={Math.min(15, w * 0.12)} height={Math.min(15, w * 0.12)} fill="none" stroke={s} strokeWidth="0.3" rx="1" />
          {/* Wardrobe on opposite wall */}
          <rect x={x + w - pad - w * 0.12} y={y + pad} width={w * 0.1} height={h * 0.35} fill="none" stroke={s} strokeWidth="0.3" />
          <line x1={x + w - pad - w * 0.07} y1={y + pad} x2={x + w - pad - w * 0.07} y2={y + pad + h * 0.35} stroke={s} strokeWidth="0.2" />
        </g>
      );
    }
    case 'hall': {
      // Sofa + coffee table + TV unit
      return (
        <g>
          {/* L-shaped sofa */}
          <rect x={x + pad} y={y + h - pad - h * 0.18} width={w * 0.6} height={h * 0.15} fill="none" stroke={s} strokeWidth={sw} rx="1" />
          <rect x={x + pad} y={y + h - pad - h * 0.35} width={w * 0.15} height={h * 0.2} fill="none" stroke={s} strokeWidth={sw} rx="1" />
          {/* Coffee table */}
          <rect x={x + w * 0.25} y={y + h * 0.5} width={w * 0.25} height={h * 0.12} fill="none" stroke={s} strokeWidth="0.3" rx="1" />
          {/* TV unit */}
          <rect x={x + w * 0.2} y={y + pad} width={w * 0.35} height={3} fill="none" stroke={s} strokeWidth={sw} />
        </g>
      );
    }
    case 'kitchen': {
      // L-shaped counter + stove + sink
      return (
        <g>
          {/* Counter along top wall */}
          <rect x={x + pad} y={y + pad} width={w - pad * 2} height={h * 0.15} fill="none" stroke={s} strokeWidth={sw} />
          {/* Counter along left wall */}
          <rect x={x + pad} y={y + pad} width={w * 0.12} height={h * 0.55} fill="none" stroke={s} strokeWidth={sw} />
          {/* Stove – 4 burner circles */}
          {[0, 1, 2, 3].map(i => (
            <circle key={i}
              cx={x + pad + (w - pad * 2) * 0.3 + (i % 2) * 8}
              cy={y + pad + h * 0.06 + Math.floor(i / 2) * 7}
              r={3} fill="none" stroke={s} strokeWidth="0.3"
            />
          ))}
          {/* Sink */}
          <rect x={x + pad + (w - pad * 2) * 0.65} y={y + pad + 1} width={w * 0.12} height={h * 0.1} fill="none" stroke={s} strokeWidth="0.3" rx="2" />
          {/* Fridge */}
          <rect x={x + w - pad - w * 0.12} y={y + h - pad - h * 0.2} width={w * 0.1} height={h * 0.18} fill="none" stroke={s} strokeWidth="0.3" />
        </g>
      );
    }
    case 'dining': {
      // Rectangular table + chairs
      const tw = w * 0.45, th = h * 0.4;
      const tcx = x + w / 2 - tw / 2, tcy = y + h / 2 - th / 2;
      return (
        <g>
          <rect x={tcx} y={tcy} width={tw} height={th} fill="none" stroke={s} strokeWidth={sw} rx="1" />
          {/* Chairs */}
          {[0.2, 0.5, 0.8].map(f => (
            <React.Fragment key={`ch_${f}`}>
              <rect x={tcx + tw * f - 3} y={tcy - 5} width={6} height={4} fill="none" stroke={s} strokeWidth="0.3" rx="1" />
              <rect x={tcx + tw * f - 3} y={tcy + th + 1} width={6} height={4} fill="none" stroke={s} strokeWidth="0.3" rx="1" />
            </React.Fragment>
          ))}
        </g>
      );
    }
    case 'toilet': {
      // WC + wash basin + shower
      return (
        <g>
          {/* WC */}
          <ellipse cx={x + w * 0.3} cy={y + h - pad - 5} rx={5} ry={6} fill="none" stroke={s} strokeWidth={sw} />
          <rect x={x + w * 0.3 - 4} y={y + h - pad - 2} width={8} height={3} fill="none" stroke={s} strokeWidth="0.3" rx="1" />
          {/* Wash basin */}
          <rect x={x + w * 0.6} y={y + pad} width={w * 0.2} height={5} fill="none" stroke={s} strokeWidth={sw} rx="2" />
          {/* Shower area – dashed corner */}
          <line x1={x + w - pad} y1={y + h - pad - h * 0.35} x2={x + w - pad} y2={y + h - pad} stroke={s} strokeWidth="0.3" strokeDasharray="2,1" />
          <line x1={x + w - pad - w * 0.3} y1={y + h - pad} x2={x + w - pad} y2={y + h - pad} stroke={s} strokeWidth="0.3" strokeDasharray="2,1" />
          {/* Shower head symbol */}
          <circle cx={x + w - pad - w * 0.15} cy={y + h - pad - h * 0.18} r={3} fill="none" stroke={s} strokeWidth="0.3" />
        </g>
      );
    }
    case 'puja': {
      // Small altar shelf
      return (
        <g>
          <rect x={x + w * 0.15} y={y + pad} width={w * 0.7} height={h * 0.12} fill="none" stroke={s} strokeWidth={sw} />
          <line x1={x + w * 0.15} y1={y + pad + h * 0.12} x2={x + w * 0.85} y2={y + pad + h * 0.12} stroke={s} strokeWidth="0.2" />
        </g>
      );
    }
    case 'staircase': {
      // Staircase treads with UP arrow
      const steps = 8;
      return (
        <g>
          {Array.from({ length: steps }, (_, i) => (
            <line key={i}
              x1={x + pad} y1={y + pad + (i + 1) * ((h - pad * 2) / (steps + 1))}
              x2={x + w - pad} y2={y + pad + (i + 1) * ((h - pad * 2) / (steps + 1))}
              stroke={s} strokeWidth="0.4"
            />
          ))}
          {/* UP arrow */}
          <line x1={x + w / 2} y1={y + h - pad} x2={x + w / 2} y2={y + pad + 5} stroke={s} strokeWidth="0.6" />
          <line x1={x + w / 2 - 3} y1={y + pad + 10} x2={x + w / 2} y2={y + pad + 5} stroke={s} strokeWidth="0.6" />
          <line x1={x + w / 2 + 3} y1={y + pad + 10} x2={x + w / 2} y2={y + pad + 5} stroke={s} strokeWidth="0.6" />
          <text x={x + w / 2 + 6} y={y + h / 2} fontSize="5" fill={s} fontStyle="italic">UP</text>
        </g>
      );
    }
    case 'parking': {
      // Car outline
      return (
        <g>
          <rect x={x + w * 0.2} y={y + h * 0.15} width={w * 0.6} height={h * 0.7} fill="none" stroke={s} strokeWidth={sw} rx="5" />
          <line x1={x + w * 0.25} y1={y + h * 0.35} x2={x + w * 0.75} y2={y + h * 0.35} stroke={s} strokeWidth="0.3" />
          <line x1={x + w * 0.25} y1={y + h * 0.65} x2={x + w * 0.75} y2={y + h * 0.65} stroke={s} strokeWidth="0.3" />
        </g>
      );
    }
    case 'balcony': {
      // Railing lines
      return (
        <g>
          <line x1={x + pad} y1={y + h / 2} x2={x + w - pad} y2={y + h / 2} stroke={s} strokeWidth="0.3" strokeDasharray="4,2" />
        </g>
      );
    }
    default:
      return null;
  }
};

/* ══════════════════════════════════════════════
   CENTERLINE GRID – Red circled labels
   ══════════════════════════════════════════════ */

const GridLines: React.FC<{
  columns: Column[];
  tx: (m: number) => number; ty: (m: number) => number;
  svgW: number; svgH: number;
}> = ({ columns, tx, ty, svgW, svgH }) => {
  const xs = Array.from(new Set(columns.map(c => c.x))).sort((a: number, b: number) => a - b);
  const ys = Array.from(new Set(columns.map(c => c.y))).sort((a: number, b: number) => a - b);

  return (
    <g>
      {xs.map((xv, i) => (
        <g key={`gx_${i}`}>
          <line x1={tx(xv)} y1={MARGIN_TOP - 30} x2={tx(xv)} y2={svgH - MARGIN_BOTTOM + 20} stroke={C.grid} strokeWidth="0.4" strokeDasharray="8,3" />
          {/* Circle label – top */}
          <circle cx={tx(xv)} cy={MARGIN_TOP - 40} r={10} fill="none" stroke={C.grid} strokeWidth="0.6" />
          <text x={tx(xv)} y={MARGIN_TOP - 36} textAnchor="middle" fontSize="8" fill={C.grid} fontWeight="700">
            {String.fromCharCode(65 + i)}
          </text>
          {/* Circle label – bottom */}
          <circle cx={tx(xv)} cy={svgH - MARGIN_BOTTOM + 35} r={10} fill="none" stroke={C.grid} strokeWidth="0.6" />
          <text x={tx(xv)} y={svgH - MARGIN_BOTTOM + 39} textAnchor="middle" fontSize="8" fill={C.grid} fontWeight="700">
            {String.fromCharCode(65 + i)}
          </text>
        </g>
      ))}
      {ys.map((yv, i) => (
        <g key={`gy_${i}`}>
          <line x1={MARGIN_LEFT - 30} y1={ty(yv)} x2={svgW - MARGIN_RIGHT + 10} y2={ty(yv)} stroke={C.grid} strokeWidth="0.4" strokeDasharray="8,3" />
          {/* Circle label – left */}
          <circle cx={MARGIN_LEFT - 40} cy={ty(yv)} r={10} fill="none" stroke={C.grid} strokeWidth="0.6" />
          <text x={MARGIN_LEFT - 40} y={ty(yv) + 3} textAnchor="middle" fontSize="8" fill={C.grid} fontWeight="700">
            {i + 1}
          </text>
          {/* Circle label – right */}
          <circle cx={svgW - MARGIN_RIGHT + 20} cy={ty(yv)} r={10} fill="none" stroke={C.grid} strokeWidth="0.6" />
          <text x={svgW - MARGIN_RIGHT + 20} y={ty(yv) + 3} textAnchor="middle" fontSize="8" fill={C.grid} fontWeight="700">
            {i + 1}
          </text>
        </g>
      ))}
    </g>
  );
};

/* ══════════════════════════════════════════════
   DIMENSION CHAINS – Tick marks (not arrows)
   ══════════════════════════════════════════════ */

const RoomDimensions: React.FC<{
  room: Room;
  tx: (m: number) => number; ty: (m: number) => number;
  scale: number;
}> = ({ room, tx, ty, scale }) => {
  const x = tx(room.x), y = ty(room.y);
  const w = room.width * scale, h = room.depth * scale;
  const off = 10; // offset from wall
  const tickL = 4;

  const wFt = (room.width / 0.3048);
  const dFt = (room.depth / 0.3048);
  const wLabel = `${wFt.toFixed(1)}'`;
  const dLabel = `${dFt.toFixed(1)}'`;

  return (
    <g>
      {/* Top dimension (width) */}
      <line x1={x} y1={y - off} x2={x + w} y2={y - off} stroke={C.dimLine} strokeWidth="0.4" />
      {/* Tick marks (45° slash) */}
      <line x1={x - tickL / 2} y1={y - off + tickL / 2} x2={x + tickL / 2} y2={y - off - tickL / 2} stroke={C.dimLine} strokeWidth="0.6" />
      <line x1={x + w - tickL / 2} y1={y - off + tickL / 2} x2={x + w + tickL / 2} y2={y - off - tickL / 2} stroke={C.dimLine} strokeWidth="0.6" />
      {/* Extension lines */}
      <line x1={x} y1={y - 2} x2={x} y2={y - off - 3} stroke={C.dimLine} strokeWidth="0.2" />
      <line x1={x + w} y1={y - 2} x2={x + w} y2={y - off - 3} stroke={C.dimLine} strokeWidth="0.2" />
      {/* Text */}
      <rect x={x + w / 2 - 14} y={y - off - 7} width={28} height={8} fill={C.bg} />
      <text x={x + w / 2} y={y - off - 1} textAnchor="middle" fontSize="6" fill={C.dim} fontWeight="600">{wLabel}</text>

      {/* Right dimension (depth) */}
      <line x1={x + w + off} y1={y} x2={x + w + off} y2={y + h} stroke={C.dimLine} strokeWidth="0.4" />
      <line x1={x + w + off - tickL / 2} y1={y - tickL / 2} x2={x + w + off + tickL / 2} y2={y + tickL / 2} stroke={C.dimLine} strokeWidth="0.6" />
      <line x1={x + w + off - tickL / 2} y1={y + h - tickL / 2} x2={x + w + off + tickL / 2} y2={y + h + tickL / 2} stroke={C.dimLine} strokeWidth="0.6" />
      <line x1={x + w + 2} y1={y} x2={x + w + off + 3} y2={y} stroke={C.dimLine} strokeWidth="0.2" />
      <line x1={x + w + 2} y1={y + h} x2={x + w + off + 3} y2={y + h} stroke={C.dimLine} strokeWidth="0.2" />
      <g transform={`rotate(-90, ${x + w + off + 5}, ${y + h / 2})`}>
        <rect x={x + w + off + 5 - 12} y={y + h / 2 - 4} width={24} height={8} fill={C.bg} />
        <text x={x + w + off + 5} y={y + h / 2 + 2} textAnchor="middle" fontSize="6" fill={C.dim} fontWeight="600">{dLabel}</text>
      </g>
    </g>
  );
};

const OverallDimensions: React.FC<{
  layout: Layout; fl: { rooms: Room[] };
  tx: (m: number) => number; ty: (m: number) => number; scale: number;
}> = ({ layout, tx, ty, scale }) => {
  const pw = layout.plotWidthM, pd = layout.plotDepthM;
  const off = 25;
  const tickL = 5;

  return (
    <g>
      {/* Overall width at bottom */}
      <line x1={tx(0)} y1={ty(pd) + off} x2={tx(pw)} y2={ty(pd) + off} stroke={C.dim} strokeWidth="0.5" />
      <line x1={tx(0) - tickL / 2} y1={ty(pd) + off + tickL / 2} x2={tx(0) + tickL / 2} y2={ty(pd) + off - tickL / 2} stroke={C.dim} strokeWidth="0.8" />
      <line x1={tx(pw) - tickL / 2} y1={ty(pd) + off + tickL / 2} x2={tx(pw) + tickL / 2} y2={ty(pd) + off - tickL / 2} stroke={C.dim} strokeWidth="0.8" />
      <line x1={tx(0)} y1={ty(pd) + 3} x2={tx(0)} y2={ty(pd) + off + 5} stroke={C.dim} strokeWidth="0.2" />
      <line x1={tx(pw)} y1={ty(pd) + 3} x2={tx(pw)} y2={ty(pd) + off + 5} stroke={C.dim} strokeWidth="0.2" />
      <rect x={tx(pw / 2) - 25} y={ty(pd) + off - 5} width={50} height={9} fill={C.bg} />
      <text x={tx(pw / 2)} y={ty(pd) + off + 3} textAnchor="middle" fontSize="7" fill={C.dim} fontWeight="700">
        {(pw / 0.3048).toFixed(0)}' - 0"
      </text>

      {/* Overall depth on left */}
      <line x1={tx(0) - off} y1={ty(0)} x2={tx(0) - off} y2={ty(pd)} stroke={C.dim} strokeWidth="0.5" />
      <line x1={tx(0) - off - tickL / 2} y1={ty(0) - tickL / 2} x2={tx(0) - off + tickL / 2} y2={ty(0) + tickL / 2} stroke={C.dim} strokeWidth="0.8" />
      <line x1={tx(0) - off - tickL / 2} y1={ty(pd) - tickL / 2} x2={tx(0) - off + tickL / 2} y2={ty(pd) + tickL / 2} stroke={C.dim} strokeWidth="0.8" />
      <line x1={tx(0) - 3} y1={ty(0)} x2={tx(0) - off - 5} y2={ty(0)} stroke={C.dim} strokeWidth="0.2" />
      <line x1={tx(0) - 3} y1={ty(pd)} x2={tx(0) - off - 5} y2={ty(pd)} stroke={C.dim} strokeWidth="0.2" />
      <g transform={`rotate(-90, ${tx(0) - off - 5}, ${ty(pd / 2)})`}>
        <rect x={tx(0) - off - 5 - 20} y={ty(pd / 2) - 5} width={40} height={9} fill={C.bg} />
        <text x={tx(0) - off - 5} y={ty(pd / 2) + 3} textAnchor="middle" fontSize="7" fill={C.dim} fontWeight="700">
          {(pd / 0.3048).toFixed(0)}' - 0"
        </text>
      </g>
    </g>
  );
};

/* ══════════════════════════════════════════════
   SETBACK ANNOTATIONS
   ══════════════════════════════════════════════ */

const SetbackAnnotations: React.FC<{
  layout: Layout; tx: (m: number) => number; ty: (m: number) => number;
}> = ({ layout, tx, ty }) => {
  const sb = layout.setbacks;
  const pw = layout.plotWidthM, pd = layout.plotDepthM;
  const fs = '5.5';

  return (
    <g fill={C.setback} fontSize={fs} fontStyle="italic">
      {/* Front */}
      <text x={tx(pw / 2)} y={ty(sb.front / 2) + 2} textAnchor="middle">
        F.S. {sb.front}m
      </text>
      {/* Rear */}
      <text x={tx(pw / 2)} y={ty(pd - sb.rear / 2) + 2} textAnchor="middle">
        R.S. {sb.rear}m
      </text>
      {/* Left */}
      <g transform={`rotate(-90, ${tx(sb.left / 2)}, ${ty(pd / 2)})`}>
        <text x={tx(sb.left / 2)} y={ty(pd / 2) + 2} textAnchor="middle">
          L.S. {sb.left}m
        </text>
      </g>
      {/* Right */}
      <g transform={`rotate(90, ${tx(pw - sb.right / 2)}, ${ty(pd / 2)})`}>
        <text x={tx(pw - sb.right / 2)} y={ty(pd / 2) + 2} textAnchor="middle">
          R.S. {sb.right}m
        </text>
      </g>
    </g>
  );
};

/* ══════════════════════════════════════════════
   NORTH ARROW – Proper compass rose
   ══════════════════════════════════════════════ */

const NorthArrow: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  return (
    <g>
      <circle cx={x} cy={y} r={16} fill="none" stroke={C.text} strokeWidth="0.5" />
      <circle cx={x} cy={y} r={14} fill="none" stroke={C.text} strokeWidth="0.3" />
      {/* North pointer – filled triangle */}
      <polygon points={`${x},${y - 13} ${x - 4},${y} ${x},${y - 3}`} fill={C.text} />
      {/* North pointer – hollow triangle */}
      <polygon points={`${x},${y - 13} ${x + 4},${y} ${x},${y - 3}`} fill="none" stroke={C.text} strokeWidth="0.5" />
      {/* South pointer */}
      <line x1={x} y1={y + 3} x2={x} y2={y + 13} stroke={C.text} strokeWidth="0.3" />
      {/* E-W */}
      <line x1={x - 13} y1={y} x2={x - 3} y2={y} stroke={C.text} strokeWidth="0.3" />
      <line x1={x + 3} y1={y} x2={x + 13} y2={y} stroke={C.text} strokeWidth="0.3" />
      {/* N label */}
      <text x={x} y={y - 19} textAnchor="middle" fontSize="9" fill={C.text} fontWeight="800">N</text>
    </g>
  );
};

/* ══════════════════════════════════════════════
   SCALE BAR
   ══════════════════════════════════════════════ */

const ScaleBar: React.FC<{ x: number; y: number; scale: number }> = ({ x, y, scale }) => {
  const segM = 1; // each segment = 1 meter
  const segs = 5;
  const segPx = segM * scale;

  return (
    <g>
      <text x={x} y={y - 5} fontSize="6" fill={C.text} fontWeight="600">SCALE 1:{Math.round(1000 / scale * 25.4)}</text>
      {Array.from({ length: segs }, (_, i) => (
        <rect key={i} x={x + i * segPx} y={y} width={segPx} height={4}
          fill={i % 2 === 0 ? C.text : C.bg} stroke={C.text} strokeWidth="0.5"
        />
      ))}
      {Array.from({ length: segs + 1 }, (_, i) => (
        <text key={`t${i}`} x={x + i * segPx} y={y + 11} textAnchor="middle" fontSize="5" fill={C.text}>
          {i * segM}m
        </text>
      ))}
    </g>
  );
};

/* ══════════════════════════════════════════════
   TITLE BLOCK
   ══════════════════════════════════════════════ */

const TitleBlock: React.FC<{
  x: number; y: number; w: number; h: number;
  layout: Layout; floorLabel: string; viewMode: string;
}> = ({ x, y, w, h, layout, floorLabel, viewMode }) => {
  const modeLabels: Record<string, string> = {
    furniture: 'FURNITURE LAYOUT',
    centerline: 'CENTERLINE GRID PLAN',
    dimension: 'DIMENSION PLAN',
    structural: 'STRUCTURAL GRID PLAN',
  };
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.bg} stroke={C.titleBlock} strokeWidth="1" />
      <line x1={x} y1={y + 15} x2={x + w} y2={y + 15} stroke={C.titleBlock} strokeWidth="0.3" />
      <line x1={x} y1={y + 30} x2={x + w} y2={y + 30} stroke={C.titleBlock} strokeWidth="0.3" />
      <line x1={x + w * 0.55} y1={y + 15} x2={x + w * 0.55} y2={y + h} stroke={C.titleBlock} strokeWidth="0.3" />
      {/* Row 1 – Title */}
      <text x={x + 5} y={y + 10} fontSize="7" fill={C.titleBlock} fontWeight="800" letterSpacing="1">
        {modeLabels[viewMode] || 'FLOOR PLAN'}
      </text>
      {/* Row 2 */}
      <text x={x + 5} y={y + 24} fontSize="5.5" fill={C.titleBlock}>
        {layout.name} • {floorLabel}
      </text>
      <text x={x + w * 0.55 + 5} y={y + 24} fontSize="5.5" fill={C.titleBlock}>
        Built-up: {layout.builtUpAreaSqFt} sqft
      </text>
      {/* Row 3 */}
      <text x={x + 5} y={y + 39} fontSize="5" fill={C.textLight}>
        NBC 2016 | {layout.nbcCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
      </text>
      <text x={x + w * 0.55 + 5} y={y + 39} fontSize="5" fill={C.textLight}>
        Date: {date}
      </text>
    </g>
  );
};
