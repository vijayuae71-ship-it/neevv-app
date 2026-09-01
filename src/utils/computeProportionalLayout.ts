/**
 * computeProportionalLayout.ts
 *
 * Standalone module that computes room size budgets BEFORE layout generation.
 * It calculates the max buildable carpet area from plot dimensions and NBC
 * coverage tiers, then distributes that carpet area to rooms by percentage,
 * enforcing NBC minimums and Vastu-preferred aspect ratios / directions.
 *
 * This module does NOT place rooms on a grid — it only produces target
 * dimensions ("budgets") that the layout engine (layoutGenerator.ts) can use
 * to size rooms consistently before/while placing them.
 */

/* ========================================================================
 * Types
 * ===================================================================== */

export type Facing = 'North' | 'South' | 'East' | 'West';

export type FloorType = 'ground' | 'upper' | 'duplex-upper' | 'terrace-floor';

export interface PlotInput {
  plotWidthM?: number;
  plotDepthM?: number;
  plotAreaSqm?: number;
}

export interface FloorRequest {
  floorType: FloorType;
  bedroomCount: number;
  toiletCount: number;
  includeKitchen?: boolean;
  includePooja?: boolean;
  includeStore?: boolean;
  includeFamilyLounge?: boolean;
}

export interface RoomAllocation {
  roomType: string;
  areaSqm: number;
  widthM: number;
  depthM: number;
  nbcMinSqm: number;
  hitNbcFloor: boolean;
  preferredDirection: string;
  aspectRatioRange: { min: number; max: number };
  vastuZone: string; // 'NE' | 'NW' | 'SE' | 'SW' | 'N' | 'S' | 'E' | 'W' | 'Center'
}

export interface FloorBudget {
  floorType: FloorType;
  carpetAreaSqm: number;
  staircaseAreaSqm: number;
  rooms: RoomAllocation[];
  warnings: string[];
  feasible: boolean;
}

export interface CoverageTier {
  label: string;
  maxCoveragePct: number;
}

export interface LayoutBudgetResult {
  plotAreaSqm: number;
  coverageTier: CoverageTier;
  maxFootprintSqm: number;
  floors: FloorBudget[];
  overallFeasible: boolean;
}

export interface FeasibilityCheckResult {
  feasible: boolean;
  plotAreaSqm: number;
  maxFootprintSqm: number;
  requiredMinSqm: number;
  availableCarpetSqm: number;
  maxSupportableBedrooms: number;
  warnings: string[];
  suggestedFloorRequests: FloorRequest[];
}

/* ========================================================================
 * Config
 * ===================================================================== */

export interface StaircaseConfig {
  minWidthM: number;
  minLandingDepthM: number;
  flightRunM: number;
  baseAreaSqm: number;
  largeHomeScalingThresholdSqm: number;
  largeHomeAreaSqm: number;
}

export interface FloorProfile {
  [roomKey: string]: number; // percentage share (0-100) of carpet area
}

export interface LayoutBudgetConfig {
  coverageTiers: Array<{ maxPlotAreaSqm: number | null; maxCoveragePct: number; label: string }>;
  externalWallDeductionPct: number;
  staircase: StaircaseConfig;
  floorProfiles: Record<FloorType, FloorProfile>;
  nbcMinimums: Record<string, number>;
  aspectRatios: Record<string, number>;
  vastuDirections: Record<string, string>;
  masterShareByCount: Record<number, number>;
  roundingIncrementM: number;
}

