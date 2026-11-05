/**
 * computeOfficeLayout.ts
 *
 * Office space allocation module, following the pattern of the residential
 * computeProportionalLayout.ts. Computes buildable commercial floor area
 * from plot dimensions, applies NBC commercial coverage/FSI/setback rules,
 * and distributes that area to office rooms (workstations, cabins,
 * conference rooms, amenities) across three differentiated layout
 * strategies: Efficiency-First, Collaboration-First, Executive-First.
 *
 * This module does NOT do complex bin-packing — it places rooms on a
 * simple grid (row-based) sized to fit the buildable footprint, with a
 * structural column grid at 6m intervals, matching the level of detail
 * used elsewhere in the app for drawing-prompt generation.
 */

import type {
  OfficeRequirements,
  OfficeFloorProgram,
  Layout,
  FloorLayout,
  Room,
  Column,
  Setbacks,
  LayoutOpening,
} from '../types';

/* ========================================================================
 * NBC Commercial constants
 * ===================================================================== */

const SQM_PER_PERSON = 9.3; // 100 sqft per person minimum (NBC commercial)
const CORRIDOR_MIN_WIDTH_M = 1.5;
const WASHROOM_MALE_RATIO = 25; // 1 per 25 employees
const WASHROOM_FEMALE_RATIO = 15; // 1 per 15 employees

const MIN_ROOM_SQM: Record<string, number> = {
  workstation_open: 4.5, // per seat
  cabin_manager: 12,
  cabin_director: 18,
  cabin_md: 25,
  conference_small: 20,
  conference_large: 40,
  board_room: 55,
  reception: 15,
  pantry: 12,
  cafeteria: 1.5, // per employee
  server_room: 10,
  break_room: 15,
  washroom_male: 8,
  washroom_female: 8,
  washroom_handicap: 8,
  electrical_room: 6,
  ahu_room: 12,
};

const SETBACKS: Setbacks = {
  front: 3.0,
  rear: 3.0,
  left: 1.5,
  right: 1.5,
};

const DEFAULT_FSI = 1.5;

const CORRIDOR_CIRCULATION_PCT = 0.15; // 15% of floor area reserved for corridors/circulation

/* ========================================================================
 * Helpers
 * ===================================================================== */

/** Coverage tier: ≤300sqm=65%, ≤500sqm=55%, >500sqm=50% */
function getCommercialCoveragePct(plotAreaSqm: number): number {
  if (plotAreaSqm <= 300) return 65;
  if (plotAreaSqm <= 500) return 55;
  return 50;
}

function roundTo(value: number, increment = 0.05): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function ftToM(ft: number): number {
  return ft * 0.3048;
}

/**
 * Compute the buildable footprint per floor (sqm), applying setbacks,
 * NBC coverage tier, and FSI constraints — whichever is tightest wins.
 */
function computeBuildableFootprint(
  plotWidthM: number,
  plotDepthM: number,
  numFloors: number
): {
  plotAreaSqm: number;
  footprintSqm: number;
  buildableWidthM: number;
  buildableDepthM: number;
  coveragePct: number;
} {
  const plotAreaSqm = plotWidthM * plotDepthM;
  const coveragePct = getCommercialCoveragePct(plotAreaSqm);
  const coverageMaxSqm = plotAreaSqm * (coveragePct / 100);

  const fsiMaxPerFloor = (plotAreaSqm * DEFAULT_FSI) / Math.max(numFloors, 1);

  const setbackAdjustedW = Math.max(0, plotWidthM - SETBACKS.left - SETBACKS.right);
  const setbackAdjustedD = Math.max(0, plotDepthM - SETBACKS.front - SETBACKS.rear);
  const setbackFootprintSqm =
    setbackAdjustedW > 0 && setbackAdjustedD > 0 ? setbackAdjustedW * setbackAdjustedD : Infinity;

  const footprintSqm = Math.min(coverageMaxSqm, fsiMaxPerFloor, setbackFootprintSqm);

  // Derive an effective buildable width/depth from the setback-adjusted
  // rectangle, scaled down if the coverage/FSI cap is tighter than the
  // physical setback rectangle.
  const scale =
    setbackFootprintSqm > 0 && setbackFootprintSqm !== Infinity
      ? Math.sqrt(footprintSqm / setbackFootprintSqm)
      : 1;
  const buildableWidthM = setbackAdjustedW > 0 ? setbackAdjustedW * Math.min(scale, 1) : Math.sqrt(footprintSqm);
  const buildableDepthM = setbackAdjustedD > 0 ? setbackAdjustedD * Math.min(scale, 1) : Math.sqrt(footprintSqm);

  return { plotAreaSqm, footprintSqm, buildableWidthM, buildableDepthM, coveragePct };
}

