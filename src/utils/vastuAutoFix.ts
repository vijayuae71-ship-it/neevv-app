import { Layout, Room, Facing } from '../types';
import { getRoomZone, calculateVastuScore } from './vastuEngine';
import { checkNBCCompliance } from './nbcCompliance';

// ============================================================================
// VASTU & NBC AUTO-FIX ENGINE
// Greedy optimization: swap rooms to improve Vastu score, expand rooms for NBC
// ============================================================================

// Vastu ideal zones for scoring swaps
const VASTU_IDEAL_ZONES: Record<string, string[]> = {
  master_bedroom: ['SW'],
  bedroom: ['SW', 'S', 'NW', 'W'],
  hall: ['N', 'NE', 'E', 'Center'],
  kitchen: ['SE'],
  toilet: ['W', 'NW'],
  dining: ['W', 'E', 'Center'],
  puja: ['NE'],
  staircase: ['S', 'SW', 'W'],
  entrance: ['N', 'E', 'NE'],
  parking: ['NW', 'SE'],
  store: ['SW', 'S'],
  utility: ['NW', 'W'],
  balcony: ['N', 'E', 'NE'],
  passage: ['Center', 'N', 'E'],
};

// NBC minimum areas (m²)
const NBC_MIN_AREAS: Record<string, number> = {
  master_bedroom: 9.5,
  bedroom: 9.5,
  hall: 9.5,
  kitchen: 5.0,
  toilet: 2.8,
  dining: 7.5,
  parking: 13.75,
  staircase: 3.0,
};

// NBC minimum widths (m)
const NBC_MIN_WIDTHS: Record<string, number> = {
  master_bedroom: 2.7,
  bedroom: 2.4,
  hall: 3.0,
  kitchen: 2.1,
  toilet: 1.2,
  dining: 2.4,
  parking: 3.0,
  passage: 1.0,
};

/**
 * Deep clone a layout object
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Score how well a room is placed according to Vastu.
 * Returns 1 if ideal, 0.3 if acceptable, 0 if bad.
 */
function vastuRoomScore(room: Room, plotWidthM: number, plotDepthM: number, facing: Facing): number {
  const zone = getRoomZone(room, plotWidthM, plotDepthM, facing);
  const idealZones = VASTU_IDEAL_ZONES[room.type] || ['Center'];
  if (idealZones.includes(zone)) return 1;
  return 0.3;
}

/**
 * Calculate the total Vastu score for a set of rooms (simple sum).
 */
function totalVastuRoomScore(rooms: Room[], plotWidthM: number, plotDepthM: number, facing: Facing): number {
  return rooms.reduce((sum, room) => sum + vastuRoomScore(room, plotWidthM, plotDepthM, facing), 0);
}

/**
 * Swap the positions and dimensions of two rooms.
 * Keeps: id, name, type, floor
 * Swaps: x, y, width, depth
 */
function swapRoomPositions(a: Room, b: Room): void {
  const tmpX = a.x;
  const tmpY = a.y;
  const tmpW = a.width;
  const tmpD = a.depth;

  a.x = b.x;
  a.y = b.y;
  a.width = b.width;
  a.depth = b.depth;

  b.x = tmpX;
  b.y = tmpY;
  b.width = tmpW;
  b.depth = tmpD;
}

/**
 * Greedy Vastu optimization: try all pairwise swaps on a floor,
 * execute the best one, repeat until no improvement.
 */