export const DEFAULT_CONFIG: LayoutBudgetConfig = {
  coverageTiers: [
    { maxPlotAreaSqm: 100, maxCoveragePct: 75, label: 'Up to 100 sqm' },
    { maxPlotAreaSqm: 200, maxCoveragePct: 65, label: 'Up to 200 sqm' },
    { maxPlotAreaSqm: 500, maxCoveragePct: 55, label: 'Up to 500 sqm' },
    { maxPlotAreaSqm: null, maxCoveragePct: 50, label: 'Above 500 sqm' },
  ],
  externalWallDeductionPct: 0.06,
  staircase: {
    minWidthM: 1.0,
    minLandingDepthM: 1.0,
    flightRunM: 3.0,
    baseAreaSqm: 3.6,
    largeHomeScalingThresholdSqm: 250,
    largeHomeAreaSqm: 4.5,
  },
  floorProfiles: {
    ground: {
      livingDining: 32,
      kitchen: 12,
      bedroom: 14,
      toilet: 9,
      pooja: 3,
      store: 3,
      wallsAndCirculation: 8,
    },
    upper: {
      bedroom: 50,
      familyLounge: 10,
      toilet: 12,
      store: 2,
      wallsAndCirculation: 8,
    },
    'duplex-upper': {
      bedroom: 40,
      familyLounge: 8,
      kitchen: 10,
      toilet: 12,
      store: 2,
      wallsAndCirculation: 8,
    },
    'terrace-floor': {
      bedroom: 55,
      toilet: 10,
      store: 3,
      wallsAndCirculation: 7,
    },
  },
  nbcMinimums: {
    masterBedroom: 11.15,
    bedroom: 9.5,
    kitchen: 5.5,
    toilet: 2.8,
    pooja: 2.0,
    store: 2.0,
    livingDining: 9.5,
    familyLounge: 7.0,
  },
  aspectRatios: {
    livingDining: 1.8,
    bedroom: 1.3,
    masterBedroom: 1.25,
    kitchen: 1.5,
    toilet: 1.4,
    pooja: 1.1,
    store: 1.3,
    familyLounge: 1.5,
  },
  vastuDirections: {
    livingDining: 'North / East',
    masterBedroom: 'South-West',
    bedroom: 'West / North-West',
    kitchen: 'South-East',
    toilet: 'North-West / West (avoid NE, SW)',
    pooja: 'North-East',
    store: 'North-West / South',
    familyLounge: 'North / East',
  },
  masterShareByCount: {
    1: 1.0,
    2: 0.58,
    3: 0.43,
    4: 0.34,
    5: 0.28,
  },
  roundingIncrementM: 0.05,
};

/* ========================================================================
 * Vastu zone mapping
 * ===================================================================== */

const VASTU_ZONE_MAP: Record<string, string> = {
  kitchen: 'SE',
  masterBedroom: 'SW',
  bedroom: 'NW',
  livingDining: 'NE',
  pooja: 'NE',
  store: 'NW',
  familyLounge: 'NE',
  toilet: 'NW',
};

export function getVastuZone(roomKey: string): string {
  return VASTU_ZONE_MAP[roomKey] || 'Center';
}

/* ========================================================================
 * Helper functions
 * ===================================================================== */

/** Resolve the plot area (sqm) from either an explicit area or width * depth. */
export function resolvePlotArea(plot: PlotInput): number {
  if (typeof plot.plotAreaSqm === 'number' && plot.plotAreaSqm > 0) {
    return plot.plotAreaSqm;
  }
  const w = plot.plotWidthM ?? 0;
  const d = plot.plotDepthM ?? 0;
  return w * d;
}

/** Find the matching NBC coverage tier for a given plot area. */
export function getCoverageTier(plotAreaSqm: number, config: LayoutBudgetConfig = DEFAULT_CONFIG): CoverageTier {
  for (const tier of config.coverageTiers) {
    if (tier.maxPlotAreaSqm === null || plotAreaSqm <= tier.maxPlotAreaSqm) {
      return { label: tier.label, maxCoveragePct: tier.maxCoveragePct };
    }
  }
  const last = config.coverageTiers[config.coverageTiers.length - 1];
  return { label: last.label, maxCoveragePct: last.maxCoveragePct };
}

/** Compute the staircase footprint (sqm) to deduct from a floor's carpet area. */
export function computeStaircaseFootprint(carpetArea: number, config: LayoutBudgetConfig = DEFAULT_CONFIG): number {
  const { largeHomeScalingThresholdSqm, largeHomeAreaSqm, baseAreaSqm } = config.staircase;
  return carpetArea >= largeHomeScalingThresholdSqm ? largeHomeAreaSqm : baseAreaSqm;
}

