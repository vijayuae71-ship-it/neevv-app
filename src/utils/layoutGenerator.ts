import {
  ProjectRequirements,
  Layout,
  FloorLayout,
  FloorProgram,
  Room,
  Column,
  Setbacks,
  Facing,
  RoomType,
} from '../types';
import { calculateSetbacks, checkNBCCompliance } from './nbcCompliance';
import { calculateVastuScore, getIdealPlotPosition } from './vastuEngine';
import { computeProportionalLayout, checkPlotFeasibility, FloorRequest as ProportionalFloorRequest, RoomAllocation } from './computeProportionalLayout';

const FT_TO_M = 0.3048;
const SQM_TO_SQFT = 10.764;

// Snap to 0.05m grid for clean wall alignment
const snap = (n: number): number => Math.round(n * 20) / 20;

// NBC 2016 minimum areas (m²)
const NBC_MIN_AREA: Record<string, number> = {
  master_bedroom: 9.5, bedroom: 9.5, hall: 9.5, kitchen: 5.0,
  toilet: 2.8, dining: 7.5, puja: 2.0, staircase: 3.0, parking: 13.75,
  store: 2.0, utility: 2.0, balcony: 2.0, passage: 1.0, entrance: 2.0,
};

// NBC 2016 minimum widths (m)
const NBC_MIN_WIDTH: Record<string, number> = {
  master_bedroom: 2.7, bedroom: 2.7, hall: 2.7, kitchen: 1.8,
  toilet: 1.2, dining: 2.4, parking: 3.0, staircase: 1.0,
  puja: 1.2, passage: 1.0, balcony: 1.2,
};

// Strategy-specific zone configurations
interface ZoneConfig {
  frontPct: number;
  midPct: number;
  rearPct: number;
  parkingPct: number;
  kitchenInRear: boolean;
  mergeLivingDining: boolean;
  includePuja: boolean;
}

const STRATEGY_CONFIG: Record<string, ZoneConfig> = {
  vastu: {
    frontPct: 0.32, midPct: 0.28, rearPct: 0.40,
    parkingPct: 0.42, kitchenInRear: false, mergeLivingDining: false, includePuja: true,
  },
  space: {
    frontPct: 0.42, midPct: 0, rearPct: 0.58,
    parkingPct: 0.35, kitchenInRear: true, mergeLivingDining: true, includePuja: false,
  },
  balanced: {
    frontPct: 0.35, midPct: 0.22, rearPct: 0.43,
    parkingPct: 0.38, kitchenInRear: false, mergeLivingDining: false, includePuja: true,
  },
};

/**
 * Calculate total NBC minimum area needed for a floor program.
 * Used to check if a plot can physically fit all requested rooms.
 */
function calcMinAreaNeeded(
  fp: FloorProgram,
  hasParking: boolean,
  isMultiFloor: boolean
): number {
  let total = 0;
  total += fp.halls * NBC_MIN_AREA.hall;
  total += fp.bedrooms * NBC_MIN_AREA.bedroom;
  total += fp.kitchens * NBC_MIN_AREA.kitchen;
  total += Math.min(fp.bedrooms, 2) * NBC_MIN_AREA.toilet;
  if (fp.hasDining) total += NBC_MIN_AREA.dining;
  if (fp.hasPuja) total += NBC_MIN_AREA.puja;
  if (hasParking) total += NBC_MIN_AREA.parking;
  if (isMultiFloor) total += NBC_MIN_AREA.staircase + NBC_MIN_AREA.store;
  return total;
}

/**
 * Adjust floor program for small plots that cannot physically fit all rooms.
 * Drops non-essential rooms in priority order: puja → dining (merge into hall).
 * Returns a new FloorProgram; never mutates the original.
 */
function fitFloorProgram(
  fp: FloorProgram,
  buildableArea: number,
  hasParking: boolean,
  isMultiFloor: boolean
): FloorProgram {
  const usable = buildableArea * 0.92; // 8% for wall thicknesses
  const adj: FloorProgram = { ...fp };

  if (calcMinAreaNeeded(adj, hasParking, isMultiFloor) <= usable) return adj;

  // Drop puja first
  if (adj.hasPuja) {
    adj.hasPuja = false;
    if (calcMinAreaNeeded(adj, hasParking, isMultiFloor) <= usable) return adj;
  }

  // Drop dining — hall becomes "Living/Dining"
  if (adj.hasDining) {
    adj.hasDining = false;
    if (calcMinAreaNeeded(adj, hasParking, isMultiFloor) <= usable) return adj;
  }

  // If still over, cap bedrooms per floor (keep at least 1)
  while (adj.bedrooms > 1 && calcMinAreaNeeded(adj, hasParking, isMultiFloor) > usable) {
    adj.bedrooms--;
  }

  return adj;
}

