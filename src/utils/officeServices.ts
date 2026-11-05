import type { Layout, Room } from '../types';

/**
 * Office building services, laid out room by room from the locked plan. One source for the HVAC and
 * fire-safety sheets and for the office fit-out estimate, so the drawings and the BOQ count the same
 * units, detectors and extinguishers. Coordinates in metres, building-local (as Layout rooms).
 *
 * Rules (preliminary design, to be confirmed by the MEP consultant / fire officer):
 *  - Cooling: 1 TR per 110 sq ft for open office / meeting rooms, 130 for cabins and reception,
 *    60 for the server room (equipment), 150 for cafeteria / break rooms. Rooms up to 25 m² get one
 *    wall-mounted VRV indoor unit; larger rooms 2 TR four-way ceiling cassettes on a grid. Server room:
 *    two units (one standby). VRV outdoor units on the terrace, 10 TR each.
 *  - Exhaust: toilet blocks one fan per 2 WCs (min 1), pantry and electrical room one each.
 *  - Fire (NBC Part 4, business occupancy, low-rise): smoke detectors on a ≤ 7 m grid in every room
 *    except toilets; sprinklers on a ≤ 4 m grid everywhere (light hazard); ABC 6 kg extinguishers one
 *    per 200 m² per floor (min 2) at exits and corridor ends; CO2 4.5 kg in server and electrical rooms;
 *    manual call point + hooter at every exit; exit signs over exits; emergency lights in corridors
 *    every 6 m; hose reel by the stair on each floor. Escape travel distance checked against 30 m.
 */
export type ServiceKind = 'cassette' | 'wall_unit' | 'exhaust' | 'smoke' | 'sprinkler' | 'ext_abc' | 'ext_co2' | 'mcp' | 'hooter' | 'exit_sign' | 'em_light' | 'hose_reel';
export interface ServicePoint { kind: ServiceKind; x: number; y: number; roomId: string; tr?: number }
export interface RoomCooling { roomId: string; name: string; areaSqFt: number; tr: number; units: number; unitType: 'cassette' | 'wall_unit' | '—' }
export interface EscapeRoute { roomId: string; name: string; path: { x: number; y: number }[]; lengthM: number; exit: string }
export interface FloorServices { floor: number; points: ServicePoint[]; cooling: RoomCooling[]; routes: EscapeRoute[]; exits: { x: number; y: number; name: string }[]; maxTravelM: number }
export interface OfficeServices { floors: FloorServices[]; totals: { tr: number; cassettes: number; wallUnits: number; outdoorUnits: number; exhaustFans: number; smoke: number; sprinklers: number; extABC: number; extCO2: number; mcp: number; hooters: number; exitSigns: number; emLights: number; hoseReels: number } }

const T = (r: Room) => String(r.type);
const isWet = (r: Room) => T(r).startsWith('washroom') || T(r) === 'toilet';
const SQFT = 10.7639;
function sqftPerTR(t: string): number | null {
  if (t === 'workstation_open' || t.startsWith('conference') || t === 'board_room') return 110;
  if (t.startsWith('cabin') || t === 'reception' || t === 'waiting_lounge' || t === 'study') return 130;
  if (t === 'server_room') return 60;
  if (t === 'cafeteria' || t === 'break_room') return 150;
  return null; // corridors, toilets, pantry, store, services, stair: not air-conditioned
}
/** n points evenly spread over [a, a+len] (cell centres). */
const spread = (a: number, len: number, n: number) => Array.from({ length: n }, (_, i) => a + (len * (i + 0.5)) / n);
const grid = (r: Room, step: number, inset = 0) => {
  const nx = Math.max(1, Math.ceil(r.width / step)), ny = Math.max(1, Math.ceil(r.depth / step));
  return spread(r.x + inset, r.width - 2 * inset, nx).flatMap((x) => spread(r.y + inset, r.depth - 2 * inset, ny).map((y) => ({ x, y })));
};

export function isOfficeLayout(layout: Layout): boolean {
  return layout.floors.some((f) => f.rooms.some((r) => T(r) === 'workstation_open' || T(r).startsWith('cabin_')));
}