/** Round a value to the nearest increment (e.g. 0.05m). */
export function roundToIncrement(value: number, increment: number = DEFAULT_CONFIG.roundingIncrementM): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/**
 * Convert an area + aspect ratio (width:depth) into rounded width/depth dims.
 * depth = sqrt(area / ratio), width = area / depth.
 */
export function areaToDimensions(
  areaSqm: number,
  aspectRatio: number,
  config: LayoutBudgetConfig = DEFAULT_CONFIG
): { widthM: number; depthM: number } {
  const safeArea = Math.max(areaSqm, 0.01);
  const safeRatio = aspectRatio > 0 ? aspectRatio : 1;
  const depth = Math.sqrt(safeArea / safeRatio);
  const width = safeArea / depth;
  return {
    widthM: roundToIncrement(width, config.roundingIncrementM),
    depthM: roundToIncrement(depth, config.roundingIncrementM),
  };
}

/**
 * Nudge a room's base aspect ratio toward the overall plot's shape, so that
 * long/thin plots tend to produce slightly longer/thinner rooms and vice
 * versa. The influence is intentionally subtle (power 0.3) so NBC minimums
 * and Vastu preferences still dominate the final room proportions.
 */
export function computePlotAwareAspectRatio(
  baseRatio: number,
  plotWidthM: number,
  plotDepthM: number
): { ratio: number; min: number; max: number } {
  if (plotWidthM <= 0 || plotDepthM <= 0) return { ratio: baseRatio, min: baseRatio * 0.7, max: baseRatio * 1.4 };
  const plotAspect = plotWidthM / plotDepthM;
  // Gently pull room aspect toward plot shape (power 0.3 = subtle influence)
  const adjusted = baseRatio * Math.pow(plotAspect, 0.3);
  return {
    ratio: Math.max(0.5, Math.min(2.5, adjusted)),
    min: Math.max(0.5, adjusted * 0.7),
    max: Math.min(2.5, adjusted * 1.4),
  };
}

/**
 * Distribute a bedroom budget across `count` bedrooms.
 * The master bedroom gets a weighted share (masterShareByCount); the
 * remainder is split evenly across the other bedrooms. NBC minimums are
 * enforced per-bedroom (borrowing from the total budget where possible).
 */
export function distributeBedrooms(
  budget: number,
  count: number,
  config: LayoutBudgetConfig = DEFAULT_CONFIG
): { areas: number[]; warnings: string[] } {
  const warnings: string[] = [];
  if (count <= 0) return { areas: [], warnings };

  const masterShare = config.masterShareByCount[count] ?? config.masterShareByCount[5] ?? 1 / count;
  const masterArea = count === 1 ? budget : budget * masterShare;
  const remainingBudget = budget - masterArea;
  const otherCount = count - 1;
  const otherArea = otherCount > 0 ? remainingBudget / otherCount : 0;

  const areas: number[] = [masterArea, ...Array(otherCount).fill(otherArea)];

  // Enforce NBC minimums
  for (let i = 0; i < areas.length; i++) {
    const minArea = i === 0 ? config.nbcMinimums.masterBedroom : config.nbcMinimums.bedroom;
    if (areas[i] < minArea) {
      warnings.push(
        `${i === 0 ? 'Master bedroom' : `Bedroom ${i + 1}`} allocation (${areas[i].toFixed(
          2
        )} sqm) is below NBC minimum (${minArea} sqm); raised to minimum.`
      );
      areas[i] = minArea;
    }
  }

  return { areas, warnings };
}

/* ========================================================================
 * Floor allocation
 * ===================================================================== */

const DOMINANT_KEY_BY_FLOOR: Record<FloorType, string> = {
  ground: 'livingDining',
  upper: 'bedroom',
  'duplex-upper': 'bedroom',
  'terrace-floor': 'bedroom',
};

