import type { BOQ, BOQLineItem, DoorScheduleItem, WindowScheduleItem, Layout, MaterialRate, CustomRateSheet, BudgetRange } from '../types';
import { computeTakeoff, type Takeoff } from './quantityTakeoff';
import { cityRateFactor, specFactor } from './marketRates';
import { electricalPoints as electricalPointsFor, plumbingPoints as plumbingPointsFor, isNiche } from './quantityRules';

/** Pricing context: city and specification level. Custom rates entered by the customer always win. */
export interface BOQContext { city?: string; budget?: BudgetRange; bathTileHeightM?: number }

const SQM_TO_SQFT = 10.764;

type QuantityBasis = 'estimated' | 'engineered';

type ConcreteBreakdown = BOQ['concreteBreakdown'];

/** Minimal structural-engine contract consumed by the BOQ module. */
export interface StructuralResultLike {
  parameters?: {
    concreteGrade?: string;
    steelGrade?: string;
  };
  summary: {
    totalConcreteM3: number;
    totalSteelKg?: number;
    bbsReconciledSteelKg?: number;
    concreteBreakdown: ConcreteBreakdown;
  };
  columns: Array<{ widthMm: number; depthMm: number }>;
  beams: Array<{ widthMm: number; depthMm: number }>;
  slabs: Array<{ thicknessMm: number }>;
}

/** Minimal BBS contract. A generated BBS takes precedence for steel quantity. */
export interface BBSResultLike {
  totalSteelKg: number;
  totalSteelMT?: number;
}

/**
 * Extended BOQ result.  The existing BOQ fields are retained unchanged; the added
 * metadata lets the UI distinguish preliminary allowances from engine/BBS quantities.
 */
export interface BOQResult extends BOQ {
  quantityBasis: QuantityBasis;
  takeoff?: Takeoff;
  pricing?: { cityLabel: string; cityFactor: number; specLabel: string; specFactor: number; contingencyPct: number; buildingCost: number; siteAndServicesCost: number; buildingCostPerSqFt: number };
  structuralDetails: {
    source: QuantityBasis;
    actualColumnCount?: number;
    beamSizesMm?: Array<{ widthMm: number; depthMm: number; count: number }>;
    slabThicknessesMm?: number[];
    concreteGrade: 'M25';
    steelGrade: 'Fe500D';
    steelSource: 'area-estimate' | 'structural-summary' | 'bbs';
  };
}

type RateSource = MaterialRate[] | CustomRateSheet | null | undefined;

/**
 * Resolve a rate from the new material-rate array or the legacy custom-rate sheet.
 * Both forms intentionally retain the historic bidirectional substring matching.
 */
