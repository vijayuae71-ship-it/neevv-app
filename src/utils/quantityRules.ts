/**
 * Shared quantity rules — the ONE definition used by both the BOQ calculator and the
 * verification engine, so cross-checks compare like with like and can never drift.
 */
import type { Layout, Room } from '../types';

/** Wall thicknesses used by every drawing and by the BOQ (mm). */
export const WALL_EXTERNAL_MM = 230;
export const WALL_INTERNAL_MM = 115;

/** Electrical point kinds drawn on the electrical layout and billed in the BOQ. */
export type ElecKind = 'light' | 'fan' | 'exhaust' | 'socket' | 'power' | 'ac';
export const ELEC_KINDS: ElecKind[] = ['light', 'fan', 'exhaust', 'socket', 'power', 'ac'];

/**
 * Per-room electrical points by kind — the ONE table behind the electrical drawing, the BOQ
 * (wiring points, light fittings, fans, AC points) and the validation. socket = 6A, power = 16A.
 */
export const ELECTRICAL_POINTS_BY_ROOM: Record<string, Partial<Record<ElecKind, number>>> = {
  master_bedroom: { light: 2, fan: 1, socket: 5, power: 1, ac: 1 },
  bedroom: { light: 2, fan: 1, socket: 3, power: 1, ac: 1 },
  hall: { light: 4, fan: 2, socket: 4, power: 1, ac: 1 },
  kitchen: { light: 2, exhaust: 1, socket: 2, power: 3 },
  toilet: { light: 1, exhaust: 1, power: 1 },
  dining: { light: 2, fan: 1, socket: 1 },
  puja: { light: 1, socket: 1 },
  passage: { light: 2 },
  study: { light: 2, fan: 1, socket: 3 },
  balcony: { light: 1, socket: 1 },
  store: { light: 1 },
  utility: { light: 1, power: 2 },
  parking: { light: 1, socket: 1 },
  entrance: { light: 1, socket: 1 },
  staircase: { light: 2 },
};
const DEFAULT_ELEC: Partial<Record<ElecKind, number>> = { light: 1, socket: 1 };
export function electricalBreakdown(type: string): Record<ElecKind, number> {
  const t = ELECTRICAL_POINTS_BY_ROOM[type] ?? DEFAULT_ELEC;
  return { light: t.light ?? 0, fan: t.fan ?? 0, exhaust: t.exhaust ?? 0, socket: t.socket ?? 0, power: t.power ?? 0, ac: t.ac ?? 0 };
}

/** Electrical points per room (total of the breakdown above). */
export const ELECTRICAL_POINT_MAP: Record<string, number> = Object.fromEntries(
  Object.keys(ELECTRICAL_POINTS_BY_ROOM).map((k) => [k, ELEC_KINDS.reduce((s, kind) => s + electricalBreakdown(k)[kind], 0)]),
);

/** Pooja niches are features inside another room, not rooms: excluded from areas, walls and counts. */
export const isNiche = (r: Room) => r.type === 'puja' && /niche/i.test(r.name);

export function electricalPoints(rooms: Room[]): number {
  return rooms.filter((r) => !isNiche(r)).reduce((sum, r) => sum + ELEC_KINDS.reduce((s, k) => s + electricalBreakdown(r.type)[k], 0), 0);
}
export function electricalTotals(rooms: Room[]): Record<ElecKind, number> {
  const out = { light: 0, fan: 0, exhaust: 0, socket: 0, power: 0, ac: 0 };
  for (const r of rooms.filter((x) => !isNiche(x))) { const b = electricalBreakdown(r.type); for (const k of ELEC_KINDS) out[k] += b[k]; }
  return out;
}

/** Sanitary fixtures per wet room — the ONE table behind the plumbing drawing and the BOQ sanitary lines. */
export interface FixtureSet { ewc: number; basin: number; shower: number; healthFaucet: number; sink: number; purifier: number; washer: number; floorTrap: number; cpFittings: number; points: number }
const EMPTY_FIX: FixtureSet = { ewc: 0, basin: 0, shower: 0, healthFaucet: 0, sink: 0, purifier: 0, washer: 0, floorTrap: 0, cpFittings: 0, points: 0 };
/** points = supply/drainage connections: bath 5 (WC, health faucet, basin, shower, floor trap), kitchen 3, utility 2. */
export const PLUMBING_FIXTURES_BY_ROOM: Record<string, Partial<FixtureSet>> = {
  toilet: { ewc: 1, healthFaucet: 1, basin: 1, shower: 1, floorTrap: 2, cpFittings: 3, points: 5 },
  kitchen: { sink: 1, purifier: 1, floorTrap: 1, cpFittings: 2, points: 3 },
  utility: { washer: 1, floorTrap: 1, cpFittings: 1, points: 2 },
};
export function fixturesFor(type: string): FixtureSet { return { ...EMPTY_FIX, ...(PLUMBING_FIXTURES_BY_ROOM[type] ?? {}) }; }
export function fixtureTotals(rooms: Room[]): FixtureSet {
  const out = { ...EMPTY_FIX };
  for (const r of rooms.filter((x) => !isNiche(x))) { const f = fixturesFor(r.type); for (const k of Object.keys(out) as (keyof FixtureSet)[]) out[k] += f[k]; }
  return out;
}

/** Supply/drainage points: bath 5, kitchen 3, utility/wash 2. */
export function plumbingPoints(rooms: Room[]): number {
  return fixtureTotals(rooms).points;
}

