/**
 * Preliminary Bar Bending Schedule generator.
 *
 * The module is intentionally standalone.  Dimensions used internally for cutting
 * lengths are millimetres; structural-result geometry remains in metres where it
 * follows the structural design engine.  This is a quantity schedule, not a
 * fabrication drawing.
 */

// Inline mirrors of the structural-engine result types.  No project import is used.
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
export interface StructuralDesignResult_Input {
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
  warnings: string[];
  disclaimer: string;
}

export interface BBSEntry {
  barMarkNo: string;
  memberType: 'slab' | 'beam' | 'column' | 'foundation' | 'staircase' | 'lintel';
  memberId: string;
  memberDescription: string;
  barType: 'main' | 'distribution' | 'tension_top' | 'tension_bottom' | 'compression' | 'stirrup' | 'tie' | 'cranked';
  barDiaMm: number;
  barShape: string;
  barLengthMm: number;
  numberOfBars: number;
  totalLengthM: number;
  unitWeightKgM: number;
  totalWeightKg: number;
  floor: number;
  remarks: string;
}
export interface BBSMemberSummary {
  memberId: string;
  memberType: string;
  memberDescription: string;
  floor: number;
  entries: BBSEntry[];
  totalWeightKg: number;
}
export interface BBSSummary {
  totalWeightKg: number;
  totalWeightMT: number;
  byDiameter: { diaMm: number; totalLengthM: number; totalWeightKg: number; }[];
  byMemberType: { type: string; weightKg: number; percentOfTotal: number; }[];
  byFloor: { floor: number; floorLabel: string; weightKg: number; }[];
}
export interface BBSResult {
  entries: BBSEntry[];
  memberSummaries: BBSMemberSummary[];
  summary: BBSSummary;
  totalSteelKg: number;
  totalSteelMT: number;
  concreteGrade: string;
  steelGrade: string;
  disclaimer: string;
}

export const BBS_DISCLAIMER =
  'PRELIMINARY BAR BENDING SCHEDULE — Generated from automated structural design. ' +
  'Verify all quantities, cut lengths, and bending dimensions with licensed structural engineer. ' +
  'Site conditions, actual concrete cover, and construction tolerances may require adjustments.';

/** IS 2502/SP 34 commonly used nominal unit masses.  Six mm is retained for supplied column ties. */
export const BAR_WEIGHT_KG_PER_M: Readonly<Record<number, number>> = {
  6: 0.222,
  8: 0.395,
  10: 0.617,
  12: 0.889,
  16: 1.580,
  20: 2.469,
  25: 3.854,
  32: 6.316,
};

const SLAB_COVER = 20;
const BEAM_COVER = 25;
const COLUMN_COVER = 40;
const FOOTING_COVER = 50;
const STAIR_COVER = 20;
const LINTEL_COVER = 25;
const WASTE_FACTOR = 1.05;

function roundUp25(value: number): number {
  return Math.ceil(Math.max(0, value) / 25) * 25;
}
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function weightForDiameter(diaMm: number): number {
  // Preserve the prescribed tabulated values.  The formula is only a safe fallback
  // for a non-standard diameter supplied by an upstream design engine.
  return BAR_WEIGHT_KG_PER_M[diaMm] ?? round3(diaMm * diaMm / 162);
}
function floorLabel(floor: number): string {
  if (floor <= 0) return 'Ground Floor';
  const named = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  return named[floor - 1] ? `${named[floor - 1]} Floor` : `Floor ${floor + 1}`;
}
function memberPrefix(type: BBSEntry['memberType']): string {
  return ({ slab: 'S', beam: 'B', column: 'C', foundation: 'F', staircase: 'ST', lintel: 'L' })[type];
}
function barToken(type: BBSEntry['barType']): string {
  return ({
    main: 'M', distribution: 'D', tension_top: 'T', tension_bottom: 'B', compression: 'C',
    stirrup: 'ST', tie: 'TI', cranked: 'CR',
  })[type];
}

