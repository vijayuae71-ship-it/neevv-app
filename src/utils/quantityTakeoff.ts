/**
 * Quantity take-off from the locked layout geometry.
 *
 * Walls, openings, floor finishes, tiling and ceiling areas are measured from the
 * same rooms and openings schedule that drive the drawings — no rule-of-thumb ratios.
 * Rooms are rectangles in building-relative metres (x across, y from the front wall).
 */
import type { Layout, Room } from '../types';
import { isNiche } from './quantityRules';

/** Bath wall tiling for one bath: perimeter × tile height, less one 750×2100 door. */
export function bathWallTileSqM(r: Room, tileH: number): number { return Math.max(0, 2 * (r.width + r.depth) * tileH - 0.75 * 2.1); }
/** Kitchen counter running metres for one kitchen (L-shape along the long wall and one short wall). */
export function kitchenCounterRmt(r: Room): number { return Math.max(2.4, Math.max(r.width, r.depth) + Math.min(r.width, r.depth) - 0.6); }
export const KITCHEN_DADO_HEIGHT_M = 0.6;

export interface FloorTakeoff {
  floor: number;
  externalWallLenM: number;   // full-height external masonry (excludes balcony/open edges)
  internalWallLenM: number;   // internal partitions, each shared edge counted once
  balconyEdgeLenM: number;    // external edges of balconies (railing, not full walls)
  roomAreaSqM: number;
  doorAreaExtSqM: number; doorAreaIntSqM: number;
  windowAreaExtSqM: number; windowAreaIntSqM: number;
  netExtMasonrySqM: number; netIntMasonrySqM: number; // after openings and columns — the BOQ masonry basis
}

export interface Takeoff {
  source: 'geometry';
  floors: FloorTakeoff[];
  footprintPerimeterM: number;
  masonryHeightM: number;
  externalMasonrySqM: number;
  internalMasonrySqM: number;
  internalPlasterSqM: number;
  externalPlasterSqM: number;
  ceilingSqM: number;
  floorFinish: { vitrifiedSqM: number; antiSkidSqM: number; balconySqM: number; stairTreads: number };
  bathWallTileSqM: number;
  bathTileHeightM: number;
  kitchenDadoSqM: number;
  kitchenCounterRmt: number;
  wetAreaSqM: { baths: number; kitchens: number; utility: number };
  parapetLenM: number;
  openings: { doors: number; windows: number; ventilators: number };
}

const EPS = 0.02;
const WET = new Set(['toilet', 'bathroom']);
const isOn = (v: number, t: number) => Math.abs(v - t) < EPS;

function sharedLength(r: Room, others: Room[], side: 'x0' | 'x1' | 'y0' | 'y1'): number {
  let len = 0;
  for (const o of others) {
    if (o === r) continue;
    if ((side === 'x0' && isOn(r.x, o.x + o.width)) || (side === 'x1' && isOn(r.x + r.width, o.x))) {
      len += Math.max(0, Math.min(r.y + r.depth, o.y + o.depth) - Math.max(r.y, o.y));
    } else if ((side === 'y0' && isOn(r.y, o.y + o.depth)) || (side === 'y1' && isOn(r.y + r.depth, o.y))) {
      len += Math.max(0, Math.min(r.x + r.width, o.x + o.width) - Math.max(r.x, o.x));
    }
  }
  return len;
}

