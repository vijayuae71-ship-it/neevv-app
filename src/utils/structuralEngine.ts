/**
 * Preliminary residential structural design engine.
 * Units: geometry is metres unless stated otherwise; forces are kN and moments kN-m.
 * This module deliberately has no project imports so it can be integrated independently.
 */

export interface Room { id: string; name: string; type: string; x: number; y: number; width: number; depth: number; floor: number; }
export interface Column { x: number; y: number; widthMM: number; depthMM: number; }
export interface FloorLayout { floor: number; floorLabel: string; rooms: Room[]; columns: Column[]; }
export interface Setbacks { front: number; rear: number; left: number; right: number; }
export interface Layout {
  floors: FloorLayout[];
  builtUpAreaSqM: number;
  builtUpAreaSqFt: number;
  setbacks: Setbacks;
  plotWidthM: number;
  plotDepthM: number;
  buildableWidthM: number;
  buildableDepthM: number;
  buildingWidthMm?: number;
  buildingDepthMm?: number;
  numFloors?: number;
  plotWidthFt?: number;
  plotDepthFt?: number;
}
export interface CityEngineeringData {
  city: string; state: string;
  seismicZone: 'II' | 'III' | 'IV' | 'V';
  zoneFactor: number;
  basicWindSpeedMps: number;
  soilType: string;
  defaultSBC_kNm2: number;
  terrainCategory: 1 | 2 | 3 | 4;
  coastalProximity: boolean;
  notes?: string;
}

export interface MaterialGrades {
  concreteGrade: 'M20' | 'M25' | 'M30';
  fck: number;
  steelGrade: 'Fe415' | 'Fe500' | 'Fe500D';
  fy: number;
}

export interface SlabDesignResult {
  id: string; floor: number; spanXm: number; spanYm: number; aspectRatio: number;
  slabType: 'one-way' | 'two-way'; thicknessMm: number; effectiveDepthMm: number;
  deadLoadKNm2: number; liveLoadKNm2: number; totalLoadKNm2: number; factoredLoadKNm2: number;
  mainBarDiaMm: number; mainBarSpacingMm: number; distBarDiaMm: number; distBarSpacingMm: number;
  shortSpanBarDiaMm?: number; shortSpanSpacingMm?: number; longSpanBarDiaMm?: number; longSpanSpacingMm?: number;
  deflectionCheck: boolean; shearCheck: boolean;
}

export interface BeamDesignResult {
  id: string; floor: number; spanM: number; widthMm: number; depthMm: number; effectiveDepthMm: number;
  loadKNm: number; maxMomentKNm: number; maxShearKN: number;
  tensionBars: string; tensionAreaMm2: number; compressionBars: string; compressionAreaMm2: number;
  stirrupDiaMm: number; stirrupSpacingNearSupportMm: number; stirrupSpacingMidSpanMm: number;
  deflectionCheck: boolean; ptProvided: number; isDoublyReinforced: boolean;
}

export interface ColumnDesignResult {
  id: string; floor: number; x: number; y: number; widthMm: number; depthMm: number;
  axialLoadKN: number; momentKNm: number; mainBars: string; mainBarAreaMm2: number;
  steelPercentage: number; tieDiaMm: number; tieSpacingMm: number; isShort: boolean;
  effectiveLength: number; slendernessRatio: number;
}

export interface FoundationDesignResult {
  id: string; columnId: string; columnLoadKN: number; footingSizeMm: number; footingDepthMm: number;
  effectiveDepthMm: number; soilPressureKNm2: number; sbc: number; barDiaMm: number; barSpacingMm: number;
  barsEachWay: number; pccSizeMm: number; pccThicknessMm: number; bearingPressureOK: boolean;
  oneWayShearOK: boolean; twoWayShearOK: boolean; developmentLengthOK: boolean;
}

export interface StaircaseDesignResult {
  numRisers: number; riserMm: number; treadMm: number; flightWidthMm: number;
  waistSlabThicknessMm: number; effectiveSpanM: number; deadLoadKNm2: number; liveLoadKNm2: number;
  factoredLoadKNm2: number; maxMomentKNm: number; mainBarDiaMm: number; mainBarSpacingMm: number;
  distBarDiaMm: number; distBarSpacingMm: number; landingThicknessMm: number;
}

export interface StructuralDesignInput {
  layout: Layout;
  cityData: CityEngineeringData;
  numFloors: number;
  floorHeightM?: number;
  concreteGrade?: 'M20' | 'M25' | 'M30';
  steelGrade?: 'Fe415' | 'Fe500' | 'Fe500D';
  soilSBC?: number;
  roofAccessible?: boolean;
  importanceFactor?: number;
  responseFactor?: number;
}

export interface StructuralDesignResult {
  parameters: {
    city: string; seismicZone: string; zoneFactor: number; windSpeed: number; soilType: string; sbc: number;
    concreteGrade: string; steelGrade: string; numFloors: number; floorHeight: number; buildingHeight: number;
    buildingWidthM: number; buildingDepthM: number;
  };
  loads: {
    deadLoadPerFloor: number; liveLoadPerFloor: number; totalBuildingWeight: number; seismicBaseShear: number;
    seismicCoeffAh: number; windForce: number; governingLateral: 'seismic' | 'wind';
    floorWiseSeismicForce: { floor: number; force: number; }[];
  };
  slabs: SlabDesignResult[];
  beams: BeamDesignResult[];
  columns: ColumnDesignResult[];
  foundations: FoundationDesignResult[];
  staircase: StaircaseDesignResult;
  summary: {
    totalConcreteM3: number; totalSteelKg: number; totalSteelMT: number;
    concreteBreakdown: { foundation: number; columns: number; beams: number; slabs: number; staircase: number; lintels: number; };
    steelBreakdown: { foundation: number; columns: number; beams: number; slabs: number; staircase: number; };
  };
  cityData?: CityEngineeringData;
  warnings: string[];
  disclaimer: string;
}

export const STRUCTURAL_DISCLAIMER =
  'PRELIMINARY STRUCTURAL DESIGN per IS 456:2000, IS 1893:2016, IS 875:1987. ' +
  'City-level parameters used — verify with site-specific soil investigation report. ' +
  'Requires review and approval by licensed structural engineer before execution. ' +
  'Automated calculation does not replace professional engineering judgment.';