/** Parses e.g. "4-16mm" and "3-16mm + 2-12mm".  Nil/invalid portions are ignored. */
export function parseBars(barStr: string): { count: number; diaMm: number }[] {
  if (!barStr) return [];
  return barStr.split('+').map((part) => {
    const match = /^\s*(\d+)\s*-\s*(\d+(?:\.\d+)?)\s*mm\s*$/i.exec(part);
    return match ? { count: Number(match[1]), diaMm: Number(match[2]) } : undefined;
  }).filter((item): item is { count: number; diaMm: number } =>
    item !== undefined && Number.isFinite(item.count) && item.count > 0 && Number.isFinite(item.diaMm) && item.diaMm > 0,
  );
}

function developmentLength(diaMm: number, steelGrade: string, concreteGrade: string): number {
  // The specified 47d is the conventional Fe500 tension value.  Fe415 is reduced
  // using IS 456 bond-stress calculation, while a small grade adjustment is used
  // only where an upstream result explicitly identifies M20/M30.
  if (/fe\s*500/i.test(steelGrade)) return 47 * diaMm;
  const tauBd = /m30/i.test(concreteGrade) ? 1.5 : /m20/i.test(concreteGrade) ? 1.2 : 1.4;
  return Math.ceil((0.87 * 415 * diaMm) / (4 * tauBd * 1.6));
}
function medianBeamDepth(beams: BeamDesignResult[], floor: number): number {
  const depths = beams.filter((beam) => beam.floor === floor && beam.depthMm > 0).map((beam) => beam.depthMm).sort((a, b) => a - b);
  if (!depths.length) return 300;
  return depths[Math.floor(depths.length / 2)];
}

interface NewEntry {
  memberType: BBSEntry['memberType'];
  memberId: string;
  memberDescription: string;
  memberIndex: number;
  barType: BBSEntry['barType'];
  barDiaMm: number;
  barShape: string;
  barLengthMm: number;
  numberOfBars: number;
  floor: number;
  remarks: string;
}

class ScheduleCollector {
  public readonly entries: BBSEntry[] = [];
  private readonly markCounts = new Map<string, number>();

  add(spec: NewEntry): void {
    if (!Number.isFinite(spec.numberOfBars) || spec.numberOfBars <= 0 || !Number.isFinite(spec.barLengthMm) || spec.barLengthMm <= 0) return;
    const key = `${spec.memberType}:${spec.memberIndex}`;
    const sequence = (this.markCounts.get(key) ?? 0) + 1;
    this.markCounts.set(key, sequence);
    const barLengthMm = roundUp25(spec.barLengthMm);
    const numberOfBars = Math.ceil(spec.numberOfBars);
    const totalLengthM = round3(numberOfBars * barLengthMm / 1000);
    const unitWeightKgM = weightForDiameter(spec.barDiaMm);
    this.entries.push({
      barMarkNo: `${memberPrefix(spec.memberType)}${spec.memberIndex}-${barToken(spec.barType)}${sequence}`,
      memberType: spec.memberType,
      memberId: spec.memberId,
      memberDescription: spec.memberDescription,
      barType: spec.barType,
      barDiaMm: spec.barDiaMm,
      barShape: spec.barShape,
      barLengthMm,
      numberOfBars,
      totalLengthM,
      unitWeightKgM,
      totalWeightKg: round2(totalLengthM * unitWeightKgM),
      floor: spec.floor,
      remarks: spec.remarks,
    });
  }
}