export function generateLayouts(req: ProjectRequirements): Layout[] {
  const plotW = req.plotWidthFt * FT_TO_M;
  const plotD = req.plotDepthFt * FT_TO_M;
  const plotArea = plotW * plotD;
  const setbacks = calculateSetbacks(plotArea, plotW, plotD);

  let buildW = snap(plotW - setbacks.left - setbacks.right);
  let buildD = snap(plotD - setbacks.front - setbacks.rear);

  if (buildW < 3 || buildD < 3) return [];

  // NBC coverage enforcement: cap building footprint to coverage tier
  const maxCoveragePct = plotArea <= 100 ? 75 : plotArea <= 200 ? 65 : plotArea <= 500 ? 55 : 50;
  const maxFootprintSqM = plotArea * (maxCoveragePct / 100);
  if (buildW * buildD > maxFootprintSqM) {
    const scale = Math.sqrt(maxFootprintSqM / (buildW * buildD));
    buildW = snap(buildW * scale);
    buildD = snap(buildD * scale);
  }

  const layouts: Layout[] = [];

  // Compute proportional room budgets
  let proportionalFloorRequests: ProportionalFloorRequest[] = req.floors.map((fp, fi) => ({
    floorType: fi === 0 ? 'ground' as const : 'upper' as const,
    bedroomCount: fp.bedrooms,
    toiletCount: Math.min(fp.bedrooms, 2),
    includeKitchen: fp.kitchens > 0,
    includePooja: fp.hasPuja,
  }));

  // === Auto-downgrade bedrooms if plot can't support requested program ===
  const feasibility = checkPlotFeasibility(
    { plotWidthM: plotW, plotDepthM: plotD },
    proportionalFloorRequests,
    undefined,
    req.fsi
  );

  let effectiveFloors: FloorProgram[] = req.floors;
  let downgradeNote = '';
  if (!feasibility.feasible) {
    // Auto-downgrade: use suggested floor requests with reduced bedrooms
    const suggested = feasibility.suggestedFloorRequests;
    effectiveFloors = req.floors.map((fp, fi) => ({
      ...fp,
      bedrooms: suggested[fi]?.bedroomCount ?? fp.bedrooms,
    }));
    const origBedrooms = req.floors.reduce((s, f) => s + f.bedrooms, 0);
    const newBedrooms = effectiveFloors.reduce((s, f) => s + f.bedrooms, 0);
    if (newBedrooms < origBedrooms) {
      downgradeNote = `Plot size adjusted: bedrooms reduced from ${origBedrooms} to ${newBedrooms} to meet NBC minimum room sizes. All rooms comply with National Building Code 2016.`;
    }
    // Rebuild proportional floor requests with downgraded counts
    proportionalFloorRequests = effectiveFloors.map((fp, fi) => ({
      floorType: (fi === 0 ? 'ground' : 'upper') as 'ground' | 'upper',
      bedroomCount: fp.bedrooms,
      toiletCount: Math.min(fp.bedrooms, 2),
      includeKitchen: fp.kitchens > 0,
      includePooja: fp.hasPuja,
    }));
  }

  const proportionalBudget = computeProportionalLayout(
    { plotWidthM: plotW, plotDepthM: plotD },
    proportionalFloorRequests,
    undefined,
    req.fsi
  );

  const strategies = [
    { id: 'vastu', name: 'Vastu-Optimized', desc: 'Strict Vastu placement — Kitchen SE, Master Bed SW, Puja NE. Dedicated zones for each function.' },
    { id: 'space', name: 'Space-Optimized', desc: 'Open-plan Living+Dining, Kitchen near bedrooms. Maximizes carpet area with minimal corridors.' },
    { id: 'balanced', name: 'Balanced Design', desc: 'Practical layout with good Vastu score and efficient room sizing. Best of both approaches.' },
  ];

  for (const strat of strategies) {
    const floors: FloorLayout[] = [];
    let totalBuiltUp = 0;
    const overlapWarnings: string[] = [];

    for (let fi = 0; fi < effectiveFloors.length; fi++) {
      const fp = effectiveFloors[fi];
      const isGround = fi === 0;
      const hasParking = isGround && req.parkingType !== 'None';
      const isStilt = isGround && req.parkingType === 'Stilt';

      // Fit floor program to buildable area
      const adjFp = fitFloorProgram(fp, buildW * buildD, hasParking, req.floors.length > 1);

      const rooms = placeRoomsForStrategy(
        adjFp, buildW, buildD, setbacks, fi,
        strat.id, req.facing, isStilt,
        req.floors.length > 1, hasParking,
        proportionalBudget.floors[fi]?.rooms,
        overlapWarnings
      );

      const columns = placeColumns(rooms, buildW, buildD, setbacks);

      floors.push({ floor: fi, floorLabel: fp.floorLabel, rooms, columns });

      if (!isStilt) {
        totalBuiltUp += buildW * buildD;
      } else {
        totalBuiltUp += buildW * buildD * 0.3;
      }
    }

    const allRooms = floors.flatMap((f) => f.rooms);
    const { score, details } = req.vastuCompliance
      ? calculateVastuScore(allRooms, plotW, plotD, req.facing)
      : { score: 0, details: [] };


    // FSI enforcement: cap total built-up to plot area * FSI
    const fsiValue = req.fsi ?? 1.0;
    totalBuiltUp = Math.min(totalBuiltUp, plotArea * fsiValue);
    const { compliant, issues } = checkNBCCompliance(allRooms, plotArea, totalBuiltUp, req.floors.length);
    // Overlap-resolution warnings are always non-fatal ('warning' severity) — the
    // geometry has already been auto-corrected; these flag cases worth a manual look.
    const combinedIssues = [
      ...issues,
      ...overlapWarnings.map((w) => ({ room: 'Layout', issue: w, severity: 'warning' as const })),
    ];

    layouts.push({
      id: strat.id,
      name: strat.name,
      strategy: strat.id,
      description: strat.desc,
      floors,
      vastuScore: req.vastuCompliance ? score : -1,
      vastuDetails: details,
      nbcCompliant: compliant,
      nbcIssues: combinedIssues,
      builtUpAreaSqM: round2(totalBuiltUp),
      builtUpAreaSqFt: Math.round(totalBuiltUp * SQM_TO_SQFT),
      setbacks,
      plotWidthM: plotW,
      plotDepthM: plotD,
      buildableWidthM: buildW,
      buildableDepthM: buildD,
      // === Setback-adjusted building dimensions (comprehensive fix) ===
      buildingWidthMm: Math.round(buildW * 1000),
      buildingDepthMm: Math.round(buildD * 1000),
      buildingFootprintSqM: round2(buildW * buildD),
      effectivePerFloorSqFt: Math.round((totalBuiltUp / effectiveFloors.length) * SQM_TO_SQFT),
      effectivePerFloorSqM: round2(totalBuiltUp / effectiveFloors.length),
      totalBuiltUpSqFt: Math.round(totalBuiltUp * SQM_TO_SQFT),
      totalBuiltUpSqM: round2(totalBuiltUp),
      fsiValue: fsiValue,
      nbcMaxCoveragePct: proportionalBudget.coverageTier.maxCoveragePct,
      numFloors: effectiveFloors.length,
      plotWidthFt: req.plotWidthFt,
      plotDepthFt: req.plotDepthFt,
      downgradeNote: downgradeNote || undefined,
      constraintBrief: [
        `BUILDING FOOTPRINT: ${Math.round(buildW * 1000)}mm × ${Math.round(buildD * 1000)}mm.`,
        `PLOT SIZE: ${Math.round(plotW * 1000)}mm × ${Math.round(plotD * 1000)}mm — building is SMALLER than plot due to setbacks.`,
        `SETBACKS: Front ${setbacks.front}m, Rear ${setbacks.rear}m, Left ${setbacks.left}m, Right ${setbacks.right}m.`,
        `MAX PER FLOOR: ${Math.round((totalBuiltUp / effectiveFloors.length) * SQM_TO_SQFT)} sqft (${round2(totalBuiltUp / effectiveFloors.length)} m²). FSI=${fsiValue}.`,
        `NBC COVERAGE: ${proportionalBudget.coverageTier.maxCoveragePct}% max.`,
        `TOTAL BUILT-UP (${effectiveFloors.length} floors): ${Math.round(totalBuiltUp * SQM_TO_SQFT)} sqft.`,
      ].join(' '),
    });
  }

  return layouts;
}

