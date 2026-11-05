import type { ProjectRequirements } from '../types';

/**
 * Building type and regional design style. One registry read by the 3D model, the elevations and
 * sections, the BOQ and the AI render prompt, so every output shows the same house.
 *
 * Pitched roofs sit over the flat RCC roof slab (trusses + tiles / sheets), so the structural design,
 * the slab and the stair stay as engineered; the BOQ adds the roof covering.
 */
export type BuildingType = 'independent' | 'villa' | 'bungalow' | 'townhouse';
export type Region = 'india' | 'middle_east' | 'uk_europe' | 'us';
export type RoofType = 'flat' | 'gable' | 'hip';
export type DesignStyleId =
  | 'in_contemporary' | 'in_kerala'
  | 'me_modern_arabic' | 'me_contemporary'
  | 'uk_brick_gable' | 'eu_render_hip'
  | 'us_craftsman' | 'us_farmhouse';

export interface DesignStyle {
  id: DesignStyleId; region: Region; label: string; blurb: string;
  roof: { type: RoofType; pitchDeg: number; overhangM: number; color: string; material: string };
  /** parapet on flat roofs (and as a low upstand under pitched roofs: none) */
  parapet: boolean;
  walls: { color: string; accent: string; cladding: 'render' | 'brick' | 'stone' | 'board_batten'; plinthStone: boolean };
  openings: { frame: string; arch: boolean; shutters: boolean; mashrabiya: boolean };
  porchColumns: boolean;
  /** words for the AI photo render, so the render matches the drawings */
  prompt: string;
}

export const DESIGN_STYLES: DesignStyle[] = [
  { id: 'in_contemporary', region: 'india', label: 'Contemporary Indian', blurb: 'Flat roof, parapet, white + wood accents, stone base',
    roof: { type: 'flat', pitchDeg: 0, overhangM: 0, color: '#d9d4c7', material: 'RCC slab with parapet' }, parapet: true,
    walls: { color: '#f2eee6', accent: '#9a6a43', cladding: 'render', plinthStone: true }, openings: { frame: '#3b3b3b', arch: false, shutters: false, mashrabiya: false }, porchColumns: false,
    prompt: 'contemporary Indian house, flat roof with parapet, white textured render, warm wood accents, stone-clad plinth, black aluminium windows' },
  { id: 'in_kerala', region: 'india', label: 'Kerala sloped roof', blurb: 'Hipped terracotta tile roof, deep eaves, verandah columns',
    roof: { type: 'hip', pitchDeg: 30, overhangM: 0.9, color: '#a8492e', material: 'Mangalore clay tiles on steel/timber frame' }, parapet: false,
    walls: { color: '#f4ecd8', accent: '#6b3f22', cladding: 'render', plinthStone: true }, openings: { frame: '#5a3a22', arch: false, shutters: false, mashrabiya: false }, porchColumns: true,
    prompt: 'traditional Kerala house, hipped terracotta Mangalore tile roof with deep eaves, laterite-coloured walls, wooden windows, verandah with round columns' },
  { id: 'me_modern_arabic', region: 'middle_east', label: 'Modern Arabic', blurb: 'Arched openings, mashrabiya screens, sand render, parapet',
    roof: { type: 'flat', pitchDeg: 0, overhangM: 0, color: '#d8c7a6', material: 'RCC slab with parapet' }, parapet: true,
    walls: { color: '#e8d7b5', accent: '#8a6a3c', cladding: 'render', plinthStone: true }, openings: { frame: '#5b4630', arch: true, shutters: false, mashrabiya: true }, porchColumns: true,
    prompt: 'modern Arabic villa, sand-coloured render, pointed arches, timber mashrabiya screens, flat roof with parapet, palm trees, Gulf style' },
  { id: 'me_contemporary', region: 'middle_east', label: 'Gulf contemporary', blurb: 'Cubic volumes, stone cladding, slim black frames',
    roof: { type: 'flat', pitchDeg: 0, overhangM: 0, color: '#cfc9bd', material: 'RCC slab with parapet' }, parapet: true,
    walls: { color: '#efebe3', accent: '#7c776d', cladding: 'stone', plinthStone: false }, openings: { frame: '#222222', arch: false, shutters: false, mashrabiya: false }, porchColumns: false,
    prompt: 'contemporary Dubai villa, cubic volumes, beige limestone cladding, large glazing with slim black frames, flat roof, landscaped driveway' },
  { id: 'uk_brick_gable', region: 'uk_europe', label: 'British brick', blurb: 'Red brick, slate gable roof, white sash windows',
    roof: { type: 'gable', pitchDeg: 40, overhangM: 0.3, color: '#4a4f57', material: 'natural slate on timber trusses' }, parapet: false,
    walls: { color: '#a5523a', accent: '#f2f2ee', cladding: 'brick', plinthStone: false }, openings: { frame: '#f5f5f2', arch: false, shutters: false, mashrabiya: false }, porchColumns: false,
    prompt: 'British red-brick house, grey slate gable roof, white sash windows, chimney, small front garden, overcast English light' },
  { id: 'eu_render_hip', region: 'uk_europe', label: 'European render', blurb: 'White render, hipped clay tile roof, window shutters',
    roof: { type: 'hip', pitchDeg: 32, overhangM: 0.5, color: '#b5532f', material: 'clay roof tiles on timber trusses' }, parapet: false,
    walls: { color: '#f5f2ea', accent: '#4f6b5a', cladding: 'render', plinthStone: true }, openings: { frame: '#ffffff', arch: false, shutters: true, mashrabiya: false }, porchColumns: false,
    prompt: 'European family house, white render, hipped terracotta tile roof, painted wooden shutters, garden, Mediterranean light' },
  { id: 'us_craftsman', region: 'us', label: 'American Craftsman', blurb: 'Low gable roof, tapered porch columns, sided walls',
    roof: { type: 'gable', pitchDeg: 25, overhangM: 0.6, color: '#3e3f42', material: 'asphalt shingles on timber trusses' }, parapet: false,
    walls: { color: '#7d8f7a', accent: '#efe8d8', cladding: 'board_batten', plinthStone: true }, openings: { frame: '#efe8d8', arch: false, shutters: false, mashrabiya: false }, porchColumns: true,
    prompt: 'American Craftsman house, low-pitched gable roof with wide eaves, tapered porch columns on stone piers, painted siding, front porch' },
  { id: 'us_farmhouse', region: 'us', label: 'Modern farmhouse', blurb: 'Steep gable, white board-and-batten, black frames',
    roof: { type: 'gable', pitchDeg: 45, overhangM: 0.4, color: '#2c2e31', material: 'standing-seam metal on timber trusses' }, parapet: false,
    walls: { color: '#f4f4f1', accent: '#1f1f1f', cladding: 'board_batten', plinthStone: false }, openings: { frame: '#1d1d1d', arch: false, shutters: false, mashrabiya: false }, porchColumns: true,
    prompt: 'modern farmhouse, steep gable roof with black standing-seam metal, white board-and-batten siding, black window frames, covered porch' },
];

