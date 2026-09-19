import type { BOQ, BOQLineItem, DoorScheduleItem, WindowScheduleItem, Layout, MaterialRate, CustomRateSheet } from '../types';

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
): BOQResult;
export function calculateBOQ(layout: Layout, numFloors: number, customRates?: CustomRateSheet | null): BOQResult;
export function calculateBOQ(
  layout: Layout,
  materialRatesOrNumFloors: MaterialRate[] | number,
  numFloorsOrCustomRates?: number | CustomRateSheet | null,
  structuralResult?: StructuralResultLike,
  bbsResult?: BBSResultLike,
): BOQResult {
  const usingNewSignature = Array.isArray(materialRatesOrNumFloors);
  const materialRates = usingNewSignature ? materialRatesOrNumFloors : undefined;
  const numFloors = usingNewSignature
    ? (typeof numFloorsOrCustomRates === 'number' ? numFloorsOrCustomRates : 1)
    : materialRatesOrNumFloors;
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
  const allRooms = layout.floors.flatMap(f => f.rooms);

  // ────── CONCRETE & STEEL ──────
  // Preserve the original allowances exactly when no structural result is supplied.
  const estimatedFoundationConcrete = +(builtUpPerFloor * SQM_TO_SQFT * 0.04).toFixed(2);
  const estimatedColumnsPerFloor = Math.ceil(builtUpPerFloor / 12);
  const estimatedColumnConcrete = +(estimatedColumnsPerFloor * numFloors * 0.23 * 0.30 * 3.0).toFixed(2);
  const estimatedBeamRun = perimeter * 1.5;
  const estimatedBeamConcrete = +(estimatedBeamRun * 0.23 * 0.40 * numFloors).toFixed(2);
  const estimatedSlabConcrete = +(builtUpPerFloor * 0.150 * numFloors).toFixed(2);
  const stairFloors = numFloors - 1 > 0 ? numFloors - 1 : 0.5;
  const estimatedStairConcrete = +(0.15 * 16 * stairFloors).toFixed(2);
  const estimatedLintelConcrete = +(estimatedSlabConcrete * 0.05).toFixed(2);
  const estimatedTotalConcrete = +(estimatedFoundationConcrete + estimatedColumnConcrete + estimatedBeamConcrete + estimatedSlabConcrete + estimatedStairConcrete + estimatedLintelConcrete).toFixed(2);
  const quantityBasis: QuantityBasis = structuralResult ? 'engineered' : 'estimated';
  const engineeredBreakdown = structuralResult?.summary.concreteBreakdown;

  const foundationConcrete = structuralResult ? finiteNonNegative(engineeredBreakdown?.foundation, estimatedFoundationConcrete) : estimatedFoundationConcrete;
  const columnConcrete = structuralResult ? finiteNonNegative(engineeredBreakdown?.columns, estimatedColumnConcrete) : estimatedColumnConcrete;
  const beamConcrete = structuralResult ? finiteNonNegative(engineeredBreakdown?.beams, estimatedBeamConcrete) : estimatedBeamConcrete;
  const slabConcrete = structuralResult ? finiteNonNegative(engineeredBreakdown?.slabs, estimatedSlabConcrete) : estimatedSlabConcrete;
  const stairConcrete = structuralResult ? finiteNonNegative(engineeredBreakdown?.staircase, estimatedStairConcrete) : estimatedStairConcrete;
  const lintelConcrete = structuralResult ? finiteNonNegative(engineeredBreakdown?.lintels, estimatedLintelConcrete) : estimatedLintelConcrete;
  const totalConcrete = structuralResult
    ? finiteNonNegative(structuralResult.summary.totalConcreteM3, foundationConcrete + columnConcrete + beamConcrete + slabConcrete + stairConcrete + lintelConcrete)
    : estimatedTotalConcrete;

  // The BBS includes detailed bar lengths and its waste allowance, so it is the preferred steel source.
  const structuralSteelKg = structuralResult ? finiteNonNegative(structuralResult.summary.totalSteelKg, totalBuiltUpSqFt * 4.5) : totalBuiltUpSqFt * 4.5;
  const steelKg = structuralResult && bbsResult
    ? finiteNonNegative(bbsResult.totalSteelKg, structuralSteelKg)
    : structuralSteelKg;
  const steelMT = +(steelKg / 1000).toFixed(2);
  const actualColumnCount = structuralResult?.columns.length;
  const beamSizes = structuralResult ? uniqueMemberSizes(structuralResult.beams) : undefined;
  const slabThicknesses = structuralResult
    ? [...new Set(structuralResult.slabs.map((slab) => slab.thicknessMm).filter((thickness) => Number.isFinite(thickness)))].sort((a, b) => a - b)
    : undefined;
  const primarySlabThickness = slabThicknesses?.[0] ?? 150;

  // ────── MASONRY ──────
  const externalWallArea = perimeter * wallHeight * numFloors;
  const internalWallArea = externalWallArea * 0.7;
  const totalWallArea = externalWallArea + internalWallArea;
  const netWallArea = totalWallArea * 0.85; // 15% openings deduction
  const brickCount = Math.ceil((netWallArea / 10) * 480);

  // ────── CEMENT / SAND / AGGREGATE ──────
  const cementForConcrete = totalConcrete * 8;
  const cementForBrickwork = brickCount / 500;
  const plasteringArea = +(netWallArea * 2).toFixed(0);
  const cementForPlastering = plasteringArea * 0.5;
  const totalCement = Math.ceil(cementForConcrete + cementForBrickwork + cementForPlastering);
  const sandCuM = +(totalCement * 0.04).toFixed(1);
  const aggregateCuM = +(totalConcrete * 0.8).toFixed(1);

  // ────── FINISHING ──────
  const paintArea = Math.round(netWallArea * 2 + totalBuiltUpSqM);
  const flooringArea = Math.round(totalBuiltUpSqM * 0.85);

  // ────── WATERPROOFING ──────
  const toilets = allRooms.filter(r => r.type === 'toilet');
  const kitchens = allRooms.filter(r => r.type === 'kitchen');
  const toiletArea = toilets.reduce((s, r) => s + r.width * r.depth, 0);
  const kitchenArea = kitchens.reduce((s, r) => s + r.width * r.depth, 0);
  const terrace = builtUpPerFloor;
  const waterproofingArea = +(toiletArea + kitchenArea + terrace).toFixed(1);

  // ────── MEP ──────
  const plumbingPoints = toilets.length * 5 + kitchens.length * 3;
  const pointMap: Record<string, number> = {
    master_bedroom: 8, bedroom: 6, hall: 10, kitchen: 6,
    toilet: 3, dining: 4, puja: 2, passage: 2,
    balcony: 2, store: 2, utility: 3, parking: 2, entrance: 2, staircase: 2,
  };
  const electricalPoints = allRooms.reduce((sum, r) => sum + (pointMap[r.type] || 2), 0);

  // ────── DOOR SCHEDULE ──────
  const doorSchedule: DoorScheduleItem[] = [];
  let dIdx = 1;
  doorSchedule.push({ mark: `D${dIdx++}`, location: 'Main Entrance', type: 'Teak Panel', widthMM: 1050, heightMM: 2100, qty: 1, material: 'Teak Wood' });
  const bedrooms = allRooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom');
  bedrooms.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Flush', widthMM: 900, heightMM: 2100, qty: 1, material: 'BWR Plywood' });
  });
  toilets.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'FRP/PVC', widthMM: 600, heightMM: 2000, qty: 1, material: 'FRP' });
  });
  kitchens.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Flush', widthMM: 900, heightMM: 2100, qty: 1, material: 'BWR Plywood' });
  });
  const pujas = allRooms.filter(r => r.type === 'puja');
  pujas.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Glass Panel', widthMM: 750, heightMM: 2100, qty: 1, material: 'Teak + Glass' });
  });
  const balconies = allRooms.filter(r => r.type === 'balcony');
  balconies.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Sliding UPVC', widthMM: 1800, heightMM: 2100, qty: 1, material: 'UPVC + Glass' });
  });

  // ────── WINDOW SCHEDULE ──────
  const windowSchedule: WindowScheduleItem[] = [];
  let wIdx = 1;
  bedrooms.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 2-Track', widthMM: 1200, heightMM: 1200, qty: 1, material: 'UPVC + Glass' });
  });
  const halls = allRooms.filter(r => r.type === 'hall');
  halls.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 3-Track', widthMM: 1800, heightMM: 1500, qty: 1, material: 'UPVC + Glass' });
  });
  kitchens.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Casement', widthMM: 900, heightMM: 900, qty: 1, material: 'UPVC' });
  });
  toilets.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Ventilator', widthMM: 600, heightMM: 450, qty: 1, material: 'UPVC' });
  });
  const dinings = allRooms.filter(r => r.type === 'dining');
  dinings.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 2-Track', widthMM: 1200, heightMM: 1200, qty: 1, material: 'UPVC + Glass' });
  });

  // ────── 50+ LINE ITEMS WITH RATES (2024-25 avg.) ──────
  const lineItems: BOQLineItem[] = [];
  let sno = 0;

  const add = (desc: string, qty: number, unit: string, rate: number, cat: BOQLineItem['category'], remark?: string) => {
    // Resolve rate: check custom rates first, fall back to default
    const resolvedRate = resolveRate(rate, desc, rateSource);
    sno++;
    lineItems.push({ sno, description: desc, quantity: +qty.toFixed(2), unit, rate: resolvedRate, amount: +(qty * resolvedRate).toFixed(0), category: cat, remark });
  };

  // ═══════════ A. SITE PREPARATION & EARTHWORK ═══════════
  add('Site Clearing & Levelling', builtUpPerFloor, 'm²', 25, 'structural', 'Remove debris, level ground');
  add('Soil Testing (Bore Log)', 1, 'LS', 15000, 'structural', 'Standard penetration test');
  add('Setting Out & Layout Marking', 1, 'LS', 8000, 'structural', 'Surveyor + equipment');
  add('Excavation for Foundation (1.2m depth)', +(builtUpPerFloor * 1.2).toFixed(2), 'm³', 350, 'structural', 'Mechanical excavation');
  add('Anti-Termite Treatment (Pre-construction)', builtUpPerFloor, 'm²', 35, 'structural', 'Chemical barrier');
  add('Sand Filling & Compaction (300mm)', +(builtUpPerFloor * 0.3).toFixed(2), 'm³', 1200, 'structural', 'Coarse sand, plate compacted');
  add('Backfilling with Excavated Earth', +(builtUpPerFloor * 0.5).toFixed(2), 'm³', 180, 'structural', 'Compacted in layers');

  // ═══════════ B. CONCRETE & RCC WORK ═══════════
  add('PCC (1:4:8) – Foundation Bed (75mm)', +(builtUpPerFloor * 0.075).toFixed(2), 'm³', 5500, 'structural', '75mm thick');
  add('RCC Foundation / Footings (M25)', foundationConcrete, 'm³', 7500, 'structural', quantityBasis === 'engineered' ? `Engineered: ${actualColumnCount ?? 0} designed footing(s), IS 456` : 'Isolated footings, IS 456');
  add('RCC Plinth Beam (M25)', +(perimeter * 0.23 * 0.30).toFixed(2), 'm³', 8000, 'structural', '230×300mm');
  add('DPC (Damp Proof Course)', +(perimeter * 0.23 * 0.05).toFixed(2), 'm³', 6000, 'structural', 'CM 1:2 + waterproofing compound');
  add('RCC Columns (M25)', columnConcrete, 'm³', 8000, 'structural', quantityBasis === 'engineered' ? `Engineered: ${actualColumnCount ?? 0} actual column member(s), IS 456` : '230×300mm, IS 456');
  add('RCC Beams (M25)', beamConcrete, 'm³', 8000, 'structural', quantityBasis === 'engineered' ? `Engineered beam sizes: ${beamSizes?.map((size) => `${size.widthMm}×${size.depthMm}mm × ${size.count}`).join(', ') || 'refer structural schedule'}, IS 456` : '230×400mm, IS 456');
  add(`RCC Roof Slab (M25, ${primarySlabThickness}mm)`, slabConcrete, 'm³', 7500, 'structural', quantityBasis === 'engineered' ? `Engineered slab thickness(es): ${slabThicknesses?.join(', ') || primarySlabThickness}mm, IS 456` : '150mm thick');
  add('RCC Staircase (M25)', stairConcrete, 'm³', 9000, 'structural', 'Waist slab type, IS 456');
  add('RCC Lintels (M25)', +(lintelConcrete * 0.7).toFixed(2), 'm³', 8000, 'structural', 'Above openings');
  add('RCC Chajjas / Sunshade', +(lintelConcrete * 0.3).toFixed(2), 'm³', 8500, 'structural', '450mm projection');
  add('Reinforcement Steel (Fe500D)', steelMT, 'MT', 72000, 'structural', structuralResult ? (bbsResult ? 'BBS total incl. schedule waste; IS 1786' : 'Structural-engine total; BBS not supplied, IS 1786') : 'Incl. binding wire, IS 1786');
  add('Curing (7-day min.)', totalConcrete, 'm³', 30, 'structural', 'Ponding / gunny bag method');

  // ═══════════ C. MASONRY WORK ═══════════
  const masonryVolumeM3 = +(netWallArea * 0.23).toFixed(1);
  add('Brick Masonry – External (230mm, CM 1:6)', +(externalWallArea * 0.85 * 0.23).toFixed(1), 'm³', 6000, 'masonry', 'Class A bricks, CM 1:6');
  add('Brick Masonry – Internal (115mm, CM 1:6)', +(internalWallArea * 0.85 * 0.115).toFixed(1), 'm³', 5500, 'masonry', 'Half-brick partition walls');
  add('Parapet Wall (100mm, 1.0m height)', +(perimeter * 0.1 * 1.0).toFixed(1), 'm³', 5500, 'masonry', 'Terrace level');

  // ═══════════ D. PLASTERING & FINISHING ═══════════
  add('Internal Plastering (CM 1:4, 12mm)', +(plasteringArea * 0.5).toFixed(0), 'm²', 45, 'masonry', 'Sand-faced smooth');
  add('External Plastering (CM 1:4, 20mm)', +(externalWallArea * 0.85).toFixed(0), 'm²', 55, 'masonry', 'Rough cast / sponge finish');
  add('Ceiling Plastering (CM 1:4, 10mm)', Math.round(totalBuiltUpSqM), 'm²', 42, 'masonry', 'Under slab');
  add('Skirting (Granite/Marble, 100mm)', +(perimeter * numFloors * 0.8).toFixed(0), 'Rmt', 180, 'finishing', '100mm high');

  // ═══════════ E. FLOORING & TILING ═══════════
  add('Vitrified Tile Flooring (600×600)', flooringArea, 'm²', 120, 'finishing', 'Double charge, Kajaria/Somany');
  add('Anti-Skid Tiles – Toilet Floor', +toiletArea.toFixed(1), 'm²', 90, 'finishing', 'Matt finish 300×300');
  add('Toilet Wall Dado Tiles (full height)', +(toiletArea * 2.4).toFixed(1), 'm²', 90, 'finishing', 'Ceramic 300×600');
  add('Kitchen Wall Dado Tiles (up to 600mm)', +(kitchenArea * 0.6).toFixed(1), 'm²', 85, 'finishing', 'Ceramic glazed');
  add('Kitchen Counter Granite Slab', +(kitchens.length * 3.0).toFixed(1), 'Rmt', 2800, 'finishing', '20mm thick, polished');
  add('Staircase Treads – Granite', Math.ceil(14 * stairFloors), 'nos', 1200, 'finishing', 'Polished granite 250×1000mm');
  add('Balcony / Sit-out – Rustic Tiles', +(balconies.reduce((s, r) => s + r.width * r.depth, 0)).toFixed(1), 'm²', 75, 'finishing', 'Anti-skid rustic');
  add('Threshold & Door Frame Grouting', doorSchedule.length, 'nos', 250, 'finishing', 'CM 1:3 + additive');

  // ═══════════ F. PAINTING & WALL FINISH ═══════════
  add('Interior Putty (2 coats)', paintArea, 'm²', 18, 'finishing', 'Birla / JK wall putty');
  add('Interior Primer (1 coat)', paintArea, 'm²', 8, 'finishing', 'Asian / Berger primer');
  add('Interior Emulsion Paint (2 coats)', paintArea, 'm²', 30, 'finishing', 'Acrylic premium, Asian Royale');
  add('Exterior Weather-Shield Paint (2 coats)', +(externalWallArea * 0.85).toFixed(0), 'm²', 40, 'finishing', 'Apex Ultima / Berger WeatherCoat');

  // ═══════════ G. WATERPROOFING ═══════════
  add('Waterproofing – Toilets (APP membrane)', +toiletArea.toFixed(1), 'm²', 95, 'misc', 'APP membrane + chemical coat');
  add('Waterproofing – Terrace', +terrace.toFixed(1), 'm²', 85, 'misc', 'Dr. Fixit / Sika + brick bat coba');
  add('Waterproofing – Kitchen', +kitchenArea.toFixed(1), 'm²', 75, 'misc', 'Liquid membrane');

  // ═══════════ H. DOORS & WINDOWS ═══════════
  doorSchedule.forEach(d => {
    const unitRate = d.material === 'Teak Wood' ? 18000 :
                     d.material === 'FRP' ? 3500 :
                     d.material === 'UPVC + Glass' ? 15000 :
                     d.material === 'Teak + Glass' ? 12000 : 8000;
    add(`Door ${d.mark}: ${d.type} (${d.widthMM}×${d.heightMM})`, d.qty, 'nos', unitRate, 'doors_windows', d.location);
  });
  // Door hardware
  add('Door Locks (Mortise – Godrej/Ozone)', doorSchedule.length, 'nos', 2500, 'doors_windows', 'SS finish');
  add('Door Hinges (SS Ball Bearing)', doorSchedule.length * 3, 'nos', 350, 'doors_windows', '4" × 3" SS hinges');
  add('Tower Bolts & Door Stoppers', doorSchedule.length, 'set', 450, 'doors_windows', 'SS tower bolt + rubber stopper');

  windowSchedule.forEach(w => {
    const unitRate = w.type === 'Ventilator' ? 2500 :
                     w.widthMM >= 1800 ? 12000 : 8000;
    add(`Window ${w.mark}: ${w.type} (${w.widthMM}×${w.heightMM})`, w.qty, 'nos', unitRate, 'doors_windows', w.location);
  });
  // Window extras
  add('Window Grills (MS Safety Grill)', windowSchedule.filter(w => w.type !== 'Ventilator').length, 'nos', 3500, 'doors_windows', 'MS grill powder-coated');
  add('Mosquito Mesh Screens (Sliding)', windowSchedule.filter(w => w.type.includes('Sliding')).length, 'nos', 2000, 'doors_windows', 'SS 304 mesh, aluminium frame');

  // ═══════════ I. PLUMBING & SANITARY ═══════════
  add('Plumbing – Supply Lines (CPVC)', plumbingPoints, 'points', 2000, 'mep', 'Astral/Supreme CPVC');
  add('Plumbing – Drainage Lines (SWR)', plumbingPoints, 'points', 1500, 'mep', '110mm & 75mm SWR pipes');
  add('EWC – Wall-Mounted / Floor-Mounted', toilets.length, 'nos', 8000, 'mep', 'Hindware / Parryware');
  add('Wash Basin – Counter Top', toilets.length, 'nos', 4500, 'mep', 'Ceramic, 18" round');
  add('Shower Mixer + Rain Shower', toilets.length, 'nos', 5500, 'mep', 'SS/Chrome finish');
  add('CP Fittings (Taps, Bib-cock, etc.)', toilets.length * 3 + kitchens.length * 2, 'nos', 1800, 'mep', 'Jaquar / Grohe equivalent');
  add('Kitchen Sink – SS Double Bowl', kitchens.length, 'nos', 6500, 'mep', '37"×18" + waste coupling');
  add('Floor Drain / Trap', toilets.length * 2 + kitchens.length, 'nos', 350, 'mep', 'SS jali grating');
  add('Solar Water Heater (100 LPD)', 1, 'nos', 22000, 'mep', 'ETC type, roof-mounted');
  add('Overhead Water Tank (1000L)', 1, 'nos', 12000, 'mep', 'Sintex / Supreme');
  add('Underground Sump (RCC, 2000L)', 1, 'nos', 25000, 'mep', 'Waterproofed RCC');
  add('Rain Water Harvesting Pit', 1, 'nos', 18000, 'mep', 'Recharge pit with filter');
  add('Septic Tank (2-chamber)', 1, 'nos', 35000, 'mep', 'RCC, 2000L, as per NBC');

  // ═══════════ J. ELECTRICAL ═══════════
  add('Electrical Wiring (Conduit + Wire)', electricalPoints, 'points', 1200, 'mep', 'PVC conduit, Finolex 1.5/2.5 sq mm');
  add('Electrical Switches & Sockets', electricalPoints, 'points', 800, 'mep', 'Anchor Roma / Legrand');
  add('LED Ceiling Lights', allRooms.length, 'nos', 1200, 'mep', 'Philips / Syska 15W downlight');
  add('Fan Points (Ceiling Fan)', bedrooms.length + halls.length + dinings.length, 'nos', 2800, 'mep', 'Crompton / Havells');
  add('AC Points (Power + Drain)', bedrooms.length + halls.length, 'nos', 3500, 'mep', '6A + 16A socket with drain pipe');
  add('Geyser Point (15A)', toilets.length, 'nos', 1500, 'mep', '15A socket + MCB');
  add('MCB Distribution Board', numFloors, 'nos', 8000, 'mep', 'Havells / Schneider DB');
  add('RCCB (Earth Leakage)', numFloors, 'nos', 3500, 'mep', '63A/30mA');
  add('Earthing (Pipe + Plate)', 2, 'nos', 6000, 'mep', 'GI pipe + copper plate');
  add('TV & Internet Points', bedrooms.length + halls.length, 'nos', 800, 'mep', 'Cat6 + coaxial');
  add('Doorbell + Video Door Phone', 1, 'nos', 4500, 'mep', 'Godrej / Hikvision');

  // ═══════════ K. EXTERNAL WORKS ═══════════
  add('Compound Wall (1.5m height)', +(perimeter * 0.7).toFixed(1), 'Rmt', 2800, 'misc', 'Brick + plaster both sides');
  add('MS Main Gate (5ft wide)', 1, 'nos', 35000, 'misc', 'MS fabricated, powder-coated');
  add('MS Staircase Railing', +(3.0 * (numFloors - 1 > 0 ? numFloors - 1 : 1) * 2).toFixed(1), 'Rmt', 1800, 'misc', 'MS + SS top rail');
  add('Balcony Railing (MS + Glass)', +(balconies.reduce((s, r) => s + r.width, 0) || 3).toFixed(1), 'Rmt', 2500, 'misc', 'MS frame + toughened glass');
  add('Portico / Car Porch (RCC)', builtUpPerFloor > 80 ? 1 : 0, 'LS', 45000, 'misc', 'Cantilever / column type');
  add('External Paving (Kota / Paver Block)', +(builtUpPerFloor * 0.15).toFixed(1), 'm²', 90, 'misc', 'Interlocking paver');
  add('Garden / Landscaping (Basic)', 1, 'LS', 15000, 'misc', 'Topsoil + grass + 2 trees');
  add('Name Board / Number Plate', 1, 'nos', 3000, 'misc', 'SS letters on granite');

  // ═══════════ L. MISCELLANEOUS ═══════════
  add('Scaffolding & Shuttering (Rental)', totalBuiltUpSqM, 'm²', 65, 'misc', 'Steel shuttering, 2 uses');
  add('Construction Water & Electricity', 1, 'LS', 15000, 'misc', 'Temporary connection');
  add('Labour Welfare & Safety', 1, 'LS', 10000, 'misc', 'PPE, first aid, signage');
  add('Architect / Structural Engineer Fee', 1, 'LS', +(totalBuiltUpSqFt * 3).toFixed(0), 'misc', '₹3/sqft approx.');
  add('Municipal Approvals & Fees', 1, 'LS', +(totalBuiltUpSqFt * 5).toFixed(0), 'misc', 'Plan sanction + completion');
  add('Debris Removal & Site Cleaning', 1, 'LS', 12000, 'misc', 'Post-construction cleanup');

  const totalCost = lineItems.reduce((s, li) => s + li.amount, 0);
  const costPerSqFt = +(totalCost / totalBuiltUpSqFt).toFixed(0);

  return {
    totalBuiltUpAreaSqFt: Math.round(totalBuiltUpSqFt),
    totalBuiltUpAreaSqM: +(totalBuiltUpSqM).toFixed(2),
    numFloors,
    concreteVolumeM3: totalConcrete,
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
    totalCost: Math.round(totalCost * 1.03), // 3% wastage buffer for Contractor-Ready accuracy
    costPerSqFt: Math.round((totalCost * 1.03) / totalBuiltUpSqFt),
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
      steelSource: !structuralResult ? 'area-estimate' : bbsResult ? 'bbs' : 'structural-summary',
    },
  };
}