function optimizeFloorVastu(
  rooms: Room[],
  plotWidthM: number,
  plotDepthM: number,
  facing: Facing
): Room[] {
  let improved = true;
  let iterations = 0;
  const maxIterations = 50; // Safety limit

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    const currentScore = totalVastuRoomScore(rooms, plotWidthM, plotDepthM, facing);
    let bestImprovement = 0;
    let bestI = -1;
    let bestJ = -1;

    // Try all pairwise swaps
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        // Skip swapping rooms of the same type (no benefit)
        if (rooms[i].type === rooms[j].type) continue;

        // Perform swap
        swapRoomPositions(rooms[i], rooms[j]);
        const newScore = totalVastuRoomScore(rooms, plotWidthM, plotDepthM, facing);
        const improvement = newScore - currentScore;

        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestI = i;
          bestJ = j;
        }

        // Undo swap
        swapRoomPositions(rooms[i], rooms[j]);
      }
    }

    // Execute the best swap if improvement found
    if (bestImprovement > 0 && bestI >= 0 && bestJ >= 0) {
      swapRoomPositions(rooms[bestI], rooms[bestJ]);
      improved = true;
    }
  }

  return rooms;
}

/**
 * Find the largest room on the same floor that is adjacent to the target room.
 */
function findLargestAdjacentRoom(target: Room, allRooms: Room[]): Room | null {
  const tolerance = 0.3; // meters - adjacency tolerance
  const sameFloor = allRooms.filter(r => r.floor === target.floor && r.id !== target.id);

  const adjacent = sameFloor.filter(r => {
    // Check if rooms share an edge (horizontally or vertically adjacent)
    const hOverlap = Math.min(target.y + target.depth, r.y + r.depth) - Math.max(target.y, r.y);
    const vOverlap = Math.min(target.x + target.width, r.x + r.width) - Math.max(target.x, r.x);

    // Horizontally adjacent (side by side)
    if (hOverlap > 0.1) {
      const gapRight = Math.abs(r.x - (target.x + target.width));
      const gapLeft = Math.abs(target.x - (r.x + r.width));
      if (gapRight < tolerance || gapLeft < tolerance) return true;
    }

    // Vertically adjacent (above/below)
    if (vOverlap > 0.1) {
      const gapBottom = Math.abs(r.y - (target.y + target.depth));
      const gapTop = Math.abs(target.y - (r.y + r.depth));
      if (gapBottom < tolerance || gapTop < tolerance) return true;
    }

    return false;
  });

  if (adjacent.length === 0) return null;

  // Return the largest adjacent room
  return adjacent.reduce((largest, r) => {
    const lArea = largest.width * largest.depth;
    const rArea = r.width * r.depth;
    return rArea > lArea ? r : largest;
  });
}

/**
 * Fix NBC minimum area issues by expanding undersized rooms.
 * Reduces the largest adjacent room proportionally.
 */
function fixNBCMinimumAreas(rooms: Room[]): Room[] {
  for (const room of rooms) {
    const minArea = NBC_MIN_AREAS[room.type];
    if (!minArea) continue;

    const currentArea = room.width * room.depth;
    if (currentArea >= minArea) continue;

    // Room is undersized — try to expand
    const neighbor = findLargestAdjacentRoom(room, rooms);
    if (!neighbor) continue;

    const deficit = minArea - currentArea;
    const neighborArea = neighbor.width * neighbor.depth;
    const neighborMinArea = NBC_MIN_AREAS[neighbor.type] || 2.0;

    // Only take from neighbor if it has enough surplus
    if (neighborArea - deficit < neighborMinArea) continue;

    // Determine expansion direction based on adjacency
    const isHorizontallyAdjacent =
      Math.abs(neighbor.x - (room.x + room.width)) < 0.3 ||
      Math.abs(room.x - (neighbor.x + neighbor.width)) < 0.3;

    if (isHorizontallyAdjacent) {
      // Expand room width, shrink neighbor width
      const expandAmount = deficit / room.depth;
      const clampedExpand = Math.min(expandAmount, neighbor.width * 0.3); // Max 30% of neighbor

      if (neighbor.x > room.x) {
        // Neighbor is to the right
        room.width += clampedExpand;
        neighbor.x += clampedExpand;
        neighbor.width -= clampedExpand;
      } else {
        // Neighbor is to the left
        room.x -= clampedExpand;
        room.width += clampedExpand;
        neighbor.width -= clampedExpand;
      }
    } else {
      // Expand room depth, shrink neighbor depth
      const expandAmount = deficit / room.width;
      const clampedExpand = Math.min(expandAmount, neighbor.depth * 0.3);

      if (neighbor.y > room.y) {
        // Neighbor is below
        room.depth += clampedExpand;
        neighbor.y += clampedExpand;
        neighbor.depth -= clampedExpand;
      } else {
        // Neighbor is above
        room.y -= clampedExpand;
        room.depth += clampedExpand;
        neighbor.depth -= clampedExpand;
      }
    }
  }

  // Fix minimum widths
  for (const room of rooms) {
    const minWidth = NBC_MIN_WIDTHS[room.type];
    if (!minWidth) continue;

    const actualMinDim = Math.min(room.width, room.depth);
    if (actualMinDim >= minWidth) continue;

    // Try to expand the smaller dimension
    if (room.width < room.depth && room.width < minWidth) {
      const needed = minWidth - room.width;
      const neighbor = findLargestAdjacentRoom(room, rooms);
      if (neighbor && neighbor.width > needed + 1.0) {
        room.width = minWidth;
        // Adjust neighbor if horizontally adjacent
        if (Math.abs(neighbor.x - (room.x + room.width - needed)) < 0.3) {
          neighbor.x += needed;
          neighbor.width -= needed;
        }
      }
    } else if (room.depth < minWidth) {
      const needed = minWidth - room.depth;
      const neighbor = findLargestAdjacentRoom(room, rooms);
      if (neighbor && neighbor.depth > needed + 1.0) {
        room.depth = minWidth;
        if (Math.abs(neighbor.y - (room.y + room.depth - needed)) < 0.3) {
          neighbor.y += needed;
          neighbor.depth -= needed;
        }
      }
    }
  }

  return rooms;
}