export function officeServices(layout: Layout): OfficeServices {
  const floors: FloorServices[] = [];
  const openings = layout.openingsSchedule?.openings ?? [];
  layout.floors.forEach((f, fi) => {
    const pts: ServicePoint[] = [], cooling: RoomCooling[] = [];
    const add = (kind: ServiceKind, x: number, y: number, roomId: string, tr?: number) => pts.push({ kind, x, y, roomId, tr });
    const W = Math.max(...f.rooms.map((r) => r.x + r.width)), D = Math.max(...f.rooms.map((r) => r.y + r.depth));
    // exits: outside doors on the ground floor, the stair door on every floor
    const exits: { x: number; y: number; name: string }[] = [];
    for (const o of openings.filter((v) => v.floor === fi && v.type === 'door' && v.roomId)) {
      const r = f.rooms.find((q) => q.id === o.roomId); if (!r || !o.face || typeof o.positionMm !== 'number') continue;
      const along = o.positionMm / 1000, p = o.face === 'front' ? { x: r.x + along, y: r.y } : o.face === 'rear' ? { x: r.x + along, y: r.y + r.depth } : o.face === 'left' ? { x: r.x, y: r.y + along } : { x: r.x + r.width, y: r.y + along };
      if (o.wall !== 'internal' && fi === 0) exits.push({ ...p, name: o.main ? 'Main entrance' : 'Fire exit' });
      if (T(r) === 'staircase') exits.push({ ...p, name: 'Staircase' });
    }
    for (const r of f.rooms) {
      const area = r.width * r.depth, t = T(r), per = sqftPerTR(t);
      if (per) {
        const tr = Math.max(1, Math.round(((area * SQFT) / per) * 2) / 2);
        if (t === 'server_room') { add('wall_unit', r.x + r.width * 0.3, r.y + 0.3, r.id, tr); add('wall_unit', r.x + r.width * 0.7, r.y + 0.3, r.id, tr); cooling.push({ roomId: r.id, name: r.name, areaSqFt: area * SQFT, tr, units: 2, unitType: 'wall_unit' }); }
        else if (area <= 25) { add('wall_unit', r.x + r.width / 2, r.y + r.depth - 0.25, r.id, tr); cooling.push({ roomId: r.id, name: r.name, areaSqFt: area * SQFT, tr, units: 1, unitType: 'wall_unit' }); }
        else {
          const n = Math.max(1, Math.ceil(tr / 2)), cols = Math.max(1, Math.round(Math.sqrt((n * r.width) / r.depth))), rows = Math.ceil(n / cols);
          let k = 0;
          for (const y of spread(r.y, r.depth, rows)) for (const x of spread(r.x, r.width, cols)) if (k++ < n) add('cassette', x, y, r.id, tr / n);
          cooling.push({ roomId: r.id, name: r.name, areaSqFt: area * SQFT, tr, units: n, unitType: 'cassette' });
        }
      }
      // exhaust
      if (isWet(r)) { const wc = Number(/\((\d+) WC/.exec(r.name)?.[1] ?? 1); for (const x of spread(r.x, r.width, Math.max(1, Math.ceil(wc / 2)))) add('exhaust', x, r.y + r.depth - 0.3, r.id); }
      if (t === 'pantry' || t === 'electrical_room' || t === 'kitchen') add('exhaust', r.x + r.width / 2, r.y + r.depth - 0.3, r.id);
      // detection and sprinklers
      if (!isWet(r) && t !== 'staircase') for (const p of grid(r, 7)) add('smoke', p.x, p.y, r.id);
      if (t !== 'staircase') for (const p of grid(r, 4)) add('sprinkler', p.x + 0.35, p.y + 0.35, r.id);
      if (t === 'server_room' || t === 'electrical_room') add('ext_co2', r.x + 0.3, r.y + 0.3, r.id);
    }
    // corridor equipment
    const corridors = f.rooms.filter((r) => T(r) === 'passage');
    for (const c of corridors) {
      for (const x of spread(c.x, c.width, Math.max(1, Math.round(c.width / 6)))) add('em_light', x, c.y + c.depth / 2, c.id);
      for (const x of spread(c.x, c.width, Math.max(1, Math.round(c.width / 10)))) add('exit_sign', x, c.y + 0.2, c.id);
    }
    // extinguishers: at exits and corridor ends, one per 200 m² (min 2)
    const need = Math.max(2, Math.ceil((W * D) / 200));
    const spots = [...exits.map((e) => ({ x: e.x, y: e.y, id: 'exit' })), ...corridors.flatMap((c) => [{ x: c.x + 0.4, y: c.y + c.depth / 2, id: c.id }, { x: c.x + c.width - 0.4, y: c.y + c.depth / 2, id: c.id }])];
    spots.slice(0, need).forEach((s) => add('ext_abc', s.x, s.y, s.id));
    for (let i = spots.length; i < need; i++) add('ext_abc', W * (i + 1) / (need + 1), corridors[0] ? corridors[0].y + corridors[0].depth / 2 : D / 2, 'floor');
    for (const e of exits) { add('mcp', e.x, e.y, 'exit'); add('hooter', e.x, e.y, 'exit'); add('exit_sign', e.x, e.y, 'exit'); }
    const st = f.rooms.find((r) => T(r) === 'staircase'), c0 = corridors[corridors.length - 1];
    if (st) add('hose_reel', st.x - 0.3, st.y + 0.3, st.id); else if (c0) add('hose_reel', c0.x + c0.width - 0.6, c0.y + 0.3, c0.id);
    // escape routes: room door → corridor centre line → along it → nearest exit (orthogonal path length)
    const routes: EscapeRoute[] = [];
    for (const r of f.rooms.filter((q) => !['passage', 'staircase'].includes(T(q)))) {
      const doors = openings.filter((o) => o.floor === fi && o.roomId === r.id && o.type === 'door' && o.wall === 'internal' && o.face && typeof o.positionMm === 'number');
      if (!doors.length || !exits.length) continue;
      let best: EscapeRoute | null = null;
      for (const door of doors) {
        const a = door.positionMm! / 1000;
        const dp = door.face === 'front' ? { x: r.x + a, y: r.y } : door.face === 'rear' ? { x: r.x + a, y: r.y + r.depth } : door.face === 'left' ? { x: r.x, y: r.y + a } : { x: r.x + r.width, y: r.y + a };
        // farthest occupied point of the room from this door (0.5 m off the walls); walked straight to the door
        const corners = [[0.5, 0.5], [r.width - 0.5, 0.5], [0.5, r.depth - 0.5], [r.width - 0.5, r.depth - 0.5]].map(([u, v]) => ({ x: r.x + u, y: r.y + v }));
        const far = corners.sort((p, q) => Math.hypot(q.x - dp.x, q.y - dp.y) - Math.hypot(p.x - dp.x, p.y - dp.y))[0];
        const inRoom = Math.hypot(far.x - dp.x, far.y - dp.y);
        const corr = corridors.find((c) => dp.x >= c.x - 0.01 && dp.x <= c.x + c.width + 0.01 && dp.y >= c.y - 0.01 && dp.y <= c.y + c.depth + 0.01);
        for (const e of exits) {
          // from the door: along the corridor centre line, then to the exit
          const tail = corr ? [dp, { x: dp.x, y: corr.y + corr.depth / 2 }, { x: e.x, y: corr.y + corr.depth / 2 }, e] : [dp, e];
          const len = inRoom + tail.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - tail[i].x) + Math.abs(p.y - tail[i].y), 0);
          if (!best || len < best.lengthM) best = { roomId: r.id, name: r.name, path: [far, ...tail], lengthM: len, exit: e.name };
        }
      }
      if (best) routes.push(best);
    }
    floors.push({ floor: fi, points: pts, cooling, routes, exits, maxTravelM: Math.max(0, ...routes.map((x) => x.lengthM)) });
  });
  const c = (k: ServiceKind) => floors.reduce((s, f) => s + f.points.filter((p) => p.kind === k).length, 0);
  const tr = floors.reduce((s, f) => s + f.cooling.reduce((a, r) => a + r.tr, 0), 0);
  return { floors, totals: { tr, cassettes: c('cassette'), wallUnits: c('wall_unit'), outdoorUnits: Math.max(1, Math.ceil(tr / 10)), exhaustFans: c('exhaust'), smoke: c('smoke'), sprinklers: c('sprinkler'), extABC: c('ext_abc'), extCO2: c('ext_co2'), mcp: c('mcp'), hooters: c('hooter'), exitSigns: c('exit_sign'), emLights: c('em_light'), hoseReels: c('hose_reel') } };
}