function resolveIncludeFlags(floorReq: FloorRequest): {
  includeKitchen: boolean;
  includePooja: boolean;
  includeStore: boolean;
  includeFamilyLounge: boolean;
} {
  const { floorType } = floorReq;
  const includeKitchen =
    floorReq.includeKitchen ?? (floorType === 'ground' || floorType === 'duplex-upper');
  const includePooja = floorReq.includePooja ?? floorType === 'ground';
  const includeStore = floorReq.includeStore ?? true;
  const includeFamilyLounge =
    floorReq.includeFamilyLounge ?? (floorType === 'upper' || floorType === 'duplex-upper');

  return { includeKitchen, includePooja, includeStore, includeFamilyLounge };
}

/**
 * Allocate a single floor's carpet area to individual rooms based on the
 * floor profile percentages, redistributing excluded rooms' shares to the
 * dominant room type, then enforcing NBC minimums and Vastu aspect ratios.
 */
export function allocateFloor(
  floorReq: FloorRequest,
  carpetArea: number,
  config: LayoutBudgetConfig = DEFAULT_CONFIG,
  plotWidthM: number = 0,
  plotDepthM: number = 0
): FloorBudget {
  const warnings: string[] = [];
  const staircaseAreaSqm = computeStaircaseFootprint(carpetArea, config);
  const netCarpet = Math.max(carpetArea - staircaseAreaSqm, 0);

  const profile = { ...config.floorProfiles[floorReq.floorType] };
  const { includeKitchen, includePooja, includeStore, includeFamilyLounge } = resolveIncludeFlags(floorReq);
  const dominantKey = DOMINANT_KEY_BY_FLOOR[floorReq.floorType];

  // Redistribute excluded rooms' percentage share to the dominant key
  const exclusions: Array<[string, boolean]> = [
    ['kitchen', includeKitchen],
    ['pooja', includePooja],
    ['store', includeStore],
    ['familyLounge', includeFamilyLounge],
  ];

  for (const [key, included] of exclusions) {
    if (!included && profile[key] !== undefined) {
      const pct = profile[key];
      delete profile[key];
      if (profile[dominantKey] !== undefined) {
        profile[dominantKey] += pct;
      } else {
        profile[dominantKey] = pct;
      }
    }
  }

  // Wall/circulation percentage is not allocated to a physical room — it's
  // simply excluded from the distributable total.
  const wallsPct = profile.wallsAndCirculation ?? 0;
  const distributablePct = Math.max(
    Object.entries(profile).reduce((sum, [k, v]) => (k === 'wallsAndCirculation' ? sum : sum + v), 0),
    0.01
  );

  // The area actually available to distribute among rooms (after wall %).
  const distributableArea = netCarpet * ((100 - wallsPct) / 100);

  const rooms: RoomAllocation[] = [];

  const pushRoom = (roomType: string, key: string, areaOverride?: number) => {
    if (profile[key] === undefined && areaOverride === undefined) return;
    const pctArea =
      areaOverride !== undefined
        ? areaOverride
        : distributableArea * (profile[key] / distributablePct);
    const nbcMinSqm = config.nbcMinimums[key] ?? 0;
    let areaSqm = pctArea;
    let hitNbcFloor = false;
    if (areaSqm < nbcMinSqm) {
      areaSqm = nbcMinSqm;
      hitNbcFloor = true;
      warnings.push(
        `${roomType} allocation (${pctArea.toFixed(2)} sqm) is below NBC minimum (${nbcMinSqm} sqm); raised to minimum.`
      );
    }
    const aspectRatio = config.aspectRatios[key] ?? 1.3;
    const plotAware = computePlotAwareAspectRatio(aspectRatio, plotWidthM, plotDepthM);
    const { widthM, depthM } = areaToDimensions(areaSqm, plotAware.ratio, config);
    rooms.push({
      roomType,
      areaSqm: roundToIncrement(areaSqm, 0.01),
      widthM,
      depthM,
      nbcMinSqm,
      hitNbcFloor,
      preferredDirection: config.vastuDirections[key] ?? 'Any',
      aspectRatioRange: { min: plotAware.min, max: plotAware.max },
      vastuZone: getVastuZone(key),
    });
  };

  // Living/Dining (ground floors, and wherever profile has it)
  if (profile.livingDining !== undefined) {
    pushRoom('Living & Dining', 'livingDining');
  }

  // Family lounge (upper floors)
  if (includeFamilyLounge && profile.familyLounge !== undefined) {
    pushRoom('Family Lounge', 'familyLounge');
  }

  // Kitchen
  if (includeKitchen && profile.kitchen !== undefined) {
    pushRoom('Kitchen', 'kitchen');
  }

  // Pooja
  if (includePooja && profile.pooja !== undefined) {
    pushRoom('Pooja Room', 'pooja');
  }

  // Store
  if (includeStore && profile.store !== undefined) {
    pushRoom('Store Room', 'store');
  }

  // Bedrooms — distribute the bedroom % budget across bedroomCount rooms
  if (profile.bedroom !== undefined && floorReq.bedroomCount > 0) {
    const bedroomBudget = distributableArea * (profile.bedroom / distributablePct);
    const { areas: bedroomAreas, warnings: bedroomWarnings } = distributeBedrooms(
      bedroomBudget,
      floorReq.bedroomCount,
      config
    );
    warnings.push(...bedroomWarnings);

    bedroomAreas.forEach((area, i) => {
      const isMaster = i === 0;
      const key = isMaster ? 'masterBedroom' : 'bedroom';
      const roomType = isMaster ? 'Master Bedroom' : `Bedroom ${i + 1}`;
      const nbcMinSqm = config.nbcMinimums[key] ?? 0;
      const hitNbcFloor = area <= nbcMinSqm + 0.001;
      const aspectRatio = config.aspectRatios[key] ?? 1.3;
      const plotAware = computePlotAwareAspectRatio(aspectRatio, plotWidthM, plotDepthM);
      const { widthM, depthM } = areaToDimensions(area, plotAware.ratio, config);
      rooms.push({
        roomType,
        areaSqm: roundToIncrement(area, 0.01),
        widthM,
        depthM,
        nbcMinSqm,
        hitNbcFloor,
        preferredDirection: config.vastuDirections[isMaster ? 'masterBedroom' : 'bedroom'] ?? 'Any',
        aspectRatioRange: { min: plotAware.min, max: plotAware.max },
        vastuZone: getVastuZone(key),
      });
    });
  }

  // Toilets — split the toilet % budget evenly across toiletCount
  if (profile.toilet !== undefined && floorReq.toiletCount > 0) {
    const toiletBudget = distributableArea * (profile.toilet / distributablePct);
    const perToilet = toiletBudget / floorReq.toiletCount;
    for (let i = 0; i < floorReq.toiletCount; i++) {
      pushRoom(`Toilet ${i + 1}`, 'toilet', perToilet);
    }
  }

  // Feasibility check: sum of NBC minimums vs distributable area, with 8% tolerance
  const requiredMin = rooms.reduce((sum, r) => sum + r.nbcMinSqm, 0);
  const tolerance = 0.08;
  const feasible = requiredMin <= distributableArea * (1 + tolerance);

  if (!feasible) {
    warnings.push(
      `Floor (${floorReq.floorType}) may not comfortably fit all rooms: NBC minimums require ${requiredMin.toFixed(
        2
      )} sqm but only ${distributableArea.toFixed(2)} sqm is distributable.`
    );
  }

  return {
    floorType: floorReq.floorType,
    carpetAreaSqm: roundToIncrement(carpetArea, 0.01),
    staircaseAreaSqm: roundToIncrement(staircaseAreaSqm, 0.01),
    rooms,
    warnings,
    feasible,
  };
}