interface Point { x: number; y: number; }
interface BeamLine { a: Point; b: Point; floor: number; tributaryWidth: number; wallLoad: number; id: string; }
interface Panel { id: string; floor: number; x: number; y: number; width: number; depth: number; type: string; }
interface BarChoice { dia: number; spacing: number; area: number; }

const RCC_DENSITY = 25; // kN/m3
const BRICK_DENSITY = 20; // kN/m3
const FINISH_LOAD = 1.5; // kN/m2
const STANDARD_BARS = [8, 10, 12, 16, 20, 25, 32];
const EPS = 1e-9;

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
function roundUp(value: number, increment: number): number { return Math.ceil(value / increment - EPS) * increment; }
function roundDown(value: number, increment: number): number { return Math.floor(value / increment + EPS) * increment; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function barArea(dia: number): number { return Math.PI * dia * dia / 4; }
function fmtBars(count: number, dia: number): string { return `${count}-${dia}mm`; }
function keyOf(p: Point): string { return `${p.x.toFixed(3)},${p.y.toFixed(3)}`; }
function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function isSame(a: Point, b: Point): boolean { return distance(a, b) < 0.001; }
function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Number(v.toFixed(3))))].sort((a, b) => a - b);
}
function concreteGrade(name: StructuralDesignInput['concreteGrade']): MaterialGrades {
  const fck = name === 'M20' ? 20 : name === 'M30' ? 30 : 25;
  return { concreteGrade: name ?? 'M25', fck, steelGrade: 'Fe500D', fy: 500 };
}
function materials(input: StructuralDesignInput): MaterialGrades {
  const base = concreteGrade(input.concreteGrade);
  const steel = input.steelGrade ?? 'Fe500D';
  return { ...base, steelGrade: steel, fy: steel === 'Fe415' ? 415 : 500 };
}
/** Approximate IS 456 Table 19 design shear stress in N/mm2, conservative interpolation. */
function tauC(pt: number, fck: number): number {
  const p = clamp(pt, 0.15, 3.0);
  // Values track Table 19 for M20; increased for higher concrete grades.
  const base = p <= 0.25 ? 0.28 : p <= 0.5 ? 0.36 : p <= 0.75 ? 0.48 : p <= 1 ? 0.56 : p <= 1.25 ? 0.64 : p <= 1.5 ? 0.70 : 0.79;
  return base * Math.sqrt(fck / 20);
}
function k2(terrain: CityEngineeringData['terrainCategory'], height: number): number {
  // Conservative low-rise interpolation of IS 875 (Part 3) Table 2 terrain/height multiplier.
  const at10: Record<number, number> = { 1: 1.05, 2: 1.00, 3: 0.91, 4: 0.80 };
  const at5: Record<number, number> = { 1: 1.05, 2: 0.98, 3: 0.87, 4: 0.76 };
  const lo = at5[terrain]; const hi = at10[terrain];
  return clamp(lo + (hi - lo) * ((height - 5) / 5), Math.min(lo, hi), Math.max(lo, hi));
}
function spectralAcceleration(soil: string, period: number): number {
  const normalized = soil.toLowerCase();
  const kind: 'I' | 'II' | 'III' = normalized.includes('soft') || normalized.includes('iii') || normalized === '3'
    ? 'III' : normalized.includes('hard') || normalized.includes('rock') || normalized === 'i' || normalized.includes('type i ') || normalized.endsWith('type i') || normalized === '1' ? 'I' : 'II';
  const plateau = kind === 'I' ? 0.40 : kind === 'II' ? 0.55 : 0.67;
  const tail = kind === 'I' ? 1.0 : kind === 'II' ? 1.36 : 1.67;
  if (period <= 0.10) return 1 + 15 * period;
  if (period <= plateau) return 2.5;
  return tail / Math.min(Math.max(period, plateau), 4.0);
}
function panelLiveLoad(panel: Panel, isRoof: boolean, roofAccessible: boolean): number {
  const text = panel.type.toLowerCase();
  if (text.includes('stair')) return 3.0;
  if (text.includes('balcony') || text.includes('terrace')) return 3.0;
  if (isRoof) return roofAccessible ? 1.5 : 0.75;
  return 2.0;
}
// TypeScript-friendly name accessor for callers whose rooms do not have a name in Panel.
function panelUse(panel: Panel): string { return panel.type.toLowerCase(); }
function isVoidPanel(panel: Panel): boolean {
  const s = panelUse(panel);
  return s.includes('shaft') || s.includes('void') || s.includes('open to sky') || s.includes('parking');
}
function gridCoordinates(length: number, origin: number): number[] {
  const coords = [origin];
  let current = origin;
  const end = origin + length;
  while (end - current > 5 + EPS) { current = Math.min(current + 5, end); coords.push(current); }
  if (coords[coords.length - 1] < end - EPS) coords.push(end);
  return uniqueSorted(coords);
}
function buildingGeometry(layout: Layout): { width: number; depth: number; originX: number; originY: number } {
  const rooms = layout.floors.flatMap((f) => f.rooms);
  const explicitWidth = finitePositive(layout.buildingWidthMm, 0) / 1000;
  const explicitDepth = finitePositive(layout.buildingDepthMm, 0) / 1000;
  const minX = rooms.length ? Math.min(...rooms.map((r) => r.x)) : 0;
  const minY = rooms.length ? Math.min(...rooms.map((r) => r.y)) : 0;
  const maxX = rooms.length ? Math.max(...rooms.map((r) => r.x + r.width)) : 0;
  const maxY = rooms.length ? Math.max(...rooms.map((r) => r.y + r.depth)) : 0;
  const area = finitePositive(layout.builtUpAreaSqM, 0);
  const defaultWidth = finitePositive(layout.buildableWidthM, finitePositive(layout.plotWidthM, Math.sqrt(area || 100)));
  const width = explicitWidth || (maxX > minX ? maxX - minX : defaultWidth);
  const depth = explicitDepth || (maxY > minY ? maxY - minY : finitePositive(layout.buildableDepthM, finitePositive(layout.plotDepthM, area / width || 10)));
  return { width: finitePositive(width, 10), depth: finitePositive(depth, 10), originX: minX, originY: minY };
}
function floorFor(floors: FloorLayout[], floor: number): FloorLayout | undefined {
  // Internal levels are zero-based and follow the supplied floor array order. This avoids
  // duplicating a storey when app data labels its ground floor as floor 1 rather than 0.
  return floors[Math.min(Math.max(floor, 0), floors.length - 1)];
}
function makePanels(layout: Layout, floor: number, geometry: ReturnType<typeof buildingGeometry>): Panel[] {
  const source = floorFor(layout.floors, floor);
  const usable = source?.rooms.filter((r) => r.width > 0.5 && r.depth > 0.5) ?? [];
  if (usable.length) return usable.map((r) => ({ id: r.id, floor, x: r.x, y: r.y, width: r.width, depth: r.depth, type: `${r.name} ${r.type}` }));
  return [{ id: `floor-${floor}-panel`, floor, x: geometry.originX, y: geometry.originY, width: geometry.width, depth: geometry.depth, type: 'residential floor' }];
}
function generateColumns(layout: Layout, floor: number, geometry: ReturnType<typeof buildingGeometry>, panels: Panel[]): Point[] {
  // A vertical frame must use one coherent support grid. Retain every user supplied
  // column coordinate from all storeys, then supplement it if fewer than four exist.
  const provided = layout.floors.flatMap((item) => item.columns).map((c) => ({ x: c.x, y: c.y }));
  // Supplement supplied locations with a maximum-5 m rational frame grid; supplied points
  // remain in the grid even where the architectural module is irregular.
  const xs = gridCoordinates(geometry.width, geometry.originX);
  const ys = gridCoordinates(geometry.depth, geometry.originY);
  const points: Point[] = [...provided];
  for (const x of xs) for (const y of ys) points.push({ x, y });
  // Put support points at internal room intersections / stair corners, retaining only grid rationality.
  for (const p of panels.filter((p) => panelUse(p).includes('stair'))) {
    for (const x of [p.x, p.x + p.width]) for (const y of [p.y, p.y + p.depth]) points.push({ x, y });
  }
  return uniquePoints(points);
}
function uniquePoints(points: Point[]): Point[] {
  const map = new Map<string, Point>();
  for (const point of points) map.set(keyOf(point), point);
  return [...map.values()].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
}
function wallLines(panels: Panel[], geometry: ReturnType<typeof buildingGeometry>): { xs: number[]; ys: number[] } {
  const xs = [geometry.originX, geometry.originX + geometry.width];
  const ys = [geometry.originY, geometry.originY + geometry.depth];
  for (const panel of panels) { xs.push(panel.x, panel.x + panel.width); ys.push(panel.y, panel.y + panel.depth); }
  return { xs: uniqueSorted(xs), ys: uniqueSorted(ys) };
}
function makeBeamGrid(columns: Point[], floor: number, panels: Panel[], geometry: ReturnType<typeof buildingGeometry>, floorHeight: number, isRoof: boolean): BeamLine[] {
  const beams: BeamLine[] = [];
  const seen = new Set<string>();
  const lines = wallLines(panels, geometry);
  const add = (a: Point, b: Point, tributaryWidth: number, wallThicknessM: number): void => {
    if (distance(a, b) < 0.75 || distance(a, b) > 5.05) return;
    const key = keyOf(a) < keyOf(b) ? `${keyOf(a)}|${keyOf(b)}` : `${keyOf(b)}|${keyOf(a)}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Roof perimeter beams carry the 1 m high, 230 mm parapet (4.6 kN/m),
    // while occupied floors carry 230 mm external and 150 mm internal masonry.
    const wallLoad = isRoof
      ? (wallThicknessM >= 0.23 ? 4.6 : 0)
      : (wallThicknessM > 0 ? Math.max(0, floorHeight - 0.45) * wallThicknessM * BRICK_DENSITY : 0);
    beams.push({ a, b, floor, tributaryWidth, wallLoad, id: `B-F${floor}-${beams.length + 1}` });
  };
  const byY = new Map<string, Point[]>(); const byX = new Map<string, Point[]>();
  for (const c of columns) {
    const ky = c.y.toFixed(3); const kx = c.x.toFixed(3);
    byY.set(ky, [...(byY.get(ky) ?? []), c]); byX.set(kx, [...(byX.get(kx) ?? []), c]);
  }
  for (const row of byY.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const midY = row[i].y;
      const isWall = lines.ys.some((y) => Math.abs(y - midY) < 0.02);
      const external = Math.abs(midY - geometry.originY) < 0.02 || Math.abs(midY - (geometry.originY + geometry.depth)) < 0.02;
      add(row[i - 1], row[i], geometry.depth / Math.max(2, Math.ceil(geometry.depth / 4)), isWall ? (external ? 0.23 : 0.15) : 0);
    }
  }
  for (const row of byX.values()) {
    row.sort((a, b) => a.y - b.y);
    for (let i = 1; i < row.length; i++) {
      const midX = row[i].x;
      const isWall = lines.xs.some((x) => Math.abs(x - midX) < 0.02);
      const external = Math.abs(midX - geometry.originX) < 0.02 || Math.abs(midX - (geometry.originX + geometry.width)) < 0.02;
      add(row[i - 1], row[i], geometry.width / Math.max(2, Math.ceil(geometry.width / 4)), isWall ? (external ? 0.23 : 0.15) : 0);
    }
  }
  return beams;
}
function chooseBars(requiredArea: number, maxSpacing: number, minimumDia = 8): BarChoice {
  let best: BarChoice | undefined;
  for (const dia of STANDARD_BARS.filter((d) => d >= minimumDia)) {
    const area = barArea(dia);
    for (let spacing = 75; spacing <= Math.min(300, maxSpacing); spacing += 25) {
      const provided = area * 1000 / spacing;
      if (provided + EPS >= requiredArea) {
        const candidate = { dia, spacing, area: provided };
        if (!best || candidate.area < best.area || (candidate.area === best.area && candidate.dia < best.dia)) best = candidate;
      }
    }
  }
  // 8 mm at 75 is very high steel; selected only for extraordinary calculated demand.
  return best ?? { dia: 32, spacing: 75, area: barArea(32) * 1000 / 75 };
}
function steelAreaForMoment(momentKNm: number, b: number, d: number, fck: number, fy: number): number {
  if (momentKNm <= 0) return 0;
  // IS 456 rectangular stress block: Mu = 0.36 fck b xu (d - 0.42 xu).
  // Solve the quadratic for xu, then Ast = Mu /(0.87 fy z), z = d - 0.42 xu.
  const m = momentKNm * 1e6;
  const normalizedMoment = m / (fck * b * d * d);
  const discriminant = Math.max(0, 0.1296 - 0.6048 * normalizedMoment);
  const xuByD = (0.36 - Math.sqrt(discriminant)) / 0.3024;
  const xu = Math.min(d, Math.max(0, xuByD * d));
  const z = Math.max(0.82 * d, d - 0.42 * xu);
  return m / (0.87 * fy * z);
}
function slabMomentCoefficients(ratio: number): { short: number; long: number } {
  // Conservatively representative IS 456 Table 26 coefficients for simply supported panels.
  if (ratio <= 1.1) return { short: 0.062, long: 0.062 };
  if (ratio <= 1.2) return { short: 0.072, long: 0.056 };
  if (ratio <= 1.3) return { short: 0.081, long: 0.051 };
  if (ratio <= 1.5) return { short: 0.092, long: 0.044 };
  if (ratio <= 1.75) return { short: 0.105, long: 0.036 };
  return { short: 0.118, long: 0.030 };
}
function designSlab(panel: Panel, materialsUsed: MaterialGrades, isRoof: boolean, roofAccessible: boolean): SlabDesignResult {
  const lx = Math.min(panel.width, panel.depth); const ly = Math.max(panel.width, panel.depth);
  const ratio = ly / lx; const oneWay = ratio > 2;
  // L/26 assumes continuity, with conservative 125 mm practical minimum for RCC residential slabs.
  const thickness = roundUp(Math.max(125, lx * 1000 / (oneWay ? 24 : 28)), 5);
  const cover = 20; const mainDia = 10; const d = thickness - cover - mainDia / 2;
  const dead = thickness / 1000 * RCC_DENSITY + FINISH_LOAD;
  const live = panelLiveLoad(panel, isRoof, roofAccessible);
  const wu = 1.5 * (dead + live);
  const momentShort = oneWay ? wu * lx * lx / 8 : slabMomentCoefficients(ratio).short * wu * lx * lx;
  const momentLong = oneWay ? 0 : slabMomentCoefficients(ratio).long * wu * lx * lx;
  const minAst = 0.0012 * 1000 * thickness;
  const reqShort = Math.max(minAst, steelAreaForMoment(momentShort, 1000, d, materialsUsed.fck, materialsUsed.fy));
  const reqLong = Math.max(minAst, steelAreaForMoment(oneWay ? momentShort * 0.2 : momentLong, 1000, d, materialsUsed.fck, materialsUsed.fy));
  const shortBars = chooseBars(reqShort, Math.min(3 * d, 300), 8);
  const longBars = chooseBars(reqLong, Math.min(5 * d, 450, 300), 8);
  const shearVu = wu * lx / 2; // kN per metre width at support
  const shearStress = shearVu * 1000 / (1000 * d);
  const pt = 100 * shortBars.area / (1000 * d);
  const deflection = thickness >= lx * 1000 / (oneWay ? 26 : 30);
  const result: SlabDesignResult = {
    id: `S-F${panel.floor}-${panel.id}`, floor: panel.floor, spanXm: lx, spanYm: ly, aspectRatio: ratio,
    slabType: oneWay ? 'one-way' : 'two-way', thicknessMm: thickness, effectiveDepthMm: d,
    deadLoadKNm2: dead, liveLoadKNm2: live, totalLoadKNm2: dead + live, factoredLoadKNm2: wu,
    mainBarDiaMm: shortBars.dia, mainBarSpacingMm: shortBars.spacing,
    distBarDiaMm: longBars.dia, distBarSpacingMm: longBars.spacing,
    deflectionCheck: deflection, shearCheck: shearStress <= tauC(pt, materialsUsed.fck),
  };
  if (!oneWay) {
    result.shortSpanBarDiaMm = shortBars.dia; result.shortSpanSpacingMm = shortBars.spacing;
    result.longSpanBarDiaMm = longBars.dia; result.longSpanSpacingMm = longBars.spacing;
  }
  return result;
}
function designBeam(line: BeamLine, materialsUsed: MaterialGrades, slabLoad: number): BeamDesignResult {
  const span = distance(line.a, line.b); const width = 230;
  const depth = roundUp(Math.max(300, span * 1000 / 13), 25);
  const d = depth - 25 - 8 - 16 / 2;
  const selfWeight = width / 1000 * depth / 1000 * RCC_DENSITY;
  const serviceLoad = slabLoad * line.tributaryWidth + line.wallLoad + selfWeight;
  const wu = 1.5 * serviceLoad;
  const moment = wu * span * span / 12; // continuous beam positive design moment
  const shear = wu * span / 2;
  const muLim = 0.133 * materialsUsed.fck * width * d * d / 1e6;
  const singlyMoment = Math.min(moment, muLim);
  const ast1 = steelAreaForMoment(singlyMoment, width, d, materialsUsed.fck, materialsUsed.fy);
  const minAst = 0.85 * width * d / materialsUsed.fy;
  let tensionArea = Math.max(minAst, ast1);
  let compressionArea = 0;
  let doubly = moment > muLim;
  if (doubly) {
    const additional = (moment - muLim) * 1e6 / (0.87 * materialsUsed.fy * (d - 50));
    tensionArea += additional; compressionArea = additional;
  }
  const tensionDia = tensionArea > 800 ? 20 : tensionArea > 400 ? 16 : 12;
  const tensionCount = Math.max(2, Math.ceil(tensionArea / barArea(tensionDia)));
  const tensionProvided = tensionCount * barArea(tensionDia);
  const compressionDia = compressionArea > 0 ? (compressionArea > 400 ? 16 : 12) : 0;
  const compressionCount = compressionArea > 0 ? Math.max(2, Math.ceil(compressionArea / barArea(compressionDia))) : 0;
  const compressionProvided = compressionCount * (compressionDia ? barArea(compressionDia) : 0);
  const pt = tensionProvided * 100 / (width * d);
  const tauV = shear * 1000 / (width * d);
  const tc = tauC(pt, materialsUsed.fck);
  const stirrupDia = 8; const asv = 2 * barArea(stirrupDia);
  const vus = Math.max(0, shear * 1000 - tc * width * d);
  const calculatedSpacing = vus > 0 ? 0.87 * materialsUsed.fy * asv * d / vus : 300;
  const near = Math.max(75, Math.min(300, roundDown(Math.min(calculatedSpacing, 0.75 * d), 25)));
  const mid = Math.max(100, Math.min(300, roundDown(Math.min(300, 0.75 * d), 25)));
  return {
    id: line.id, floor: line.floor, spanM: span, widthMm: width, depthMm: depth, effectiveDepthMm: d,
    loadKNm: serviceLoad, maxMomentKNm: moment, maxShearKN: shear,
    tensionBars: fmtBars(tensionCount, tensionDia), tensionAreaMm2: tensionProvided,
    compressionBars: compressionCount ? fmtBars(compressionCount, compressionDia) : 'Nil', compressionAreaMm2: compressionProvided,
    stirrupDiaMm: stirrupDia, stirrupSpacingNearSupportMm: near, stirrupSpacingMidSpanMm: mid,
    deflectionCheck: depth >= span * 1000 / 15, ptProvided: pt, isDoublyReinforced: doubly,
  };
}
function nearestColumn(point: Point, columns: Point[]): Point {
  let nearest = columns[0]; let best = distance(point, nearest);
  for (const column of columns.slice(1)) { const d = distance(point, column); if (d < best) { nearest = column; best = d; } }
  return nearest;
}
function tributaryAreas(columns: Point[], panels: Panel[]): Map<string, number> {
  const areas = new Map<string, number>(); for (const c of columns) areas.set(keyOf(c), 0);
  for (const panel of panels) {
    if (isVoidPanel(panel)) continue;
    const corners: Point[] = [{ x: panel.x, y: panel.y }, { x: panel.x + panel.width, y: panel.y }, { x: panel.x, y: panel.y + panel.depth }, { x: panel.x + panel.width, y: panel.y + panel.depth }];
    for (const corner of corners) { const c = nearestColumn(corner, columns); areas.set(keyOf(c), (areas.get(keyOf(c)) ?? 0) + panel.width * panel.depth / 4); }
  }
  return areas;
}
function columnSizeFromProvided(layout: Layout, floor: number, point: Point): { width: number; depth: number } {
  const c = (floorFor(layout.floors, floor)?.columns ?? []).find((item) => Math.abs(item.x - point.x) < 0.01 && Math.abs(item.y - point.y) < 0.01);
  return { width: Math.max(200, c?.widthMM ?? 300), depth: Math.max(200, c?.depthMM ?? 300) };
}
function designColumns(
  layout: Layout, allColumns: Point[], panelsByFloor: Map<number, Panel[]>, numFloors: number, floorHeight: number,
  serviceAreaLoad: number, materialsUsed: MaterialGrades, lateralBaseShear: number,
): ColumnDesignResult[] {
  const results: ColumnDesignResult[] = [];
  const runningLoads = new Map<string, number>(); for (const c of allColumns) runningLoads.set(keyOf(c), 0);
  for (let floor = numFloors - 1; floor >= 0; floor--) {
    const areas = tributaryAreas(allColumns, panelsByFloor.get(floor) ?? []);
    for (const point of allColumns) {
      const key = keyOf(point); const dimensions = columnSizeFromProvided(layout, floor, point);
      const selfWeight = dimensions.width / 1000 * dimensions.depth / 1000 * floorHeight * RCC_DENSITY;
      const above = runningLoads.get(key) ?? 0;
      const axialService = above + (areas.get(key) ?? 0) * serviceAreaLoad + selfWeight;
      runningLoads.set(key, axialService);
      const pu = 1.5 * axialService;
      const gross = dimensions.width * dimensions.depth;
      // Puz = 0.4 fck Ac + 0.67 fy Asc; solve directly, bounded 1--4 percent for economy.
      const rawSteel = Math.max(0.01 * gross, (pu * 1000 - 0.4 * materialsUsed.fck * gross) / (0.67 * materialsUsed.fy - 0.4 * materialsUsed.fck));
      const targetSteel = clamp(rawSteel, 0.01 * gross, 0.04 * gross);
      const dia = targetSteel > 1800 ? 25 : targetSteel > 1000 ? 20 : targetSteel > 550 ? 16 : 12;
      const count = Math.max(4, Math.ceil(targetSteel / barArea(dia))); // rectangular columns need four corner bars
      const provided = count * barArea(dia);
      const leastDimension = Math.min(dimensions.width, dimensions.depth);
      const effectiveLength = 0.65 * floorHeight * 1000;
      const slenderness = effectiveLength / leastDimension;
      const isShort = slenderness <= 12;
      const minEccentricity = Math.max(floorHeight * 1000 / 500 + leastDimension / 30, 20);
      const moment = pu * minEccentricity / 1000 + lateralBaseShear * floorHeight / Math.max(1, allColumns.length * numFloors) * 0.05;
      const tieDia = Math.max(6, Math.ceil(dia / 4 / 2) * 2);
      const tieSpacing = Math.floor(Math.min(300, 16 * dia, leastDimension) / 25) * 25;
      results.push({
        id: `C-F${floor}-${key}`, floor, x: point.x, y: point.y, widthMm: dimensions.width, depthMm: dimensions.depth,
        axialLoadKN: axialService, momentKNm: moment, mainBars: fmtBars(count, dia), mainBarAreaMm2: provided,
        steelPercentage: 100 * provided / gross, tieDiaMm: tieDia, tieSpacingMm: Math.max(75, tieSpacing), isShort,
        effectiveLength, slendernessRatio: slenderness,
      });
    }
  }
  return results;
}
function designFooting(column: ColumnDesignResult, sbc: number, materialsUsed: MaterialGrades): FoundationDesignResult {
  const serviceLoad = column.axialLoadKN;
  const provision = 1.10; // initial footing/soil cover allowance used for service bearing sizing
  const area = serviceLoad * provision / sbc;
  const side = roundUp(Math.max(0.9, Math.sqrt(area)), 0.05);
  const columnSide = Math.max(column.widthMm, column.depthMm) / 1000;
  let depth = 450;
  let oneWayOK = false; let twoWayOK = false;
  // Iterate depth until factored one-way and punching shear sections are satisfactory.
  for (; depth <= 1200; depth += 25) {
    const d = depth - 50 - 8;
    const qu = 1.5 * serviceLoad * provision / (side * side); // kN/m2
    const cantilever = Math.max(0, (side - columnSide) / 2);
    const oneWayVu = qu * Math.max(0, cantilever - d / 1000); // per m width
    const oneStress = oneWayVu * 1000 / (1000 * d);
    const perimeter = 4 * (columnSide + d / 1000);
    const punchingArea = Math.max(0, side * side - (columnSide + d / 1000) ** 2);
    const punchVu = qu * punchingArea;
    const punchStress = punchVu * 1000 / (perimeter * 1000 * d);
    oneWayOK = oneStress <= tauC(0.5, materialsUsed.fck);
    twoWayOK = punchStress <= 0.25 * Math.sqrt(materialsUsed.fck);
    if (oneWayOK && twoWayOK) break;
  }
  depth = Math.min(depth, 1200); const d = depth - 58;
  const qService = serviceLoad * provision / (side * side);
  const qu = 1.5 * serviceLoad * provision / (side * side);
  const cantilever = Math.max(0, (side - columnSide) / 2);
  const moment = qu * cantilever * cantilever / 2; // kNm per metre width at column face
  const minAst = 0.0012 * 1000 * depth;
  const required = Math.max(minAst, steelAreaForMoment(moment, 1000, d, materialsUsed.fck, materialsUsed.fy));
  const bars = chooseBars(required, Math.min(3 * d, 300), 10);
  const clearWidth = side * 1000 - 2 * 50;
  // Round down, rather than up, so reporting a 25 mm increment never reduces provided steel.
  const providedSpacing = Math.max(75, roundDown(Math.min(bars.spacing, clearWidth / 3), 25));
  const barsEachWay = Math.max(4, Math.ceil(clearWidth / providedSpacing) + 1);
  const ldRequired = 0.87 * materialsUsed.fy * bars.dia / (4 * 1.6 * Math.sqrt(materialsUsed.fck));
  const availableLd = cantilever * 1000 - 50;
  return {
    id: `F-${column.id}`, columnId: column.id, columnLoadKN: serviceLoad, footingSizeMm: side * 1000,
    footingDepthMm: depth, effectiveDepthMm: d, soilPressureKNm2: qService, sbc,
    barDiaMm: bars.dia, barSpacingMm: providedSpacing, barsEachWay,
    pccSizeMm: side * 1000 + 300, pccThicknessMm: 150,
    bearingPressureOK: qService <= sbc, oneWayShearOK: oneWayOK, twoWayShearOK: twoWayOK,
    developmentLengthOK: availableLd >= ldRequired,
  };
}
function designStaircase(floorHeight: number, materialsUsed: MaterialGrades): StaircaseDesignResult {
  const risers = Math.max(2, Math.round(floorHeight * 1000 / 165));
  const riser = floorHeight * 1000 / risers; const tread = 270;
  const treads = risers - 1; const horizontalRun = treads * tread / 1000;
  // Two-flight dog-legged stair; each flight rises approximately half a storey.
  const flightRun = Math.max(1.2, horizontalRun / 2);
  const rise = floorHeight / 2; const span = Math.hypot(flightRun, rise);
  const waist = roundUp(Math.max(150, span * 1000 / 20), 5);
  const theta = Math.atan2(rise, flightRun);
  const waistWeight = waist / 1000 * RCC_DENSITY / Math.cos(theta);
  const stepWeight = 0.5 * (riser / 1000) * (tread / 1000) * RCC_DENSITY / (tread / 1000);
  const dead = waistWeight + stepWeight + FINISH_LOAD;
  const live = 3.0; const wu = 1.5 * (dead + live);
  const moment = wu * span * span / 8; const d = waist - 20 - 10 / 2;
  const ast = Math.max(0.0012 * 1000 * waist, steelAreaForMoment(moment, 1000, d, materialsUsed.fck, materialsUsed.fy));
  const main = chooseBars(ast, Math.min(3 * d, 300), 8);
  const distribution = chooseBars(0.0012 * 1000 * waist, Math.min(5 * d, 300), 8);
  return {
    numRisers: risers, riserMm: riser, treadMm: tread, flightWidthMm: 1000, waistSlabThicknessMm: waist,
    effectiveSpanM: span, deadLoadKNm2: dead, liveLoadKNm2: live, factoredLoadKNm2: wu, maxMomentKNm: moment,
    mainBarDiaMm: main.dia, mainBarSpacingMm: main.spacing, distBarDiaMm: distribution.dia,
    distBarSpacingMm: distribution.spacing, landingThicknessMm: Math.max(125, waist),
  };
}
function barWeightKgPerM(dia: number): number { return dia * dia / 162; }
function parseBarSpec(spec: string): { count: number; dia: number } | undefined {
  const match = /^(\d+)-(\d+)mm$/.exec(spec); return match ? { count: Number(match[1]), dia: Number(match[2]) } : undefined;
}
function positiveSum(values: number[]): number { return values.reduce((sum, value) => sum + Math.max(0, value), 0); }

/**
 * Produces preliminary member sizes and reinforcement. It is intentionally conservative,
 * but it is not a substitute for a site-specific analysis model or a licensed engineer.
 */
export function designStructure(input: StructuralDesignInput): StructuralDesignResult {
  if (!input || !input.layout || !input.cityData) throw new Error('layout and cityData are required.');
  const warnings: string[] = [];
  const layout = input.layout; const city = input.cityData;
  const floorsCount = Math.max(1, Math.floor(finitePositive(input.numFloors, layout.numFloors ?? (layout.floors.length || 1))));
  const floorHeight = finitePositive(input.floorHeightM, 3.0);
  const roofAccessible = input.roofAccessible ?? true;
  const importance = finitePositive(input.importanceFactor, 1.0);
  const response = finitePositive(input.responseFactor, 3.0);
  const sbc = finitePositive(input.soilSBC, city.defaultSBC_kNm2);
  const grade = materials(input); const geometry = buildingGeometry(layout);
  if (sbc < 100) warnings.push('Soil bearing capacity is below 100 kN/m². Obtain a site-specific geotechnical design before relying on isolated footings.');
  if (layout.floors.length === 0) warnings.push('No floor-room geometry was supplied; a rectangular floor plate and rational 5 m column grid were assumed.');
  if (city.coastalProximity) warnings.push('Coastal exposure indicated: check durability cover, chloride exposure class and wind coefficients for the exact site.');
  if (floorsCount > 3) warnings.push('Building exceeds typical low-rise scope; perform a full three-dimensional seismic analysis and drift check.');

  const panelsByFloor = new Map<number, Panel[]>();
  for (let floor = 0; floor < floorsCount; floor++) panelsByFloor.set(floor, makePanels(layout, floor, geometry));
  const basePanels = panelsByFloor.get(0) ?? [];
  const baseColumns = generateColumns(layout, 0, geometry, basePanels);
  if ((floorFor(layout.floors, 0)?.columns.length ?? 0) < 4) warnings.push('Column grid was generated from building envelope at maximum 5 m spacing; verify all actual wall/support intersections.');

  const slabs: SlabDesignResult[] = [];
  for (let floor = 0; floor < floorsCount; floor++) {
    const isRoof = floor === floorsCount - 1;
    for (const panel of panelsByFloor.get(floor) ?? []) if (!isVoidPanel(panel)) slabs.push(designSlab(panel, grade, isRoof, roofAccessible));
  }
  const averageSlabServiceLoad = slabs.length ? positiveSum(slabs.map((s) => s.totalLoadKNm2)) / slabs.length : 6;
  const beamLines: BeamLine[] = [];
  const beams: BeamDesignResult[] = [];
  for (let floor = 0; floor < floorsCount; floor++) {
    const lines = makeBeamGrid(baseColumns, floor, panelsByFloor.get(floor) ?? [], geometry, floorHeight, floor === floorsCount - 1);
    beamLines.push(...lines);
    for (const line of lines) beams.push(designBeam(line, grade, averageSlabServiceLoad));
  }
  const staircase = designStaircase(floorHeight, grade);
  const floorAreas = [...panelsByFloor.entries()].map(([, panels]) => positiveSum(panels.filter((p) => !isVoidPanel(p)).map((p) => p.width * p.depth)));
  const averageFloorArea = positiveSum(floorAreas) / floorAreas.length;
  // Beam reactions include slab load, so they must not be added to slab weight again.
  // For building/seismic weight and tributary column load only beam self weight and wall load are added here.
  const beamIntrinsicByFloor = Array.from({ length: floorsCount }, (_, floor) => positiveSum(beamLines.filter((line) => line.floor === floor).map((line) => {
    const beam = beams.find((item) => item.id === line.id);
    const selfWeight = beam ? beam.widthMm / 1000 * beam.depthMm / 1000 * RCC_DENSITY * beam.spanM : 0;
    return selfWeight + line.wallLoad * distance(line.a, line.b);
  })));
  const preliminaryColumnWeight = baseColumns.length * 0.3 * 0.3 * floorHeight * RCC_DENSITY;
  const stairDeadPerLevel = staircase.deadLoadKNm2 * staircase.effectiveSpanM * (staircase.flightWidthMm / 1000) * 2;
  const floorDeadWeights = Array.from({ length: floorsCount }, (_, floor) => {
    const slabFloor = slabs.filter((s) => s.floor === floor);
    return positiveSum(slabFloor.map((s) => s.deadLoadKNm2 * s.spanXm * s.spanYm)) + beamIntrinsicByFloor[floor] + preliminaryColumnWeight + (floor < floorsCount - 1 ? stairDeadPerLevel : 0);
  });
  const floorLiveWeights = Array.from({ length: floorsCount }, (_, floor) => positiveSum(slabs.filter((s) => s.floor === floor).map((s) => s.liveLoadKNm2 * s.spanXm * s.spanYm)) + (floor < floorsCount - 1 ? 3 * staircase.effectiveSpanM * (staircase.flightWidthMm / 1000) * 2 : 0));
  const deadLoadPerFloor = positiveSum(floorDeadWeights) / floorsCount;
  const liveLoadPerFloor = positiveSum(floorLiveWeights) / floorsCount;
  const seismicWeightByFloor = floorDeadWeights.map((dead, floor) => {
    // IS 1893 seismic weight includes appropriate imposed-load portion; 25% used for residential LL.
    return dead + 0.25 * floorLiveWeights[floor];
  });
  const totalWeight = positiveSum(seismicWeightByFloor);
  const height = floorsCount * floorHeight;
  const period = 0.075 * Math.pow(height, 0.75);
  const sag = spectralAcceleration(city.soilType, period);
  const ah = (city.zoneFactor / 2) * (importance / response) * sag;
  const baseShear = ah * totalWeight;
  const denominator = seismicWeightByFloor.reduce((sum, w, floor) => sum + w * Math.pow((floor + 1) * floorHeight, 2), 0);
  const floorWiseSeismicForce = seismicWeightByFloor.map((weight, floor) => ({
    floor, force: denominator > 0 ? baseShear * weight * Math.pow((floor + 1) * floorHeight, 2) / denominator : 0,
  }));
  const windSpeed = city.basicWindSpeedMps * 1.0 * k2(city.terrainCategory, height) * 1.0;
  const windPressure = 0.6 * windSpeed * windSpeed / 1000; // kN/m2
  const aspect = Math.max(geometry.width, geometry.depth) / Math.min(geometry.width, geometry.depth);
  const cf = aspect > 3 ? 1.3 : aspect > 2 ? 1.2 : 1.1;
  const windForce = windPressure * Math.max(geometry.width, geometry.depth) * height * cf;
  const governingLateral: 'seismic' | 'wind' = baseShear >= windForce ? 'seismic' : 'wind';
  if (governingLateral === 'wind') warnings.push('Wind exceeds equivalent seismic base shear in this preliminary comparison; detailed IS 875 Part 3 pressure zoning and connection design is required.');
  if (city.seismicZone === 'IV' || city.seismicZone === 'V') warnings.push('High seismic zone: OMRF R=3 has been used. Confirm IS 13920 ductile detailing requirements and perform a structural analysis.');

  const intrinsicBeamAreaLoad = positiveSum(beamIntrinsicByFloor) / Math.max(1, floorsCount * averageFloorArea);
  const columns = designColumns(layout, baseColumns, panelsByFloor, floorsCount, floorHeight, averageSlabServiceLoad + intrinsicBeamAreaLoad, grade, Math.max(baseShear, windForce));
  const groundColumns = columns.filter((column) => column.floor === 0);
  const foundations = groundColumns.map((column) => designFooting(column, sbc, grade));
  if (columns.some((c) => !c.isShort)) warnings.push('One or more columns are slender (effective-length ratio > 12); slender-column moment magnification must be designed explicitly.');
  if (foundations.some((f) => !f.oneWayShearOK || !f.twoWayShearOK || !f.developmentLengthOK)) warnings.push('One or more footing checks did not converge within 1200 mm depth; a licensed engineer must resize/design these footings.');
  if (slabs.some((s) => !s.shearCheck || !s.deflectionCheck)) warnings.push('One or more slab preliminary checks are not satisfactory; revise depth, support condition or reinforcement after analysis.');

  const slabConcrete = positiveSum(slabs.map((s) => s.spanXm * s.spanYm * s.thicknessMm / 1000));
  const beamConcrete = positiveSum(beams.map((b) => b.spanM * b.widthMm / 1000 * b.depthMm / 1000));
  const columnConcrete = positiveSum(columns.map((c) => c.widthMm / 1000 * c.depthMm / 1000 * floorHeight));
  const foundationConcrete = positiveSum(foundations.map((f) => (f.footingSizeMm / 1000) ** 2 * f.footingDepthMm / 1000));
  const staircaseConcrete = staircase.effectiveSpanM * (staircase.flightWidthMm / 1000) * (staircase.waistSlabThicknessMm / 1000) * 2 * Math.max(1, floorsCount - 1);
  const lintels = 0.23 * 0.15 * (geometry.width + geometry.depth) * 2 * floorsCount;
  const slabSteel = positiveSum(slabs.map((s) => {
    const area = s.spanXm * s.spanYm;
    // For each direction, total bar length is panel area divided by bar spacing.
    const mainLength = area / (s.mainBarSpacingMm / 1000);
    const distLength = area / (s.distBarSpacingMm / 1000);
    return mainLength * barWeightKgPerM(s.mainBarDiaMm) + distLength * barWeightKgPerM(s.distBarDiaMm);
  }));
  const beamSteel = positiveSum(beams.map((b) => {
    const t = parseBarSpec(b.tensionBars); const c = parseBarSpec(b.compressionBars);
    const longitudinal = (t ? t.count * b.spanM * barWeightKgPerM(t.dia) : 0) + (c ? c.count * b.spanM * barWeightKgPerM(c.dia) : 0);
    const stirrups = (b.spanM / ((b.stirrupSpacingMidSpanMm || 200) / 1000) + 2) * 2 * (b.widthMm + b.depthMm) / 1000 * barWeightKgPerM(b.stirrupDiaMm);
    return longitudinal + stirrups;
  }));
  const columnSteel = positiveSum(columns.map((c) => {
    const spec = parseBarSpec(c.mainBars); const vertical = spec ? spec.count * floorHeight * barWeightKgPerM(spec.dia) : 0;
    const ties = floorHeight / (c.tieSpacingMm / 1000) * 2 * (c.widthMm + c.depthMm) / 1000 * barWeightKgPerM(c.tieDiaMm);
    return vertical + ties;
  }));
  const foundationSteel = positiveSum(foundations.map((f) => 2 * f.barsEachWay * (f.footingSizeMm / 1000 - 0.1) * barWeightKgPerM(f.barDiaMm)));
  const staircaseSteel = 2 * Math.max(1, floorsCount - 1) * staircase.flightWidthMm / staircase.mainBarSpacingMm * staircase.effectiveSpanM * barWeightKgPerM(staircase.mainBarDiaMm) +
    2 * Math.max(1, floorsCount - 1) * staircase.effectiveSpanM * 1000 / staircase.distBarSpacingMm * (staircase.flightWidthMm / 1000) * barWeightKgPerM(staircase.distBarDiaMm);
  const totalConcrete = foundationConcrete + columnConcrete + beamConcrete + slabConcrete + staircaseConcrete + lintels;
  const totalSteel = foundationSteel + columnSteel + beamSteel + slabSteel + staircaseSteel;

  return {
    parameters: { city: city.city, seismicZone: city.seismicZone, zoneFactor: city.zoneFactor, windSpeed, soilType: city.soilType, sbc,
      concreteGrade: grade.concreteGrade, steelGrade: grade.steelGrade, numFloors: floorsCount, floorHeight, buildingHeight: height,
      buildingWidthM: geometry.width, buildingDepthM: geometry.depth },
    loads: { deadLoadPerFloor, liveLoadPerFloor, totalBuildingWeight: totalWeight, seismicBaseShear: baseShear, seismicCoeffAh: ah,
      windForce, governingLateral, floorWiseSeismicForce },
    slabs, beams, columns, foundations, staircase,
    summary: { totalConcreteM3: totalConcrete, totalSteelKg: totalSteel, totalSteelMT: totalSteel / 1000,
      concreteBreakdown: { foundation: foundationConcrete, columns: columnConcrete, beams: beamConcrete, slabs: slabConcrete, staircase: staircaseConcrete, lintels },
      steelBreakdown: { foundation: foundationSteel, columns: columnSteel, beams: beamSteel, slabs: slabSteel, staircase: staircaseSteel } },
    cityData: city,
    warnings, disclaimer: STRUCTURAL_DISCLAIMER,
  };
}