/** Ids of the doors and windows that belong to bedrooms, from the locked openings schedule. */
export function bedroomOpeningIds(layout: Layout): { doors: Set<string>; windows: Set<string>; bedroomsWithoutDoor: string[]; bedroomsWithoutWindow: string[] } | null {
  const ops = layout.openingsSchedule?.openings ?? [];
  if (!ops.length || !ops.every((o) => o.roomId)) return null;
  const beds = layout.floors.flatMap((f) => f.rooms).filter((r) => r.type === 'bedroom' || r.type === 'master_bedroom');
  const ids = new Set(beds.map((r) => r.id));
  const doors = new Set(ops.filter((o) => o.type === 'door' && ids.has(o.roomId!)).map((o) => o.id));
  const windows = new Set(ops.filter((o) => o.type === 'window' && ids.has(o.roomId!)).map((o) => o.id));
  return {
    doors, windows,
    bedroomsWithoutDoor: beds.filter((r) => !ops.some((o) => o.type === 'door' && o.roomId === r.id)).map((r) => r.name),
    bedroomsWithoutWindow: beds.filter((r) => !ops.some((o) => o.type === 'window' && o.roomId === r.id)).map((r) => r.name),
  };
}

/** Assumed founding depth below natural ground level (m) — used by BOQ earthwork AND drawn on sections. Verify with a soil report. */
export const ASSUMED_FOUNDING_DEPTH_M = 1.5;
/** Terrace parapet height (mm) used by sections, elevations, BOQ masonry and validation. Assumption — confirm locally. */
export const PARAPET_HEIGHT_MM = 1000;

/* ── Electrical circuits ──
 * One rule for the electrical drawing's circuit numbers/schedule and the BOQ's DB ways and MCBs.
 * Lighting (L, F, EF) ≤ 10 points / circuit, 6A sockets ≤ 8 / circuit, 16A power ≤ 2 / circuit,
 * every split AC on its own circuit. Design loads are the usual Indian residential allowances. */
export const POINT_LOAD_W: Record<ElecKind, number> = { light: 60, fan: 75, exhaust: 40, socket: 100, power: 1000, ac: 1800 };
export type CircuitKind = 'lighting' | 'socket' | 'power' | 'ac';
export interface Circuit { no: string; kind: CircuitKind; rooms: string[]; roomIds: string[]; points: number; loadW: number; mcbA: number; cableMm2: number }
const CIRCUIT_RULE: Record<CircuitKind, { kinds: ElecKind[]; max: number; mcbA: number; cable: number }> = {
  lighting: { kinds: ['light', 'fan', 'exhaust'], max: 10, mcbA: 6, cable: 1.5 },
  socket: { kinds: ['socket'], max: 8, mcbA: 16, cable: 2.5 },
  power: { kinds: ['power'], max: 2, mcbA: 20, cable: 4 },
  ac: { kinds: ['ac'], max: 1, mcbA: 20, cable: 4 },
};
/** Circuits for one floor's rooms, numbered C1… in the order lighting, sockets, power, AC. */
export function planCircuits(rooms: Room[]): Circuit[] {
  const out: Circuit[] = [];
  for (const kind of ['lighting', 'socket', 'power', 'ac'] as CircuitKind[]) {
    const rule = CIRCUIT_RULE[kind];
    let cur: Circuit | null = null;
    for (const r of rooms.filter((x) => !isNiche(x))) {
      const b = electricalBreakdown(r.type);
      let n = rule.kinds.reduce((s, k) => s + b[k], 0);
      const w = (k: ElecKind) => POINT_LOAD_W[k];
      const perPoint = n ? rule.kinds.reduce((s, k) => s + b[k] * w(k), 0) / n : 0;
      while (n > 0) {
        if (!cur || cur.points >= rule.max) { cur = { no: '', kind, rooms: [], roomIds: [], points: 0, loadW: 0, mcbA: rule.mcbA, cableMm2: rule.cable }; out.push(cur); }
        const take = Math.min(n, rule.max - cur.points);
        cur.points += take; cur.loadW += take * perPoint; n -= take;
        if (!cur.roomIds.includes(r.id)) { cur.roomIds.push(r.id); cur.rooms.push(r.name); }
      }
    }
  }
  out.forEach((c, i) => { c.no = `C${i + 1}`; c.loadW = Math.round(c.loadW); });
  return out;
}
/** Connected and maximum-demand load for a set of circuits (diversity: lighting 0.8, sockets 0.4, power 0.5, AC 0.8). */
export function circuitDemand(circuits: Circuit[]): { connectedW: number; demandW: number; supply: 'single-phase' | 'three-phase'; mainA: number } {
  const div: Record<CircuitKind, number> = { lighting: 0.8, socket: 0.4, power: 0.5, ac: 0.8 };
  const connectedW = circuits.reduce((s, c) => s + c.loadW, 0);
  const demandW = Math.round(circuits.reduce((s, c) => s + c.loadW * div[c.kind], 0));
  const supply = demandW > 7000 ? 'three-phase' : 'single-phase';
  const amps = supply === 'single-phase' ? demandW / 230 : demandW / (Math.sqrt(3) * 415);
  const mainA = [32, 40, 63, 80, 100].find((a) => a >= amps * 1.25) ?? 100;
  return { connectedW, demandW, supply, mainA };
}