/* ========================================================================
 * Main entry points
 * ===================================================================== */

/**
 * Compute the full proportional layout budget: plot coverage, max footprint,
 * and per-floor room allocations.
 */
export function computeProportionalLayout(
  plot: PlotInput,
  floorRequests: FloorRequest[],
  config: LayoutBudgetConfig = DEFAULT_CONFIG
): LayoutBudgetResult {
  const plotAreaSqm = resolvePlotArea(plot);
  const coverageTier = getCoverageTier(plotAreaSqm, config);
  const maxFootprintSqm = plotAreaSqm * (coverageTier.maxCoveragePct / 100);

  // FSI enforcement: FSI=1 means total built-up ≤ plot area
  // Per-floor footprint capped to plotArea * FSI / numFloors
  const FSI = 1.0;
  const numFloors = floorRequests.length || 1;
  const fsiMaxPerFloor = plotAreaSqm * FSI / numFloors;
  const effectiveFootprint = Math.min(maxFootprintSqm, fsiMaxPerFloor);

  // Deduct external wall thickness allowance to get usable carpet area per floor.
  const carpetPerFloor = effectiveFootprint * (1 - config.externalWallDeductionPct);

  const plotWidthM = plot.plotWidthM ?? 0;
  const plotDepthM = plot.plotDepthM ?? 0;

  const floors: FloorBudget[] = floorRequests.map((floorReq) =>
    allocateFloor(floorReq, carpetPerFloor, config, plotWidthM, plotDepthM)
  );

  const overallFeasible = floors.every((f) => f.feasible);

  return {
    plotAreaSqm: roundToIncrement(plotAreaSqm, 0.01),
    coverageTier,
    maxFootprintSqm: roundToIncrement(maxFootprintSqm, 0.01),
    floors,
    overallFeasible,
  };
}

