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

  const buildW = snap(plotW - setbacks.left - setbacks.right);
  const buildD = snap(plotD - setbacks.front - setbacks.rear);

  if (buildW < 3 || buildD < 3) return [];

  const layouts: Layout[] = [];

  const strategies = [
    { id: 'vastu', name: 'Vastu-Optimized', desc: 'Strict Vastu placement — Kitchen SE, Master Bed SW, Puja NE. Dedicated zones for each function.' },
    { id: 'space', name: 'Space-Optimized', desc: 'Open-plan Living+Dining, Kitchen near bedrooms. Maximizes carpet area with minimal corridors.' },
    { id: 'balanced', name: 'Balanced Design', desc: 'Practical layout with good Vastu score and efficient room sizing. Best of both approaches.' },
  ];

  for (const strat of strategies) {
    const floors: FloorLayout[] = [];
    let totalBuiltUp = 0;

    for (let fi = 0; fi < req.floors.length; fi++) {
      const fp = req.floors[fi];
      const isGround = fi === 0;
      const hasParking = isGround && req.parkingType !== 'None';
      const isStilt = isGround && req.parkingType === 'Stilt';

      // Fit floor program to buildable area
      const adjFp = fitFloorProgram(fp, buildW * buildD, hasParking, req.floors.length > 1);

      const rooms = placeRoomsForStrategy(
        adjFp, buildW, buildD, setbacks, fi,
        strat.id, req.facing, isStilt,
        req.floors.length > 1, hasParking
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

    const { compliant, issues } = checkNBCCompliance(allRooms, plotArea, totalBuiltUp, req.floors.length);

    layouts.push({
      id: strat.id,
      name: strat.name,
      strategy: strat.id,
      description: strat.desc,
      floors,
      vastuScore: req.vastuCompliance ? score : -1,
      vastuDetails: details,
      nbcCompliant: compliant,
      nbcIssues: issues,
      builtUpAreaSqM: round2(totalBuiltUp),
      builtUpAreaSqFt: Math.round(totalBuiltUp * SQM_TO_SQFT),
      setbacks,
      plotWidthM: plotW,
      plotDepthM: plotD,
      buildableWidthM: buildW,
      buildableDepthM: buildD,
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
  hasParking: boolean
): Room[] {
  const ox = snap(setbacks.left);
  const oy = snap(setbacks.front);

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

  return rooms;
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
