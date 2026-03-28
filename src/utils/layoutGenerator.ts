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

interface RoomSpec {
  type: RoomType;
  name: string;
  minArea: number;
  priority: number;
}

/**
 * ADJACENCY RULES (Indian Residential Best Practice):
 * - Balcony MUST adjoin Living Room or Bedroom (exterior wall side)
 * - Toilet MUST adjoin its parent Bedroom (internal side, away from entrance)
 * - Kitchen should adjoin Dining
 * - Puja should be near Kitchen or Entrance
 * - Parking should be at front (entrance side)
 * - Staircase should be central or near entrance
 */

export function generateLayouts(req: ProjectRequirements): Layout[] {
  const plotW = req.plotWidthFt * FT_TO_M;
  const plotD = req.plotDepthFt * FT_TO_M;
  const plotArea = plotW * plotD;
  const setbacks = calculateSetbacks(plotArea, plotW, plotD);

  const buildW = plotW - setbacks.left - setbacks.right;
  const buildD = plotD - setbacks.front - setbacks.rear;

  if (buildW < 3 || buildD < 3) return [];

  const layouts: Layout[] = [];

  const strategies = [
    { id: 'vastu', name: 'Vastu-Optimized', desc: 'Strict Vastu compliance with room placement per Shastra norms. Kitchen in SE, Master Bed in SW, Entrance per facing.' },
    { id: 'space', name: 'Space-Optimized', desc: 'Maximizes carpet area and room dimensions. Efficient circulation with minimal passage waste.' },
    { id: 'balanced', name: 'Balanced Design', desc: 'Practical layout balancing Vastu principles with optimal space utilization and natural light.' },
  ];

  for (const strat of strategies) {
    const floors: FloorLayout[] = [];
    let totalBuiltUp = 0;

    for (let fi = 0; fi < req.floors.length; fi++) {
      const fp = req.floors[fi];
      const isGround = fi === 0;
      const hasParking = isGround && req.parkingType !== 'None';
      const isStilt = isGround && req.parkingType === 'Stilt';

      const rooms = placeRoomsWithAdjacency(
        fp, buildW, buildD, setbacks, fi,
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
      : { score: 0, details: [], suggestions: [] };

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
 * Core room placement engine with adjacency enforcement.
 * Uses a zone-based approach: divides buildable area into functional zones,
 * then places rooms respecting adjacency constraints.
 */
function placeRoomsWithAdjacency(
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
  const ox = setbacks.left;
  const oy = setbacks.front;

  if (isStilt) {
    return [
      { id: `f${floor}_parking`, name: 'Stilt Parking', type: 'parking', x: ox, y: oy, width: buildW - 2.5, depth: buildD, floor },
      { id: `f${floor}_staircase`, name: 'Staircase', type: 'staircase', x: ox + buildW - 2.5, y: oy, width: 2.5, depth: Math.min(5, buildD), floor },
    ];
  }

  const rooms: Room[] = [];
  const staircaseW = isMultiFloor ? 2.5 : 0;
  const effectiveW = buildW - staircaseW;

  // --- ZONE DEFINITIONS ---
  // Front zone: Living/Hall, Entrance, Parking (faces the road)
  // Middle zone: Dining, Kitchen, Passage, Staircase
  // Rear zone: Bedrooms with attached toilets
  // Balconies: Attached to bedrooms/living on EXTERIOR walls only

  // Determine zone depths
  const numBedrooms = fp.bedrooms;
  const numHalls = fp.halls;
  const hasKitchen = fp.kitchens > 0;
  const hasDining = fp.hasDining;
  const hasPuja = fp.hasPuja;

  // Calculate row distribution
  let frontDepth: number, rearDepth: number, midDepth: number;
  const hasMidZone = hasKitchen || hasDining || hasPuja;

  if (hasMidZone && numBedrooms > 0) {
    // 3-zone layout: front (living), middle (kitchen/dining), rear (bedrooms)
    frontDepth = buildD * 0.35;
    midDepth = buildD * 0.25;
    rearDepth = buildD * 0.40;
  } else if (numBedrooms > 0 && numHalls > 0) {
    // 2-zone: front (living/kitchen), rear (bedrooms)
    frontDepth = buildD * 0.45;
    midDepth = 0;
    rearDepth = buildD * 0.55;
  } else {
    // Single zone
    frontDepth = buildD;
    midDepth = 0;
    rearDepth = 0;
  }

  // Ensure minimum depths
  frontDepth = Math.max(frontDepth, 3);
  if (hasMidZone) midDepth = Math.max(midDepth, 2.8);
  if (numBedrooms > 0) rearDepth = Math.max(rearDepth, 3.5);

  // Normalize to fit buildD
  const totalRaw = frontDepth + midDepth + rearDepth;
  if (totalRaw > buildD) {
    const scale = buildD / totalRaw;
    frontDepth *= scale;
    midDepth *= scale;
    rearDepth *= scale;
  }

  // Adjust for parking on ground floor
  let parkingW = 0;
  if (hasParking && !isStilt) {
    parkingW = Math.max(3.0, Math.min(effectiveW * 0.4, 4.0)); // NBC: min 3.0m for door clearance
  }

  // --- FRONT ZONE: Living/Hall + Parking ---
  let currentY = oy;

  if (numHalls > 0) {
    const livingW = effectiveW - parkingW;
    for (let i = 0; i < numHalls; i++) {
      const hw = i === 0 ? livingW : livingW;
      rooms.push({
        id: `f${floor}_hall_${i}`,
        name: numHalls > 1 ? `Living ${i + 1}` : 'Living/Hall',
        type: 'hall',
        x: ox + (i === 0 ? 0 : 0),
        y: currentY,
        width: hw,
        depth: frontDepth,
        floor,
      });

      // BALCONY: Attach to living room on FRONT exterior wall
      // Only if living room is on the front edge (road-facing)
      if (i === 0 && frontDepth > 1.5) {
        const balconyDepth = Math.min(1.5, frontDepth * 0.2);
        // Place balcony as part of the living area on the front
        // We'll note this as a balcony adjacent to living
        rooms.push({
          id: `f${floor}_balcony_living`,
          name: 'Balcony',
          type: 'balcony',
          x: ox,
          y: currentY - Math.min(balconyDepth, setbacks.front * 0.5 > 0.8 ? balconyDepth : 0),
          // Place on exterior side of living — use front setback projection or side
          width: Math.min(livingW * 0.5, 3),
          depth: balconyDepth,
          floor,
        });
        // Fix: place balcony properly. If front setback doesn't allow projection,
        // place alongside living on the exterior side wall
      }
    }

    if (hasParking && parkingW > 0) {
      rooms.push({
        id: `f${floor}_parking`,
        name: 'Car Parking',
        type: 'parking',
        x: ox + effectiveW - parkingW,
        y: currentY,
        width: parkingW,
        depth: frontDepth,
        floor,
      });
    }
  } else if (hasParking) {
    rooms.push({
      id: `f${floor}_parking`,
      name: 'Car Parking',
      type: 'parking',
      x: ox,
      y: currentY,
      width: effectiveW,
      depth: frontDepth,
      floor,
    });
  }

  currentY += frontDepth;

  // --- MIDDLE ZONE: Kitchen + Dining + Puja ---
  if (hasMidZone && midDepth > 0) {
    let midX = ox;
    const kitchenW = hasKitchen ? (hasDining ? effectiveW * 0.45 : effectiveW * 0.5) : 0;
    const diningW = hasDining ? (hasKitchen ? effectiveW * 0.35 : effectiveW * 0.5) : 0;
    const pujaW = hasPuja ? effectiveW - kitchenW - diningW : 0;

    // Kitchen placement — Vastu: SE corner
    if (hasKitchen) {
      const kx = strategy === 'vastu' ? getVastuX(ox, effectiveW, kitchenW, 'SE', facing) : midX;
      rooms.push({
        id: `f${floor}_kitchen_0`,
        name: 'Kitchen',
        type: 'kitchen',
        x: kx,
        y: currentY,
        width: kitchenW,
        depth: midDepth,
        floor,
      });
      midX = kx + kitchenW;
    }

    // Dining — adjacent to kitchen
    if (hasDining) {
      rooms.push({
        id: `f${floor}_dining_0`,
        name: 'Dining',
        type: 'dining',
        x: midX,
        y: currentY,
        width: diningW,
        depth: midDepth,
        floor,
      });
      midX += diningW;
    }

    // Puja room — near kitchen/entrance
    if (hasPuja && pujaW > 1.2) {
      rooms.push({
        id: `f${floor}_puja_0`,
        name: 'Puja Room',
        type: 'puja',
        x: midX,
        y: currentY,
        width: pujaW,
        depth: midDepth,
        floor,
      });
    }

    currentY += midDepth;
  }

  // --- REAR ZONE: Bedrooms with attached toilets ---
  if (numBedrooms > 0 && rearDepth > 0) {
    // Distribute bedrooms across width
    const bedroomCols = Math.min(numBedrooms, effectiveW > 7 ? 3 : 2);
    const bedroomColW = effectiveW / bedroomCols;
    // Toilet strip: carved from bedroom on interior side (not exterior)
    const toiletW = Math.max(1.5, bedroomColW * 0.28);
    const toiletD = Math.min(2.5, rearDepth * 0.45);

    let bedIdx = 0;
    let bedroomRows = Math.ceil(numBedrooms / bedroomCols);

    for (let row = 0; row < bedroomRows; row++) {
      const rowY = currentY + row * (rearDepth / bedroomRows);
      const rowH = rearDepth / bedroomRows;

      for (let col = 0; col < bedroomCols && bedIdx < numBedrooms; col++) {
        const isMaster = bedIdx === 0;
        const bedName = isMaster ? 'Master Bedroom' : `Bedroom ${bedIdx + 1}`;
        const bedType: RoomType = isMaster ? 'master_bedroom' : 'bedroom';
        const bx = ox + col * bedroomColW;

        // Determine which side is EXTERIOR (plot boundary) vs INTERIOR
        const isLeftEdge = col === 0;
        const isRightEdge = col === bedroomCols - 1;
        const isRearEdge = row === bedroomRows - 1;

        // Toilet goes on INTERIOR side (away from exterior walls)
        // If bedroom is on left edge, toilet goes on right side of bedroom
        // If bedroom is on right edge, toilet goes on left side of bedroom
        const toiletOnRight = isLeftEdge || (!isRightEdge && col < bedroomCols / 2);

        const actualBedW = bedroomColW - toiletW;

        if (toiletOnRight) {
          // Bedroom on left, toilet on right (interior side)
          rooms.push({
            id: `f${floor}_${bedType}_${bedIdx}`,
            name: bedName,
            type: bedType,
            x: bx,
            y: rowY,
            width: actualBedW,
            depth: rowH,
            floor,
          });
          // Toilet attached to bedroom (interior side)
          rooms.push({
            id: `f${floor}_toilet_${bedIdx}`,
            name: `Toilet ${bedIdx + 1}`,
            type: 'toilet',
            x: bx + actualBedW,
            y: rowY + rowH - toiletD,
            width: toiletW,
            depth: toiletD,
            floor,
          });

          // BALCONY: Attach to BEDROOM on EXTERIOR wall side
          // Balcony goes on the rear or side exterior wall adjacent to the bedroom
          if (isRearEdge || isLeftEdge) {
            const balconyDepth = Math.min(1.2, rowH * 0.2);
            const balconyW = Math.min(actualBedW * 0.6, 2.5);
            if (isRearEdge) {
              // Balcony projects from bedroom toward rear
              rooms.push({
                id: `f${floor}_balcony_bed_${bedIdx}`,
                name: 'Balcony',
                type: 'balcony',
                x: bx,
                y: rowY + rowH - balconyDepth,
                width: balconyW,
                depth: balconyDepth,
                floor,
              });
            }
          }
        } else {
          // Toilet on left (interior side), bedroom on right
          rooms.push({
            id: `f${floor}_toilet_${bedIdx}`,
            name: `Toilet ${bedIdx + 1}`,
            type: 'toilet',
            x: bx,
            y: rowY + rowH - toiletD,
            width: toiletW,
            depth: toiletD,
            floor,
          });
          rooms.push({
            id: `f${floor}_${bedType}_${bedIdx}`,
            name: bedName,
            type: bedType,
            x: bx + toiletW,
            y: rowY,
            width: actualBedW,
            depth: rowH,
            floor,
          });

          // BALCONY attached to bedroom on exterior (right edge or rear)
          if (isRearEdge || isRightEdge) {
            const balconyDepth = Math.min(1.2, rowH * 0.2);
            const balconyW = Math.min(actualBedW * 0.6, 2.5);
            if (isRearEdge) {
              rooms.push({
                id: `f${floor}_balcony_bed_${bedIdx}`,
                name: 'Balcony',
                type: 'balcony',
                x: bx + toiletW,
                y: rowY + rowH - balconyDepth,
                width: balconyW,
                depth: balconyDepth,
                floor,
              });
            }
          }
        }

        bedIdx++;
      }
    }
  }

  // --- STAIRCASE: near entrance/center ---
  if (isMultiFloor) {
    const stairDepth = Math.min(5, buildD * 0.35);
    rooms.push({
      id: `f${floor}_staircase`,
      name: 'Staircase',
      type: 'staircase',
      x: ox + effectiveW,
      y: oy,
      width: staircaseW,
      depth: stairDepth,
      floor,
    });

    // Space below staircase: Store/Utility capped at reasonable size
    const remainBelowStair = buildD - stairDepth;
    if (remainBelowStair > 1.5) {
      // Cap store at 3m depth max (~7.5 m²), rest becomes passage
      const storeDepth = Math.min(3.0, remainBelowStair);
      rooms.push({
        id: `f${floor}_utility`,
        name: floor === 0 ? 'Store' : 'Utility',
        type: floor === 0 ? 'store' : 'utility',
        x: ox + effectiveW,
        y: oy + stairDepth,
        width: staircaseW,
        depth: storeDepth,
        floor,
      });
      // If remaining space below store, add passage/circulation
      const passageDepth = remainBelowStair - storeDepth;
      if (passageDepth > 0.8) {
        rooms.push({
          id: `f${floor}_passage_stair`,
          name: 'Passage',
          type: 'passage',
          x: ox + effectiveW,
          y: oy + stairDepth + storeDepth,
          width: staircaseW,
          depth: passageDepth,
          floor,
        });
      }
    }
  }

  // --- Handle remaining rooms for middle zone if no separate mid zone ---
  if (!hasMidZone || midDepth === 0) {
    // Kitchen and dining placed adjacent to hall in front zone
    let fillX = ox;
    const hallRoom = rooms.find(r => r.type === 'hall');
    if (hallRoom) {
      fillX = hallRoom.x + hallRoom.width;
    }
    const remainW = ox + effectiveW - fillX;

    if (fp.kitchens > 0 && !rooms.some(r => r.type === 'kitchen')) {
      const kw = hasDining ? remainW * 0.55 : remainW;
      if (kw > 1.8) {
        rooms.push({
          id: `f${floor}_kitchen_0`,
          name: 'Kitchen',
          type: 'kitchen',
          x: fillX,
          y: oy,
          width: kw,
          depth: frontDepth,
          floor,
        });
        fillX += kw;
      }
    }
    if (fp.hasDining && !rooms.some(r => r.type === 'dining')) {
      const dw = ox + effectiveW - fillX;
      if (dw > 1.5) {
        rooms.push({
          id: `f${floor}_dining_0`,
          name: 'Dining',
          type: 'dining',
          x: fillX,
          y: oy,
          width: dw,
          depth: frontDepth,
          floor,
        });
      }
    }
    if (fp.hasPuja && !rooms.some(r => r.type === 'puja')) {
      // Tuck puja near kitchen or entrance
      const lastRoom = rooms[rooms.length - 1];
      if (lastRoom) {
        const pw = Math.min(2, effectiveW * 0.15);
        const pd = Math.min(2.5, frontDepth * 0.4);
        rooms.push({
          id: `f${floor}_puja_0`,
          name: 'Puja Room',
          type: 'puja',
          x: lastRoom.x + lastRoom.width - pw,
          y: lastRoom.y + lastRoom.depth - pd,
          width: pw,
          depth: pd,
          floor,
        });
      }
    }
  }

  // --- Final balcony cleanup: remove any balcony not adjacent to bedroom/living ---
  return rooms.filter(room => {
    if (room.type !== 'balcony') return true;
    // Check adjacency to a bedroom or hall
    return rooms.some(other => {
      if (other.type !== 'hall' && other.type !== 'bedroom' && other.type !== 'master_bedroom') return false;
      return roomsAdjacent(room, other);
    });
  });
}

/** Check if two rooms share a wall (adjacent within 0.15m tolerance) */
function roomsAdjacent(a: Room, b: Room): boolean {
  const tol = 0.15;
  // Horizontal overlap
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  // Vertical overlap
  const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);

  // Shared vertical wall (left-right adjacency)
  if (overlapY > tol) {
    if (Math.abs((a.x + a.width) - b.x) < tol || Math.abs((b.x + b.width) - a.x) < tol) return true;
  }
  // Shared horizontal wall (top-bottom adjacency)
  if (overlapX > tol) {
    if (Math.abs((a.y + a.depth) - b.y) < tol || Math.abs((b.y + b.depth) - a.y) < tol) return true;
  }
  return false;
}

/** Vastu-based X position helper */
function getVastuX(ox: number, totalW: number, roomW: number, zone: string, facing: Facing): number {
  // SE = right side for North/East facing, left side for South/West
  if (zone === 'SE') {
    if (facing === 'North' || facing === 'East') return ox + totalW - roomW;
    return ox;
  }
  if (zone === 'SW') {
    if (facing === 'North' || facing === 'West') return ox;
    return ox + totalW - roomW;
  }
  return ox; // default
}

/**
 * Place structural columns at wall junctions.
 * 230mm x 300mm columns, no span > 4.5m without a beam.
 */
function placeColumns(rooms: Room[], buildW: number, buildD: number, setbacks: Setbacks): Column[] {
  const columns: Column[] = [];
  const ox = setbacks.left;
  const oy = setbacks.front;

  const xCoords = new Set<number>();
  const yCoords = new Set<number>();

  xCoords.add(ox);
  xCoords.add(ox + buildW);
  yCoords.add(oy);
  yCoords.add(oy + buildD);

  for (const room of rooms) {
    xCoords.add(round2(room.x));
    xCoords.add(round2(room.x + room.width));
    yCoords.add(round2(room.y));
    yCoords.add(round2(room.y + room.depth));
  }

  const xs = Array.from(xCoords).sort((a, b) => a - b);
  const ys = Array.from(yCoords).sort((a, b) => a - b);

  const finalXs = addIntermediatePoints(xs, 4.5);
  const finalYs = addIntermediatePoints(ys, 4.5);

  for (const x of finalXs) {
    for (const y of finalYs) {
      const isCorner = rooms.some(
        (r) =>
          (Math.abs(r.x - x) < 0.05 || Math.abs(r.x + r.width - x) < 0.05) &&
          (Math.abs(r.y - y) < 0.05 || Math.abs(r.y + r.depth - y) < 0.05)
      );

      const isBoundaryCorner =
        (Math.abs(x - ox) < 0.05 || Math.abs(x - (ox + buildW)) < 0.05) &&
        (Math.abs(y - oy) < 0.05 || Math.abs(y - (oy + buildD)) < 0.05);

      const isEdge =
        Math.abs(x - ox) < 0.05 ||
        Math.abs(x - (ox + buildW)) < 0.05 ||
        Math.abs(y - oy) < 0.05 ||
        Math.abs(y - (oy + buildD)) < 0.05;

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
    { x: ox + buildW, y: oy },
    { x: ox, y: oy + buildD },
    { x: ox + buildW, y: oy + buildD },
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
        result.push(round2(sorted[i - 1] + step * j));
      }
    }
    result.push(sorted[i]);
  }
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
