import { Layout, Room, Facing } from '../types';
import { getRoomZone, calculateVastuScore, VASTU_IDEAL_ZONES, VASTU_TABOO } from './vastuEngine';
import { checkNBCCompliance } from './nbcCompliance';

// ============================================================================
// VASTU & NBC AUTO-FIX ENGINE v2
// Multi-pass optimization: swap rooms for Vastu, expand rooms for NBC
// More aggressive expansion (30% per pass) to converge within 5 passes
// ============================================================================

// NBC minimum areas (m²)
const NBC_MIN_AREAS: Record<string, number> = {
  master_bedroom: 9.5, bedroom: 9.5, hall: 9.5, kitchen: 5.0,
  toilet: 2.8, dining: 7.5, parking: 13.75, staircase: 3.0,
  puja: 2.0, store: 2.0, utility: 2.0,
};

// NBC minimum widths (m)
const NBC_MIN_WIDTHS: Record<string, number> = {
  master_bedroom: 2.7, bedroom: 2.7, hall: 2.7, kitchen: 1.8,
  toilet: 1.2, dining: 2.4, parking: 3.0, passage: 1.0,
  puja: 1.2, staircase: 1.0,
};

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function vastuRoomScore(room: Room, plotWidthM: number, plotDepthM: number, facing: Facing): number {
  const zone = getRoomZone(room, plotWidthM, plotDepthM, facing);
  const idealZones = VASTU_IDEAL_ZONES[room.type] || ['Center'];
  const tabooZones = VASTU_TABOO[room.type] || [];
  if (idealZones.includes(zone)) return 1;
  if (tabooZones.includes(zone)) return 0;
  return 0.3;
}

function totalVastuRoomScore(rooms: Room[], plotWidthM: number, plotDepthM: number, facing: Facing): number {
  return rooms.reduce((sum, room) => sum + vastuRoomScore(room, plotWidthM, plotDepthM, facing), 0);
}

function swapRoomPositions(a: Room, b: Room): void {
  const tmpX = a.x, tmpY = a.y, tmpW = a.width, tmpD = a.depth;
  a.x = b.x; a.y = b.y; a.width = b.width; a.depth = b.depth;
  b.x = tmpX; b.y = tmpY; b.width = tmpW; b.depth = tmpD;
}

function optimizeFloorVastu(rooms: Room[], plotWidthM: number, plotDepthM: number, facing: Facing): Room[] {
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    const currentScore = totalVastuRoomScore(rooms, plotWidthM, plotDepthM, facing);
    let bestImprovement = 0, bestI = -1, bestJ = -1;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (rooms[i].type === rooms[j].type) continue;
        swapRoomPositions(rooms[i], rooms[j]);
        const newScore = totalVastuRoomScore(rooms, plotWidthM, plotDepthM, facing);
        if (newScore - currentScore > bestImprovement) {
          bestImprovement = newScore - currentScore;
          bestI = i; bestJ = j;
        }
        swapRoomPositions(rooms[i], rooms[j]);
      }
    }
    if (bestImprovement > 0 && bestI >= 0 && bestJ >= 0) {
      swapRoomPositions(rooms[bestI], rooms[bestJ]);
      improved = true;
    }
  }
  return rooms;
}

function findLargestAdjacentRoom(target: Room, allRooms: Room[]): Room | null {
  const tolerance = 0.3;
  const sameFloor = allRooms.filter(r => r.floor === target.floor && r.id !== target.id);
  const adjacent = sameFloor.filter(r => {
    const hOverlap = Math.min(target.y + target.depth, r.y + r.depth) - Math.max(target.y, r.y);
    const vOverlap = Math.min(target.x + target.width, r.x + r.width) - Math.max(target.x, r.x);
    if (hOverlap > 0.1) {
      if (Math.abs(r.x - (target.x + target.width)) < tolerance) return true;
      if (Math.abs(target.x - (r.x + r.width)) < tolerance) return true;
    }
    if (vOverlap > 0.1) {
      if (Math.abs(r.y - (target.y + target.depth)) < tolerance) return true;
      if (Math.abs(target.y - (r.y + r.depth)) < tolerance) return true;
    }
    return false;
  });
  if (adjacent.length === 0) return null;
  return adjacent.reduce((largest, r) => {
    return (r.width * r.depth > largest.width * largest.depth) ? r : largest;
  });
}

/**
 * Fix NBC minimum area/width issues — MORE AGGRESSIVE (up to 40% of neighbor per pass)
 */
