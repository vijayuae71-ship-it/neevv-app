/**
 * neevv Architect Planner — brief-first residential planning.
 *
 * The design logic is fixed and architect-defined; the computer only sizes, places and checks.
 *   1. Plot → setbacks → buildable envelope → FSI cap (all assumptions labelled).
 *   2. Brief → how much area the family actually needs → number of floors (1 if it fits, G+1 only if needed).
 *   3. Zoning in three bands from the road:  FRONT (public: kitchen | dining | living)
 *                                            MIDDLE (stair spine | family lobby | pooja)
 *                                            REAR (private: bedrooms + bath columns)
 *   4. Service column (kitchen, utility, stair) on one side; the stair is placed first and repeats on every floor.
 *   5. Rooms grow with the plot up to sensible caps; unused FSI is reported, never forced into the design.
 *   6. Vastu decides which side the service column goes (ranking preference only).
 *   7. Every option is checked; anything with an ERROR is never offered. If nothing fits, the brief is
 *      reported as not fitting with verified alternatives — rooms are never silently dropped.
 *
 * Coordinates returned in the app frame: metres, building-relative, x = left→right as seen from inside
 * the house looking at the road (vastuEngine convention), y = 0 at the front (road) wall → rear.
 */
import type { Facing, Room, RoomType } from '../../types';
import { calculateVastuScore } from '../vastuEngine';

export const ARCHITECT_PLANNER_VERSION = 'neevv-architect-planner v1.0 (2026-10-09)';
const FT = 0.3048;
const SQFT = 10.7639;
const EXT = 0.23; // external wall (full thickness inside the footprint)
const INT = 0.075; // half of a 150 mm internal wall
const r2 = (n: number) => Math.round(n * 100) / 100;
const snap = (n: number) => Math.round(n * 20) / 20;
const snapDown = (n: number) => Math.floor(n * 20 + 1e-6) / 20;

export type Status = 'PASS' | 'WARNING' | 'ERROR' | 'INFEASIBLE' | 'UNVERIFIED';
export interface PlanCheck { item: string; status: Status; detail: string; suggestion?: string }

export interface Brief {
  plotWidthFt: number; plotDepthFt: number; facing: Facing;
  bedrooms: number;                       // total incl. master (1–5)
  masterBath: 'attached' | 'separate';
  pooja: boolean; study: boolean;
  parking: 'Open' | 'Stilt' | 'None';
  vastu: boolean;
  fsi?: number;                           // assumed 1.0
  setbacks?: { front: number; rear: number; left: number; right: number }; // metres; assumed defaults
  floorsPreference?: 'auto' | 1 | 2;
}

export const DEFAULT_SETBACKS = { front: 1.5, rear: 1.5, left: 1.0, right: 1.0 };
export const MIN_PLOT = { widthFt: 30, depthFt: 40, areaSqft: 1200 };
const CAR_FRONT_M = 5.0; // open depth in front of the building for one car

// ───────── Size table (centre-line metres) by plot band — architect's incremental sizes ─────────
type Band = 0 | 1 | 2 | 3;
const BAND_NAME = ['Small', 'Medium', 'Large', 'Extra large'];
const bandOf = (plotSqm: number): Band => (plotSqm <= 140 ? 0 : plotSqm <= 250 ? 1 : plotSqm <= 450 ? 2 : 3);
const SZ = {
  kitchenW: [3.1, 3.2, 3.5, 3.9], kitchenD: [2.7, 3.1, 3.4, 3.7],
  utilD: [1.2, 1.3, 1.4, 1.6],
  bathW: [1.6, 1.65, 1.75, 1.9], bathD: [2.65, 2.7, 2.8, 3.0],
  masterW: [3.9, 4.2, 4.6, 5.1], bedW: [3.3, 3.5, 3.8, 4.1], rearD: [3.6, 3.9, 4.3, 4.7],
  livingD: [4.4, 4.4, 4.8, 5.4], livingCapW: 7.6, diningW: [0, 3.1, 3.5, 3.9], diningCapW: 4.3,
  poojaW: [0, 1.6, 1.9, 2.2],
  stairBoxL: 3.1, stairBoxD: 2.3, // dog-leg 2 × 1.0 m flights: 2.1 × 2.75 m clear + walls
  midD: [2.3, 2.5, 2.8, 3.1],
  min: { living: 3.4, bedW: 3.0, masterW: 3.4, rearD: 3.35, rearDCompact: 3.1, frontD: 3.45, dining: 2.6, kitchenDCompact: 2.4 },
};

// ───────── Envelope ─────────
export interface SiteEnvelope {
  plotWm: number; plotDm: number; plotSqm: number; band: Band; bandName: string;
  setbacks: { front: number; rear: number; left: number; right: number }; setbackSource: 'assumed' | 'customer';
  envW: number; envD: number; fsi: number; fsiSource: 'assumed' | 'customer'; fsiCapSqm: number;
  carInFront: boolean; maxDepthWithCar: number;
}
export function siteEnvelope(b: Brief): SiteEnvelope {
  const pw = b.plotWidthFt * FT, pd = b.plotDepthFt * FT, sb = b.setbacks ?? DEFAULT_SETBACKS;
  const envW = snapDown(pw - sb.left - sb.right), envD = snapDown(pd - sb.front - sb.rear);
  const fsi = b.fsi ?? 1.0;
  const carInFront = b.parking === 'Open' && b.plotWidthFt >= 40 && b.plotDepthFt >= 50;
  return {
    plotWm: r2(pw), plotDm: r2(pd), plotSqm: r2(pw * pd), band: bandOf(pw * pd), bandName: BAND_NAME[bandOf(pw * pd)],
    setbacks: sb, setbackSource: b.setbacks ? 'customer' : 'assumed', envW, envD, fsi, fsiSource: b.fsi !== undefined ? 'customer' : 'assumed',
    fsiCapSqm: r2(pw * pd * fsi), carInFront, maxDepthWithCar: snapDown(pd - sb.rear - CAR_FRONT_M),
  };
}

// ───────── Geometry types (canonical frame: x from service side, y from front) ─────────
type Kind = 'kitchen' | 'utility' | 'stair' | 'living' | 'dining' | 'hall' | 'lobby' | 'lounge' | 'pooja' | 'pooja_niche'
  | 'master' | 'mbath' | 'dress' | 'bedroom' | 'bath' | 'wash' | 'study' | 'store' | 'balcony';
interface Cell { name: string; kind: Kind; x0: number; x1: number; y0: number; y1: number; open?: ('S' | 'N' | 'F' | 'R')[] }
interface FloorGeo { label: string; cells: Cell[] }
export interface Variant { storeys: 1 | 2; serviceSide: 'left' | 'right'; compact?: boolean; rbMax?: number }

const KIND_TO_TYPE: Record<Kind, RoomType> = {
  kitchen: 'kitchen', utility: 'utility', stair: 'staircase', living: 'hall', dining: 'dining', hall: 'hall', lobby: 'passage',
  lounge: 'hall', pooja: 'puja', pooja_niche: 'puja', master: 'master_bedroom', mbath: 'toilet', dress: 'store', bedroom: 'bedroom',
  bath: 'toilet', wash: 'utility', study: 'study', store: 'store', balcony: 'balcony',
};

interface Need { masterAttached: boolean; commonBaths: number }
function bathNeed(b: Brief, storeys: number): Need {
  const B = b.bedrooms;
  if (B === 1) return { masterAttached: false, commonBaths: 1 }; // 1BHK: one common bath
  const masterAttached = b.masterBath === 'attached';
  const others = masterAttached ? B - 1 : B;
  let commonBaths = Math.max(1, Math.ceil(others / 2));
  if (storeys === 2) commonBaths = Math.max(commonBaths, masterAttached ? 1 : 2); // a bath on each floor
  return { masterAttached, commonBaths };
}