export function computeTakeoff(layout: Layout, opts: { floorHeightM?: number; beamDepthM?: number; columnCount?: number; columnSizeM?: number; bathTileHeightM?: number } = {}): Takeoff {
  const W = layout.buildableWidthM, D = layout.buildableDepthM;
  const floorH = opts.floorHeightM ?? 3.0;
  const beamD = Math.min(0.6, Math.max(0.3, opts.beamDepthM ?? 0.45));
  const masonryH = +(floorH - beamD).toFixed(3);
  const ops = layout.openingsSchedule?.openings ?? [];
  const floors: FloorTakeoff[] = [];

  for (const f of layout.floors) {
    const rooms = f.rooms.filter((r) => !isNiche(r));
    let ext = 0, intShared = 0, balc = 0, area = 0, freeInternal = 0;
    for (const r of rooms) {
      area += r.width * r.depth;
      const edges: { side: 'x0' | 'x1' | 'y0' | 'y1'; len: number; onBoundary: boolean }[] = [
        { side: 'x0', len: r.depth, onBoundary: isOn(r.x, 0) },
        { side: 'x1', len: r.depth, onBoundary: isOn(r.x + r.width, W) },
        { side: 'y0', len: r.width, onBoundary: isOn(r.y, 0) },
        { side: 'y1', len: r.width, onBoundary: isOn(r.y + r.depth, D) },
      ];
      for (const e of edges) {
        if (e.onBoundary) { if (r.type === 'balcony') balc += e.len; else ext += e.len; continue; }
        const sh = Math.min(e.len, sharedLength(r, rooms, e.side));
        intShared += sh;
        freeInternal += Math.max(0, e.len - sh); // inner edge facing a void/terrace is still a wall
      }
    }
    const internal = intShared / 2 + freeInternal;
    const fo = ops.filter((o) => (o.floor ?? 0) === f.floor);
    const a = (o: (typeof ops)[number]) => (o.widthMm / 1000) * (o.heightMm / 1000) * (o.quantity || 1);
    floors.push({
      floor: f.floor,
      externalWallLenM: +ext.toFixed(2), internalWallLenM: +internal.toFixed(2), balconyEdgeLenM: +balc.toFixed(2), roomAreaSqM: +area.toFixed(2),
      doorAreaExtSqM: +fo.filter((o) => o.type === 'door' && o.wall !== 'internal').reduce((s, o) => s + a(o), 0).toFixed(2),
      doorAreaIntSqM: +fo.filter((o) => o.type === 'door' && o.wall === 'internal').reduce((s, o) => s + a(o), 0).toFixed(2),
      windowAreaExtSqM: +fo.filter((o) => o.type !== 'door' && o.wall !== 'internal').reduce((s, o) => s + a(o), 0).toFixed(2),
      windowAreaIntSqM: +fo.filter((o) => o.type !== 'door' && o.wall === 'internal').reduce((s, o) => s + a(o), 0).toFixed(2),
      netExtMasonrySqM: 0, netIntMasonrySqM: 0,
    });
  }

  const colCount = opts.columnCount ?? 0;
  const colSize = opts.columnSizeM ?? 0.3;
  let extMas = 0, intMas = 0, intPl = 0, extPl = 0;
  for (const t of floors) {
    const totalLen = t.externalWallLenM + t.internalWallLenM;
    const colPerFloor = layout.floors.length ? colCount / layout.floors.length : 0;
    const colLen = totalLen > 0 ? Math.min(totalLen * 0.25, colPerFloor * colSize) : 0;
    const extLen = Math.max(0, t.externalWallLenM - colLen * (t.externalWallLenM / (totalLen || 1)));
    const intLen = Math.max(0, t.internalWallLenM - colLen * (t.internalWallLenM / (totalLen || 1)));
    const extOpen = t.doorAreaExtSqM + t.windowAreaExtSqM;
    const intOpen = t.doorAreaIntSqM + t.windowAreaIntSqM;
    t.netExtMasonrySqM = +Math.max(0, extLen * masonryH - extOpen).toFixed(1);
    t.netIntMasonrySqM = +Math.max(0, intLen * masonryH - intOpen).toFixed(1);
    extMas += t.netExtMasonrySqM;
    intMas += t.netIntMasonrySqM;
    const plH = floorH - 0.15;
    intPl += Math.max(0, t.externalWallLenM * plH - extOpen) + Math.max(0, 2 * (t.internalWallLenM * plH - intOpen));
    extPl += Math.max(0, t.externalWallLenM * floorH - extOpen);
  }
  const perimeter = 2 * (W + D);
  extPl += perimeter * 1.0 * 2; // parapet, both faces

  const all = layout.floors.flatMap((f) => f.rooms).filter((r) => !isNiche(r));
  const areaOf = (pred: (r: Room) => boolean) => all.filter(pred).reduce((s, r) => s + r.width * r.depth, 0);
  const baths = all.filter((r) => WET.has(r.type));
  const kitchens = all.filter((r) => r.type === 'kitchen');
  const tileH = opts.bathTileHeightM ?? 2.1;
  const bathWallTile = baths.reduce((s, r) => s + bathWallTileSqM(r, tileH), 0);
  const counter = kitchens.reduce((s, r) => s + kitchenCounterRmt(r), 0);
  const stairs = all.filter((r) => r.type === 'staircase');
  const storeys = Math.max(1, layout.numFloors ?? layout.floors.length);
  // risers per storey (3.0 m floor-to-floor at ≤190 mm) incl. the terrace flight
  const stairTreads = stairs.length ? Math.ceil(floorH / 0.19) * storeys : 0;
  const stairArea = areaOf((r) => r.type === 'staircase');
  const balconySqM = areaOf((r) => r.type === 'balcony');
  const antiSkid = areaOf((r) => WET.has(r.type) || r.type === 'utility');
  const parkingArea = areaOf((r) => r.type === 'parking');
  const totalRoom = areaOf(() => true);

  return {
    source: 'geometry',
    floors,
    footprintPerimeterM: +perimeter.toFixed(2),
    masonryHeightM: masonryH,
    externalMasonrySqM: +extMas.toFixed(1),
    internalMasonrySqM: +intMas.toFixed(1),
    internalPlasterSqM: +intPl.toFixed(1),
    externalPlasterSqM: +extPl.toFixed(1),
    ceilingSqM: +(totalRoom - stairArea * 0.5).toFixed(1),
    floorFinish: {
      vitrifiedSqM: +Math.max(0, totalRoom - stairArea - balconySqM - antiSkid - parkingArea).toFixed(1),
      antiSkidSqM: +antiSkid.toFixed(1),
      balconySqM: +balconySqM.toFixed(1),
      stairTreads,
    },
    bathWallTileSqM: +bathWallTile.toFixed(1),
    bathTileHeightM: tileH,
    kitchenDadoSqM: +(counter * KITCHEN_DADO_HEIGHT_M).toFixed(1),
    kitchenCounterRmt: +counter.toFixed(1),
    wetAreaSqM: { baths: +areaOf((r) => WET.has(r.type)).toFixed(1), kitchens: +areaOf((r) => r.type === 'kitchen').toFixed(1), utility: +areaOf((r) => r.type === 'utility').toFixed(1) },
    parapetLenM: +perimeter.toFixed(2),
    openings: {
      doors: ops.filter((o) => o.type === 'door').reduce((s, o) => s + (o.quantity || 1), 0),
      windows: ops.filter((o) => o.type === 'window').reduce((s, o) => s + (o.quantity || 1), 0),
      ventilators: ops.filter((o) => o.type === 'ventilator').reduce((s, o) => s + (o.quantity || 1), 0),
    },
  };
}