function fixNBCMinimumAreas(rooms: Room[]): Room[] {
  // Sort rooms by deficit (largest deficit first) for priority fixing
  const roomsWithDeficit = rooms
    .map(r => ({ room: r, deficit: (NBC_MIN_AREAS[r.type] || 0) - r.width * r.depth }))
    .filter(r => r.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);

  for (const { room } of roomsWithDeficit) {
    const minArea = NBC_MIN_AREAS[room.type];
    if (!minArea) continue;
    const currentArea = room.width * room.depth;
    if (currentArea >= minArea) continue;

    const neighbor = findLargestAdjacentRoom(room, rooms);
    if (!neighbor) continue;

    const deficit = minArea - currentArea;
    const neighborArea = neighbor.width * neighbor.depth;
    const neighborMinArea = NBC_MIN_AREAS[neighbor.type] || 2.0;

    // Allow taking up to 40% of neighbor (was 30%)
    if (neighborArea - deficit < neighborMinArea * 0.9) continue;

    const isHorizAdj =
      Math.abs(neighbor.x - (room.x + room.width)) < 0.3 ||
      Math.abs(room.x - (neighbor.x + neighbor.width)) < 0.3;

    if (isHorizAdj) {
      const expandAmount = deficit / room.depth;
      const clampedExpand = Math.min(expandAmount, neighbor.width * 0.40);
      if (neighbor.x > room.x) {
        room.width += clampedExpand;
        neighbor.x += clampedExpand;
        neighbor.width -= clampedExpand;
      } else {
        room.x -= clampedExpand;
        room.width += clampedExpand;
        neighbor.width -= clampedExpand;
      }
    } else {
      const expandAmount = deficit / room.width;
      const clampedExpand = Math.min(expandAmount, neighbor.depth * 0.40);
      if (neighbor.y > room.y) {
        room.depth += clampedExpand;
        neighbor.y += clampedExpand;
        neighbor.depth -= clampedExpand;
      } else {
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

    if (room.width < room.depth && room.width < minWidth) {
      const needed = minWidth - room.width;
      const neighbor = findLargestAdjacentRoom(room, rooms);
      if (neighbor && neighbor.width > needed + 1.0) {
        room.width = minWidth;
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
 * Auto-fix layout — 5-pass multi-pass loop (was 3).
 * Fail-closed: if error occurs, returns null (caller must handle).
 */
export function autoFixLayout(layout: Layout, facing: Facing): Layout | null {
  try {
    const optimized = deepClone(layout);
    const { plotWidthM, plotDepthM } = optimized;
    const MAX_PASSES = 5;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      // Step 1: Vastu optimization
      for (const floorLayout of optimized.floors) {
        floorLayout.rooms = optimizeFloorVastu(floorLayout.rooms, plotWidthM, plotDepthM, facing);
      }

      // Step 2: NBC area/width fixes
      for (const floorLayout of optimized.floors) {
        floorLayout.rooms = fixNBCMinimumAreas(floorLayout.rooms);
      }

      // Step 3: Check if we're done
      const passRooms = optimized.floors.flatMap(f => f.rooms);
      const passNBC = checkNBCCompliance(passRooms, plotWidthM * plotDepthM, optimized.builtUpAreaSqM, optimized.floors.length);
      const nbcErrors = passNBC.issues.filter(i => i.severity === 'error');
      if (nbcErrors.length === 0) break;
    }

    // Final recalculation
    const allRooms = optimized.floors.flatMap(f => f.rooms);
    const plotArea = plotWidthM * plotDepthM;

    const vastuResult = calculateVastuScore(allRooms, plotWidthM, plotDepthM, facing);
    optimized.vastuScore = vastuResult.score;
    optimized.vastuDetails = vastuResult.details;

    const nbcResult = checkNBCCompliance(allRooms, plotArea, optimized.builtUpAreaSqM, optimized.floors.length);
    optimized.nbcCompliant = nbcResult.compliant;
    optimized.nbcIssues = nbcResult.issues;

    const newBuiltUpM2 = optimized.floors.reduce((sum, fl) => {
      const floorArea = fl.rooms.reduce((s, r) => s + r.width * r.depth, 0);
      return sum + floorArea;
    }, 0);
    optimized.builtUpAreaSqM = Math.round(newBuiltUpM2 * 100) / 100;
    optimized.builtUpAreaSqFt = Math.round(newBuiltUpM2 * 10.764 * 100) / 100;

    return optimized;
  } catch (error) {
    // Fail-closed: return null on error, never pass original as "fixed"
    console.error('AutoFix failed:', error);
    return null;
  }
}