/** Distribute `total` width across cells with [min, target, cap]; returns widths or null if mins don't fit. */
function distribute(total: number, cells: { min: number; target: number; cap: number; weight: number }[]): number[] | null {
  const sumMin = cells.reduce((s, c) => s + c.min, 0);
  if (sumMin > total + 1e-6) return null;
  const sumT = cells.reduce((s, c) => s + c.target, 0);
  let w: number[];
  if (sumT >= total) {
    // compress from target toward min proportionally to the slack
    const slack = sumT - sumMin, k = slack > 0 ? (sumT - total) / slack : 0;
    w = cells.map((c) => c.target - (c.target - c.min) * k);
  } else {
    w = cells.map((c) => c.target);
    let left = total - sumT;
    for (let it = 0; it < 6 && left > 1e-6; it++) {
      const open = cells.map((c, i) => (w[i] < c.cap - 1e-6 ? c.weight : 0));
      const ws = open.reduce((s, v) => s + v, 0);
      if (ws === 0) break;
      let used = 0;
      w = w.map((v, i) => { const add = Math.min(cells[i].cap - v, (left * open[i]) / ws); used += add; return v + add; });
      left -= used;
    }
    if (left > 1e-6) return null; // cannot absorb — caller decides (narrower building)
  }
  // snap to 50 mm keeping the total exact
  const out = w.map(snap); const diff = r2(total - out.reduce((s, v) => s + v, 0));
  out[out.length - 1] = r2(out[out.length - 1] + diff);
  return out;
}

interface Built { W: number; D: number; floors: FloorGeo[]; notes: string[]; failures: string[]; frontOpen: number }

/** Front open space: car bay when planned, else the front setback + a sit-out; any extra depth becomes a rear garden. */
function placeFront(env: SiteEnvelope, D: number): number {
  const avail = env.plotDm - env.setbacks.rear - D;           // maximum possible front open depth
  const want = env.carInFront ? Math.max(CAR_FRONT_M + 0.5, env.setbacks.front) : env.setbacks.front + 1.5;
  return r2(Math.max(env.setbacks.front, Math.min(avail, want)));
}