function scheduleSlabs(result: StructuralDesignResult_Input, collector: ScheduleCollector): void {
  result.slabs.forEach((slab, index) => {
    const memberIndex = index + 1;
    const memberId = `S${memberIndex}`;
    const description = `${floorLabel(slab.floor)} Slab Panel ${memberIndex} (${slab.id})`;
    const shortSpan = Math.min(slab.spanXm, slab.spanYm) * 1000;
    const longSpan = Math.max(slab.spanXm, slab.spanYm) * 1000;
    const mainDia = slab.shortSpanBarDiaMm ?? slab.mainBarDiaMm;
    const mainSpacing = slab.shortSpanSpacingMm ?? slab.mainBarSpacingMm;
    const distributionDia = slab.longSpanBarDiaMm ?? slab.distBarDiaMm;
    const distributionSpacing = slab.longSpanSpacingMm ?? slab.distBarSpacingMm;
    const mainCount = Math.ceil(longSpan / finitePositive(mainSpacing, 150)) + 1;
    const ldMain = developmentLength(mainDia, result.parameters.steelGrade, result.parameters.concreteGrade);
    const mainLength = shortSpan + 2 * ldMain - 2 * SLAB_COVER;
    collector.add({ memberType: 'slab', memberId, memberDescription: description, memberIndex, barType: 'main', barDiaMm: mainDia,
      barShape: 'Straight', barLengthMm: mainLength, numberOfBars: mainCount, floor: slab.floor,
      remarks: slab.slabType === 'two-way' ? 'Main reinforcement in short-span direction' : 'Main reinforcement', });

    const distributionCount = Math.ceil(shortSpan / finitePositive(distributionSpacing, 200)) + 1;
    const ldDist = developmentLength(distributionDia, result.parameters.steelGrade, result.parameters.concreteGrade);
    collector.add({ memberType: 'slab', memberId, memberDescription: description, memberIndex, barType: 'distribution', barDiaMm: distributionDia,
      barShape: 'Straight', barLengthMm: longSpan + 2 * ldDist - 2 * SLAB_COVER, numberOfBars: distributionCount, floor: slab.floor,
      remarks: slab.slabType === 'two-way' ? 'Distribution reinforcement in long-span direction' : 'Distribution reinforcement', });

    // Negative-moment top bars are a 0.3L support strip with one development length.
    collector.add({ memberType: 'slab', memberId, memberDescription: description, memberIndex, barType: 'tension_top', barDiaMm: mainDia,
      barShape: 'Straight', barLengthMm: 0.3 * shortSpan + ldMain, numberOfBars: mainCount, floor: slab.floor,
      remarks: 'Extra top bars at supports; 0.3L support strip', });
  });
}

function scheduleBeams(result: StructuralDesignResult_Input, collector: ScheduleCollector): void {
  result.beams.forEach((beam, index) => {
    const memberIndex = index + 1;
    const memberId = `B${memberIndex}`;
    const description = `${floorLabel(beam.floor)} Beam ${memberIndex} (${beam.id})`;
    const span = beam.spanM * 1000;
    for (const bar of parseBars(beam.tensionBars)) {
      const ld = developmentLength(bar.diaMm, result.parameters.steelGrade, result.parameters.concreteGrade);
      collector.add({ memberType: 'beam', memberId, memberDescription: description, memberIndex, barType: 'tension_bottom', barDiaMm: bar.diaMm,
        barShape: 'Straight', barLengthMm: span + 2 * ld, numberOfBars: bar.count, floor: beam.floor,
        remarks: 'Bottom tension reinforcement; includes 47d tension anchorage where applicable', });
    }
    if (beam.isDoublyReinforced) {
      for (const bar of parseBars(beam.compressionBars)) {
        const ld = developmentLength(bar.diaMm, result.parameters.steelGrade, result.parameters.concreteGrade);
        collector.add({ memberType: 'beam', memberId, memberDescription: description, memberIndex, barType: 'compression', barDiaMm: bar.diaMm,
          barShape: 'Straight', barLengthMm: span + 2 * ld, numberOfBars: bar.count, floor: beam.floor,
          remarks: 'Top compression / negative-moment reinforcement', });
      }
    }
    const stirrupDia = finitePositive(beam.stirrupDiaMm, 8);
    const stirrupLength = 2 * (beam.widthMm - 2 * BEAM_COVER) + 2 * (beam.depthMm - 2 * BEAM_COVER) + 2 * 10 * stirrupDia;
    const nearCount = Math.ceil((span / 4) / finitePositive(beam.stirrupSpacingNearSupportMm, 150)) * 2;
    collector.add({ memberType: 'beam', memberId, memberDescription: description, memberIndex, barType: 'stirrup', barDiaMm: stirrupDia,
      barShape: 'U-stirrup', barLengthMm: stirrupLength, numberOfBars: nearCount, floor: beam.floor,
      remarks: 'Stirrups in L/4 zones at both supports', });
    const midCount = Math.ceil((span / 2) / finitePositive(beam.stirrupSpacingMidSpanMm, 200));
    collector.add({ memberType: 'beam', memberId, memberDescription: description, memberIndex, barType: 'stirrup', barDiaMm: stirrupDia,
      barShape: 'U-stirrup', barLengthMm: stirrupLength, numberOfBars: midCount, floor: beam.floor,
      remarks: 'Stirrups in middle L/2 zone', });
  });
}

