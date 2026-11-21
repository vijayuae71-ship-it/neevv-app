/**
 * Plan export for professionals: DXF (one per floor, metres → millimetres, model space) and IFC4
 * (whole building: site, building, storeys, walls, spaces, doors and windows). Pure functions; the
 * server runs them after checking the caller is an approved professional.
 */
import type { Layout } from '../types';
import { placeOpenings, FLOOR_TO_FLOOR_MM } from './buildingModel';
import { WALL_EXTERNAL_MM, WALL_INTERNAL_MM } from './quantityRules';

const FLOOR_TO_FLOOR_MM_FALLBACK = FLOOR_TO_FLOOR_MM;

type Seg = { x1: number; y1: number; x2: number; y2: number; external: boolean };
export interface PlanRoom { name: string; type: string; x: number; y: number; w: number; d: number }
export interface PlanOpening { type: string; axis: 'x' | 'y'; fixed: number; a: number; b: number; sill: number; height: number; room: string }
export interface PlanFloor { floor: number; label: string; W: number; D: number; rooms: PlanRoom[]; walls: Seg[]; openings: PlanOpening[] }

const WALL_HEIGHT = FLOOR_TO_FLOOR_MM_FALLBACK / 1000 - 0.15;
const EPS = 0.01;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Floors as plain geometry in metres (building-local: origin at the buildable area's front-left corner). */
export function planFloors(layout: Layout): PlanFloor[] {
  const W = layout.buildableWidthM, D = layout.buildableDepthM;
  const ops = placeOpenings(layout);
  return layout.floors.map((f) => {
    const rooms = f.rooms.filter((r) => !(r.type === 'puja' && /niche/i.test(r.name)));
    const segs = new Map<string, Seg>();
    const add = (x1: number, y1: number, x2: number, y2: number) => {
      const a: [number, number] = [r3(x1), r3(y1)], b: [number, number] = [r3(x2), r3(y2)];
      const key = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? `${a}|${b}` : `${b}|${a}`;
      if (segs.has(key)) return;
      const external = (Math.abs(a[1]) < EPS && Math.abs(b[1]) < EPS) || (Math.abs(a[1] - D) < EPS && Math.abs(b[1] - D) < EPS)
        || (Math.abs(a[0]) < EPS && Math.abs(b[0]) < EPS) || (Math.abs(a[0] - W) < EPS && Math.abs(b[0] - W) < EPS);
      segs.set(key, { x1: a[0], y1: a[1], x2: b[0], y2: b[1], external });
    };
    for (const r of rooms) {
      add(r.x, r.y, r.x + r.width, r.y);
      add(r.x + r.width, r.y, r.x + r.width, r.y + r.depth);
      add(r.x, r.y + r.depth, r.x + r.width, r.y + r.depth);
      add(r.x, r.y, r.x, r.y + r.depth);
    }
    return {
      floor: f.floor,
      label: f.floor === 0 ? 'Ground floor' : `First floor`,
      W, D,
      rooms: rooms.map((r) => ({ name: r.name, type: r.type, x: r3(r.x), y: r3(r.y), w: r3(r.width), d: r3(r.depth) })),
      walls: [...segs.values()],
      openings: ops.filter((o) => o.floor === f.floor).map((o) => ({
        type: o.source.type, axis: o.axis, fixed: r3(o.fixed), a: r3(o.a), b: r3(o.b), sill: r3(o.sillM), height: r3(o.heightM), room: o.room.name,
      })),
    };
  });
}

/* ───────────────────────────── DXF (model space, millimetres) ───────────────────────────── */

const mm = (m: number) => (Math.round(m * 1000 * 100) / 100).toFixed(2);
const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^\w .+\-/()]/g, ' ').trim();

export function floorDXF(fl: PlanFloor): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), String(v));
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    g(0, 'LINE'); g(8, layer); g(10, mm(x1)); g(20, mm(y1)); g(30, '0'); g(11, mm(x2)); g(21, mm(y2)); g(31, '0');
  };
  const text = (layer: string, x: number, y: number, h: number, s: string) => {
    g(0, 'TEXT'); g(8, layer); g(10, mm(x)); g(20, mm(y)); g(30, '0'); g(40, Math.round(h * 1000)); g(1, ascii(s));
  };
  // header and layers (R12, the most widely readable DXF)
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, 6);
  const layers: [string, number][] = [['WALLS_EXTERNAL', 7], ['WALLS_INTERNAL', 8], ['DOORS', 3], ['WINDOWS', 5], ['ROOMS', 2], ['TEXT', 2]];
  for (const [name, color] of layers) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  // walls as centre lines; the thickness is in the layer name and the notes
  for (const s of fl.walls) line(s.external ? 'WALLS_EXTERNAL' : 'WALLS_INTERNAL', s.x1, s.y1, s.x2, s.y2);
  // openings across their wall
  for (const o of fl.openings) {
    const layer = o.type === 'door' ? 'DOORS' : 'WINDOWS';
    if (o.axis === 'x') line(layer, o.a, o.fixed, o.b, o.fixed); else line(layer, o.fixed, o.a, o.fixed, o.b);
  }
  // rooms: outline and label with the clear size
  for (const r of fl.rooms) {
    line('ROOMS', r.x, r.y, r.x + r.w, r.y); line('ROOMS', r.x + r.w, r.y, r.x + r.w, r.y + r.d);
    line('ROOMS', r.x + r.w, r.y + r.d, r.x, r.y + r.d); line('ROOMS', r.x, r.y + r.d, r.x, r.y);
    text('TEXT', r.x + r.w / 2, r.y + r.d / 2 + 0.15, 0.18, r.name.replace(/\s*\(.*?\)\s*/g, '').trim());
    text('TEXT', r.x + r.w / 2, r.y + r.d / 2 - 0.15, 0.14, `${(r.w).toFixed(2)} x ${(r.d).toFixed(2)} m`);
  }
  text('TEXT', 0, -0.6, 0.25, `${fl.label} - neevv preliminary plan - verify with a licensed professional before use`);
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n') + '\n';
}