function resolveRate(defaultRate: number, itemKey: string, rateSource?: RateSource): number {
  if (!rateSource) return defaultRate;
  const materials = Array.isArray(rateSource) ? rateSource : rateSource.materials;
  const key = itemKey.toLowerCase();

  for (const material of materials) {
    if (material.customRate !== undefined && material.customRate !== null) {
      const name = material.name.toLowerCase();
      if (key.includes(name) || name.includes(key)) return material.customRate;
    }
  }

  // MaterialRate[] is deliberately material-only. Legacy sheets retain labour overrides.
  if (!Array.isArray(rateSource)) {
    for (const labour of rateSource.labour) {
      if (labour.customRate !== undefined && labour.customRate !== null) {
        const trade = labour.trade.toLowerCase();
        if (key.includes(trade) || trade.includes(key)) return labour.customRate;
      }
    }
  }
  return defaultRate;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function uniqueMemberSizes(members: Array<{ widthMm: number; depthMm: number }>): Array<{ widthMm: number; depthMm: number; count: number }> {
  const sizes = new Map<string, { widthMm: number; depthMm: number; count: number }>();
  for (const member of members) {
    if (!Number.isFinite(member.widthMm) || !Number.isFinite(member.depthMm)) continue;
    const key = `${member.widthMm}×${member.depthMm}`;
    const item = sizes.get(key);
    if (item) item.count += 1;
    else sizes.set(key, { widthMm: member.widthMm, depthMm: member.depthMm, count: 1 });
  }
  return [...sizes.values()];
}

/**
 * Full Bill of Quantities with 50+ itemized line items, door/window schedules,
 * and concrete breakdown. Rates are 2024-25 Indian market averages unless overridden.
 *
 * New signature: calculateBOQ(layout, materialRates, numFloors, structuralResult?, bbsResult?).
 * The legacy calculateBOQ(layout, numFloors, customRates?) signature remains supported.
 */
export function calculateBOQ(
  layout: Layout,
  materialRates: MaterialRate[],
  numFloors: number,
  structuralResult?: StructuralResultLike,
  bbsResult?: BBSResultLike,
  ctx?: BOQContext,
): BOQResult;
export function calculateBOQ(layout: Layout, numFloors: number, customRates?: CustomRateSheet | null): BOQResult;
export function calculateBOQ(
  layout: Layout,
  materialRatesOrNumFloors: MaterialRate[] | number,
  numFloorsOrCustomRates?: number | CustomRateSheet | null,
  structuralResult?: StructuralResultLike,
  bbsResult?: BBSResultLike,
  ctx?: BOQContext,
): BOQResult {
  const usingNewSignature = Array.isArray(materialRatesOrNumFloors);
  const materialRates = usingNewSignature ? materialRatesOrNumFloors : undefined;
  const requestedFloors = usingNewSignature
    ? (typeof numFloorsOrCustomRates === 'number' ? numFloorsOrCustomRates : 1)
    : materialRatesOrNumFloors;
  // The locked layout defines the storey count; the argument is only a fallback for legacy layouts.
  const numFloors = Math.max(1, layout.numFloors ?? layout.floors?.length ?? requestedFloors);
  const customRates = usingNewSignature
    ? undefined
    : (typeof numFloorsOrCustomRates === 'object' ? numFloorsOrCustomRates : undefined);
  const rateSource: RateSource = materialRates ?? customRates;

  // FIX: layout.builtUpAreaSqM is already total across all floors
  const totalBuiltUpSqM = layout.builtUpAreaSqM;
  const builtUpPerFloor = totalBuiltUpSqM / numFloors;
  const totalBuiltUpSqFt = totalBuiltUpSqM * SQM_TO_SQFT;
  const perimeter = 2 * (layout.buildableWidthM + layout.buildableDepthM);
  const wallHeight = 3.0;
  // Pooja niches sit inside another room — they are not rooms for quantities.
  const allRooms = layout.floors.flatMap(f => f.rooms).filter(r => !isNiche(r));

  // ────── CONCRETE & STEEL ──────
  // Preserve the original allowances exactly when no structural result is supplied.
  const estimatedFoundationConcrete = +(builtUpPerFloor * SQM_TO_SQFT * 0.04).toFixed(2);
  const estimatedColumnsPerFloor = Math.ceil(builtUpPerFloor / 12);
  const estimatedColumnConcrete = +(estimatedColumnsPerFloor * numFloors * 0.23 * 0.30 * 3.0).toFixed(2);
  const estimatedBeamRun = perimeter * 1.5;
  const estimatedBeamConcrete = +(estimatedBeamRun * 0.23 * 0.40 * numFloors).toFixed(2);
  const estimatedSlabConcrete = +(builtUpPerFloor * 0.15 * numFloors).toFixed(2);
  const stairFloors = numFloors - 1 > 0 ? numFloors - 1 : 0.5;
  const estimatedStairConcrete = +(0.15 * 16 * stairFloors).toFixed(2);
  const estimatedLintelConcrete = +(estimatedSlabConcrete * 0.05).toFixed(2);
  const estimatedTotalConcrete = +(estimatedFoundationConcrete + estimatedColumnConcrete + estimatedBeamConcrete + estimatedSlabConcrete + estimatedStairConcrete + estimatedLintelConcrete).toFixed(2);
  const quantityBasis: QuantityBasis = structuralResult ? 'engineered' : 'estimated';
  const engineeredBreakdown = structuralResult?.summary.concreteBreakdown;

  // When a structural result is supplied, concrete quantities come ONLY from the
  // structural engine's own breakdown/total — no area-based formula may override them.
  // finiteNonNegative(..., 0) is a defensive guard against a malformed upstream value,
  // not a silent revert to the estimated formula.
  const foundationConcrete = +(structuralResult ? finiteNonNegative(engineeredBreakdown?.foundation, 0) : estimatedFoundationConcrete).toFixed(2);
  const columnConcrete = +(structuralResult ? finiteNonNegative(engineeredBreakdown?.columns, 0) : estimatedColumnConcrete).toFixed(2);
  const beamConcrete = +(structuralResult ? finiteNonNegative(engineeredBreakdown?.beams, 0) : estimatedBeamConcrete).toFixed(2);
  const slabConcrete = +(structuralResult ? finiteNonNegative(engineeredBreakdown?.slabs, 0) : estimatedSlabConcrete).toFixed(2);
  const stairConcrete = +(structuralResult ? finiteNonNegative(engineeredBreakdown?.staircase, 0) : estimatedStairConcrete).toFixed(2);
  const lintelConcrete = +(structuralResult ? finiteNonNegative(engineeredBreakdown?.lintels, 0) : estimatedLintelConcrete).toFixed(2);
  let totalConcrete = structuralResult
    ? finiteNonNegative(structuralResult.summary.totalConcreteM3, foundationConcrete + columnConcrete + beamConcrete + slabConcrete + stairConcrete + lintelConcrete)
    : estimatedTotalConcrete;
  totalConcrete = +totalConcrete.toFixed(1);

  // Steel: the Bar Bending Schedule grand total (net bars + 5% cutting waste) is the one procurement
  // figure. runStructuralDesign() reconciles the engine headline to it; when a BBS is supplied we use it
  // directly, otherwise the engine total, otherwise an area allowance.
  const engineSteel = structuralResult ? finiteNonNegative(structuralResult.summary.totalSteelKg, 0) : 0;
  const bbsSteel = bbsResult && Number.isFinite(bbsResult.totalSteelKg) && bbsResult.totalSteelKg > 0
    ? bbsResult.totalSteelKg : 0;
  const steelKg = bbsSteel || engineSteel || totalBuiltUpSqFt * 4.5;
  const steelSourceNote = bbsSteel
    ? 'Bar Bending Schedule grand total (net bars + 5% cutting waste); IS 1786'
    : engineSteel ? 'Structural-engine total; IS 1786' : 'Allowance @ 4.5 kg/sqft — structure not yet designed';
  const steelMT = +(steelKg / 1000).toFixed(2);
  const actualColumnCount = structuralResult?.columns.length;
  const beamSizes = structuralResult ? uniqueMemberSizes(structuralResult.beams) : undefined;
  const slabThicknesses = structuralResult
    ? [...new Set(structuralResult.slabs.map((slab) => slab.thicknessMm).filter((thickness) => Number.isFinite(thickness)))].sort((a, b) => a - b)
    : undefined;
  const primarySlabThickness = slabThicknesses?.[0] ?? 150;

  // ────── QUANTITY TAKE-OFF FROM LOCKED GEOMETRY ──────
  const beamDepths = (structuralResult?.beams ?? []).map((b) => b.depthMm).filter((d) => Number.isFinite(d) && d > 0);
  const beamDepthM = beamDepths.length ? Math.max(...beamDepths) / 1000 : 0.45;
  const colSizeM = structuralResult?.columns?.[0] ? Math.max(structuralResult.columns[0].widthMm, structuralResult.columns[0].depthMm) / 1000 : 0.3;
  const takeoff = computeTakeoff(layout, { floorHeightM: wallHeight, beamDepthM, columnCount: actualColumnCount ?? 0, columnSizeM: colSizeM, bathTileHeightM: ctx?.bathTileHeightM });
  const city = cityRateFactor(ctx?.city);
  const spec = specFactor(ctx?.budget);

  // ────── MASONRY (net of openings and columns) ──────
  const extMasonryM3 = +(takeoff.externalMasonrySqM * 0.23).toFixed(2);
  const intMasonryM3 = +(takeoff.internalMasonrySqM * 0.115).toFixed(2);
  const parapetM3 = +(takeoff.parapetLenM * 1.0 * 0.115).toFixed(2);
  const masonryM3 = extMasonryM3 + intMasonryM3 + parapetM3;
  const brickCount = Math.ceil(masonryM3 * 500);
  const externalWallArea = takeoff.externalPlasterSqM;

  // ────── CEMENT / SAND / AGGREGATE ──────
  const plasteringArea = Math.round(takeoff.internalPlasterSqM + takeoff.externalPlasterSqM + takeoff.ceilingSqM);
  const cementForConcrete = totalConcrete * 8;          // M25 ≈ 8 bags/m³
  const cementForBrickwork = masonryM3 * 1.3;           // CM 1:6
  const cementForPlastering = takeoff.internalPlasterSqM * 0.105 + takeoff.ceilingSqM * 0.09 + takeoff.externalPlasterSqM * 0.18;
  const totalCement = Math.ceil(cementForConcrete + cementForBrickwork + cementForPlastering);
  const sandCuM = +(totalConcrete * 0.42 + masonryM3 * 0.28 + plasteringArea * 0.018).toFixed(1);
  const aggregateCuM = +(totalConcrete * 0.84).toFixed(1);

  // ────── FINISHING ──────
  const paintArea = Math.round(takeoff.internalPlasterSqM + takeoff.ceilingSqM);
  const flooringArea = Math.round(takeoff.floorFinish.vitrifiedSqM);

  // ────── WET AREAS ──────
  const toilets = allRooms.filter(r => r.type === 'toilet');
  const kitchens = allRooms.filter(r => r.type === 'kitchen');
  const utilities = allRooms.filter(r => r.type === 'utility');
  const toiletArea = takeoff.wetAreaSqM.baths;
  const kitchenArea = takeoff.wetAreaSqM.kitchens;
  const terrace = layout.buildableWidthM * layout.buildableDepthM;
  const waterproofingArea = +(toiletArea + kitchenArea + takeoff.wetAreaSqM.utility + terrace).toFixed(1);

  // ────── MEP (shared rules — same functions the verification engine uses) ──────
  const plumbingPoints = plumbingPointsFor(allRooms);
  const electricalPoints = electricalPointsFor(allRooms);

  const halls = allRooms.filter(r => r.type === 'hall');
  const dinings = allRooms.filter(r => r.type === 'dining');
  const bedrooms = allRooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom');
  const balconies = allRooms.filter(r => r.type === 'balcony');
  const pujas = allRooms.filter(r => r.type === 'puja');

  // ────── DOOR & WINDOW SCHEDULES ──────
  // The locked layout's openings schedule is the single source; the room-type list is only a
  // fallback for legacy layouts without one.
  const doorSchedule: DoorScheduleItem[] = [];
  const windowSchedule: WindowScheduleItem[] = [];
  const schedOps = layout.openingsSchedule?.openings ?? [];
  if (schedOps.length) {
    const roomType = new Map(allRooms.map((r) => [r.id, r.type]));
    const doorKind = (o: (typeof schedOps)[number]): Pick<DoorScheduleItem, 'type' | 'material'> => {
      const t = o.roomId ? roomType.get(o.roomId) : undefined;
      if (o.main) return { type: 'Teak Panel (main)', material: 'Teak Wood' };
      if (t === 'toilet') return { type: 'WPC/FRP', material: 'FRP' };
      if (t === 'balcony' || o.widthMm >= 1500) return { type: 'Sliding UPVC', material: 'UPVC + Glass' };
      if (t === 'puja') return { type: 'Glass Panel', material: 'Teak + Glass' };
      return { type: 'Flush', material: 'BWR Plywood' };
    };
    for (const o of schedOps) {
      const loc = o.floor === undefined ? o.room : `${o.room} (${o.floor === 0 ? 'GF' : 'FF'})`;
      if (o.type === 'door') doorSchedule.push({ mark: o.id, location: loc, ...doorKind(o), widthMM: o.widthMm, heightMM: o.heightMm, qty: o.quantity || 1 });
      else windowSchedule.push({ mark: o.id, location: loc, type: o.type === 'ventilator' ? 'Ventilator' : o.widthMm >= 1500 ? 'Sliding 3-Track' : 'Sliding 2-Track', widthMM: o.widthMm, heightMM: o.heightMm, qty: o.quantity || 1, material: o.type === 'ventilator' ? 'UPVC' : 'UPVC + Glass' });
    }
  } else {
    let dIdx = 1, wIdx = 1;
    doorSchedule.push({ mark: `D${dIdx++}`, location: 'Main Entrance', type: 'Teak Panel (main)', widthMM: 1050, heightMM: 2100, qty: 1, material: 'Teak Wood' });
    bedrooms.forEach(r => doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Flush', widthMM: 900, heightMM: 2100, qty: 1, material: 'BWR Plywood' }));
    toilets.forEach(r => doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'WPC/FRP', widthMM: 750, heightMM: 2100, qty: 1, material: 'FRP' }));
    kitchens.forEach(r => doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Flush', widthMM: 900, heightMM: 2100, qty: 1, material: 'BWR Plywood' }));
    pujas.forEach(r => doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Glass Panel', widthMM: 750, heightMM: 2100, qty: 1, material: 'Teak + Glass' }));
    balconies.forEach(r => doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Sliding UPVC', widthMM: 1800, heightMM: 2100, qty: 1, material: 'UPVC + Glass' }));
    bedrooms.forEach(r => windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 2-Track', widthMM: 1200, heightMM: 1200, qty: 1, material: 'UPVC + Glass' }));
    halls.forEach(r => windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 3-Track', widthMM: 1800, heightMM: 1500, qty: 1, material: 'UPVC + Glass' }));
    kitchens.forEach(r => windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 2-Track', widthMM: 1200, heightMM: 1050, qty: 1, material: 'UPVC + Glass' }));
    toilets.forEach(r => windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Ventilator', widthMM: 600, heightMM: 450, qty: 1, material: 'UPVC' }));
    dinings.forEach(r => windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 2-Track', widthMM: 1200, heightMM: 1200, qty: 1, material: 'UPVC + Glass' }));
  }
  const doorCount = doorSchedule.reduce((s, d) => s + d.qty, 0);

  // ────── LINE ITEMS — composite rates (material + labour), standard spec, reference city ──────
  const lineItems: BOQLineItem[] = [];
  let sno = 0;
  const catFactor = (cat: BOQLineItem['category']) =>
    cat === 'finishing' || cat === 'doors_windows' ? city.factor * spec.factor
      : cat === 'mep' ? city.factor * (1 + (spec.factor - 1) * 0.5)
      : city.factor;
  const add = (desc: string, qty: number, unit: string, rate: number, cat: BOQLineItem['category'], remark?: string) => {
    if (!(qty > 0)) return;
    const custom = resolveRate(-1, desc, rateSource);
    const resolvedRate = custom >= 0 ? custom : Math.round(rate * catFactor(cat));
    sno++;
    lineItems.push({ sno, description: desc, quantity: +qty.toFixed(2), unit, rate: resolvedRate, amount: +(qty * resolvedRate).toFixed(0), category: cat, remark });
  };

  // Footing-derived earthwork when the structural engine has designed footings
  const footings = (structuralResult as (StructuralResultLike & { foundations?: Array<{ footingSizeMm: number; footingDepthMm: number; pccSizeMm?: number; pccThicknessMm?: number }> }) | undefined)?.foundations ?? [];
  const foundingDepthM = 1.5;
  const gfInternalLen = takeoff.floors[0]?.internalWallLenM ?? 0;
  const gfExternalLen = takeoff.floors[0]?.externalWallLenM ?? perimeter;
  const excavationM3 = footings.length
    ? footings.reduce((s, f) => s + ((f.footingSizeMm / 1000 + 0.6) ** 2) * foundingDepthM, 0) + (perimeter + gfInternalLen * 0.5) * 0.6 * 0.6
    : builtUpPerFloor * 1.2;
  const pccM3 = footings.length
    ? footings.reduce((s, f) => s + ((f.pccSizeMm ?? f.footingSizeMm + 150) / 1000) ** 2 * ((f.pccThicknessMm ?? 75) / 1000), 0)
    : builtUpPerFloor * 0.075;
  const footingVolM3 = footings.reduce((s, f) => s + (f.footingSizeMm / 1000) ** 2 * (f.footingDepthMm / 1000), 0);
  const backfillM3 = Math.max(0, excavationM3 - pccM3 - (footings.length ? footingVolM3 : excavationM3 * 0.4));
  const groundFloorArea = layout.buildableWidthM * layout.buildableDepthM;
  const earthBasis = footings.length ? `From ${footings.length} designed footing(s) at ${foundingDepthM} m founding depth + plinth-beam trench` : 'Allowance — footings not yet designed';

  // A. SITE PREPARATION & EARTHWORK
  add('Site Clearing & Levelling', groundFloorArea, 'm²', 30, 'structural', 'Remove debris, level ground');
  add('Soil Testing (Bore Log)', 1, 'LS', 20000, 'structural', 'SBC to be confirmed on site');
  add('Setting Out & Layout Marking', 1, 'LS', 10000, 'structural', 'Surveyor + equipment');
  add('Excavation for Foundation', +excavationM3.toFixed(2), 'm³', 400, 'structural', earthBasis);
  add('Anti-Termite Treatment (Pre-construction)', groundFloorArea, 'm²', 75, 'structural', 'Chemical barrier, IS 6313');
  add('Plinth Filling & Compaction (300mm)', +(groundFloorArea * 0.3).toFixed(2), 'm³', 1100, 'structural', 'Sand/murrum, compacted in layers');
  add('Backfilling with Excavated Earth', +backfillM3.toFixed(2), 'm³', 250, 'structural', 'Compacted in layers');

  // B. CONCRETE & RCC (rates include formwork; steel billed separately)
  add('PCC (1:4:8) – Footing Bed', +pccM3.toFixed(2), 'm³', 6000, 'structural', footings.length ? 'Under designed footings' : '75mm allowance');
  add('RCC Foundation / Footings (M25)', foundationConcrete, 'm³', 8000, 'structural', quantityBasis === 'engineered' ? `Engineered: ${actualColumnCount ?? 0} designed footing(s), IS 456` : 'Isolated footings, IS 456');
  add('RCC Plinth Beam (M25)', +((gfExternalLen + gfInternalLen) * 0.23 * 0.30).toFixed(2), 'm³', 9500, 'structural', '230×300mm under ground-floor wall lines');
  add('DPC (40mm CC 1:2:4 + waterproofing compound)', +(gfExternalLen * 0.23 + gfInternalLen * 0.115).toFixed(2), 'm²', 450, 'structural', 'At plinth level');
  add('RCC Columns (M25)', columnConcrete, 'm³', 11000, 'structural', quantityBasis === 'engineered' ? `Engineered: ${actualColumnCount ?? 0} actual column member(s), IS 456` : '230×300mm, IS 456');
  add('RCC Beams (M25)', beamConcrete, 'm³', 10500, 'structural', quantityBasis === 'engineered' ? `Engineered beam sizes: ${beamSizes?.map((size) => `${size.widthMm}×${size.depthMm}mm × ${size.count}`).join(', ') || 'refer structural schedule'}, IS 456` : '230×400mm, IS 456');
  add(`RCC Roof Slab (M25, ${primarySlabThickness}mm)`, slabConcrete, 'm³', 9500, 'structural', quantityBasis === 'engineered' ? `Engineered slab thickness(es): ${slabThicknesses?.join(', ') || primarySlabThickness}mm, IS 456` : '150mm thick');
  add('RCC Staircase (M25)', stairConcrete, 'm³', 11000, 'structural', 'Waist slab type, IS 456');
  add('RCC Lintels (M25)', +lintelConcrete.toFixed(2), 'm³', 10000, 'structural', 'Above openings');
  add('RCC Chajjas / Sunshade', +(lintelConcrete * 0.3).toFixed(2), 'm³', 10500, 'structural', '450mm projection');
  add('Reinforcement Steel (Fe500D)', steelMT, 'MT', 72000, 'structural', steelSourceNote);
  add('Curing (7-day min.)', totalConcrete, 'm³', 60, 'structural', 'Ponding / wet hessian');

  // C. MASONRY — measured from wall lines of the locked plan
  add('Brick Masonry – External (230mm, CM 1:6)', extMasonryM3, 'm³', 6500, 'masonry', `${takeoff.floors.reduce((s, f) => s + f.externalWallLenM, 0).toFixed(1)} m of external wall × ${takeoff.masonryHeightM} m, less openings & columns`);
  add('Brick Masonry – Internal (115mm, CM 1:4)', intMasonryM3, 'm³', 7200, 'masonry', `${takeoff.floors.reduce((s, f) => s + f.internalWallLenM, 0).toFixed(1)} m of partitions × ${takeoff.masonryHeightM} m, less openings`);
  add('Parapet Wall (115mm, 1.0m height)', parapetM3, 'm³', 7200, 'masonry', 'Terrace level');

  // D. PLASTERING
  add('Internal Plastering (CM 1:4, 12mm)', Math.round(takeoff.internalPlasterSqM), 'm²', 280, 'masonry', 'Both faces of partitions + inner face of external walls, less openings');
  add('External Plastering (CM 1:4, 20mm)', Math.round(takeoff.externalPlasterSqM), 'm²', 360, 'masonry', 'Outer face less openings + parapet both faces');
  add('Ceiling Plastering (CM 1:3, 10mm)', Math.round(takeoff.ceilingSqM), 'm²', 300, 'masonry', 'Under slab');
  const skirtingRm = allRooms.filter(r => !['toilet', 'staircase', 'balcony', 'parking'].includes(r.type)).reduce((s, r) => s + 2 * (r.width + r.depth), 0) - doorCount * 0.9;
  add('Skirting (Vitrified/Granite, 100mm)', +Math.max(0, skirtingRm).toFixed(0), 'Rmt', 250, 'finishing', 'Room perimeters less door widths');

  // E. FLOORING & TILING
  add('Vitrified Tile Flooring (600×600)', flooringArea, 'm²', 1150, 'finishing', 'Rooms excl. wet areas, stair & balcony');
  add('Anti-Skid Tiles – Bath & Utility Floor', takeoff.floorFinish.antiSkidSqM, 'm²', 900, 'finishing', 'Matt 300×300');
  add(`Bath Wall Tiles (up to ${ctx?.bathTileHeightM ?? 2.1} m)`, takeoff.bathWallTileSqM, 'm²', 900, 'finishing', 'Bath perimeters × tile height, less door');
  add('Kitchen Dado Tiles (600mm above counter)', takeoff.kitchenDadoSqM, 'm²', 900, 'finishing', 'Along counter length');
  add('Kitchen Counter Granite Slab', takeoff.kitchenCounterRmt, 'Rmt', 4000, 'finishing', '20mm, 600mm deep, polished');
  add('Staircase Treads & Risers – Granite', takeoff.floorFinish.stairTreads, 'nos', 2200, 'finishing', 'Polished granite, 1.0 m wide');
  add('Balcony / Sit-out – Rustic Tiles', takeoff.floorFinish.balconySqM, 'm²', 900, 'finishing', 'Anti-skid rustic');
  add('Threshold & Door Frame Grouting', doorCount, 'nos', 600, 'finishing', 'Granite threshold');

  // F. PAINTING
  add('Interior Putty (2 coats)', paintArea, 'm²', 70, 'finishing', 'Walls + ceiling');
  add('Interior Primer (1 coat)', paintArea, 'm²', 30, 'finishing', 'Walls + ceiling');
  add('Interior Emulsion Paint (2 coats)', paintArea, 'm²', 95, 'finishing', 'Acrylic emulsion');
  add('Exterior Weather-Shield Paint (primer + 2 coats)', Math.round(externalWallArea), 'm²', 130, 'finishing', 'Exterior emulsion');

  // G. WATERPROOFING
  add('Waterproofing – Baths (floor + 300mm up walls)', +(toiletArea * 1.4).toFixed(1), 'm²', 750, 'misc', 'Membrane / cementitious coat');
  add('Waterproofing – Terrace', +terrace.toFixed(1), 'm²', 800, 'misc', 'Brick-bat coba / membrane');
  add('Waterproofing – Kitchen & Utility', +(kitchenArea + takeoff.wetAreaSqM.utility).toFixed(1), 'm²', 500, 'misc', 'Liquid membrane');

  // H. DOORS & WINDOWS — from the openings schedule
  doorSchedule.forEach(d => {
    const unitRate = d.material === 'Teak Wood' ? 55000 :
                     d.material === 'FRP' ? 8000 :
                     d.material === 'UPVC + Glass' ? 28000 :
                     d.material === 'Teak + Glass' ? 25000 : 14000;
    add(`Door ${d.mark}: ${d.type} (${d.widthMM}×${d.heightMM})`, d.qty, 'nos', unitRate, 'doors_windows', d.location);
  });
  add('Door Locks (Mortise)', doorCount, 'nos', 3000, 'doors_windows', 'SS finish');
  add('Door Hinges (SS Ball Bearing)', doorCount * 3, 'nos', 400, 'doors_windows', 'SS hinges');
  add('Tower Bolts & Door Stoppers', doorCount, 'set', 600, 'doors_windows', 'SS');
  windowSchedule.forEach(w => {
    const areaM2 = (w.widthMM / 1000) * (w.heightMM / 1000);
    const unitRate = w.type === 'Ventilator' ? 4500 : Math.max(4000, Math.round(areaM2 * 7000));
    add(`Window ${w.mark}: ${w.type} (${w.widthMM}×${w.heightMM})`, w.qty, 'nos', unitRate, 'doors_windows', w.location);
  });
  const glazedWindows = windowSchedule.filter(w => w.type !== 'Ventilator');
  const glazedArea = glazedWindows.reduce((s, w) => s + (w.widthMM / 1000) * (w.heightMM / 1000) * w.qty, 0);
  add('Window Grills (MS Safety Grill)', +glazedArea.toFixed(2), 'm²', 2800, 'doors_windows', 'MS, powder-coated');
  add('Mosquito Mesh Screens', glazedWindows.reduce((s, w) => s + w.qty, 0), 'nos', 2500, 'doors_windows', 'SS mesh, aluminium frame');

  // I. PLUMBING & SANITARY
  const persons = bedrooms.length * 2 + 1;
  const sumpL = Math.max(5000, Math.ceil((persons * 135 * 1.5) / 1000) * 1000);
  const ohtL = Math.max(1000, Math.ceil((persons * 135) / 500) * 500);
  add('Plumbing – Supply Lines (CPVC)', plumbingPoints, 'points', 2400, 'mep', 'CPVC concealed');
  add('Plumbing – Drainage Lines (SWR)', plumbingPoints, 'points', 1800, 'mep', '110mm & 75mm SWR');
  add('EWC (with seat cover & cistern)', toilets.length, 'nos', 12000, 'mep', 'Incl. installation');
  add('Wash Basin', toilets.length, 'nos', 7000, 'mep', 'Ceramic, with fittings');
  add('Shower Mixer + Overhead Shower', toilets.length, 'nos', 9000, 'mep', 'Chrome finish');
  add('CP Fittings (Taps, Bib-cock, etc.)', toilets.length * 3 + kitchens.length * 2 + utilities.length, 'nos', 2500, 'mep', 'Mid-range brand');
  add('Kitchen Sink – SS', kitchens.length, 'nos', 9000, 'mep', 'With waste coupling');
  add('Floor Drain / Trap', toilets.length * 2 + kitchens.length + utilities.length, 'nos', 600, 'mep', 'SS grating');
  add('Solar Water Heater (100 LPD)', 1, 'nos', 28000, 'mep', 'Roof-mounted');
  add(`Overhead Water Tank (${ohtL} L)`, 1, 'nos', Math.round(ohtL * 12), 'mep', `1 day for ~${persons} persons @ 135 lpcd`);
  add(`Underground Sump (RCC, ${sumpL} L)`, 1, 'nos', Math.round(sumpL * 17), 'mep', '1.5 days storage');
  add('Rain Water Harvesting Pit', 1, 'nos', 25000, 'mep', 'Recharge pit with filter (check local mandate)');
  add('Septic Tank / Sewer Connection', 1, 'LS', 55000, 'mep', 'Septic tank where no public sewer');

  // J. ELECTRICAL
  add('Electrical Wiring (Conduit + Wire)', electricalPoints, 'points', 1250, 'mep', 'Concealed PVC conduit, FR wires');
  add('Electrical Switches & Sockets', electricalPoints, 'points', 550, 'mep', 'Modular');
  add('LED Ceiling Lights', allRooms.length, 'nos', 1500, 'mep', '15W downlight');
  add('Fan Points (Ceiling Fan)', bedrooms.length + halls.length + dinings.length + allRooms.filter(r => r.type === 'study').length, 'nos', 3500, 'mep', 'Incl. fan');
  add('AC Points (Power + Drain)', bedrooms.length + halls.length, 'nos', 4500, 'mep', '16A socket with drain pipe');
  add('Geyser Point (15A)', toilets.length, 'nos', 2000, 'mep', '15A socket + MCB');
  add('MCB Distribution Board', numFloors, 'nos', 12000, 'mep', 'Per floor');
  add('RCCB (Earth Leakage)', numFloors, 'nos', 4500, 'mep', '63A/30mA');
  add('Earthing (Pipe/Plate)', 2, 'nos', 9000, 'mep', 'As per IS 3043');
  add('TV & Internet Points', bedrooms.length + halls.length, 'nos', 1000, 'mep', 'Cat6 + coaxial');
  add('Doorbell + Video Door Phone', 1, 'nos', 8000, 'mep', 'Video door phone');

  // K. EXTERNAL WORKS (site works — reported separately from the building cost)
  const siteStart = lineItems.length;
  const plotPerimeter = 2 * ((layout.plotWidthM || layout.buildableWidthM) + (layout.plotDepthM || layout.buildableDepthM));
  add('Compound Wall (1.5m height)', +Math.max(0, plotPerimeter - 4).toFixed(1), 'Rmt', 4000, 'misc', 'Plot boundary less gate opening');
  add('MS Main Gate (4 m)', 1, 'nos', 45000, 'misc', 'Powder-coated');
  add('Staircase Railing', +(takeoff.floorFinish.stairTreads * 0.25 * 1.2).toFixed(1), 'Rmt', 3500, 'misc', 'MS + wooden/SS top rail');
  add('Balcony Railing', +takeoff.floors.reduce((s, f) => s + f.balconyEdgeLenM, 0).toFixed(1), 'Rmt', 4500, 'misc', 'MS / glass');
  add('Driveway / Front Paving', +((layout.setbacks?.front ?? 1.5) * Math.min(3.5, layout.plotWidthM || 3.5)).toFixed(1), 'm²', 1100, 'misc', 'Paver blocks');
  add('Garden / Landscaping (Basic)', 1, 'LS', 25000, 'misc', 'Topsoil, grass, plants');
  add('Name Board / Number Plate', 1, 'nos', 5000, 'misc', 'Name plate');

  const siteWorksItems = lineItems.slice(siteStart).map((li) => li.sno);
  // L. MISCELLANEOUS
  add('Scaffolding (External)', Math.round(externalWallArea), 'm²', 90, 'misc', 'Rental for external work');
  add('Construction Water & Electricity', 1, 'LS', Math.round(totalBuiltUpSqFt * 8), 'misc', 'Temporary connections');
  add('Labour Welfare & Safety', 1, 'LS', 15000, 'misc', 'PPE, first aid, signage');
  add('Structural Review & Approvals (allowance)', 1, 'LS', Math.round(totalBuiltUpSqFt * 15), 'misc', 'Licensed engineer review + plan sanction; varies by city');
  add('Debris Removal & Site Cleaning', 1, 'LS', 20000, 'misc', 'Post-construction');

  const totalCost = lineItems.reduce((s, li) => s + li.amount, 0);
  const costPerSqFt = +(totalCost / totalBuiltUpSqFt).toFixed(0);

  return {
    totalBuiltUpAreaSqFt: Math.round(totalBuiltUpSqFt),
    totalBuiltUpAreaSqM: +(totalBuiltUpSqM).toFixed(2),
    numFloors,
    concreteVolumeM3: +totalConcrete.toFixed(1),
    steelWeightMT: steelMT,
    brickCount,
    cementBags: totalCement,
    sandCuM,
    aggregateCuM,
    paintAreaSqM: paintArea,
    flooringAreaSqM: flooringArea,
    plumbingPoints,
    electricalPoints,
    lineItems,
    doorSchedule,
    windowSchedule,
    totalCost: Math.round(totalCost * 1.03), // 3% contingency
    costPerSqFt: Math.round((totalCost * 1.03) / totalBuiltUpSqFt),
    takeoff,
    pricing: (() => { const SITE = /^(Soil Testing|Solar Water Heater|Overhead Water Tank|Underground Sump|Rain Water|Septic|Structural Review)/; const site = lineItems.filter(li => siteWorksItems.includes(li.sno) || SITE.test(li.description)).reduce((s2, li) => s2 + li.amount, 0); const building = totalCost - site; return { cityLabel: city.label, cityFactor: city.factor, specLabel: spec.label, specFactor: spec.factor, contingencyPct: 3, buildingCost: Math.round(building * 1.03), siteAndServicesCost: Math.round(site * 1.03), buildingCostPerSqFt: Math.round(building * 1.03 / totalBuiltUpSqFt) }; })(),
    concreteBreakdown: {
      foundation: foundationConcrete,
      columns: columnConcrete,
      beams: beamConcrete,
      slabs: slabConcrete,
      staircase: stairConcrete,
      lintels: lintelConcrete,
    },
    waterproofingAreaSqM: waterproofingArea,
    plasteringAreaSqM: plasteringArea,
    quantityBasis,
    // === Structural-engine wiring: top-level convenience fields for BOQReport display ===
    concreteGrade: 'M25',
    steelGrade: 'Fe500D',
    slabThicknessesMm: slabThicknesses ?? [primarySlabThickness],
    steelKgPerSqFt: +(steelKg / totalBuiltUpSqFt).toFixed(2),
    columnSizeMm: structuralResult?.columns?.[0]
      ? `${structuralResult.columns[0].widthMm}mm × ${structuralResult.columns[0].depthMm}mm`
      : '230mm × 300mm',
    beamSizesMm: beamSizes,
    builtUpPerFloorSqFt: Math.round(builtUpPerFloor * SQM_TO_SQFT),
    structuralDetails: {
      source: quantityBasis,
      actualColumnCount,
      beamSizesMm: beamSizes,
      slabThicknessesMm: slabThicknesses,
      // The BOQ standardises its published specification, regardless of a malformed upstream label.
      concreteGrade: 'M25',
      steelGrade: 'Fe500D',
      // Steel is always sourced from the structural engine's own summary when a
      // structural result is supplied (see steelKg above); bbsResult is retained in the
      // signature for callers, but no longer selects a different steel figure here.
      steelSource: bbsResult && Number.isFinite(bbsResult.totalSteelKg) && bbsResult.totalSteelKg > 0
        ? 'bbs' : !structuralResult ? 'area-estimate' : 'structural-summary',
    },
  };
}