/** Count total employees across a floor program (used for washrooms/cafeteria sizing). */
function estimateFloorHeadcount(floor: OfficeFloorProgram, totalEmployeeCount: number, totalFloors: number): number {
  const explicitSeats =
    floor.workstations +
    floor.managerCabins +
    floor.directorCabins +
    (floor.mdCabin ? 1 : 0);
  if (explicitSeats > 0) return explicitSeats;
  // Fall back to an even split of the company headcount across floors.
  return Math.ceil(totalEmployeeCount / Math.max(totalFloors, 1));
}

function computeWashroomCounts(headcount: number): { male: number; female: number; handicap: number } {
  const male = Math.max(1, Math.ceil(headcount / WASHROOM_MALE_RATIO));
  const female = Math.max(1, Math.ceil(headcount / WASHROOM_FEMALE_RATIO));
  const handicap = 1;
  return { male, female, handicap };
}

/* ========================================================================
 * Layout strategy profiles
 * ===================================================================== */

interface StrategyProfile {
  name: string;
  description: string;
  strategyKey: 'efficiency' | 'collaboration' | 'executive';
  // Multipliers applied to base room sizes / counts to differentiate the
  // three layout strategies from one another.
  workstationSeatSqm: number;
  cabinScale: number;
  conferenceScale: number;
  breakRoomScale: number;
  cafeteriaScale: number;
}

const STRATEGY_PROFILES: StrategyProfile[] = [
  {
    name: 'Efficiency-First',
    description:
      'Maximizes seat density and open workstation area, with compact cabins and shared amenities — best for lean, high-headcount teams.',
    strategyKey: 'efficiency',
    workstationSeatSqm: MIN_ROOM_SQM.workstation_open * 0.92,
    cabinScale: 0.85,
    conferenceScale: 0.9,
    breakRoomScale: 0.85,
    cafeteriaScale: 0.9,
  },
  {
    name: 'Collaboration-First',
    description:
      'Prioritizes larger conference rooms, break-out zones, and cafeteria space to encourage cross-team collaboration and informal meetings.',
    strategyKey: 'collaboration',
    workstationSeatSqm: MIN_ROOM_SQM.workstation_open * 1.05,
    cabinScale: 1.0,
    conferenceScale: 1.35,
    breakRoomScale: 1.4,
    cafeteriaScale: 1.25,
  },
  {
    name: 'Executive-First',
    description:
      'Allocates generous director/MD cabins, a premium board room, and an upgraded reception, trading off some open workstation density.',
    strategyKey: 'executive',
    workstationSeatSqm: MIN_ROOM_SQM.workstation_open * 1.0,
    cabinScale: 1.4,
    conferenceScale: 1.1,
    breakRoomScale: 1.0,
    cafeteriaScale: 1.0,
  },
];

/* ========================================================================
 * Room allocation for a single floor under a given strategy
 * ===================================================================== */

interface RoomBudget {
  type: string;
  label: string;
  count: number;
  areaEachSqm: number;
}