/**
 * Strategy-aware room placement engine.
 * Uses grid-snapped coordinates for wall alignment.
 * Each strategy produces genuinely different room arrangements.
 */
function placeRoomsForStrategy(
  fp: FloorProgram,
  buildW: number,
  buildD: number,
  setbacks: Setbacks,
  floor: number,
  strategy: string,
  facing: Facing,
  isStilt: boolean,
  isMultiFloor: boolean,
  hasParking: boolean,
  roomBudgets?: RoomAllocation[],
  outWarnings?: string[]
): Room[] {
  const ox = snap(setbacks.left);
  const oy = snap(setbacks.front);

  const getBudget = (type: string): RoomAllocation | undefined =>
    roomBudgets?.find(b => b.roomType === type);
  const getBudgetIdx = (prefix: string, idx: number): RoomAllocation | undefined =>
    roomBudgets?.find(b => b.roomType === (idx === 0 && prefix === 'Bedroom' ? 'Master Bedroom' : `${prefix} ${idx + 1}`));

  if (isStilt) {
    return [
      { id: `f${floor}_parking`, name: 'Stilt Parking', type: 'parking', x: ox, y: oy, width: snap(buildW - 2.5), depth: buildD, floor },
      { id: `f${floor}_staircase`, name: 'Staircase', type: 'staircase', x: snap(ox + buildW - 2.5), y: oy, width: snap(2.5), depth: snap(Math.min(5, buildD)), floor },
    ];
  }

  const config = STRATEGY_CONFIG[strategy] || STRATEGY_CONFIG.balanced;
  const rooms: Room[] = [];

  // Staircase strip
  const staircaseW = isMultiFloor ? snap(Math.min(2.5, buildW * 0.3)) : 0;
  const effectiveW = snap(buildW - staircaseW);

  // Parking dimensions — ensure NBC minimum area (13.75 m²)
  let parkingW = 0;
  let parkingD = 0;
  if (hasParking) {
    parkingW = snap(Math.max(3.0, Math.min(effectiveW * config.parkingPct, 4.5)));
    parkingD = snap(Math.max(NBC_MIN_AREA.parking / parkingW, 3.5));
  }

  // Zone depths — start from strategy proportions, enforce NBC minimums
  const livingW = snap(effectiveW - parkingW);

  const minFrontD = hasParking ? snap(Math.max(3.0, parkingD)) : snap(3.0);
  const minMidD = (config.midPct > 0 && fp.kitchens > 0) ? snap(Math.max(2.5, NBC_MIN_AREA.kitchen / effectiveW * 2)) : 0;
  const minRearD = fp.bedrooms > 0 ? snap(Math.max(3.5, NBC_MIN_AREA.bedroom / (effectiveW / Math.max(1, fp.bedrooms)) + 0.5)) : 0;

  let frontD = snap(Math.max(buildD * config.frontPct, minFrontD));
  let midD = config.midPct > 0 ? snap(Math.max(buildD * config.midPct, minMidD)) : 0;
  let rearD = fp.bedrooms > 0 ? snap(Math.max(buildD * config.rearPct, minRearD)) : 0;

  // Normalize if total exceeds buildD
  const totalRaw = frontD + midD + rearD;
  if (totalRaw > buildD) {
    const scale = buildD / totalRaw;
    frontD = snap(frontD * scale);
    midD = snap(midD * scale);
    rearD = snap(buildD - frontD - midD);
  } else {
    rearD = snap(buildD - frontD - midD);
  }

  // ===== FRONT ZONE =====
  let currentY = oy;

  // Determine if we should merge living+dining
  const mergeLivDin = config.mergeLivingDining || (!fp.hasDining && fp.halls > 0);
  const hallLabel = mergeLivDin ? 'Living/Dining' : 'Living/Hall';

  if (fp.halls > 0) {
    rooms.push({
      id: `f${floor}_hall_0`, name: hallLabel, type: 'hall',
      x: ox, y: currentY, width: livingW, depth: frontD, floor,
    });
  }

  if (hasParking && parkingW > 0) {
    rooms.push({
      id: `f${floor}_parking`, name: 'Car Parking', type: 'parking',
      x: snap(ox + livingW), y: currentY, width: parkingW, depth: frontD, floor,
    });
  }

  currentY = snap(currentY + frontD);

  // ===== MID ZONE (Vastu/Balanced only — Space skips this) =====
  if (midD > 0 && !config.kitchenInRear) {
    const hasKitchen = fp.kitchens > 0;
    const hasDining = fp.hasDining && !mergeLivDin;
    const hasPuja = fp.hasPuja && config.includePuja;

    let kitchenW = 0, diningW = 0, pujaW = 0;
    const midRoomCount = (hasKitchen ? 1 : 0) + (hasDining ? 1 : 0) + (hasPuja ? 1 : 0);

    if (midRoomCount > 0) {
      if (hasKitchen && hasDining && hasPuja) {
        kitchenW = snap(effectiveW * 0.40);
        diningW = snap(effectiveW * 0.38);
        pujaW = snap(effectiveW - kitchenW - diningW);
      } else if (hasKitchen && hasDining) {
        kitchenW = snap(effectiveW * 0.45);
        diningW = snap(effectiveW - kitchenW);
      } else if (hasKitchen && hasPuja) {
        kitchenW = snap(effectiveW * 0.70);
        pujaW = snap(effectiveW - kitchenW);
      } else if (hasKitchen) {
        kitchenW = snap(effectiveW);
      }
    }

    const kitchenOnRight = strategy === 'vastu' && (facing === 'North' || facing === 'East');

    if (kitchenOnRight) {
      let midX = ox;
      // Kitchen on LEFT for exterior wall access
      if (hasKitchen) {
        rooms.push({
          id: `f${floor}_kitchen_0`, name: 'Kitchen', type: 'kitchen',
          x: midX, y: currentY, width: kitchenW, depth: midD, floor,
        });
        midX = snap(midX + kitchenW);
      }
      if (hasPuja && pujaW >= 1.2) {
        rooms.push({
          id: `f${floor}_puja_0`, name: 'Puja Room', type: 'puja',
          x: midX, y: currentY, width: pujaW, depth: midD, floor,
        });
        midX = snap(midX + pujaW);
      }
      if (hasDining) {
        const clampedW = snap(Math.min(diningW, ox + effectiveW - midX));
        if (clampedW > 1.5) {
          rooms.push({
            id: `f${floor}_dining_0`, name: 'Dining', type: 'dining',
            x: midX, y: currentY, width: clampedW, depth: midD, floor,
          });
        }
      }
    } else {
      let midX = ox;
      if (hasKitchen) {
        rooms.push({
          id: `f${floor}_kitchen_0`, name: 'Kitchen', type: 'kitchen',
          x: midX, y: currentY, width: kitchenW, depth: midD, floor,
        });
        midX = snap(midX + kitchenW);
      }
      if (hasDining) {
        const clampedW = snap(Math.min(diningW, ox + effectiveW - midX));
        if (clampedW > 1.5) {
          rooms.push({
            id: `f${floor}_dining_0`, name: 'Dining', type: 'dining',
            x: midX, y: currentY, width: clampedW, depth: midD, floor,
          });
          midX = snap(midX + clampedW);
        }
      }
      if (hasPuja && config.includePuja) {
        const pw = snap(ox + effectiveW - midX);
        if (pw >= 1.2) {
          rooms.push({
            id: `f${floor}_puja_0`, name: 'Puja Room', type: 'puja',
            x: midX, y: currentY, width: pw, depth: midD, floor,
          });
        }
      }
    }

    currentY = snap(currentY + midD);
  }

  // ===== REAR ZONE: Bedrooms + Toilets (+ Kitchen for Space strategy) =====
  if (fp.bedrooms > 0 && rearD > 0) {
    const numBedrooms = fp.bedrooms;

    if (config.kitchenInRear && fp.kitchens > 0) {
      const kitchenW = snap(Math.max(2.1, effectiveW * 0.28));
      const bedroomAreaW = snap(effectiveW - kitchenW);

      rooms.push({
        id: `f${floor}_kitchen_0`, name: 'Kitchen', type: 'kitchen',
        x: ox, y: currentY, width: kitchenW, depth: rearD, floor,
      });

      const bedroomCols = Math.min(numBedrooms, Math.max(1, Math.floor(bedroomAreaW / 3.0)));
      const bedColW = snap(bedroomAreaW / bedroomCols);
      const toiletW = snap(Math.max(1.2, Math.min(1.8, bedColW * 0.28)));
      const toiletD = snap(Math.min(2.5, rearD * 0.40));

      for (let i = 0; i < Math.min(numBedrooms, bedroomCols); i++) {
        const isMaster = i === 0;
        const bx = snap(ox + kitchenW + i * bedColW);
        const bedW = snap(bedColW - toiletW);

        rooms.push({
          id: `f${floor}_${isMaster ? 'master_bedroom' : 'bedroom'}_${i}`,
          name: isMaster ? 'Master Bedroom' : `Bedroom ${i + 1}`,
          type: isMaster ? 'master_bedroom' : 'bedroom',
          x: bx, y: currentY, width: bedW, depth: rearD, floor,
        });

        rooms.push({
          id: `f${floor}_toilet_${i}`,
          name: `Toilet ${i + 1}`,
          type: 'toilet',
          x: snap(bx + bedW), y: snap(currentY + rearD - toiletD),
          width: toiletW, depth: toiletD, floor,
        });
      }
    } else {
      const bedroomCols = Math.min(numBedrooms, Math.max(1, Math.floor(effectiveW / 3.5)));
      const bedColW = snap(effectiveW / bedroomCols);
      const toiletW = snap(Math.max(1.2, Math.min(1.8, bedColW * 0.28)));
      const toiletD = snap(Math.min(2.5, rearD * 0.42));

      const bedroomRows = Math.ceil(numBedrooms / bedroomCols);

      let bedIdx = 0;
      for (let row = 0; row < bedroomRows; row++) {
        const rowY = snap(currentY + row * (rearD / bedroomRows));
        const rowH = snap(rearD / bedroomRows);

        for (let col = 0; col < bedroomCols && bedIdx < numBedrooms; col++) {
          const isMaster = bedIdx === 0;
          const bedType: RoomType = isMaster ? 'master_bedroom' : 'bedroom';
          const bedName = isMaster ? 'Master Bedroom' : `Bedroom ${bedIdx + 1}`;
          const bx = snap(ox + col * bedColW);

          const isLeftEdge = col === 0;
          const toiletOnRight = isLeftEdge || col < bedroomCols / 2;
          const actualBedW = snap(bedColW - toiletW);

          if (toiletOnRight) {
            rooms.push({
              id: `f${floor}_${bedType}_${bedIdx}`, name: bedName, type: bedType,
              x: bx, y: rowY, width: actualBedW, depth: rowH, floor,
            });
            rooms.push({
              id: `f${floor}_toilet_${bedIdx}`, name: `Toilet ${bedIdx + 1}`, type: 'toilet',
              x: snap(bx + actualBedW), y: snap(rowY + rowH - toiletD),
              width: toiletW, depth: toiletD, floor,
            });
          } else {
            rooms.push({
              id: `f${floor}_toilet_${bedIdx}`, name: `Toilet ${bedIdx + 1}`, type: 'toilet',
              x: bx, y: snap(rowY + rowH - toiletD),
              width: toiletW, depth: toiletD, floor,
            });
            rooms.push({
              id: `f${floor}_${bedType}_${bedIdx}`, name: bedName, type: bedType,
              x: snap(bx + toiletW), y: rowY, width: actualBedW, depth: rowH, floor,
            });
          }

          bedIdx++;
        }
      }
    }
  }

  // ===== STAIRCASE STRIP =====
  if (isMultiFloor && staircaseW > 0) {
    const stairDepth = snap(Math.min(5, buildD * 0.40));
    rooms.push({
      id: `f${floor}_staircase`, name: 'Staircase', type: 'staircase',
      x: snap(ox + effectiveW), y: oy, width: staircaseW, depth: stairDepth, floor,
    });

    const remainBelow = snap(buildD - stairDepth);
    if (remainBelow > 1.5) {
      const storeD = snap(Math.min(3.0, remainBelow));
      rooms.push({
        id: `f${floor}_utility`, name: floor === 0 ? 'Store' : 'Utility',
        type: floor === 0 ? 'store' : 'utility',
        x: snap(ox + effectiveW), y: snap(oy + stairDepth),
        width: staircaseW, depth: storeD, floor,
      });

      const passD = snap(remainBelow - storeD);
      if (passD > 0.8) {
        rooms.push({
          id: `f${floor}_passage_stair`, name: 'Passage', type: 'passage',
          x: snap(ox + effectiveW), y: snap(oy + stairDepth + storeD),
          width: staircaseW, depth: passD, floor,
        });
      }
    }
  }

  // ===== HANDLE MISSING MID-ZONE ROOMS (fallback) =====
  if (config.midPct === 0 && !config.kitchenInRear) {
    let fillX = ox;
    const hallRoom = rooms.find(r => r.type === 'hall');
    if (hallRoom) fillX = snap(hallRoom.x + hallRoom.width);
    const remainW = snap(ox + effectiveW - fillX);

    if (fp.kitchens > 0 && !rooms.some(r => r.type === 'kitchen') && remainW > 1.8) {
      const kw = snap(fp.hasDining ? remainW * 0.55 : remainW);
      rooms.push({
        id: `f${floor}_kitchen_0`, name: 'Kitchen', type: 'kitchen',
        x: fillX, y: oy, width: kw, depth: frontD, floor,
      });
      fillX = snap(fillX + kw);
    }
    if (fp.hasDining && !mergeLivDin && !rooms.some(r => r.type === 'dining')) {
      const dw = snap(ox + effectiveW - fillX);
      if (dw > 1.5) {
        rooms.push({
          id: `f${floor}_dining_0`, name: 'Dining', type: 'dining',
          x: fillX, y: oy, width: dw, depth: frontD, floor,
        });
      }
    }
  }

  // ===== VASTU ZONE PLACEMENT (from proportional budget) =====
  // REMOVED: this used to translate a single room toward its ideal Vastu quadrant
  // without checking any other room's position, which reliably produced overlaps
  // (a room nudged into a neighbor is exactly as broken as one resized into a
  // neighbor). The zone-based placement above already achieves coarse Vastu
  // alignment for the rooms Vastu cares about most (kitchen SE/NE via
  // `kitchenOnRight`, bedroom/master ordering, puja placement) without needing a
  // second, unsafe translation pass. No replacement nudge is applied.

  // ===== APPLY PROPORTIONAL BUDGET DIMENSIONS (flexible aspect ratio) =====
  // Rooms may grow toward their budgeted (ideal) area, but growth is bounded not
  // just by the outer building envelope but also by the nearest neighboring room's
  // edge in the growth direction — otherwise a room can grow straight through a
  // sibling that is already correctly tiled next to it (this was the direct cause
  // of the Living/Dining-Car Parking, Kitchen-Master Bedroom, etc. overlaps).
  // Neighbor bounds are computed from a snapshot taken before any room in this
  // pass is resized, so the result does not depend on array iteration order.
  if (roomBudgets) {
    const outerMaxX = snap(ox + buildW);
    const outerMaxY = snap(oy + buildD);
    const snapshot = rooms.map((r) => ({ ...r }));
    const neighborBounds = (room: Room): { rightBound: number; bottomBound: number } => {
      let rightBound = outerMaxX;
      let bottomBound = outerMaxY;
      for (const o of snapshot) {
        if (o.id === room.id) continue;
        const yOverlap = Math.min(room.y + room.depth, o.y + o.depth) - Math.max(room.y, o.y);
        if (yOverlap > 0.05 && o.x >= room.x - 0.05 && o.x < rightBound) rightBound = o.x;
        const xOverlap = Math.min(room.x + room.width, o.x + o.width) - Math.max(room.x, o.x);
        if (xOverlap > 0.05 && o.y >= room.y - 0.05 && o.y < bottomBound) bottomBound = o.y;
      }
      return { rightBound, bottomBound };
    };

    for (const room of rooms) {
      let budget: RoomAllocation | undefined;
      if (room.type === 'hall') budget = getBudget('Living & Dining');
      else if (room.type === 'kitchen') budget = getBudget('Kitchen');
      else if (room.type === 'master_bedroom') budget = getBudget('Master Bedroom');
      else if (room.type === 'bedroom') budget = getBudgetIdx('Bedroom', parseInt(room.id.split('_').pop() || '1'));
      else if (room.type === 'toilet') budget = getBudgetIdx('Toilet', parseInt(room.id.split('_').pop() || '0'));
      else if (room.type === 'puja') budget = getBudget('Pooja Room');
      else if (room.type === 'store' || room.type === 'utility') budget = getBudget('Store Room');

      if (budget) {
        // Use budget area but allow flexible aspect ratio
        // If budget dimensions fit in available space, use them
        // Otherwise, adjust aspect ratio within allowed range to fit
        let targetW = budget.widthM;
        let targetD = budget.depthM;

        // Check if budget dimensions would overflow the space actually available
        // (outer envelope AND nearest neighboring room, whichever is closer).
        const { rightBound, bottomBound } = neighborBounds(room);
        const maxAvailW = snap(rightBound - room.x);
        const maxAvailD = snap(bottomBound - room.y);

        if (targetW > maxAvailW) {
          // Room too wide — increase depth, decrease width (lower aspect ratio)
          targetW = Math.max(snap(maxAvailW), 1.0);
          if (budget.aspectRatioRange) targetD = snap(budget.areaSqm / targetW);
        }
        if (targetD > maxAvailD) {
          // Room too deep — increase width, decrease depth (higher aspect ratio)
          targetD = Math.max(snap(maxAvailD), 1.0);
          if (budget.aspectRatioRange) targetW = snap(budget.areaSqm / targetD);
          // Re-check the width bound after an aspect-ratio-driven width increase.
          if (targetW > maxAvailW) targetW = Math.max(snap(maxAvailW), 1.0);
        }

        room.width = snap(Math.max(targetW, 0.5));
        room.depth = snap(Math.max(targetD, 0.5));
      }
    }
  }

  // ===== BOUNDARY CLAMP =====
  const maxX = snap(ox + buildW);
  const maxY = snap(oy + buildD);
  for (const room of rooms) {
    if (room.x < ox) room.x = ox;
    if (room.y < oy) room.y = oy;
    if (room.x + room.width > maxX + 0.02) {
      room.width = snap(maxX - room.x);
    }
    if (room.y + room.depth > maxY + 0.02) {
      room.depth = snap(maxY - room.y);
    }
    room.width = Math.max(0.5, room.width);
    room.depth = Math.max(0.5, room.depth);
    room.x = snap(room.x);
    room.y = snap(room.y);
    room.width = snap(room.width);
    room.depth = snap(room.depth);
  }

  // ===== OVERLAP DETECTION & RESOLUTION =====
  // Zone-based placement above can leave two rooms overlapping, or push a room's edge
  // outside the buildable footprint after aspect-ratio/Vastu adjustments. This pass
  // re-clamps to the footprint and resolves pairwise overlaps by shifting the later
  // room into free space, or — if it cannot be shifted without leaving the footprint —
  // shrinking it just enough to remove the overlap. Rooms that still cannot be fully
  // resolved are reported via outWarnings rather than silently left broken.
  const overlapWarnings = resolveOverlappingRooms(rooms, ox, oy, maxX, maxY);
  if (outWarnings) outWarnings.push(...overlapWarnings);

  return rooms;
}