function scheduleColumns(result: StructuralDesignResult_Input, collector: ScheduleCollector, floorHeightMm: number): void {
  result.columns.forEach((column, index) => {
    const memberIndex = index + 1;
    const memberId = `C${memberIndex}`;
    const description = `${floorLabel(column.floor)} Column ${memberIndex} (${column.id})`;
    const beamDepth = medianBeamDepth(result.beams, column.floor);
    const columnHeight = Math.max(500, floorHeightMm - beamDepth);
    for (const bar of parseBars(column.mainBars)) {
      const lap = 50 * bar.diaMm;
      collector.add({ memberType: 'column', memberId, memberDescription: description, memberIndex, barType: 'main', barDiaMm: bar.diaMm,
        barShape: 'Straight', barLengthMm: columnHeight + lap, numberOfBars: bar.count, floor: column.floor,
        remarks: `Vertical main bars; 50d compression lap (${Math.round(lap)} mm) included`, });
    }
    const tieDia = finitePositive(column.tieDiaMm, 8);
    const tieLength = 2 * (column.widthMm - 2 * COLUMN_COVER) + 2 * (column.depthMm - 2 * COLUMN_COVER) + 2 * 10 * tieDia;
    collector.add({ memberType: 'column', memberId, memberDescription: description, memberIndex, barType: 'tie', barDiaMm: tieDia,
      barShape: 'Rectangular tie', barLengthMm: tieLength,
      numberOfBars: Math.ceil(columnHeight / finitePositive(column.tieSpacingMm, 150)) + 1, floor: column.floor,
      remarks: 'Closed lateral ties over clear column height; 10d hooks included', });
  });
}

function scheduleFoundations(result: StructuralDesignResult_Input, collector: ScheduleCollector): void {
  result.foundations.forEach((foundation, index) => {
    const memberIndex = index + 1;
    const memberId = `F${memberIndex}`;
    const description = `Foundation ${memberIndex} (${foundation.id}) below ${foundation.columnId}`;
    const hook = 9 * foundation.barDiaMm;
    const footingBarLength = foundation.footingSizeMm - 2 * FOOTING_COVER + 2 * hook;
    collector.add({ memberType: 'foundation', memberId, memberDescription: description, memberIndex, barType: 'main', barDiaMm: foundation.barDiaMm,
      barShape: 'L-bend', barLengthMm: footingBarLength, numberOfBars: foundation.barsEachWay, floor: 0,
      remarks: 'Bottom footing bars, X direction; 9d end bends/hooks included', });
    collector.add({ memberType: 'foundation', memberId, memberDescription: description, memberIndex, barType: 'distribution', barDiaMm: foundation.barDiaMm,
      barShape: 'L-bend', barLengthMm: footingBarLength, numberOfBars: foundation.barsEachWay, floor: 0,
      remarks: 'Bottom footing bars, Y direction; 9d end bends/hooks included', });

    const parentColumn = result.columns.find((column) => column.id === foundation.columnId);
    const starters = parentColumn ? parseBars(parentColumn.mainBars) : [{ count: 4, diaMm: 12 }];
    for (const bar of starters) {
      collector.add({ memberType: 'foundation', memberId, memberDescription: description, memberIndex, barType: 'main', barDiaMm: bar.diaMm,
        barShape: 'Straight', barLengthMm: foundation.footingDepthMm + 50 * bar.diaMm, numberOfBars: bar.count, floor: 0,
        remarks: 'Column starter/dowel bars; footing embedment plus 50d lap into column', });
    }
  });
}