/**
 * Quick pre-generation feasibility check: sums NBC minimums for the
 * requested program against the available carpet area, and estimates the
 * maximum number of bedrooms the plot could reasonably support.
 */
export function checkPlotFeasibility(
  plot: PlotInput,
  floorRequests: FloorRequest[],
  config: LayoutBudgetConfig = DEFAULT_CONFIG
): FeasibilityCheckResult {
  const plotAreaSqm = resolvePlotArea(plot);
  const coverageTier = getCoverageTier(plotAreaSqm, config);
  const maxFootprintSqm = plotAreaSqm * (coverageTier.maxCoveragePct / 100);

  // FSI enforcement: FSI=1 means total built-up ≤ plot area
  // Per-floor footprint capped to plotArea * FSI / numFloors
  const FSI = 1.0;
  const numFloors = floorRequests.length || 1;
  const fsiMaxPerFloor = plotAreaSqm * FSI / numFloors;
  const effectiveFootprint = Math.min(maxFootprintSqm, fsiMaxPerFloor);
  const carpetPerFloor = effectiveFootprint * (1 - config.externalWallDeductionPct);

  const warnings: string[] = [];
  let requiredMinSqm = 0;
  let availableCarpetSqm = 0;

  for (const floorReq of floorRequests) {
    const staircaseArea = computeStaircaseFootprint(carpetPerFloor, config);
    const netCarpet = Math.max(carpetPerFloor - staircaseArea, 0);
    availableCarpetSqm += netCarpet;

    const { includeKitchen, includePooja, includeStore, includeFamilyLounge } = resolveIncludeFlags(floorReq);

    let floorMin = 0;
    if (floorReq.floorType === 'ground' || DOMINANT_KEY_BY_FLOOR[floorReq.floorType] === 'livingDining') {
      floorMin += config.nbcMinimums.livingDining;
    }
    if (includeKitchen) floorMin += config.nbcMinimums.kitchen;
    if (includePooja) floorMin += config.nbcMinimums.pooja;
    if (includeStore) floorMin += config.nbcMinimums.store;
    if (includeFamilyLounge) floorMin += config.nbcMinimums.familyLounge;

    for (let i = 0; i < floorReq.bedroomCount; i++) {
      floorMin += i === 0 ? config.nbcMinimums.masterBedroom : config.nbcMinimums.bedroom;
    }
    floorMin += floorReq.toiletCount * config.nbcMinimums.toilet;

    requiredMinSqm += floorMin;
  }

  const feasible = requiredMinSqm <= availableCarpetSqm * 1.08;
  if (!feasible) {
    warnings.push(
      `Requested program requires at least ${requiredMinSqm.toFixed(
        2
      )} sqm of carpet area (NBC minimums), but only ${availableCarpetSqm.toFixed(
        2
      )} sqm is available across ${floorRequests.length} floor(s).`
    );
  }

  // Estimate max supportable bedrooms (rough): assume 1 master + N others,
  // reserving a baseline for living/kitchen/toilets on the ground floor.
  const baselineNonBedroom =
    config.nbcMinimums.livingDining +
    config.nbcMinimums.kitchen +
    config.nbcMinimums.toilet * 2;
  const bedroomBudget = Math.max(availableCarpetSqm - baselineNonBedroom, 0);
  let maxSupportableBedrooms = 0;
  let remaining = bedroomBudget;
  const bedroomSizes = [config.nbcMinimums.masterBedroom, ...Array(20).fill(config.nbcMinimums.bedroom)];
  for (const size of bedroomSizes) {
    if (remaining >= size) {
      remaining -= size;
      maxSupportableBedrooms++;
    } else {
      break;
    }
  }

  // Auto-downgrade: if the requested program isn't feasible, suggest a
  // reduced-bedroom program that fits within the available carpet area.
  const suggestedFloorRequests: FloorRequest[] = floorRequests.map((fr) => ({ ...fr }));
  if (!feasible) {
    // Reduce bedrooms starting from upper floors, then ground
    let totalBedrooms = suggestedFloorRequests.reduce((s, fr) => s + fr.bedroomCount, 0);
    while (totalBedrooms > 1) {
      // Find floor with most bedrooms and reduce by 1
      let maxIdx = 0;
      for (let i = 1; i < suggestedFloorRequests.length; i++) {
        if (suggestedFloorRequests[i].bedroomCount > suggestedFloorRequests[maxIdx].bedroomCount) maxIdx = i;
      }
      if (suggestedFloorRequests[maxIdx].bedroomCount <= 1) break;
      suggestedFloorRequests[maxIdx].bedroomCount--;
      suggestedFloorRequests[maxIdx].toiletCount = Math.min(
        suggestedFloorRequests[maxIdx].bedroomCount,
        suggestedFloorRequests[maxIdx].toiletCount
      );
      totalBedrooms--;

      // Recheck feasibility with reduced program
      let newRequired = 0;
      for (const fr of suggestedFloorRequests) {
        let floorMin = 0;
        if (fr.floorType === 'ground') floorMin += config.nbcMinimums.livingDining;
        if (fr.includeKitchen ?? (fr.floorType === 'ground' || fr.floorType === 'duplex-upper'))
          floorMin += config.nbcMinimums.kitchen;
        if (fr.includePooja ?? fr.floorType === 'ground') floorMin += config.nbcMinimums.pooja;
        for (let i = 0; i < fr.bedroomCount; i++) {
          floorMin += i === 0 ? config.nbcMinimums.masterBedroom : config.nbcMinimums.bedroom;
        }
        floorMin += Math.min(fr.bedroomCount, 2) * config.nbcMinimums.toilet;
        newRequired += floorMin;
      }
      if (newRequired <= availableCarpetSqm * 1.08) break;
    }
    warnings.push(
      `Auto-adjusted to ${suggestedFloorRequests.reduce((s, fr) => s + fr.bedroomCount, 0)} total bedrooms to fit your plot.`
    );
  }

  return {
    feasible,
    plotAreaSqm: roundToIncrement(plotAreaSqm, 0.01),
    maxFootprintSqm: roundToIncrement(maxFootprintSqm, 0.01),
    requiredMinSqm: roundToIncrement(requiredMinSqm, 0.01),
    availableCarpetSqm: roundToIncrement(availableCarpetSqm, 0.01),
    maxSupportableBedrooms,
    warnings,
    suggestedFloorRequests,
  };
}