/**
 * Auto-fix a layout for better Vastu and NBC compliance.
 *
 * Algorithm:
 * 1. Deep clone the layout
 * 2. For each floor, greedy-optimize room positions for Vastu
 * 3. Fix NBC minimum area/width violations
 * 4. Re-calculate Vastu score and NBC compliance
 * 5. Return the optimized layout
 */
export function autoFixLayout(layout: Layout, facing: Facing): Layout {
  const optimized = deepClone(layout);
  const { plotWidthM, plotDepthM } = optimized;

  // Step 1: Optimize Vastu placement per floor
  for (const floorLayout of optimized.floors) {
    floorLayout.rooms = optimizeFloorVastu(
      floorLayout.rooms,
      plotWidthM,
      plotDepthM,
      facing
    );
  }

  // Step 2: Fix NBC minimum area/width issues per floor
  for (const floorLayout of optimized.floors) {
    floorLayout.rooms = fixNBCMinimumAreas(floorLayout.rooms);
  }

  // Step 3: Collect all rooms and re-calculate scores
  const allRooms = optimized.floors.flatMap(f => f.rooms);
  const plotArea = plotWidthM * plotDepthM;
  const builtUpAreaSqM = optimized.builtUpAreaSqM;
  const numFloors = optimized.floors.length;

  // Re-calculate Vastu
  const vastuResult = calculateVastuScore(allRooms, plotWidthM, plotDepthM, facing);
  optimized.vastuScore = vastuResult.score;
  optimized.vastuDetails = vastuResult.details;

  // Re-calculate NBC compliance
  const nbcResult = checkNBCCompliance(allRooms, plotArea, builtUpAreaSqM, numFloors);
  optimized.nbcCompliant = nbcResult.compliant;
  optimized.nbcIssues = nbcResult.issues;

  // Update built-up area based on potentially adjusted room sizes
  const newBuiltUpM2 = optimized.floors.reduce((sum, fl) => {
    const floorArea = fl.rooms.reduce((s, r) => s + r.width * r.depth, 0);
    return sum + floorArea;
  }, 0);
  optimized.builtUpAreaSqM = Math.round(newBuiltUpM2 * 100) / 100;
  optimized.builtUpAreaSqFt = Math.round(newBuiltUpM2 * 10.764 * 100) / 100;

  return optimized;
}