function buildRoomBudgets(
  floor: OfficeFloorProgram,
  profile: StrategyProfile,
  headcount: number
): RoomBudget[] {
  const budgets: RoomBudget[] = [];

  if (floor.workstations > 0) {
    budgets.push({
      type: 'workstation_open',
      label: 'Open Workstations',
      count: 1, // treated as a single open-plan zone sized for all seats
      areaEachSqm: roundTo(floor.workstations * profile.workstationSeatSqm, 0.1),
    });
  }

  if (floor.managerCabins > 0) {
    budgets.push({
      type: 'cabin_manager',
      label: 'Manager Cabin',
      count: floor.managerCabins,
      areaEachSqm: roundTo(MIN_ROOM_SQM.cabin_manager * profile.cabinScale, 0.1),
    });
  }

  if (floor.directorCabins > 0) {
    budgets.push({
      type: 'cabin_director',
      label: 'Director Cabin',
      count: floor.directorCabins,
      areaEachSqm: roundTo(MIN_ROOM_SQM.cabin_director * profile.cabinScale, 0.1),
    });
  }

  if (floor.mdCabin) {
    budgets.push({
      type: 'cabin_md',
      label: 'MD Cabin',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.cabin_md * profile.cabinScale, 0.1),
    });
  }

  if (floor.conferenceSmall > 0) {
    budgets.push({
      type: 'conference_small',
      label: 'Conference Room (Small)',
      count: floor.conferenceSmall,
      areaEachSqm: roundTo(MIN_ROOM_SQM.conference_small * profile.conferenceScale, 0.1),
    });
  }

  if (floor.conferenceLarge > 0) {
    budgets.push({
      type: 'conference_large',
      label: 'Conference Room (Large)',
      count: floor.conferenceLarge,
      areaEachSqm: roundTo(MIN_ROOM_SQM.conference_large * profile.conferenceScale, 0.1),
    });
  }

  if (floor.boardRoom) {
    budgets.push({
      type: 'board_room',
      label: 'Board Room',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.board_room * profile.conferenceScale, 0.1),
    });
  }

  if (floor.hasReception) {
    budgets.push({
      type: 'reception',
      label: 'Reception',
      count: 1,
      areaEachSqm: roundTo(
        MIN_ROOM_SQM.reception * (profile.strategyKey === 'executive' ? 1.3 : 1.0),
        0.1
      ),
    });
    budgets.push({
      type: 'waiting_lounge',
      label: 'Waiting Lounge',
      count: 1,
      areaEachSqm: roundTo(10 * (profile.strategyKey === 'executive' ? 1.3 : 1.0), 0.1),
    });
  }

  if (floor.hasPantry) {
    budgets.push({
      type: 'pantry',
      label: 'Pantry',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.pantry * profile.breakRoomScale, 0.1),
    });
  }

  if (floor.hasCafeteria) {
    budgets.push({
      type: 'cafeteria',
      label: 'Cafeteria',
      count: 1,
      areaEachSqm: roundTo(
        Math.max(MIN_ROOM_SQM.cafeteria * headcount * profile.cafeteriaScale, MIN_ROOM_SQM.cafeteria * 10),
        0.1
      ),
    });
  }

  if (floor.hasServerRoom) {
    budgets.push({
      type: 'server_room',
      label: 'Server Room',
      count: 1,
      areaEachSqm: MIN_ROOM_SQM.server_room,
    });
  }

  if (floor.hasBreakRoom) {
    budgets.push({
      type: 'break_room',
      label: 'Break Room',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.break_room * profile.breakRoomScale, 0.1),
    });
  }

  // Washrooms — auto-added based on headcount ratios
  const washroomCounts = computeWashroomCounts(headcount);
  budgets.push({
    type: 'washroom_male',
    label: 'Washroom (Male)',
    count: washroomCounts.male,
    areaEachSqm: MIN_ROOM_SQM.washroom_male,
  });
  budgets.push({
    type: 'washroom_female',
    label: 'Washroom (Female)',
    count: washroomCounts.female,
    areaEachSqm: MIN_ROOM_SQM.washroom_female,
  });
  budgets.push({
    type: 'washroom_handicap',
    label: 'Washroom (Accessible)',
    count: washroomCounts.handicap,
    areaEachSqm: MIN_ROOM_SQM.washroom_handicap,
  });

  // Electrical + AHU rooms — always included as core building services
  budgets.push({
    type: 'electrical_room',
    label: 'Electrical Room',
    count: 1,
    areaEachSqm: MIN_ROOM_SQM.electrical_room,
  });
  budgets.push({
    type: 'ahu_room',
    label: 'AHU Room',
    count: 1,
    areaEachSqm: MIN_ROOM_SQM.ahu_room,
  });

  return budgets;
}

/* ========================================================================
 * Floor planning: a double-loaded office plan
 *
 *   FRONT (road)  ┌──────────────────────────────────────────┐
 *   front band    │ reception │ conference │ MD / directors   │  windows to the road
 *   corridor 1.8  ├──────────────────────────────────────────┤  main entry via reception
 *   open office   │ workstations (windows on the side walls)  │
 *   corridor 1.5  ├──────────────────────────────────────────┤
 *   rear band     │ cabins │ pantry │ server │ WCs │ stair …   │  windows / ventilators
 *   REAR          └──────────────────────────────────────────┘
 *
 * Every room opens onto a corridor; rooms tile the footprint exactly (shared walls).
 * ===================================================================== */

type Face = 'front' | 'rear' | 'left' | 'right';
const FRONT_TYPES = ['reception', 'waiting_lounge', 'board_room', 'conference_large', 'conference_small', 'cabin_md', 'cabin_director'];
const NO_WINDOW = new Set(['server_room', 'electrical_room', 'ahu_room']);
const WET = (t: string) => t.startsWith('washroom');
/** narrowest usable room per type (m) and what goes first when a band is too wide (low = dropped first) */
const MIN_W: Record<string, number> = { staircase: 5.0, reception: 3.0, waiting_lounge: 2.4, cabin_manager: 2.7, cabin_director: 3.0, cabin_md: 3.6, conference_small: 3.6, conference_large: 4.5, board_room: 5.4,
  pantry: 2.4, cafeteria: 3.6, server_room: 2.0, break_room: 3.0, electrical_room: 1.8, ahu_room: 2.4, washroom_male: 2.4, washroom_female: 2.4, washroom_handicap: 2.2, store: 1.8 };