function scheduleStaircases(result: StructuralDesignResult_Input, collector: ScheduleCollector, count: number): void {
  const stair = result.staircase;
  const inclinedLength = stair.effectiveSpanM * 1000;
  for (let stairIndex = 1; stairIndex <= count; stairIndex++) {
    const floor = Math.min(stairIndex - 1, Math.max(0, result.parameters.numFloors - 1));
    const memberId = `ST${stairIndex}`;
    const description = `${floorLabel(floor)} Dog-legged Stair Flight ${stairIndex}`;
    const mainLd = developmentLength(stair.mainBarDiaMm, result.parameters.steelGrade, result.parameters.concreteGrade);
    collector.add({ memberType: 'staircase', memberId, memberDescription: description, memberIndex: stairIndex, barType: 'main', barDiaMm: stair.mainBarDiaMm,
      barShape: 'Straight', barLengthMm: inclinedLength + 2 * mainLd,
      numberOfBars: Math.ceil(stair.flightWidthMm / finitePositive(stair.mainBarSpacingMm, 150)) + 1, floor,
      remarks: 'Waist-slab main bars along inclined flight; both-end development included', });
    collector.add({ memberType: 'staircase', memberId, memberDescription: description, memberIndex: stairIndex, barType: 'distribution', barDiaMm: stair.distBarDiaMm,
      barShape: 'Straight', barLengthMm: Math.max(100, stair.flightWidthMm - 2 * STAIR_COVER),
      numberOfBars: Math.ceil(inclinedLength / finitePositive(stair.distBarSpacingMm, 200)) + 1, floor,
      remarks: 'Waist-slab distribution bars transverse to inclined flight', });
  }
}

function scheduleLintels(result: StructuralDesignResult_Input, collector: ScheduleCollector, floors: number): void {
  // The structural engine supplies an aggregate lintel concrete allowance, not openings.
  // Convert it to equivalent 230 x 150 mm lintel run and split it into nominal 2 m runs.
  const allowanceM3 = Math.max(0, result.summary.concreteBreakdown.lintels);
  const lintelRunM = allowanceM3 > 0 ? allowanceM3 / (0.23 * 0.15) : 0;
  if (lintelRunM <= 0) return;
  const lintelCount = Math.max(1, Math.ceil(lintelRunM / 2));
  const runPerLintelMm = lintelRunM * 1000 / lintelCount;
  const lintelDepth = 150;
  const lintelWidth = 230;
  for (let index = 1; index <= lintelCount; index++) {
    const floor = Math.min(Math.floor((index - 1) * floors / lintelCount), Math.max(0, floors - 1));
    const memberId = `L${index}`;
    const description = `${floorLabel(floor)} Estimated Lintel ${index}`;
    const longitudinalLength = runPerLintelMm;
    collector.add({ memberType: 'lintel', memberId, memberDescription: description, memberIndex: index, barType: 'tension_bottom', barDiaMm: 10,
      barShape: 'Straight', barLengthMm: longitudinalLength, numberOfBars: 2, floor,
      remarks: 'Estimated standard lintel: two 10 mm bottom bars; includes nominal 300 mm end bearings in allowance', });
    collector.add({ memberType: 'lintel', memberId, memberDescription: description, memberIndex: index, barType: 'tension_top', barDiaMm: 10,
      barShape: 'Straight', barLengthMm: longitudinalLength, numberOfBars: 2, floor,
      remarks: 'Estimated standard lintel: two 10 mm top bars', });
    const stirrupDia = 8;
    const stirrupLength = 2 * (lintelWidth - 2 * LINTEL_COVER) + 2 * (lintelDepth - 2 * LINTEL_COVER) + 2 * 10 * stirrupDia;
    collector.add({ memberType: 'lintel', memberId, memberDescription: description, memberIndex: index, barType: 'stirrup', barDiaMm: stirrupDia,
      barShape: 'U-stirrup', barLengthMm: stirrupLength, numberOfBars: Math.ceil(longitudinalLength / 150) + 1, floor,
      remarks: 'Estimated lintel 8 mm stirrups at 150 mm c/c; 10d hooks included', });
  }
}

function buildMemberSummaries(entries: BBSEntry[]): BBSMemberSummary[] {
  const groups = new Map<string, BBSMemberSummary>();
  for (const entry of entries) {
    const key = `${entry.memberType}|${entry.memberId}|${entry.floor}`;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.totalWeightKg = round2(existing.totalWeightKg + entry.totalWeightKg);
    } else {
      groups.set(key, { memberId: entry.memberId, memberType: entry.memberType, memberDescription: entry.memberDescription,
        floor: entry.floor, entries: [entry], totalWeightKg: entry.totalWeightKg });
    }
  }
  return [...groups.values()];
}