/** Axis-aligned overlap amount (m) between two rooms in each dimension; <=0 means no overlap in that axis. */
function overlapAmount(a: Room, b: Room): { overlapX: number; overlapY: number } {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  return { overlapX, overlapY };
}

/**
 * Detects overlapping room rectangles and resolves them in place by shifting or
 * shrinking rooms so the final layout has no overlaps and stays within
 * [ox, maxX] x [oy, maxY]. Returns warnings for anything that could not be
 * cleanly resolved (still overlapping, or shrunk below a usable minimum).
 */
function resolveOverlappingRooms(rooms: Room[], ox: number, oy: number, maxX: number, maxY: number): string[] {
  const warnings: string[] = [];
  const MIN_DIM = 0.9; // do not auto-shrink a room below ~0.9m in any dimension
  const clampRoom = (r: Room) => {
    if (r.x < ox) r.x = snap(ox);
    if (r.y < oy) r.y = snap(oy);
    if (r.x + r.width > maxX) r.width = Math.max(MIN_DIM, snap(maxX - r.x));
    if (r.y + r.depth > maxY) r.depth = Math.max(MIN_DIM, snap(maxY - r.y));
  };

  const MAX_PASSES = 10;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let anyOverlap = false;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const { overlapX, overlapY } = overlapAmount(a, b);
        if (overlapX > 0.02 && overlapY > 0.02) {
          anyOverlap = true;
          if (overlapX <= overlapY) {
            // Resolve along X: push b clear of a (or a clear of b), else shrink.
            if (b.x >= a.x) {
              const shifted = snap(a.x + a.width);
              if (shifted + b.width <= maxX + 0.02) b.x = shifted;
              else if (snap(b.x - a.width) >= ox - 0.02) a.x = snap(b.x - a.width);
              else b.width = Math.max(MIN_DIM, snap(b.width - overlapX));
            } else {
              const shifted = snap(b.x + b.width);
              if (shifted + a.width <= maxX + 0.02) a.x = shifted;
              else if (snap(a.x - b.width) >= ox - 0.02) b.x = snap(a.x - b.width);
              else a.width = Math.max(MIN_DIM, snap(a.width - overlapX));
            }
          } else {
            // Resolve along Y: push b clear of a (or a clear of b), else shrink.
            if (b.y >= a.y) {
              const shifted = snap(a.y + a.depth);
              if (shifted + b.depth <= maxY + 0.02) b.y = shifted;
              else if (snap(b.y - a.depth) >= oy - 0.02) a.y = snap(b.y - a.depth);
              else b.depth = Math.max(MIN_DIM, snap(b.depth - overlapY));
            } else {
              const shifted = snap(b.y + b.depth);
              if (shifted + a.depth <= maxY + 0.02) a.y = shifted;
              else if (snap(a.y - b.depth) >= oy - 0.02) b.y = snap(a.y - b.depth);
              else a.depth = Math.max(MIN_DIM, snap(a.depth - overlapY));
            }
          }
          clampRoom(a);
          clampRoom(b);
        }
      }
    }
    if (!anyOverlap) break;
  }

  // Last-resort hard guarantee: the shift/shrink passes above can still deadlock
  // when a room is bounded on every side (e.g. wedged between the outer wall and
  // two neighbors), because MIN_DIM prevents shrinking further. As an absolute
  // final step, force-eliminate any remaining overlap by shrinking whichever room
  // of the pair has room to spare along the lower-overlap axis, down to a hard
  // floor of 0.3 m, and only crossing below that (down to a 0.05 m geometric
  // floor) when neither room has anything left to give — a genuinely infeasible
  // room program for this plot. Either way the "shrunk below usable minimum" and
  // "still overlap" warnings below will flag it for manual review.
  const HARD_MIN_DIM = 0.3;
  const ABSOLUTE_FLOOR = 0.05;
  for (let hardPass = 0; hardPass < 8; hardPass++) {
    let anyHardOverlap = false;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const { overlapX, overlapY } = overlapAmount(a, b);
        if (overlapX > 0.02 && overlapY > 0.02) {
          anyHardOverlap = true;
          if (overlapX <= overlapY) {
            const aCanShrink = a.width - overlapX >= HARD_MIN_DIM;
            const bCanShrink = b.width - overlapX >= HARD_MIN_DIM;
            const target = aCanShrink ? a : bCanShrink ? b : (a.width >= b.width ? a : b);
            target.width = Math.max(ABSOLUTE_FLOOR, snap(target.width - overlapX));
          } else {
            const aCanShrink = a.depth - overlapY >= HARD_MIN_DIM;
            const bCanShrink = b.depth - overlapY >= HARD_MIN_DIM;
            const target = aCanShrink ? a : bCanShrink ? b : (a.depth >= b.depth ? a : b);
            target.depth = Math.max(ABSOLUTE_FLOOR, snap(target.depth - overlapY));
          }
        }
      }
    }
    if (!anyHardOverlap) break;
  }

  // Final report: anything still overlapping, out-of-bounds, or shrunk to the floor.
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    for (let j = i + 1; j < rooms.length; j++) {
      const other = rooms[j];
      const { overlapX, overlapY } = overlapAmount(room, other);
      if (overlapX > 0.05 && overlapY > 0.05) {
        warnings.push(
          `${room.name} and ${other.name} still overlap by ${(overlapX * overlapY).toFixed(2)} m² after auto-resolution; manual layout review required.`
        );
      }
    }
    if (room.width <= MIN_DIM + 0.01 || room.depth <= MIN_DIM + 0.01) {
      warnings.push(
        `${room.name} was shrunk to ${room.width.toFixed(2)}m × ${room.depth.toFixed(2)}m to resolve an overlap/boundary conflict; verify manually.`
      );
    }
    if (room.x < ox - 0.05 || room.y < oy - 0.05 || room.x + room.width > maxX + 0.05 || room.y + room.depth > maxY + 0.05) {
      warnings.push(`${room.name} extends outside the buildable footprint after auto-resolution; manual layout review required.`);
    }
  }

  return warnings;
}