function build(b: Brief, env: SiteEnvelope, v: Variant): Built {
  const k = env.band, B = b.bedrooms, notes: string[] = [];
  const fail = (m: string): Built => ({ W: 0, D: 0, floors: [], notes, failures: [m], frontOpen: 0 });
  const two = v.storeys === 2;
  const compact = !!v.compact;
  const Ws = snap(Math.max(SZ.kitchenW[k], SZ.stairBoxL));
  const bathW = SZ.bathW[k];
  const attached = B >= 2 && b.masterBath === 'attached';
  const minBed = SZ.min.bedW;
  const c0Min = snap(Math.max(SZ.min.masterW, Ws + 0.95));
  const masterT = Math.max(SZ.masterW[k], c0Min), bedT = SZ.bedW[k];

  // ── Wet columns in the rear row; they repeat on every floor so plumbing stacks ──
  const ffOthers = two ? B - 2 : 0;
  const ffWet = two ? (attached ? 1 : 0) + (ffOthers > 0 || !attached ? 1 : 0) : 0;
  const gfCommons = two ? 1 : Math.max(1, Math.ceil((attached ? B - 1 : B) / 2));
  const wetCols = two ? Math.max(1, ffWet) : (attached ? 1 : 0) + gfCommons;

  // ── How many bedrooms the rear row holds; the rest go to the front band (architect's overflow order) ──
  const rowWant = two ? ffOthers : B - 1;
  const fixedMin = c0Min + wetCols * 1.5;
  if (fixedMin > env.envW + 1e-6) return fail(`Bedroom + bath row needs ${r2(fixedMin)} m width; only ${env.envW} m is buildable`);
  const rb = Math.min(rowWant, v.rbMax ?? 99, Math.max(0, Math.floor((env.envW - fixedMin + 1e-6) / minBed)));
  let overflow = rowWant - rb;
  const gfFrontBed = !two && overflow >= 1 ? 1 : 0;
  const midBed = !two && overflow >= 2 ? 1 : 0;
  if (!two && overflow > 2) return fail(`${overflow} bedrooms do not fit the bedroom zone of a single storey`);
  if (compact && !two && overflow > 0) return fail('Compact pattern keeps all bedrooms in the rear row');
  const ffFrontCap = two ? Math.min(2, Math.floor((env.envW - Ws + 1e-6) / minBed)) : 0;
  const ffFrontBeds = two ? Math.min(overflow, ffFrontCap) : 0;
  const gfExtraBed = two ? overflow - ffFrontBeds : 0;
  if (gfExtraBed > 1) return fail('Too many bedrooms for two floors of this plot');
  const hasPoojaRoom = b.pooja && k >= 1 && !midBed && !compact;

  // ── Width: sized to the brief (big plots keep side gardens), capped by the envelope ──
  const livingT = Math.min(SZ.livingCapW, 3.6 + 0.5 * B + 0.5 * k);
  const splitDiningWanted = B >= 2 && k >= 1;
  const frontTarget = Ws + (splitDiningWanted ? SZ.diningW[k] : 0) + livingT + gfFrontBed * bedT;
  const rearTarget = masterT + wetCols * bathW + rb * bedT + (two && rb === 0 ? 2.8 : 0);
  let W = Math.min(env.envW, snap(Math.max(frontTarget, rearTarget)));
  const frontMin = Ws + SZ.min.living + gfFrontBed * minBed;
  if (frontMin > W) W = env.envW;
  if (frontMin > W + 1e-6) return fail(`Front rooms need ${r2(frontMin)} m width; only ${env.envW} m is buildable`);

  // ── Depths ──
  // compact pattern (narrow plots): no middle band — the stair sits behind the kitchen and the hall reaches the bedrooms directly
  const kdC = compact ? Math.max(SZ.min.kitchenDCompact, Math.min(SZ.kitchenD[k], 2.7)) : 0;
  let Df = compact ? r2(kdC + SZ.stairBoxD) : Math.max(SZ.livingD[k], SZ.kitchenD[k] + SZ.utilD[k] * (k >= 1 ? 1 : 0));
  let Dr = SZ.rearD[k];
  let Dm = compact ? 0 : snap(midBed ? Math.max(SZ.midD[k], 3.45) : SZ.midD[k]);
  const DmMin = compact ? 0 : midBed ? 3.45 : SZ.stairBoxD;
  const frontDMin = compact ? r2(SZ.min.kitchenDCompact + SZ.stairBoxD) : SZ.min.frontD, rearDMin = compact ? SZ.min.rearDCompact : SZ.min.rearD;
  let Dcap = env.envD;
  if (env.carInFront) Dcap = Math.min(Dcap, env.maxDepthWithCar);
  const perFloorCap = env.fsiCapSqm / v.storeys;
  const shrinkTo = (cap: number): string | null => {
    let over = Df + Dm + Dr - cap;
    if (over <= 1e-6) return null;
    const fCut = Math.max(0, Math.min(over, Df - frontDMin)); Df -= fCut; over -= fCut;
    const rCut = Math.max(0, Math.min(over, Dr - rearDMin)); Dr -= rCut; over -= rCut;
    const mCut = Math.max(0, Math.min(over, Dm - DmMin)); Dm = r2(Dm - mCut); over -= mCut;
    return over > 1e-6 ? `needs ${r2(Df + Dm + Dr)} m depth; only ${r2(cap)} m available${env.carInFront && cap === env.maxDepthWithCar ? ' after keeping car space in front' : ''}` : null;
  };
  let e = shrinkTo(Dcap); if (e) return fail(`Plan ${e}`);
  const rearMinW = c0Min + wetCols * 1.5 + rb * minBed;
  if (W * (Df + Dm + Dr) > perFloorCap + 0.05) {
    const wFit = snapDown(perFloorCap / (Df + Dm + Dr));
    const wFloor = Math.max(rearMinW, frontMin, Ws + Math.min(livingT, 4.2) + gfFrontBed * minBed);
    if (wFit >= wFloor) W = wFit; // narrower house, same rooms, wider side open space
    // otherwise keep the width and take the cut in depth (rooms keep usable proportions)
  }
  if (W * (Df + Dm + Dr) > perFloorCap + 0.05) { e = shrinkTo(snapDown(perFloorCap / W)); if (e && two && rb > 0) return build(b, env, { ...v, rbMax: rb - 1 }); if (e) return fail(`FSI ${env.fsi}: each of ${v.storeys} floor(s) may be ${r2(perFloorCap)} m²; the plan ${e}`); }
  Df = snapDown(Df); Dr = snapDown(Dr);
  const D = r2(Df + Dm + Dr), yF = Df, yM = r2(Df + Dm);
  if (W * D > perFloorCap + 0.05) return fail(`Each floor would be ${r2(W * D)} m²; FSI ${env.fsi} allows ${r2(perFloorCap)} m² per floor`);

  // ── Rear row ──
  const spec: { key: string; min: number; target: number; cap: number; weight: number }[] = [
    { key: 'c0', min: c0Min, target: masterT, cap: 5.6, weight: 1.3 },
    ...Array.from({ length: wetCols }, (_, i) => ({ key: `w${i}`, min: 1.5, target: bathW, cap: bathW + 0.25, weight: 0.1 })),
    ...Array.from({ length: rb }, (_, i) => ({ key: `b${i}`, min: minBed, target: bedT, cap: 4.6, weight: 1 })),
  ];
  if (two && rb === 0) spec.push({ key: 'x', min: 0, target: 2.8, cap: 99, weight: 1 });
  let rw = distribute(W, spec);
  if (!rw) { spec.push({ key: 'x', min: 0, target: 0, cap: 99, weight: 0.01 }); rw = distribute(W, spec); }
  if (!rw) return fail('Rear row does not fit');
  // a sliver end cell (< 1.2 m) is merged into its neighbour
  // a sliver end cell (< 1.2 m) goes to the nearest bedroom (the master/parents column if only baths sit next to it)
  if (spec[spec.length - 1].key === 'x' && rw[rw.length - 1] < 1.2 && spec.length > 1) {
    const sl = rw.pop()!; spec.pop();
    let j = spec.length - 1; while (j > 0 && spec[j].key.startsWith('w')) j--;
    rw[j] = r2(rw[j] + sl);
  }
  const rx: Record<string, [number, number]> = {}; let acc = 0;
  spec.forEach((c, i) => { rx[c.key] = [r2(acc), r2(acc + rw![i])]; acc += rw![i]; });
  const restKeys = spec.filter((s) => s.key.startsWith('b') || s.key === 'x').map((s) => s.key);

  const bathColumn = (x0: number, x1: number, top: Kind, topName: string, bathKind: Kind, bathName: string): Cell[] => {
    const bd = SZ.bathD[k];
    if (Dr - bd >= 0.9 - 1e-6) return [
      { name: topName, kind: top, x0, x1, y0: yM, y1: r2(D - bd) },
      { name: bathName, kind: bathKind, x0, x1, y0: r2(D - bd), y1: D },
    ];
    return [{ name: bathName, kind: bathKind, x0, x1, y0: yM, y1: D }];
  };
  const restCell = (name: string, kind: Kind): Cell | null => {
    if (!restKeys.length) return null;
    return { name, kind, x0: rx[restKeys[0]][0], x1: rx[restKeys[restKeys.length - 1]][1], y0: yM, y1: D };
  };

  // ── Front band (ground floor): kitchen + utility | dining | living | front bedroom ──
  const gf: Cell[] = [];
  const kd = Math.min(SZ.kitchenD[k], Df);
  const stairName = !two ? 'Stair (terrace / future floor)' : 'Stair';
  const compactStair: Cell = { name: stairName, kind: 'stair', x0: 0, x1: Ws, y0: r2(Df - SZ.stairBoxD), y1: Df };
  if (compact) { gf.push({ name: 'Kitchen', kind: 'kitchen', x0: 0, x1: Ws, y0: 0, y1: r2(Df - SZ.stairBoxD) }); gf.push({ ...compactStair }); }
  else if (Df - kd >= 1.1) { gf.push({ name: 'Kitchen', kind: 'kitchen', x0: 0, x1: Ws, y0: 0, y1: kd }); gf.push({ name: 'Utility', kind: 'utility', x0: 0, x1: Ws, y0: kd, y1: Df }); }
  else gf.push({ name: 'Kitchen', kind: 'kitchen', x0: 0, x1: Ws, y0: 0, y1: Df });
  const fRest = r2(W - Ws);
  const split = splitDiningWanted && fRest - gfFrontBed * bedT >= 4.2 + 2.9;
  const fSpec = [
    ...(split ? [{ n: 'Dining', kd: 'dining' as Kind, min: SZ.min.dining, target: SZ.diningW[k], cap: SZ.diningCapW, weight: 0.5 }] : []),
    { n: split ? 'Living' : 'Living + dining hall', kd: (split ? 'living' : 'hall') as Kind, min: SZ.min.living, target: livingT, cap: SZ.livingCapW, weight: 1 },
    ...(gfFrontBed ? [{ n: `Bedroom ${B - midBed}`, kd: 'bedroom' as Kind, min: minBed, target: bedT, cap: 4.4, weight: 0.6 }] : []),
  ];
  let fw = distribute(fRest, fSpec);
  if (!fw) { fSpec.push({ n: 'Study', kd: 'study', min: 0, target: 0, cap: 99, weight: 0.01 }); fw = distribute(fRest, fSpec); }
  if (!fw) return fail('Front rooms do not fit');
  if (fSpec[fSpec.length - 1].kd === 'study' && fw[fw.length - 1] < 2.6) { const li = fSpec.findIndex((s) => s.kd === 'living' || s.kd === 'hall'); fw[li] = r2(fw[li] + fw[fw.length - 1]); fw.pop(); fSpec.pop(); }
  let fx = Ws; let livingCell: Cell | null = null;
  fSpec.forEach((s, i) => {
    const c: Cell = { name: s.n, kind: s.kd, x0: r2(fx), x1: r2(fx + fw![i]), y0: 0, y1: Df };
    if (s.kd === 'dining') c.open = ['N']; if (s.kd === 'living' && split) c.open = ['S'];
    if (s.kd === 'living' || s.kd === 'hall') livingCell = c;
    gf.push(c); fx += fw![i];
  });
  if (gf[gf.length - 1].x1 !== W) gf[gf.length - 1].x1 = W;
  if (b.pooja && !hasPoojaRoom && livingCell) { const lc = livingCell as Cell; gf.push({ name: 'Pooja niche', kind: 'pooja_niche', x0: r2(lc.x1 - 0.8), x1: lc.x1, y0: 0, y1: 0.8 }); }

  // ── Middle band: stair spine | lobby | pooja room or bedroom ──
  const midRow = (fi: number): Cell[] => {
    const cells: Cell[] = [];
    if (compact) return cells;
    const sd = Dm - SZ.stairBoxD >= 0.9 ? SZ.stairBoxD : Dm;
    cells.push({ name: !two ? 'Stair (terrace / future floor)' : 'Stair', kind: 'stair', x0: 0, x1: Ws, y0: yF, y1: r2(yF + sd) });
    if (sd < Dm) cells.push({ name: 'Store', kind: 'store', x0: 0, x1: Ws, y0: r2(yF + sd), y1: yM });
    let xEnd = W;
    if (fi === 0 && hasPoojaRoom) { const pw = SZ.poojaW[k]; cells.push({ name: 'Pooja room', kind: 'pooja', x0: r2(W - pw), x1: W, y0: yF, y1: yM }); xEnd = r2(W - pw); }
    if (fi === 0 && midBed) { const bw = snap(Math.min(bedT, W - Ws - 1.8)); cells.push({ name: `Bedroom ${B}`, kind: 'bedroom', x0: r2(W - bw), x1: W, y0: yF, y1: yM }); xEnd = r2(W - bw); }
    // a long middle band is split: lobby + family lounge, so no corridor-like strip
    const lobbyLen = xEnd - Ws, maxLobby = snap(Math.max(3.0, 2.6 * Dm));
    if (lobbyLen > 3.5 * (Dm - 0.15) && lobbyLen - maxLobby >= 2.6) {
      cells.push({ name: fi === 0 ? 'Lobby' : 'Upper lobby', kind: 'lobby', x0: Ws, x1: r2(Ws + maxLobby), y0: yF, y1: yM, open: ['N'] });
      cells.push({ name: 'Family lounge / TV', kind: 'lounge', x0: r2(Ws + maxLobby), x1: xEnd, y0: yF, y1: yM, open: ['S', 'F'] });
    } else cells.push({ name: fi === 0 ? (two ? 'Lobby' : 'Family lobby / TV') : 'Upper lobby', kind: 'lobby', x0: Ws, x1: xEnd, y0: yF, y1: yM, open: fi === 0 ? ['F'] : [] });
    return cells;
  };
  gf.push(...midRow(0));

  if (!two) {
    gf.push({ name: B === 1 ? 'Bedroom' : 'Master bedroom', kind: B === 1 ? 'bedroom' : 'master', x0: rx.c0[0], x1: rx.c0[1], y0: yM, y1: D });
    let w = 0;
    if (attached) { const [a, z] = rx[`w${w++}`]; gf.push(...bathColumn(a, z, 'dress', 'Dress', 'mbath', 'Master bath')); }
    for (let i = 0; i < gfCommons; i++) { const [a, z] = rx[`w${w++}`]; gf.push(...bathColumn(a, z, 'wash', 'Wash', 'bath', gfCommons > 1 ? `Common bath ${i + 1}` : 'Common bath')); }
    for (let i = 0; i < rb; i++) gf.push({ name: `Bedroom ${i + 2}`, kind: 'bedroom', x0: rx[`b${i}`][0], x1: rx[`b${i}`][1], y0: yM, y1: D });
    if (rx.x) { const wx = rx.x[1] - rx.x[0]; gf.push({ name: wx >= 2.6 ? 'Study' : 'Linen store', kind: wx >= 2.6 ? 'study' : 'store', x0: rx.x[0], x1: rx.x[1], y0: yM, y1: D }); }
    notes.push(`Single storey: all ${B} bedroom${B > 1 ? 's' : ''} on one level — no stair climbing; the stair is kept for terrace / water-tank access and a future floor.`);
    if (gfFrontBed) notes.push('One bedroom sits at the front, opening off the living room (guest / elders).');
    if (midBed) notes.push('One bedroom sits beside the family lobby with its own outside wall.');
    return { W, D, floors: [{ label: 'GROUND FLOOR', cells: gf }], notes, failures: [], frontOpen: placeFront(env, D) };
  }

  // ── G+1 ──
  // GF rear: parents' bedroom · common bath (under the FF master bath) · utility under the FF common bath · guest/study
  const [w0a, w0z] = rx.w0;
  gf.push({ name: 'Bedroom 2 (parents)', kind: 'bedroom', x0: rx.c0[0], x1: rx.c0[1], y0: yM, y1: D });
  gf.push(...bathColumn(w0a, w0z, 'wash', 'Wash', 'bath', 'Common bath'));
  for (let i = 1; i < wetCols; i++) { const [a, z] = rx[`w${i}`]; gf.push(...bathColumn(a, z, 'wash', 'Wash', 'utility', 'Laundry')); }
  const restW = restKeys.length ? rx[restKeys[restKeys.length - 1]][1] - rx[restKeys[0]][0] : 0;
  let bedNo = 3;
  const ff: Cell[] = [...midRow(1)];
  // the master is made larger than the parents' room by taking δ from the master-bath column above the GF bath
  const bathMinW = 1.2 + INT + (Math.abs(w0z - W) < 1e-6 ? EXT : INT) + 0.05;
  const delta = r2(Math.max(0, Math.min(0.45, w0z - w0a - bathMinW)));
  ff.push({ name: 'Master bedroom', kind: 'master', x0: rx.c0[0], x1: r2(rx.c0[1] + delta), y0: yM, y1: D });
  if (attached) ff.push(...bathColumn(r2(w0a + delta), w0z, 'dress', 'Dress', 'mbath', 'Master bath'));
  else ff.push(...bathColumn(r2(w0a + delta), w0z, 'wash', 'Wash', 'bath', 'Common bath'));
  for (let i = 1; i < wetCols; i++) { const [a, z] = rx[`w${i}`]; ff.push(...bathColumn(a, z, 'wash', 'Wash', 'bath', 'Common bath')); }
  for (let i = 0; i < rb; i++) ff.push({ name: `Bedroom ${bedNo++}`, kind: 'bedroom', x0: rx[`b${i}`][0], x1: rx[`b${i}`][1], y0: yM, y1: D });
  if (rx.x) { const wx = rx.x[1] - rx.x[0]; ff.push({ name: wx >= 2.6 ? (b.study ? 'Study' : 'Study / hobby') : 'Linen store', kind: wx >= 2.6 ? 'study' : 'store', x0: rx.x[0], x1: rx.x[1], y0: yM, y1: D }); }
  // FF front band: over the kitchen → balcony/study; over dining + living → bedrooms first, then the family lounge
  const kEnd = compact ? r2(Df - SZ.stairBoxD) : Df;          // K column above the kitchen
  const kTop = Math.min(kEnd, 2.6);
  const studyTop = b.study && !rx.x && !(compact && ffFrontBeds > 0);
  ff.push({ name: studyTop ? 'Study' : 'Balcony (open)', kind: studyTop ? 'study' : 'balcony', x0: 0, x1: Ws, y0: 0, y1: kEnd - kTop >= 0.9 ? kTop : kEnd });
  if (kEnd - kTop >= 0.9) ff.push({ name: 'Linen / store', kind: 'store', x0: 0, x1: Ws, y0: kTop, y1: kEnd });
  if (compact) ff.push({ ...compactStair });
  // master clear area — no other bedroom may be as large
  const masterClearA = (rx.c0[1] + delta - rx.c0[0] - EXT - INT) * (Dr - EXT - INT);
  if (ffFrontBeds > 0) {
    const lobbyD = compact ? 1.3 : 0;                         // compact: a lobby strip behind the front bedrooms reaches the rear rooms
    const bedD = r2(Df - lobbyD);
    const capW = Math.min(4.6, (masterClearA * 0.95) / Math.max(1, bedD - EXT - INT) + INT * 2);
    const s2 = [...Array.from({ length: ffFrontBeds }, () => ({ min: minBed, target: Math.min(bedT, capW), cap: capW, weight: 1 })), { min: 0, target: 0, cap: 99, weight: 0.01 }];
    const ww = distribute(fRest, s2);
    if (!ww) return fail('Upper-floor front bedrooms do not fit');
    let xx = Ws;
    for (let i = 0; i < ffFrontBeds; i++) { ff.push({ name: `Bedroom ${bedNo++}`, kind: 'bedroom', x0: r2(xx), x1: r2(xx + ww[i]), y0: 0, y1: bedD }); xx += ww[i]; }
    const left = r2(W - xx);
    if (left >= 2.6) ff.push({ name: 'Family lounge', kind: 'lounge', x0: r2(xx), x1: W, y0: 0, y1: bedD, open: compact ? ['R'] : [] });
    else if (left >= 1.0) ff.push({ name: 'Balcony (open)', kind: 'balcony', x0: r2(xx), x1: W, y0: 0, y1: bedD });
    else if (left > 0.01) ff[ff.length - 1].x1 = W;
    if (lobbyD) ff.push({ name: 'Upper lobby', kind: 'lobby', x0: Ws, x1: W, y0: bedD, y1: Df });
  } else ff.push({ name: 'Family lounge', kind: 'lounge', x0: Ws, x1: W, y0: 0, y1: Df, open: ['R'] });
  if (gfExtraBed) {
    if (restW < minBed) return fail('Fourth bedroom does not fit on either floor');
    gf.push(restCell(`Bedroom ${bedNo++}`, 'bedroom')!);
  } else if (restW > 0.05) {
    gf.push(restCell(restW >= 2.6 ? (b.study ? 'Study' : 'Guest / study') : 'Store', restW >= 2.6 ? 'study' : 'store')!);
  }
  notes.push('G+1: parents\u2019 bedroom on the ground floor so elders avoid the stairs; master suite directly above; upstairs baths sit over the ground-floor bath/utility.');
  if (ffFrontBeds) notes.push(`${ffFrontBeds} upper bedroom${ffFrontBeds > 1 ? 's' : ''} at the front, over the living area.`);
  return { W, D, floors: [{ label: 'GROUND FLOOR', cells: gf }, { label: 'FIRST FLOOR', cells: ff }], notes, failures: [], frontOpen: placeFront(env, D) };
}