const minW = (t: string, it?: { label: string }) => {
  if (it && WET(t)) { const wc = Number(/\((\d+) WC/.exec(it.label)?.[1] ?? 1); return Math.max(MIN_W[t] ?? 2.4, 1.2 * wc + 1.2); }
  return MIN_W[t] ?? 2.4;
};
const PRIORITY: Record<string, number> = { store: 0, break_room: 1, waiting_lounge: 1, cafeteria: 2, conference_small: 3, board_room: 3, conference_large: 4, cabin_manager: 4, cabin_director: 5, pantry: 6, server_room: 6, ahu_room: 2, cabin_md: 7, electrical_room: 8, reception: 9, washroom_male: 9, washroom_female: 9, washroom_handicap: 9, staircase: 9 };
const C1 = 1.8, C2 = 1.5, MIN_OPEN_DEPTH = 3.0, STAIR_LEN = 5.0, STAIR_MIN_D = 2.7;

export interface OfficeFloorPlan { rooms: Room[]; openings: LayoutOpening[]; seats: number; warnings: string[]; bands: { front: number; rear: number } }
type Item = { type: string; label: string; area: number };

/** The floor's rooms, with toilets as blocks (one per gender + accessible). */
function floorItems(budgets: RoomBudget[], stair: boolean): Item[] {
  const items: Item[] = [];
  for (const b of budgets) {
    if (b.type === 'workstation_open') continue;
    if (WET(b.type)) { // WCs in a row + wash counter; accessible WC on its own (NBC 2.2 × 2.2 min)
      const acc = b.type === 'washroom_handicap';
      items.push({ type: b.type, label: acc ? 'Accessible WC' : `${b.type === 'washroom_male' ? 'Gents' : 'Ladies'} toilet (${b.count} WC)`, area: acc ? 5 : 3.5 + 2.2 * b.count });
      continue;
    }
    for (let i = 0; i < b.count; i++) items.push({ type: b.type, label: b.count > 1 ? `${b.label} ${i + 1}` : b.label, area: b.areaEachSqm });
  }
  if (stair) items.push({ type: 'staircase', label: 'Staircase', area: STAIR_LEN * STAIR_MIN_D });
  return items;
}
const bandDepth = (band: Item[], W: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, band.reduce((a, i) => a + i.area, 0) / Math.max(1, W)));
const FRONT_D: [number, number] = [4.2, 5.1], REAR_D: [number, number] = [3.0, 4.2];

/** Split rooms into the road-side band and the rear band, moving flexible rooms to whichever has width to spare. */
function splitBands(items: Item[], W: number): { front: Item[]; rear: Item[] } {
  let front = items.filter(i => FRONT_TYPES.includes(i.type)), rear = items.filter(i => !FRONT_TYPES.includes(i.type));
  const need = (band: Item[], lohi: [number, number]) => { const d = bandDepth(band, W, ...lohi); return band.reduce((a, i) => a + Math.max(minW(i.type, i), i.area / d), 0); };
  const flexible = (i: Item) => !WET(i.type) && i.type !== 'staircase' && i.type !== 'reception';
  for (let guard = 0; guard < 30; guard++) {
    const fw = need(front, FRONT_D), rw = need(rear, REAR_D);
    if (rw > W && fw < W) { const m = rear.filter(flexible).sort((a, b) => a.area - b.area).find(i => fw + minW(i.type) <= W); if (m) { rear = rear.filter(i => i !== m); front.push(m); continue; } }
    if (fw > W && rw < W) { const m = front.filter(i => flexible(i) && i.type.startsWith('cabin')).find(i => rw + minW(i.type) <= W); if (m) { front = front.filter(i => i !== m); rear.push(m); continue; } }
    break;
  }
  // narrow plots: one toilet block for all (accessible, unisex) when separate blocks don't fit
  const wet = rear.filter(i => WET(i.type));
  if (need(rear, REAR_D) > W && wet.length > 1) {
    const wcs = wet.reduce((a, i) => a + (i.type === 'washroom_handicap' ? 1 : Number(/\((\d+) WC\)/.exec(i.label)?.[1] ?? 1)), 0);
    const merged = [...rear.filter(i => !WET(i.type)), { type: 'washroom_handicap', label: `Toilets (${wcs} WC, accessible)`, area: 3.5 + 2.2 * wcs }];
    if (need(merged, REAR_D) < need(rear, REAR_D) - 0.5) rear = merged;
  }
  return { front, rear };
}