function buildSummary(entries: BBSEntry[], floors: number): BBSSummary {
  const rawWeight = entries.reduce((sum, entry) => sum + entry.totalWeightKg, 0);
  const totalWeightKg = round2(rawWeight * WASTE_FACTOR);
  const byDiameter = new Map<number, { length: number; weight: number }>();
  const byMemberType = new Map<string, number>();
  const byFloor = new Map<number, number>();
  for (const entry of entries) {
    const diameter = byDiameter.get(entry.barDiaMm) ?? { length: 0, weight: 0 };
    diameter.length += entry.totalLengthM * WASTE_FACTOR;
    diameter.weight += entry.totalWeightKg * WASTE_FACTOR;
    byDiameter.set(entry.barDiaMm, diameter);
    byMemberType.set(entry.memberType, (byMemberType.get(entry.memberType) ?? 0) + entry.totalWeightKg * WASTE_FACTOR);
    byFloor.set(entry.floor, (byFloor.get(entry.floor) ?? 0) + entry.totalWeightKg * WASTE_FACTOR);
  }
  const byDiameterResult = [...byDiameter.entries()].sort(([a], [b]) => a - b).map(([diaMm, data]) => ({
    diaMm, totalLengthM: round3(data.length), totalWeightKg: round2(data.weight),
  }));
  const byMemberTypeResult = [...byMemberType.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, weightKg]) => ({
    type, weightKg: round2(weightKg), percentOfTotal: totalWeightKg ? round2(weightKg * 100 / totalWeightKg) : 0,
  }));
  const byFloorResult: { floor: number; floorLabel: string; weightKg: number; }[] = [];
  for (let floor = 0; floor < floors; floor++) {
    byFloorResult.push({ floor, floorLabel: floorLabel(floor), weightKg: round2(byFloor.get(floor) ?? 0) });
  }
  // Preserve entries (such as a one-storey stair) assigned outside a malformed floor count.
  for (const [floor, weightKg] of [...byFloor.entries()].sort(([a], [b]) => a - b)) {
    if (floor < 0 || floor >= floors) byFloorResult.push({ floor, floorLabel: floorLabel(floor), weightKg: round2(weightKg) });
  }
  return { totalWeightKg, totalWeightMT: round2(totalWeightKg / 1000), byDiameter: byDiameterResult,
    byMemberType: byMemberTypeResult, byFloor: byFloorResult };
}

/**
 * Generate a preliminary BBS from the structural-design engine result.
 * A 5% cutting-waste allowance is included in summary totals and group summaries;
 * individual BBSEntry weights remain net scheduled weights for fabrication traceability.
 */
export function generateBBS(structuralResult: StructuralDesignResult_Input, numFloors: number): BBSResult {
  if (!structuralResult || !structuralResult.parameters) throw new Error('A valid structural design result is required.');
  const floors = Math.max(1, Math.floor(finitePositive(numFloors, structuralResult.parameters.numFloors || 1)));
  const floorHeightMm = finitePositive(structuralResult.parameters.floorHeight, 3) * 1000;
  const collector = new ScheduleCollector();
  scheduleSlabs(structuralResult, collector);
  scheduleBeams(structuralResult, collector);
  scheduleColumns(structuralResult, collector, floorHeightMm);
  scheduleFoundations(structuralResult, collector);
  // The structural engine treats a dog-legged stair as two flights per storey connection.
  scheduleStaircases(structuralResult, collector, Math.max(1, floors - 1));
  scheduleLintels(structuralResult, collector, floors);

  const memberSummaries = buildMemberSummaries(collector.entries);
  const summary = buildSummary(collector.entries, floors);
  return {
    entries: collector.entries,
    memberSummaries,
    summary,
    totalSteelKg: summary.totalWeightKg,
    totalSteelMT: summary.totalWeightMT,
    concreteGrade: structuralResult.parameters.concreteGrade,
    steelGrade: structuralResult.parameters.steelGrade,
    disclaimer: BBS_DISCLAIMER,
  };
}