// ───────── Checks (computer) ─────────
function clearOf(c: Cell, W: number, D: number) {
  const ded = (side: 'S' | 'N' | 'F' | 'R', edge: boolean) => (c.kind === 'balcony' ? 0 : edge ? EXT : c.open?.includes(side) ? 0 : INT);
  const w = c.x1 - c.x0 - ded('S', c.x0 < 1e-6) - ded('N', Math.abs(c.x1 - W) < 1e-6);
  const d = c.y1 - c.y0 - ded('F', c.y0 < 1e-6) - ded('R', Math.abs(c.y1 - D) < 1e-6);
  return { w: r2(w), d: r2(d), a: r2(w * d) };
}
function shared(a: Cell, b: Cell) {
  const e = 1e-6; let L = 0;
  if (Math.abs(a.x1 - b.x0) < e || Math.abs(b.x1 - a.x0) < e) L = Math.max(L, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  if (Math.abs(a.y1 - b.y0) < e || Math.abs(b.y1 - a.y0) < e) L = Math.max(L, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  return L;
}
const overlaps = (a: Cell, b: Cell) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;

function checkPlan(bt: Built, env: SiteEnvelope, b: Brief): PlanCheck[] {
  const out: PlanCheck[] = []; const { W, D, floors } = bt;
  const add = (item: string, ok: boolean, detail: string, soft = false, suggestion?: string) => out.push({ item, status: ok ? 'PASS' : soft ? 'WARNING' : 'ERROR', detail, suggestion });
  add('Building inside setback envelope', W <= env.envW + 1e-6 && D <= env.envD + 1e-6, `${W} × ${D} m vs ${env.envW} × ${env.envD} m`);
  let total = 0;
  for (const f of floors) {
    const open = f.cells.filter((c) => c.kind === 'balcony').reduce((s, c) => s + (c.x1 - c.x0) * (c.y1 - c.y0), 0);
    total += W * D - open;
    // tiling: cells must cover the footprint without overlap
    const area = f.cells.filter((c) => c.kind !== 'pooja_niche').reduce((s, c) => s + (c.x1 - c.x0) * (c.y1 - c.y0), 0);
    add(`${f.label}: rooms tile the footprint`, Math.abs(area - W * D) < 0.05, `${r2(area)} of ${r2(W * D)} m²`);
    const cs = f.cells.filter((c) => c.kind !== 'pooja_niche');
    let ov = false; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (overlaps(cs[i], cs[j])) ov = true;
    add(`${f.label}: no overlapping rooms`, !ov, ov ? 'overlap found' : 'none');
  }
  add('Total built-up within FSI', total <= env.fsiCapSqm + 0.05, `${r2(total)} m² (${Math.round(total * SQFT)} sqft) vs ${env.fsiCapSqm} m² (FSI ${env.fsi}); balconies counted open, staircase counted`);
  const all = floors.flatMap((f, fi) => f.cells.map((c) => ({ f, fi, c, cl: clearOf(c, W, D) })));
  // bedroom count preservation (Test A)
  const beds = all.filter((o) => o.c.kind === 'bedroom' || o.c.kind === 'master');
  add('All requested bedrooms present', beds.length === b.bedrooms, `${beds.length} of ${b.bedrooms}`);
  const tag = (o: { f: FloorGeo; c: Cell }) => `${o.f.label === 'GROUND FLOOR' ? 'GF' : 'FF'} ${o.c.name}`;
  for (const o of all) {
    const { c, cl } = o; const mn = Math.min(cl.w, cl.d), ratio = Math.max(cl.w, cl.d) / Math.max(mn, 0.01);
    if (c.kind === 'master') add(`${tag(o)}: habitable room min (≥9.5 m², ≥2.4 m)`, cl.a >= 9.5 && mn >= 2.4, `${cl.a} m², ${cl.w}×${cl.d} m`);
    if (c.kind === 'bedroom') add(`${tag(o)}: habitable room min (≥7.5 m², ≥2.4 m)`, cl.a >= 7.5 && mn >= 2.4, `${cl.a} m², ${cl.w}×${cl.d} m`);
    if (c.kind === 'hall' || c.kind === 'living') add(`${tag(o)}: living min (≥9.5 m², ≥3.0 m)`, cl.a >= 9.5 && mn >= 3.0, `${cl.a} m², ${cl.w}×${cl.d} m`);
    if (c.kind === 'kitchen') add(`${tag(o)}: kitchen min (≥5.0 m², ≥1.8 m)`, cl.a >= 5 && mn >= 1.8, `${cl.a} m², ${cl.w}×${cl.d} m`);
    if (c.kind === 'bath' || c.kind === 'mbath') add(`${tag(o)}: bath + WC min (≥2.8 m², ≥1.2 m)`, cl.a >= 2.8 && mn >= 1.2, `${cl.a} m², ${cl.w}×${cl.d} m`);
    if (c.kind === 'stair') add(`${tag(o)}: dog-leg stair fits (2.1 × 2.75 m clear)`, Math.min(cl.w, cl.d) >= 2.1 - 1e-6 && Math.max(cl.w, cl.d) >= 2.75 - 1e-6, `${cl.w}×${cl.d} m clear`);
    if (['master', 'bedroom', 'kitchen', 'study'].includes(c.kind) || ((c.kind === 'hall' || c.kind === 'living') && !c.open?.length)) add(`${tag(o)}: proportion ≤ 1.7`, ratio <= 1.7, ratio.toFixed(2), true);
    if (c.kind === 'bath' || c.kind === 'mbath') add(`${tag(o)}: bath not a long strip (≤ 2.1)`, ratio <= 2.1, ratio.toFixed(2), true);
    if (c.kind === 'lobby' && o.fi === 0) add(`${tag(o)}: lobby not a corridor (≤ 3.5 : 1)`, Math.max(cl.w, cl.d) / Math.max(0.01, mn) <= 3.5, `${cl.w}×${cl.d} m`, true);
    if (['store', 'wash', 'dress', 'utility'].includes(c.kind) && cl.a < 1.0) add(`${tag(o)}: usable size (≥1.0 m²)`, false, `${cl.a} m²`, true);
    if (['master', 'bedroom', 'hall', 'living', 'kitchen', 'study', 'lounge'].includes(c.kind) && !(c.kind === 'lounge' && c.open?.length)) {
      const ext = c.x0 < 1e-6 || Math.abs(c.x1 - W) < 1e-6 || c.y0 < 1e-6 || Math.abs(c.y1 - D) < 1e-6;
      add(`${tag(o)}: has an external wall for light/ventilation`, ext, ext ? 'yes' : 'internal room');
    }
    if (c.kind === 'bath' || c.kind === 'mbath') {
      const ext = c.x0 < 1e-6 || Math.abs(c.x1 - W) < 1e-6 || c.y0 < 1e-6 || Math.abs(c.y1 - D) < 1e-6;
      add(`${tag(o)}: ventilator on external wall`, ext, ext ? 'yes' : 'needs duct', true);
    }
  }
  // access: every room opens off circulation (or its parent), never through another bedroom
  const CIRC: Kind[] = ['living', 'dining', 'hall', 'lobby', 'lounge'];
  for (const f of floors) for (const c of f.cells) {
    if (CIRC.includes(c.kind) || c.kind === 'pooja_niche' || c.kind === 'balcony') continue;
    const parents: Kind[] = c.kind === 'mbath' ? ['dress', 'master'] : c.kind === 'dress' ? ['master'] : c.kind === 'bath' ? ['wash', ...CIRC]
      : c.kind === 'utility' ? ['kitchen', 'wash', ...CIRC] : c.kind === 'store' ? [...CIRC, 'kitchen', 'utility', 'stair', 'wash'] : c.kind === 'stair' ? [...CIRC] : CIRC;
    const best = Math.max(0, ...f.cells.filter((o) => o !== c && parents.includes(o.kind)).map((o) => shared(c, o)));
    add(`${f.label === 'GROUND FLOOR' ? 'GF' : 'FF'} ${c.name}: door off ${parents[0] === 'dress' ? 'master suite' : 'circulation'}`, best >= 0.9 - 1e-6, `${r2(best)} m shared wall`);
  }
  if (beds.length > 1) {
    const m = beds.find((o) => o.c.kind === 'master'); const other = Math.max(...beds.filter((o) => o.c.kind !== 'master').map((o) => o.cl.a));
    if (m) add('Master is the largest bedroom', m.cl.a > other, `${m.cl.a} vs ${other} m²`);
  }
  if (floors.length > 1) {
    const st = (f: FloorGeo) => f.cells.find((c) => c.kind === 'stair')!;
    const a = st(floors[0]), s = st(floors[1]);
    add('Stair in the same position on every floor', a.x0 === s.x0 && a.x1 === s.x1 && a.y0 === s.y0 && a.y1 === s.y1, `${a.x0}–${a.x1} × ${a.y0}–${a.y1} m`);
    for (const bth of floors[1].cells.filter((c) => c.kind === 'bath' || c.kind === 'mbath')) {
      const below = floors[0].cells.filter((g) => overlaps(g, bth) && g.kind !== 'pooja_niche').map((g) => g.kind);
      add(`FF ${bth.name} stacks over a wet area`, below.every((t) => ['bath', 'mbath', 'utility', 'wash', 'kitchen'].includes(t)), `below: ${below.join(', ')}`, true);
      add(`FF ${bth.name} not above pooja or kitchen hob`, !below.includes('pooja'), below.join(', '));
    }
  }
  out.push({ item: 'NBC minimum values', status: 'UNVERIFIED', detail: 'from neevv rule set; verify against the NBC 2016 text' });
  out.push({ item: 'Setbacks and FSI', status: 'UNVERIFIED', detail: `${env.setbackSource} setbacks F${env.setbacks.front}/R${env.setbacks.rear}/S${env.setbacks.left}–${env.setbacks.right} m, FSI ${env.fsi} (${env.fsiSource}) — confirm with local building regulations` });
  return out;
}

// ───────── Area the brief needs (for the verdict) ─────────
export function briefAreaSqm(b: Brief, env: SiteEnvelope, storeys: number): number {
  const k = env.band, need = bathNeed(b, storeys);
  const net = 12 + (b.bedrooms - 1) * 2 + 7.5 + SZ.kitchenW[k] * SZ.kitchenD[k] * 0.85 + 11 + (b.bedrooms - 1) * 9.5
    + ((need.masterAttached ? 1 : 0) + need.commonBaths) * 3.6 + (b.pooja ? 1.5 : 0);
  return r2(net * 1.3 + storeys * 7.5);
}

// ───────── Public API ─────────
export interface PlanOption {
  id: string; title: string; storeys: 1 | 2; serviceSide: 'left' | 'right';
  widthM: number; depthM: number; floors: { floor: number; label: string; rooms: Room[] }[];
  builtUpSqm: number; builtUpSqft: number; fsiUsed: number; frontOpenM: number; parkingNote: string;
  vastuScore: number; checks: PlanCheck[]; notes: string[]; recommended: boolean;
  openings: PlanOpening[]; structuralGrid: { xs: number[]; ys: number[] };
}
export interface PlanOpening {
  id: string; floor: number; roomId: string; room: string; type: 'door' | 'window' | 'ventilator';
  wall: 'front' | 'rear' | 'left' | 'right' | 'internal';   // building wall for exterior openings
  face: 'front' | 'rear' | 'left' | 'right';                // side of the room the opening sits on
  positionMm: number;                                        // centre, measured along that side from the room's origin corner
  widthMm: number; heightMm: number; sillHeightMm: number; material: string; quantity: 1; main?: boolean;
}
export interface PlanResult {
  status: 'OK' | 'INFEASIBLE' | 'UNSUPPORTED';
  version: string; envelope: SiteEnvelope; verdict: string; options: PlanOption[];
  reasons: string[]; alternatives: { label: string; brief: Partial<Brief>; verified: boolean; note: string }[];
  checks: PlanCheck[];
}

// ───────── Openings (doors on the real shared wall with the room's access, windows on real external walls) ─────────
const CIRC_KINDS: Kind[] = ['living', 'dining', 'hall', 'lobby', 'lounge'];
function accessParents(c: Cell): Kind[] {
  return c.kind === 'mbath' ? ['dress', 'master'] : c.kind === 'dress' ? ['master'] : c.kind === 'bath' ? ['wash', ...CIRC_KINDS]
    : c.kind === 'utility' ? ['kitchen', 'wash', ...CIRC_KINDS] : c.kind === 'store' ? [...CIRC_KINDS, 'kitchen', 'utility', 'wash']
    : c.kind === 'balcony' ? ['lounge', 'bedroom', 'master', 'study', 'lobby'] : CIRC_KINDS;
}
type Side = 'S' | 'N' | 'F' | 'R';
function sharedEdge(a: Cell, b: Cell): { side: Side; from: number; to: number } | null {
  const e = 1e-6;
  if (Math.abs(a.x0 - b.x1) < e || Math.abs(a.x1 - b.x0) < e) {
    const from = Math.max(a.y0, b.y0), to = Math.min(a.y1, b.y1);
    if (to - from > e) return { side: Math.abs(a.x0 - b.x1) < e ? 'S' : 'N', from, to };
  }
  if (Math.abs(a.y0 - b.y1) < e || Math.abs(a.y1 - b.y0) < e) {
    const from = Math.max(a.x0, b.x0), to = Math.min(a.x1, b.x1);
    if (to - from > e) return { side: Math.abs(a.y0 - b.y1) < e ? 'F' : 'R', from, to };
  }
  return null;
}
interface RawOpening { cell: Cell; fi: number; type: PlanOpening['type']; side: Side; centre: number; widthMm: number; heightMm: number; sill: number; material: string; exterior: boolean; main?: boolean }
function makeOpenings(bt: Built): RawOpening[] {
  const out: RawOpening[] = [];
  const { W, D } = bt;
  bt.floors.forEach((f, fi) => {
    for (const c of f.cells) {
      if (c.kind === 'pooja_niche') continue;
      // door
      if (!CIRC_KINDS.includes(c.kind) && c.kind !== 'stair') {
        let best: { side: Side; from: number; to: number } | null = null;
        for (const o of f.cells) {
          if (o === c || !accessParents(c).includes(o.kind)) continue;
          const se = sharedEdge(c, o); if (se && (!best || se.to - se.from > best.to - best.from)) best = se;
        }
        if (best) {
          const isBath = c.kind === 'bath' || c.kind === 'mbath';
          const w = c.kind === 'balcony' ? Math.min(1800, Math.round((best.to - best.from) * 1000) - 300) : isBath ? 750 : c.kind === 'store' || c.kind === 'wash' || c.kind === 'dress' ? 750 : c.kind === 'pooja' ? 750 : 900;
          if (w >= 600) out.push({ cell: c, fi, type: 'door', side: best.side, centre: best.from + Math.min((best.to - best.from) / 2, 0.15 + w / 2000), widthMm: w, heightMm: 2100, sill: 0,
            material: isBath ? 'WPC frame, PVC shutter' : c.kind === 'balcony' ? 'UPVC sliding door, clear glass' : 'Sal wood frame, flush door shutter', exterior: false });
        }
      }
      // exterior edges of this cell
      const ext: { side: Side; len: number; from: number; to: number }[] = [];
      if (c.y0 < 1e-6) ext.push({ side: 'F', len: c.x1 - c.x0, from: c.x0, to: c.x1 });
      if (Math.abs(c.y1 - D) < 1e-6) ext.push({ side: 'R', len: c.x1 - c.x0, from: c.x0, to: c.x1 });
      if (c.x0 < 1e-6) ext.push({ side: 'S', len: c.y1 - c.y0, from: c.y0, to: c.y1 });
      if (Math.abs(c.x1 - W) < 1e-6) ext.push({ side: 'N', len: c.y1 - c.y0, from: c.y0, to: c.y1 });
      ext.sort((a, b) => b.len - a.len);
      // main entrance: front wall of the GF living / hall
      if (fi === 0 && (c.kind === 'living' || c.kind === 'hall') && c.y0 < 1e-6) {
        const centre = c.kind === 'hall' ? c.x0 + Math.min(1.2, (c.x1 - c.x0) / 3) : (c.x0 + c.x1) / 2 - 0.6;
        out.push({ cell: c, fi, type: 'door', side: 'F', centre, widthMm: 1050, heightMm: 2100, sill: 0, material: 'Teak wood frame, panelled main door', exterior: true, main: true });
      }
      if (!ext.length || ['store', 'dress', 'wash', 'balcony', 'lobby', 'pooja'].includes(c.kind)) continue;
      const isWet = c.kind === 'bath' || c.kind === 'mbath';
      const spec = isWet ? { w: 600, h: 450, sill: 2100, t: 'ventilator' as const, m: 'Aluminium frame, frosted glass louvres' }
        : c.kind === 'kitchen' ? { w: 1200, h: 1050, sill: 1050, t: 'window' as const, m: 'UPVC frame, clear glass, MS grille' }
        : c.kind === 'stair' ? { w: 900, h: 900, sill: 1500, t: 'window' as const, m: 'UPVC frame, clear glass, MS grille' }
        : c.kind === 'utility' ? { w: 900, h: 900, sill: 1200, t: 'window' as const, m: 'UPVC frame, clear glass, MS grille' }
        : (c.kind === 'living' || c.kind === 'hall' || c.kind === 'lounge') ? { w: 1800, h: 1500, sill: 750, t: 'window' as const, m: 'UPVC frame, clear glass, MS grille' }
        : { w: 1500, h: 1200, sill: 900, t: 'window' as const, m: 'UPVC frame, clear glass, MS grille' };
      const edges = ['master', 'living', 'hall', 'lounge'].includes(c.kind) || (c.kind === 'bedroom' && ext.length > 1) ? ext.slice(0, 2) : ext.slice(0, 1);
      for (const e of edges) {
        const w = Math.min(spec.w, Math.round(e.len * 1000) - 600);
        if (w < 450) continue;
        let centre = (e.from + e.to) / 2;
        // keep the living-room window clear of the main door
        if (fi === 0 && e.side === 'F' && (c.kind === 'living' || c.kind === 'hall')) centre = Math.min(e.to - w / 2000 - 0.3, centre + 0.9);
        out.push({ cell: c, fi, type: spec.t, side: e.side, centre, widthMm: w, heightMm: spec.h, sill: spec.sill, material: spec.m, exterior: true });
      }
    }
  });
  return out;
}

/** Column lines chosen from real wall lines (≤ 5 m spans) so columns sit in walls, not in the middle of rooms. */
function structuralGrid(bt: Built): { xs: number[]; ys: number[] } {
  const pick = (len: number, cands: number[], coverage: (v: number) => number): number[] => {
    const cs = Array.from(new Set(cands.map((v) => r2(v)))).filter((v) => v > 0.6 && v < len - 0.6).sort((a, b) => a - b);
    const out = [0]; let prev = 0;
    while (len - prev > 5.0 + 1e-6) {
      const opts = cs.filter((v) => v > prev + 1.2 && v <= prev + 5.0 + 1e-6);
      if (!opts.length) { prev = r2(Math.min(prev + 5.0, len)); out.push(prev); continue; }
      const best = opts.reduce((a, b) => (coverage(b) + (b - prev) / 25 > coverage(a) + (a - prev) / 25 ? b : a));
      out.push(best); prev = best;
    }
    out.push(r2(len));
    return out;
  };
  const cells = bt.floors.flatMap((f) => f.cells.filter((c) => c.kind !== 'pooja_niche'));
  const total = bt.floors.length;
  const covX = (x: number) => cells.filter((c) => Math.abs(c.x0 - x) < 1e-6 || Math.abs(c.x1 - x) < 1e-6).reduce((s, c) => s + (c.y1 - c.y0), 0) / (2 * bt.D * total);
  const covY = (y: number) => cells.filter((c) => Math.abs(c.y0 - y) < 1e-6 || Math.abs(c.y1 - y) < 1e-6).reduce((s, c) => s + (c.x1 - c.x0), 0) / (2 * bt.W * total);
  return { xs: pick(bt.W, cells.flatMap((c) => [c.x0, c.x1]), covX), ys: pick(bt.D, cells.flatMap((c) => [c.y0, c.y1]), covY) };
}

function toApp(bt: Built, side: 'left' | 'right'): { floor: number; label: string; rooms: Room[] }[] {
  return bt.floors.map((f, fi) => ({
    floor: fi, label: f.label,
    rooms: f.cells.map((c, i) => {
      const w = r2(c.x1 - c.x0), x = side === 'left' ? c.x0 : r2(bt.W - c.x1);
      return { id: `f${fi}_${c.kind}_${i}`, name: c.name, type: KIND_TO_TYPE[c.kind], x, y: c.y0, width: w, depth: r2(c.y1 - c.y0), floor: fi };
    }),
  }));
}

function appOpeningsAndGrid(bt: Built, side: 'left' | 'right', floors: { floor: number; rooms: Room[] }[]): { openings: PlanOpening[]; structuralGrid: { xs: number[]; ys: number[] } } {
  const mirror = side === 'right';
  const raw = makeOpenings(bt);
  const sideToApp = (s: Side): PlanOpening['face'] => s === 'F' ? 'front' : s === 'R' ? 'rear' : s === 'S' ? (mirror ? 'right' : 'left') : (mirror ? 'left' : 'right');
  const openings: PlanOpening[] = raw.map((o, i) => {
    const idx = bt.floors[o.fi].cells.indexOf(o.cell);
    const room = floors[o.fi].rooms[idx];
    const face = sideToApp(o.side);
    // position along the room side, from the room's app-frame origin corner
    let pos = (o.side === 'F' || o.side === 'R') ? o.centre - o.cell.x0 : o.centre - o.cell.y0;
    if (mirror && (o.side === 'F' || o.side === 'R')) pos = (o.cell.x1 - o.cell.x0) - pos;
    return { id: `${o.type === 'door' ? 'D' : o.type === 'window' ? 'W' : 'V'}${o.fi}${String(i + 1).padStart(2, '0')}`, floor: o.fi, roomId: room.id, room: room.name, type: o.type,
      wall: o.exterior ? face : 'internal', face, positionMm: Math.round(pos * 1000), widthMm: o.widthMm, heightMm: o.heightMm, sillHeightMm: o.sill, material: o.material, quantity: 1, main: o.main };
  });
  const g = structuralGrid(bt);
  const xs = mirror ? g.xs.map((x) => r2(bt.W - x)).sort((a, b) => a - b) : g.xs;
  return { openings, structuralGrid: { xs, ys: g.ys } };
}

export function isSupportedPlot(b: Pick<Brief, 'plotWidthFt' | 'plotDepthFt'>) {
  return b.plotWidthFt >= MIN_PLOT.widthFt && b.plotDepthFt >= MIN_PLOT.depthFt && b.plotWidthFt * b.plotDepthFt >= MIN_PLOT.areaSqft;
}

export function planHome(b: Brief, opts: { alternatives?: boolean } = {}): PlanResult {
  const env = siteEnvelope(b);
  const base = { version: ARCHITECT_PLANNER_VERSION, envelope: env };
  if (!isSupportedPlot(b)) {
    return { ...base, status: 'UNSUPPORTED', options: [], checks: [], alternatives: [],
      verdict: 'Compact plot designs are coming soon.',
      reasons: [`Full home design currently needs a plot of at least ${MIN_PLOT.widthFt}×${MIN_PLOT.depthFt} ft (${MIN_PLOT.areaSqft} sqft). Your plot is ${b.plotWidthFt}×${b.plotDepthFt} ft.`] };
  }
  const cands: { bt: Built; v: Variant; checks: PlanCheck[]; vastu: number }[] = [];
  const fails: string[] = [];
  const storeyList: (1 | 2)[] = b.floorsPreference === 1 ? [1] : b.floorsPreference === 2 ? [2] : [1, 2];
  for (const storeys of storeyList) {
    if (storeys === 2 && b.bedrooms === 1) continue;
    for (const compact of [false, true]) for (const serviceSide of ['left', 'right'] as const) {
      const v: Variant = { storeys, serviceSide, compact };
      const bt = build(b, env, v);
      if (bt.failures.length) { fails.push(`${storeys === 1 ? 'Single storey' : 'G+1'}: ${bt.failures[0]}`); continue; }
      const checks = checkPlan(bt, env, b);
      if (checks.some((c) => c.status === 'ERROR')) { fails.push(`${storeys === 1 ? 'Single storey' : 'G+1'}: ${checks.find((c) => c.status === 'ERROR')!.item} (${checks.find((c) => c.status === 'ERROR')!.detail})`); continue; }
      const rooms = toApp(bt, serviceSide).flatMap((f) => f.rooms);
      const vastu = b.vastu ? calculateVastuScore(rooms, bt.W, bt.D, b.facing).score : 0;
      cands.push({ bt, v, checks, vastu });
    }
  }
  // ranking: Vastu (preference only) − warnings; the zoned plan is preferred over the compact one when both pass on wider plots
  const q = (c: (typeof cands)[number]) => (b.vastu ? c.vastu : 50) - 6 * c.checks.filter((x) => x.status === 'WARNING').length - (c.v.compact && c.bt.W > 8.5 ? (c.bt.W > 10.5 ? 15 : 8) : 0);
  const singles = cands.filter((c) => c.v.storeys === 1).sort((a, b2) => q(b2) - q(a));
  const doubles = cands.filter((c) => c.v.storeys === 2).sort((a, b2) => q(b2) - q(a));
  // with Vastu on, a mirrored plan that scores far lower is not offered as an option
  if (b.vastu && cands.length) { const best = Math.max(...cands.map((c) => c.vastu)); for (let i = cands.length - 1; i >= 0; i--) if (cands[i].vastu < best - 20) { const c = cands[i]; const lst = c.v.storeys === 1 ? singles : doubles; const j = lst.indexOf(c); if (j >= 0 && lst.length > 1) lst.splice(j, 1); } }
  const coverage = (c: { bt: Built }) => (c.bt.W * c.bt.D) / env.plotSqm;
  const chosen: typeof cands = [];
  let verdict = '';
  const singleComfortable = singles[0] && coverage(singles[0]) <= 0.5;
  if (singles.length && (singleComfortable || !doubles.length)) {
    chosen.push(singles[0]);
    if (doubles[0]) chosen.push(doubles[0]);
    if (singles[1]) chosen.push(singles[1]);
    verdict = singleComfortable
      ? `Single storey recommended — your ${b.bedrooms}BHK fits on one level with open space left, so no stair climbing and lower cost.${doubles.length ? ' A G+1 option is also shown if you prefer a larger garden.' : ''}`
      : `Single storey fits${doubles.length ? '' : ' (the only arrangement that passes all checks)'}.`;
  } else if (singles.length && doubles.length) {
    chosen.push(singles[0], doubles[0]); if (doubles[1]) chosen.push(doubles[1]);
    verdict = `Your choice: a compact single storey or a roomier G+1 — both pass every check.`;
  } else if (doubles.length) {
    chosen.push(...doubles.slice(0, 2));
    verdict = `G+1 needed — your ${b.bedrooms}BHK does not fit on one floor of this plot${env.carInFront ? ' while keeping car parking in front' : ''}.`;
  }
  const options: PlanOption[] = chosen.slice(0, 3).map((c, i) => {
    const floors = toApp(c.bt, c.v.serviceSide);
    const open = c.bt.floors.flatMap((f) => f.cells.filter((x) => x.kind === 'balcony')).reduce((s, x) => s + (x.x1 - x.x0) * (x.y1 - x.y0), 0);
    const bua = r2(c.bt.W * c.bt.D * c.v.storeys - open);
    const sideWord = c.v.compact ? 'compact hall plan' : 'zoned plan';
    const mirrored = chosen.slice(0, i).some((o) => o.v.storeys === c.v.storeys && !!o.v.compact === !!c.v.compact);
    const parkingNote = b.parking === 'None' ? `No car parking requested (${c.bt.frontOpen} m open in front)`
      : env.carInFront && c.bt.frontOpen >= CAR_FRONT_M - 1e-6 ? `Car + two-wheeler in front (${c.bt.frontOpen} m open)`
      : `Two-wheeler only in front (${c.bt.frontOpen} m open) — a car needs a plot at least 40 ft wide and 50 ft deep, or stilt parking with higher FSI`;
    return {
      id: `${c.v.storeys === 1 ? 'G' : 'G1'}-${c.v.compact ? 'compact' : 'zoned'}-${c.v.serviceSide}`,
      title: `${c.v.storeys === 1 ? 'Single storey' : 'G+1'} · ${sideWord}${mirrored ? ' (mirrored)' : ''}`,
      storeys: c.v.storeys, serviceSide: c.v.serviceSide, widthM: c.bt.W, depthM: c.bt.D, floors,
      builtUpSqm: bua, builtUpSqft: Math.round(bua * SQFT), fsiUsed: r2(bua / env.plotSqm), frontOpenM: c.bt.frontOpen, parkingNote,
      vastuScore: b.vastu ? c.vastu : -1, checks: c.checks, notes: c.bt.notes, recommended: i === 0,
      ...appOpeningsAndGrid(c.bt, c.v.serviceSide, floors),
    };
  });
  if (options.length) return { ...base, status: 'OK', verdict, options, reasons: [], alternatives: [], checks: options[0].checks };

  // ── Does not fit: explain and offer verified alternatives ──
  const needG1 = briefAreaSqm(b, env, 2);
  const reasons: string[] = [];
  if (needG1 > env.fsiCapSqm) reasons.push(`A ${b.bedrooms}BHK needs about ${Math.round(needG1 * SQFT)} sqft of built-up area (rooms at minimum comfortable sizes plus walls, circulation and staircase). FSI ${env.fsi} on this plot allows ${Math.round(env.fsiCapSqm * SQFT)} sqft in total (area definition: all covered floor area incl. staircase and walls).`);
  else reasons.push(`The total area is within FSI ${env.fsi}, but the ${b.bedrooms} bedrooms, baths, kitchen and staircase cannot be arranged at NBC minimum sizes inside the ${env.envW} m × ${env.envD} m buildable area (after assumed setbacks) without going over the per-floor FSI limit.`);
  reasons.push(...Array.from(new Set(fails)).slice(0, 3));
  const alternatives: PlanResult['alternatives'] = [];
  if (opts.alternatives !== false) {
    for (let nb = b.bedrooms - 1; nb >= 1; nb--) {
      const r = planHome({ ...b, bedrooms: nb, study: true }, { alternatives: false });
      if (r.status !== 'OK') continue;
      const hasStudy = r.options[0].floors.some((f) => f.rooms.some((x) => x.type === 'study'));
      alternatives.push({ label: `${nb}BHK${hasStudy ? ' + study' : ''}`, brief: { bedrooms: nb, study: true }, verified: true, note: `Fits: ${r.options[0].title}, ${r.options[0].builtUpSqft} sqft.` });
      break;
    }
    if (b.parking === 'Open') {
      const r = planHome({ ...b, parking: 'None' }, { alternatives: false });
      if (r.status === 'OK') alternatives.push({ label: 'Without car parking in front', brief: { parking: 'None' }, verified: true, note: `Fits: ${r.options[0].title}.` });
    }
    for (const fsi of [1.25, 1.5, 1.75, 2.0]) {
      if (fsi <= env.fsi) continue;
      const r = planHome({ ...b, fsi }, { alternatives: false });
      if (r.status === 'OK') { alternatives.push({ label: `${b.bedrooms}BHK if your local rules allow FSI ${fsi}`, brief: { fsi }, verified: true, note: 'Only if your local authority permits this FSI — please confirm before choosing.' }); break; }
    }
    const STD: [number, number][] = [[30, 50], [40, 40], [40, 60], [50, 60], [50, 80], [60, 80], [80, 100]];
    const bigger = STD.find(([w, d]) => w * d > b.plotWidthFt * b.plotDepthFt && planHome({ ...b, plotWidthFt: w, plotDepthFt: d }, { alternatives: false }).status === 'OK');
    if (bigger) alternatives.push({ label: 'A larger plot', brief: {}, verified: true, note: `The same ${b.bedrooms}BHK fits on a ${bigger[0]}×${bigger[1]} ft plot under the same assumptions.` });
  }
  return { ...base, status: 'INFEASIBLE', options: [], checks: [], reasons, alternatives,
    verdict: `Your ${b.bedrooms}BHK does not fit this plot under the current assumptions. Nothing has been removed — please choose one of the options below.` };
}

/** @internal test hook */
export function __debugBuild(b: Brief, v: Variant) { const env = siteEnvelope(b); const bt = build(b, env, v); return { env, bt, checks: bt.failures.length ? [] : checkPlan(bt, env, b) }; }