function planOfficeFloor(items: Item[], W: number, D: number, floorIndex: number, opts: { seatSqm: number; requestedSeats: number; floorLabel: string; fD: number; rD: number }): OfficeFloorPlan {
  const warnings: string[] = [];
  const snap = (v: number) => roundTo(v, 0.05);
  let { front, rear } = splitBands(items, W);
  let fD = front.length ? opts.fD : 0, rD = opts.rD;
  const useC2 = D - fD - rD - (fD > 0 ? C1 : 0) - C2 >= MIN_OPEN_DEPTH;
  let openD = D - fD - rD - (fD > 0 ? C1 : 0) - (useC2 ? C2 : 0);
  if (openD < MIN_OPEN_DEPTH) warnings.push(`${opts.floorLabel}: the plot is too shallow for a full open office between the room bands — reduce rooms or add a floor.`);
  openD = Math.max(0, openD);

  const rooms: Room[] = [], openings: LayoutOpening[] = [];
  let rid = 0, oid = 0;
  const addRoom = (type: string, name: string, x: number, y: number, w: number, d: number): Room => {
    const r: Room = { id: `F${floorIndex}-R${++rid}`, name, type: type as Room['type'], x: snap(x), y: snap(y), width: snap(w), depth: snap(d), floor: floorIndex };
    rooms.push(r); return r;
  };
  const addOpening = (r: Room, kind: LayoutOpening['type'], face: Face, posM: number, widthMm: number, external: boolean, main = false) => {
    const len = face === 'front' || face === 'rear' ? r.width : r.depth;
    if (widthMm / 1000 + 0.3 > len) return;
    const pos = Math.min(Math.max(posM, widthMm / 2000 + 0.15), len - widthMm / 2000 - 0.15);
    const door = kind === 'door', vent = kind === 'ventilator';
    openings.push({ id: `${door ? 'D' : vent ? 'V' : 'W'}${floorIndex}${++oid}`, floor: floorIndex, roomId: r.id, face, positionMm: Math.round(pos * 1000), main, type: kind, room: r.name,
      wall: external ? face : 'internal', widthMm, heightMm: door ? 2100 : vent ? 450 : 1500, sillHeightMm: door ? 0 : vent ? 1800 : 750,
      material: door ? (main ? 'Glazed aluminium double door' : WET(r.type) ? 'WPC door' : 'Flush door, laminate') : 'Aluminium sliding, toughened glass', quantity: 1 });
  };
  /** a band of rooms across the full width (stair fixed at the right end); slack to the largest room, or a store */
  const band = (list0: Item[], y: number, d: number, doorFace: Face, outFace: Face) => {
    if (d <= 0) return;
    const stair = list0.find(i => i.type === 'staircase');
    let list = list0.filter(i => i !== stair);
    const Wb = W - (stair ? STAIR_LEN : 0);
    let widths = list.map(i => Math.max(minW(i.type, i), i.area / d));
    for (let guard = 0; guard < 40 && widths.reduce((a, b) => a + b, 0) > Wb + 1e-6; guard++) {
      const over = widths.reduce((a, b) => a + b, 0) - Wb, give = widths.map((w, i) => w - minW(list[i].type, list[i])), room = give.reduce((a, b) => a + b, 0);
      if (room >= over) { widths = widths.map((w, i) => w - (give[i] * over) / room); break; }
      widths = widths.map((_, i) => minW(list[i].type, list[i]));
      let di = -1, best = 99; list.forEach((it, n) => { const pr = PRIORITY[it.type] ?? 5; if (pr < best) { best = pr; di = n; } });
      if (di < 0 || best >= 9) { warnings.push(`${opts.floorLabel}: the rear rooms need ${widths.reduce((a, b) => a + b, 0).toFixed(1)} m but the building is ${Wb.toFixed(1)} m wide — choose a wider plot or fewer rooms.`); break; }
      warnings.push(`${opts.floorLabel}: ${list[di].label} does not fit the plot width — add a floor or reduce rooms.`);
      list = list.filter((_, n) => n !== di); widths = widths.filter((_, n) => n !== di);
    }
    let slack = Wb - widths.reduce((a, b) => a + b, 0);
    if (slack >= 2.0) { list = [...list, { type: 'store', label: 'Store / filing', area: slack * d }]; widths = [...widths, slack]; slack = 0; }
    if (slack > 0 && widths.length) { // to the largest usable room, not a toilet block
      const pick = list.map((it, i) => ({ i, w: widths[i], ok: !WET(it.type) })).sort((a, b) => Number(b.ok) - Number(a.ok) || b.w - a.w)[0];
      if (!pick.ok && slack >= 1.2) { list = [...list, { type: 'store', label: 'Store', area: slack * d }]; widths = [...widths, slack]; } else widths[pick.i] += slack;
    }
    const k = Wb / Math.max(1e-6, widths.reduce((a, b) => a + b, 0)); widths = widths.map(w => w * Math.min(1, k)); // never past the stair
    let x = 0;
    const put = (it: Item, w: number, last: boolean) => {
      const r = addRoom(it.type, it.label, x, y, w, d);
      if (it.type === 'staircase') addOpening(r, 'door', doorFace, w / 2, 1200, false);
      else addOpening(r, 'door', doorFace, WET(it.type) ? w - 0.6 : Math.min(w / 2, 0.75), WET(it.type) ? 900 : it.type.startsWith('conference') || it.type === 'board_room' ? 1200 : 900, false);
      if (WET(it.type)) addOpening(r, 'ventilator', outFace, w / 2, 600, true);
      else addOpening(r, 'window', outFace, w / 2, NO_WINDOW.has(it.type) || it.type === 'store' ? 600 : Math.round(Math.min(2400, Math.max(900, (w - 1.2) * 1000)) / 100) * 100, true);
      if (x < 0.01 && !WET(it.type)) addOpening(r, 'window', 'left', d / 2, 1200, true);
      if (last && !WET(it.type) && it.type !== 'staircase') addOpening(r, 'window', 'right', d / 2, 1200, true);
      x += w;
    };
    list.forEach((it, i) => put(it, i === list.length - 1 && !stair ? W - x : widths[i], i === list.length - 1 && !stair));
    if (stair) put(stair, W - x, true);
  };
  // rear: windowed rooms first, then services, then washrooms grouped next to the stair
  const rank = (t: string) => (WET(t) ? 2 : NO_WINDOW.has(t) ? 1 : 0);
  rear.sort((a, b) => rank(a.type) - rank(b.type));
  front.sort((a, b) => (a.type === 'reception' ? -2 : a.type === 'waiting_lounge' ? -1 : 0) - (b.type === 'reception' ? -2 : b.type === 'waiting_lounge' ? -1 : 0));
  let y = 0;
  if (fD > 0) { band(front, y, fD, 'rear', 'front'); y += fD; }
  const c1 = fD > 0 ? addRoom('passage', 'Corridor', 0, y, W, C1) : null; if (c1) { addOpening(c1, 'window', 'left', C1 / 2, 900, true); addOpening(c1, 'window', 'right', C1 / 2, 900, true); y += C1; }
  let seats = 0;
  if (openD > 0) {
    const open = addRoom('workstation_open', 'Open Workstations', 0, y, W, openD);
    seats = Math.max(0, Math.floor((W * openD) / opts.seatSqm));
    if (seats < opts.requestedSeats) warnings.push(`${opts.floorLabel}: ${seats} of ${opts.requestedSeats} workstations fit in the open office.`);
    if (c1) { addOpening(open, 'door', 'front', 1.2, 1500, false); if (W > 12) addOpening(open, 'door', 'front', W - 1.2, 1500, false); }
    if (useC2) addOpening(open, 'door', 'rear', W / 2, 1500, false);
    else addOpening(open, 'door', 'left', openD / 2, 1000, true); // fire exit from the office
    const nWin = Math.max(1, Math.floor(openD / 3));
    for (let i = 0; i < nWin; i++) { addOpening(open, 'window', 'left', openD * (i + 0.5) / nWin, 1800, true); addOpening(open, 'window', 'right', openD * (i + 0.5) / nWin, 1800, true); }
    y += openD;
  }
  const c2 = useC2 ? addRoom('passage', 'Corridor (rear)', 0, y, W, C2) : null; if (c2) { addOpening(c2, 'door', 'left', C2 / 2, 1000, true); y += C2; } // fire exit at the corridor end
  band(rear, y, rD, 'front', 'rear');
  // main entrance from the road: through the reception, else the front corridor
  const rec = rooms.find(r => (r.type as string) === 'reception');
  if (floorIndex === 0) {
    if (rec) { const i = openings.findIndex(o => o.roomId === rec.id && o.type === 'window' && o.face === 'front'); if (i >= 0) openings.splice(i, 1); addOpening(rec, 'door', 'front', rec.width / 2, 1500, true, true); }
    else if (c1) addOpening(c1, 'door', 'left', C1 / 2, 1500, true, true); else if (c2) addOpening(c2, 'door', 'right', C2 / 2, 1500, true, true);
    else { const o = rooms.find(r => (r.type as string) === 'workstation_open'); if (o) addOpening(o, 'door', 'right', o.depth / 2, 1500, true, true); }
  }
  return { rooms, openings, seats, warnings, bands: { front: fD, rear: rD } };
}