/* ───────────────────────────── IFC4 (STEP text) ───────────────────────────── */

const FOOT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';
/** Deterministic 22-character IFC GUID from a seed string (FNV-1a based, pure JS). */
function guid(seed: string): string {
  let h = 2166136261;
  let s = '';
  for (let k = 0; k < 22; k++) {
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i) + k; h = Math.imul(h, 16777619); }
    s += FOOT[(h >>> 0) % 64];
  }
  return s;
}
const num = (v: number) => (Number.isInteger(v) ? `${v}.` : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.'));
const str = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The whole building as IFC4 (metres). One storey per floor; spaces are the rooms. */
export function buildingIFC(floors: PlanFloor[], opts: { name: string; date: string }): string {
  const lines: string[] = [];
  let n = 0;
  const e = (body: string) => { n += 1; lines.push(`#${n}=${body};`); return n; };
  const ref = (id: number) => `#${id}`;
  const list = (ids: number[]) => `(${ids.map(ref).join(',')})`;

  const org = e(`IFCORGANIZATION($,'neevv',$,$,$)`);
  const app = e(`IFCAPPLICATION(${ref(org)},'1.0','neevv plan export','neevv')`);
  void app;
  const lenU = e(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  const areaU = e(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const volU = e(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
  const units = e(`IFCUNITASSIGNMENT(${list([lenU, areaU, volU])})`);
  const origin = e(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const zDir = e(`IFCDIRECTION((0.,0.,1.))`);
  const xDir = e(`IFCDIRECTION((1.,0.,0.))`);
  const axis3 = e(`IFCAXIS2PLACEMENT3D(${ref(origin)},${ref(zDir)},${ref(xDir)})`);
  const ctx = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ref(axis3)},$)`);
  const project = e(`IFCPROJECT(${str(guid(opts.name + 'project'))},$,${str(opts.name)},$,$,$,$,${list([ctx])},${ref(units)})`);
  const sitePl = e(`IFCLOCALPLACEMENT($,${ref(axis3)})`);
  const site = e(`IFCSITE(${str(guid(opts.name + 'site'))},$,'Site',$,$,${ref(sitePl)},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = e(`IFCLOCALPLACEMENT(${ref(sitePl)},${ref(axis3)})`);
  const building = e(`IFCBUILDING(${str(guid(opts.name + 'building'))},$,'Building',$,$,${ref(bldPl)},$,$,.ELEMENT.,$,$,$)`);
  e(`IFCRELAGGREGATES(${str(guid(opts.name + 'agg0'))},$,$,$,${ref(project)},${list([site])})`);
  e(`IFCRELAGGREGATES(${str(guid(opts.name + 'agg1'))},$,$,$,${ref(site)},${list([building])})`);

  const dirOf = (x1: number, y1: number, x2: number, y2: number) => {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    return { L, dx: (x2 - x1) / L, dy: (y2 - y1) / L };
  };
  /** Extruded rectangle of length L (along dx,dy) and thickness t, starting at (x,y,z), height h. */
  const box = (x: number, y: number, z: number, dx: number, dy: number, L: number, t: number, h: number, pl: { rel: number }, tag: string) => {
    const place = e(`IFCAXIS2PLACEMENT3D(${ref(e(`IFCCARTESIANPOINT((${num(x)},${num(y)},${num(z)}))`))},${ref(zDir)},${ref(e(`IFCDIRECTION((${num(dx)},${num(dy)},0.))`))})`);
    const localPl = e(`IFCLOCALPLACEMENT(${ref(pl.rel)},${ref(place)})`);
    const prof2 = e(`IFCAXIS2PLACEMENT2D(${ref(e(`IFCCARTESIANPOINT((${num(L / 2)},0.))`))},$)`);
    const profile = e(`IFCRECTANGLEPROFILEDEF(.AREA.,${str(tag)},${ref(prof2)},${num(L)},${num(t)})`);
    const solid = e(`IFCEXTRUDEDAREASOLID(${ref(profile)},${ref(axis3)},${ref(zDir)},${num(h)})`);
    const rep = e(`IFCSHAPEREPRESENTATION(${ref(ctx)},'Body','SweptSolid',${list([solid])})`);
    const shape = e(`IFCPRODUCTDEFINITIONSHAPE($,$,${list([rep])})`);
    return { placement: localPl, shape };
  };

  const storeys: number[] = [];
  floors.forEach((fl, si) => {
    const elev = si * (FLOOR_TO_FLOOR_MM_FALLBACK / 1000);
    const stPlace = e(`IFCAXIS2PLACEMENT3D(${ref(e(`IFCCARTESIANPOINT((0.,0.,${num(elev)}))`))},${ref(zDir)},${ref(xDir)})`);
    const stPl = e(`IFCLOCALPLACEMENT(${ref(bldPl)},${ref(stPlace)})`);
    const storey = e(`IFCBUILDINGSTOREY(${str(guid(opts.name + 'storey' + fl.floor))},$,${str(fl.label)},$,$,${ref(stPl)},$,${str(fl.label)},.ELEMENT.,${num(elev)})`);
    storeys.push(storey);
    const rel = { rel: stPl };
    const contained: number[] = [];
    // walls: one per centre line, full storey height less the slab
    fl.walls.forEach((s, i) => {
      const { L, dx, dy } = dirOf(s.x1, s.y1, s.x2, s.y2);
      const t = (s.external ? WALL_EXTERNAL_MM : WALL_INTERNAL_MM) / 1000;
      const b = box(s.x1, s.y1, 0, dx, dy, L, t, WALL_HEIGHT, rel, 'Wall');
      contained.push(e(`IFCWALL(${str(guid(`${opts.name}w${fl.floor}-${i}`))},$,${str(s.external ? 'External wall' : 'Internal wall')},$,$,${ref(b.placement)},${ref(b.shape)},$,.STANDARD.)`));
    });
    // spaces: the rooms, as their footprint
    fl.rooms.forEach((r, i) => {
      const place = e(`IFCAXIS2PLACEMENT3D(${ref(e(`IFCCARTESIANPOINT((${num(r.x)},${num(r.y)},0.))`))},${ref(zDir)},${ref(xDir)})`);
      const spPl = e(`IFCLOCALPLACEMENT(${ref(stPl)},${ref(place)})`);
      const prof2 = e(`IFCAXIS2PLACEMENT2D(${ref(e(`IFCCARTESIANPOINT((${num(r.w / 2)},${num(r.d / 2)}))`))},$)`);
      const profile = e(`IFCRECTANGLEPROFILEDEF(.AREA.,${str('Room')},${ref(prof2)},${num(r.w)},${num(r.d)})`);
      const solid = e(`IFCEXTRUDEDAREASOLID(${ref(profile)},${ref(axis3)},${ref(zDir)},${num(WALL_HEIGHT)})`);
      const rep = e(`IFCSHAPEREPRESENTATION(${ref(ctx)},'Body','SweptSolid',${list([solid])})`);
      const shape = e(`IFCPRODUCTDEFINITIONSHAPE($,$,${list([rep])})`);
      contained.push(e(`IFCSPACE(${str(guid(`${opts.name}s${fl.floor}-${i}`))},$,${str(r.name)},$,$,${ref(spPl)},${ref(shape)},${str(r.name)},.ELEMENT.,.SPACE.,$)`));
    });
    // doors and windows: sized and placed on their wall, sill height from the floor
    fl.openings.forEach((o, i) => {
      const isDoor = o.type === 'door';
      const dx = o.axis === 'x' ? 1 : 0, dy = o.axis === 'x' ? 0 : 1;
      const x = o.axis === 'x' ? o.a : o.fixed, y = o.axis === 'x' ? o.fixed : o.a;
      const L = o.b - o.a;
      const t = (WALL_EXTERNAL_MM / 1000) * 0.5;
      const b = box(x, y, o.sill, dx, dy, L, t, o.height, rel, isDoor ? 'Door' : 'Window');
      const name = isDoor ? 'Door' : 'Window';
      contained.push(isDoor
        ? e(`IFCDOOR(${str(guid(`${opts.name}o${fl.floor}-${i}`))},$,${str(name)},$,$,${ref(b.placement)},${ref(b.shape)},$,${num(o.height)},${num(L)},$,$,$,$,$)`)
        : e(`IFCWINDOW(${str(guid(`${opts.name}o${fl.floor}-${i}`))},$,${str(name)},$,$,${ref(b.placement)},${ref(b.shape)},$,${num(o.height)},${num(L)},$,$,$)`));
    });
    e(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${str(guid(`${opts.name}c${fl.floor}`))},$,$,$,${list(contained)},${ref(storey)})`);
  });
  e(`IFCRELAGGREGATES(${str(guid(opts.name + 'agg2'))},$,$,$,${ref(building)},${list(storeys)})`);

  const stamp = opts.date.slice(0, 19);
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME(${str('neevv-plan.ifc')},${str(stamp)},(''),(''),'neevv','neevv','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}