export const REGIONS: { id: Region; label: string }[] = [
  { id: 'india', label: 'India' }, { id: 'middle_east', label: 'Middle East' }, { id: 'uk_europe', label: 'UK & Europe' }, { id: 'us', label: 'US' },
];

export const BUILDING_TYPES: { id: BuildingType; label: string; blurb: string }[] = [
  { id: 'independent', label: 'Independent house', blurb: 'Standard plot house, floors as planned' },
  { id: 'villa', label: 'Villa', blurb: 'Detached, G+1, garden all round, car porch' },
  { id: 'bungalow', label: 'Bungalow', blurb: 'Detached, single storey, wide plan' },
  { id: 'townhouse', label: 'Townhouse', blurb: 'Row house: shared side walls, narrow, 2–3 floors' },
];

/** The style for a brief (defaults to contemporary Indian, the planner's original look). */
export function styleFor(req: Pick<ProjectRequirements, 'designStyle'> | null | undefined): DesignStyle {
  return DESIGN_STYLES.find((s) => s.id === req?.designStyle) ?? DESIGN_STYLES[0];
}

/** Ridge height of a pitched roof above the slab (m), for a building of depth/width spanning `spanM`. */
export function ridgeRiseM(style: DesignStyle, spanM: number): number {
  return style.roof.type === 'flat' ? 0 : Math.tan((style.roof.pitchDeg * Math.PI) / 180) * (spanM / 2 + style.roof.overhangM);
}

/** Brief adjustments for the building type (applied before planning). */
export function applyBuildingType<T extends ProjectRequirements>(req: T): T {
  switch (req.buildingType) {
    case 'bungalow': return { ...req, floorsPreference: 1 };
    case 'villa': return { ...req, floorsPreference: req.floorsPreference === 1 ? 1 : 2 };
    case 'townhouse': return { ...req, floorsPreference: 2, setbacks: { ...(req.setbacks ?? { front: 3, rear: 1.5, left: 0, right: 0 }), left: 0, right: 0 } } as T;
    default: return req;
  }
}