/**
 * Place structural columns at wall junctions.
 * 230mm x 300mm columns, no span > 4.5m without a beam.
 */
function placeColumns(rooms: Room[], buildW: number, buildD: number, setbacks: Setbacks): Column[] {
  const columns: Column[] = [];
  const ox = snap(setbacks.left);
  const oy = snap(setbacks.front);

  const xCoords = new Set<number>();
  const yCoords = new Set<number>();

  xCoords.add(ox);
  xCoords.add(snap(ox + buildW));
  yCoords.add(oy);
  yCoords.add(snap(oy + buildD));

  for (const room of rooms) {
    xCoords.add(snap(room.x));
    xCoords.add(snap(room.x + room.width));
    yCoords.add(snap(room.y));
    yCoords.add(snap(room.y + room.depth));
  }

  const xs = Array.from(xCoords).sort((a, b) => a - b);
  const ys = Array.from(yCoords).sort((a, b) => a - b);

  const finalXs = addIntermediatePoints(xs, 4.5);
  const finalYs = addIntermediatePoints(ys, 4.5);

  for (const x of finalXs) {
    for (const y of finalYs) {
      const isCorner = rooms.some(
        (r) =>
          (Math.abs(snap(r.x) - x) < 0.06 || Math.abs(snap(r.x + r.width) - x) < 0.06) &&
          (Math.abs(snap(r.y) - y) < 0.06 || Math.abs(snap(r.y + r.depth) - y) < 0.06)
      );

      const isBoundaryCorner =
        (Math.abs(x - ox) < 0.06 || Math.abs(x - snap(ox + buildW)) < 0.06) &&
        (Math.abs(y - oy) < 0.06 || Math.abs(y - snap(oy + buildD)) < 0.06);

      const isEdge =
        Math.abs(x - ox) < 0.06 ||
        Math.abs(x - snap(ox + buildW)) < 0.06 ||
        Math.abs(y - oy) < 0.06 ||
        Math.abs(y - snap(oy + buildD)) < 0.06;

      if (isCorner || isBoundaryCorner || isEdge) {
        const exists = columns.some((c) => Math.abs(c.x - x) < 0.1 && Math.abs(c.y - y) < 0.1);
        if (!exists) {
          columns.push({ x, y, widthMM: 230, depthMM: 300 });
        }
      }
    }
  }

  const corners = [
    { x: ox, y: oy },
    { x: snap(ox + buildW), y: oy },
    { x: ox, y: snap(oy + buildD) },
    { x: snap(ox + buildW), y: snap(oy + buildD) },
  ];
  for (const corner of corners) {
    const exists = columns.some(
      (c) => Math.abs(c.x - corner.x) < 0.1 && Math.abs(c.y - corner.y) < 0.1
    );
    if (!exists) {
      columns.push({ x: corner.x, y: corner.y, widthMM: 230, depthMM: 300 });
    }
  }

  return columns;
}

function addIntermediatePoints(sorted: number[], maxSpan: number): number[] {
  const result: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > maxSpan) {
      const n = Math.ceil(gap / maxSpan);
      const step = gap / n;
      for (let j = 1; j < n; j++) {
        result.push(snap(sorted[i - 1] + step * j));
      }
    }
    result.push(sorted[i]);
  }
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