/**
 * Column lines on wall lines, bays ≤ MAX_SPAN (same rule as homes): across, the room partitions
 * of the ground floor (stair edges kept); along, the band and corridor lines, the open office split evenly.
 */
const MAX_SPAN = 5.1;
function officeGrid(W: number, D: number, rooms: Room[]): { xs: number[]; ys: number[] } {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const stair = rooms.find(r => r.type === 'staircase');
  const banned = (x: number) => !!stair && x > stair.x + 0.05 && x < stair.x + stair.width - 0.05;
  const cand = [...new Set(rooms.filter(r => r.type !== 'passage' && (r.type as string) !== 'workstation_open').flatMap(r => [r2(r.x), r2(r.x + r.width)]))].filter(x => x > 0.6 && x < W - 0.6 && !banned(x)).sort((a, b) => a - b);
  const must = stair ? [r2(stair.x)].filter(x => x > 0.6 && x < W - 0.6) : [];
  const xs = [0]; let at = 0;
  while (W - at > MAX_SPAN) {
    const reach = cand.filter(x => x > at + 0.6 && x <= at + MAX_SPAN);
    const forced = must.find(x => x > at + 0.6 && x <= at + MAX_SPAN);
    let nx = forced ?? reach[reach.length - 1];
    if (nx === undefined) { nx = r2(Math.min(at + MAX_SPAN, at + (W - at) / Math.ceil((W - at) / MAX_SPAN))); while (banned(nx)) nx = r2(nx - 0.1); }
    xs.push(nx); at = nx;
  }
  xs.push(r2(W));
  const lines = [...new Set(rooms.filter(r => r.type === 'passage' || (r.type as string) === 'workstation_open').flatMap(r => [r2(r.y), r2(r.y + r.depth)]))].sort((a, b) => a - b);
  const ys: number[] = [0];
  for (const y of [...lines, r2(D)]) {
    const prev = ys[ys.length - 1]; if (y - prev < 0.6) continue;
    const n = Math.ceil((y - prev - 1e-6) / MAX_SPAN); for (let i = 1; i < n; i++) ys.push(r2(prev + (y - prev) * i / n));
    ys.push(y);
  }
  return { xs, ys: ys[ys.length - 1] === r2(D) ? ys : [...ys, r2(D)] };
}