/* ── Pitched roof geometry, shared by the 3D model and the elevations / sections ──
 * The roof sits on the RCC roof slab (top of slab = 0). Eaves overhang the walls by overhangM and drop
 * below slab top by the slope; the ridge runs along the longer side of the building. */
export interface RoofGeom {
  ridgeAlongX: boolean;
  t: number; o: number;
  /** rise of ridge and drop of eave edge relative to slab top (m) */
  ridge: number; eave: number;
}
export function roofGeom(style: DesignStyle, W: number, D: number): RoofGeom | null {
  if (style.roof.type === 'flat') return null;
  const ridgeAlongX = W >= D, span = ridgeAlongX ? D : W;
  const t = Math.tan((style.roof.pitchDeg * Math.PI) / 180), o = style.roof.overhangM;
  return { ridgeAlongX, t, o, ridge: t * span / 2, eave: -t * o };
}

type V3 = [number, number, number];
/** Roof faces and gable-end wall infill as polygons in building-local metres: x across the width, y up from slab top, z into the depth. */
export function roofFaces3D(style: DesignStyle, W: number, D: number): { roof: V3[][]; gableWalls: V3[][] } | null {
  const g = roofGeom(style, W, D);
  if (!g) return null;
  // build with the ridge along x over a (L × S) rectangle, then swap axes if the ridge runs along z
  const L = g.ridgeAlongX ? W : D, S = g.ridgeAlongX ? D : W, o = g.o, ye = g.eave, yr = g.ridge;
  const roof: V3[][] = [], walls: V3[][] = [];
  if (style.roof.type === 'gable') {
    roof.push([[-o, ye, -o], [L + o, ye, -o], [L + o, yr, S / 2], [-o, yr, S / 2]]);
    roof.push([[-o, ye, S + o], [-o, yr, S / 2], [L + o, yr, S / 2], [L + o, ye, S + o]]);
    walls.push([[0, 0, 0], [0, 0, S], [0, yr, S / 2]], [[L, 0, 0], [L, yr, S / 2], [L, 0, S]]);
  } else {
    const run = Math.min(S / 2 + o, (L + 2 * o) / 2);
    roof.push([[-o, ye, -o], [L + o, ye, -o], [L + o - run, yr, S / 2], [-o + run, yr, S / 2]]);
    roof.push([[-o, ye, S + o], [-o + run, yr, S / 2], [L + o - run, yr, S / 2], [L + o, ye, S + o]]);
    roof.push([[-o, ye, -o], [-o + run, yr, S / 2], [-o, ye, S + o]]);
    roof.push([[L + o, ye, -o], [L + o, ye, S + o], [L + o - run, yr, S / 2]]);
  }
  const swap = (p: V3): V3 => (g.ridgeAlongX ? p : [p[2], p[1], p[0]]);
  return { roof: roof.map(f => f.map(swap)), gableWalls: walls.map(f => f.map(swap)) };
}

/**
 * Roof outline seen in an elevation or section of one side, as (u, dz) polygons in metres: u along the
 * view from 0 to the side's length, dz above slab top. Profiles are symmetric, so left/right mirroring
 * of the view does not matter.
 */
export function roofProfile(style: DesignStyle, side: 'front' | 'rear' | 'left' | 'right', W: number, D: number): { roof: [number, number][]; gable?: [number, number][]; ridge: number } | null {
  const g = roofGeom(style, W, D);
  if (!g) return null;
  const len = side === 'front' || side === 'rear' ? W : D;
  const alongRidge = (side === 'front' || side === 'rear') === g.ridgeAlongX; // looking at the eave side
  const o = g.o, ye = g.eave, yr = g.ridge;
  if (alongRidge) {
    if (style.roof.type === 'gable') return { roof: [[-o, ye], [len + o, ye], [len + o, yr], [-o, yr]], ridge: yr };
    const S = len === W ? D : W, run = Math.min(S / 2 + o, (len + 2 * o) / 2);
    return { roof: [[-o, ye], [len + o, ye], [len + o - run, yr], [-o + run, yr]], ridge: yr };
  }
  const v = Math.max(0.18, 0.2 / Math.cos(Math.atan(g.t))); // verge / fascia depth
  if (style.roof.type === 'gable') return { roof: [[-o, ye], [len / 2, yr + v], [len + o, ye], [len + o, ye - v], [len / 2, yr], [-o, ye - v]].map(([u, z]) => [u, z]) as [number, number][], gable: [[0, 0], [len / 2, yr], [len, 0]], ridge: yr + v };
  return { roof: [[-o, ye], [len / 2, yr], [len + o, ye]], ridge: yr };
}