/* ========================================================================
 * Main entry point
 * ===================================================================== */

/**
 * Compute three differentiated office layout options for the given
 * requirements: Efficiency-First, Collaboration-First, Executive-First.
 */
export function computeOfficeLayout(req: OfficeRequirements): { layouts: Layout[]; warnings: string[] } {
  const warnings: string[] = [];

  const plotWidthM = ftToM(req.plotWidthFt);
  const plotDepthM = ftToM(req.plotDepthFt);
  const numFloors = Math.max(req.floors.length, 1);

  const { plotAreaSqm, footprintSqm, buildableWidthM, buildableDepthM, coveragePct } =
    computeBuildableFootprint(plotWidthM, plotDepthM, numFloors);

  if (footprintSqm <= 0) {
    warnings.push('Plot dimensions and setbacks leave no buildable footprint. Check plot size and setback rules.');
  }

  // Circulation deduction (corridors + lobby waiting areas) applied to the
  // per-floor buildable footprint before room budgets are computed.
  const netFloorAreaSqm = footprintSqm * (1 - CORRIDOR_CIRCULATION_PCT);

  const layouts: Layout[] = STRATEGY_PROFILES.map((profile) => {
    const allOpenings: LayoutOpening[] = [];
    const before = warnings.length;
    const W = roundTo(buildableWidthM, 0.05), D = roundTo(buildableDepthM, 0.05);
    // one band depth for every floor, so walls, corridors and columns stack
    const perFloor = req.floors.map((fr) => { const its = floorItems(buildRoomBudgets(fr, profile, estimateFloorHeadcount(fr, req.employeeCount, numFloors)), numFloors > 1); return splitBands(its, W); });
    const bandsD = {
      front: roundTo(Math.max(...perFloor.map(b => (b.front.length ? bandDepth(b.front, W, ...FRONT_D) : 0))), 0.05) || FRONT_D[0],
      rear: roundTo(Math.max(STAIR_MIN_D, ...perFloor.map(b => bandDepth(b.rear, W, ...REAR_D))), 0.05),
    };
    if (D - bandsD.front - bandsD.rear - C1 - C2 < MIN_OPEN_DEPTH) { bandsD.front = FRONT_D[0]; bandsD.rear = Math.max(REAR_D[0], STAIR_MIN_D); }
    // (planOfficeFloor drops the rear corridor itself when the office would still be too shallow)
    const floorLayouts: FloorLayout[] = req.floors.map((floorReq, floorIndex) => {
      const headcount = estimateFloorHeadcount(floorReq, req.employeeCount, numFloors);

      const perPersonMinSqm = headcount * SQM_PER_PERSON;
      if (perPersonMinSqm > netFloorAreaSqm) {
        warnings.push(
          `${profile.name}: ${floorReq.floorLabel} requires at least ${perPersonMinSqm.toFixed(
            1
          )} sqm for ${headcount} occupants (NBC 9.3 sqm/person), but only ${netFloorAreaSqm.toFixed(
            1
          )} sqm is available. Consider reducing headcount or adding floors.`
        );
      }

      const items = floorItems(buildRoomBudgets(floorReq, profile, headcount), numFloors > 1);
      const plan = planOfficeFloor(items, W, D, floorIndex, { seatSqm: profile.workstationSeatSqm, requestedSeats: floorReq.workstations, floorLabel: floorReq.floorLabel, fD: bandsD.front, rD: bandsD.rear });
      for (const w of plan.warnings) if (!warnings.includes(`${profile.name}: ${w}`)) warnings.push(`${profile.name}: ${w}`);
      allOpenings.push(...plan.openings);
      const rooms = plan.rooms, columns: Column[] = [];

      return {
        floor: floorIndex,
        floorLabel: floorReq.floorLabel,
        rooms,
        columns,
      };
    });

    const grid = officeGrid(W, D, floorLayouts[0]?.rooms ?? []);
    const cols: Column[] = grid.xs.flatMap(x => grid.ys.map(y => ({ x, y, widthMM: 300, depthMM: 450 })));
    for (const f of floorLayouts) f.columns = cols;
    const builtUpAreaSqM = roundTo(footprintSqm * numFloors, 0.01);
    const builtUpAreaSqFt = roundTo(builtUpAreaSqM * 10.7639, 0.01);

    const layout: Layout = {
      id: `office-${profile.strategyKey}`,
      name: profile.name,
      strategy: profile.strategyKey,
      description: profile.description,
      floors: floorLayouts,
      openingsSchedule: {
        openings: allOpenings,
        totalDoors: allOpenings.filter(o => o.type === 'door').length,
        totalWindows: allOpenings.filter(o => o.type === 'window').length,
        totalVentilators: allOpenings.filter(o => o.type === 'ventilator').length,
        scheduleText: '',
      },
      vastuScore: 0, // Not applicable for commercial layouts
      vastuDetails: [],
      nbcCompliant: warnings.length === 0,
      nbcIssues: [],
      builtUpAreaSqM,
      builtUpAreaSqFt,
      setbacks: SETBACKS,
      plotWidthM: roundTo(plotWidthM, 0.01),
      plotDepthM: roundTo(plotDepthM, 0.01),
      buildableWidthM: roundTo(buildableWidthM, 0.01),
      buildableDepthM: roundTo(buildableDepthM, 0.01),
      structuralGridM: grid,
      // shown on the option card: what did not fit this plot, so the customer can adjust the brief
      plannerChecks: warnings.slice(before).map((w) => ({ item: w.includes('workstations fit') ? 'Seats' : w.includes('requires at least') ? 'Area per person (NBC)' : 'Fit', status: 'WARNING' as const, detail: w.replace(`${profile.name}: `, '') })),
      buildingWidthMm: Math.round(buildableWidthM * 1000),
      buildingDepthMm: Math.round(buildableDepthM * 1000),
      buildingFootprintSqM: roundTo(footprintSqm, 0.01),
      effectivePerFloorSqFt: roundTo(footprintSqm * 10.7639, 0.01),
      effectivePerFloorSqM: roundTo(footprintSqm, 0.01),
      totalBuiltUpSqFt: builtUpAreaSqFt,
      totalBuiltUpSqM: builtUpAreaSqM,
      fsiValue: DEFAULT_FSI,
      nbcMaxCoveragePct: coveragePct,
      constraintBrief: `Buildable footprint capped at ${footprintSqm.toFixed(
        1
      )} sqm/floor (coverage ${coveragePct}%, FSI ${DEFAULT_FSI}, setbacks F${SETBACKS.front}m/R${SETBACKS.rear}m/L${SETBACKS.left}m/R${SETBACKS.right}m).`,
      numFloors,
      plotWidthFt: req.plotWidthFt,
      plotDepthFt: req.plotDepthFt,
    };

    return layout;
  });

  if (plotAreaSqm > 0 && footprintSqm / plotAreaSqm > 0.9) {
    warnings.push('Plot is very small relative to setback requirements; buildable footprint may be impractically tight.');
  }

  return { layouts, warnings };
}
