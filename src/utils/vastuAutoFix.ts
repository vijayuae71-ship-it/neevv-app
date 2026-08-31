import { Layout, Room, Facing } from '../types';
import { getRoomZone, calculateVastuScore, VASTU_IDEAL_ZONES, VASTU_TABOO } from './vastuEngine';
import { checkNBCCompliance } from './nbcCompliance';

// ============================================================================
// VASTU & NBC AUTO-FIX ENGINE v3
// Multi-phase: swap for Vastu → expand for NBC → REMOVE non-essential rooms
// when buildable area is physically too small for all rooms at NBC minimums.
// Phase 2.5: multi-neighbor borrowing when a single neighbor can't cover the
// full deficit (fixes rooms plateauing below their NBC minimum area).
// Phase 4: re-run expansion after room removal to fill freed space.
// Phase 5: fix kitchen exterior wall access.
// Phase 6: fix ground floor coverage exceeding the NBC maximum.
// ============================================================================

const NBC_MIN_AREAS: Record<string, number> = {
  master_bedroom: 9.5, bedroom: 9.5, hall: 9.5, kitchen: 5.0,
  toilet: 2.8, dining: 7.5, parking: 13.75, staircase: 3.0,
  puja: 2.0, store: 2.0, utility: 2.0, passage: 1.0,
};

const NBC_MIN_WIDTHS: Record<string, number> = {
  master_bedroom: 2.7, bedroom: 2.7, hall: 2.7, kitchen: 1.8,
  toilet: 1.2, dining: 2.4, parking: 3.0, passage: 1.0,
  puja: 1.2, staircase: 1.0,
};

// Rooms removable when plot is over-programmed (most dispensable first)
const REMOVAL_PRIORITY: string[] = [
  'passage', 'store', 'utility', 'puja', 'dining',
];

// NBC maximum ground coverage for plots under 200 m²
const NBC_MAX_GROUND_COVERAGE_PCT = 65;
const NBC_MAX_COVERAGE_PLOT_AREA_THRESHOLD = 200;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Vastu helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// NBC area / width fix helpers
// ---------------------------------------------------------------------------

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
 * Like findLargestAdjacentRoom, but returns ALL adjacent rooms on the same
 * floor (not just the single largest one). Used by multiNeighborBorrow to
 * spread a room's area deficit across every available neighbor instead of
 * relying on one neighbor that may already be at its own NBC minimum.
 */
function findAllAdjacentRooms(target: Room, allRooms: Room[]): Room[] {
  const tolerance = 0.3;
  const sameFloor = allRooms.filter(r => r.floor === target.floor && r.id !== target.id);
  return sameFloor.filter(r => {
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
}

function fixNBCMinimumAreas(rooms: Room[]): Room[] {
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

    // Toilets are critical (no toilet = no occupancy certificate). When the
    // room needing space is a toilet and its neighbor is sitting right at
    // its own NBC minimum, allow borrowing down to 5% below the neighbor's
    // minimum so the toilet can still be brought up to its own minimum.
    const isToiletFix = room.type === 'toilet';
    const neighborFloorAllowed = isToiletFix ? neighborMinArea * 0.95 : neighborMinArea;

    if (neighborArea - deficit < neighborFloorAllowed) continue;

    const isHorizAdj =
      Math.abs(neighbor.x - (room.x + room.width)) < 0.3 ||
      Math.abs(room.x - (neighbor.x + neighbor.width)) < 0.3;

    if (isHorizAdj) {
      const expandAmount = deficit / room.depth;
      const clampedExpand = Math.min(expandAmount, neighbor.width * 0.50);
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
      const clampedExpand = Math.min(expandAmount, neighbor.depth * 0.50);
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
 * Multi-neighbor borrowing: when a room is still below its NBC minimum area
 * after fixNBCMinimumAreas (e.g. because its single largest neighbor is
 * already sitting at its own NBC minimum and can't donate), pull smaller
 * amounts of spare area from EVERY adjacent room proportionally until the
 * deficit is covered. Each donor's contribution is capped at 30% of its own
 * current area to avoid over-shrinking any one neighbor.
 */
function multiNeighborBorrow(rooms: Room[]): Room[] {
  const roomsWithDeficit = rooms
    .map(r => ({ room: r, deficit: (NBC_MIN_AREAS[r.type] || 0) - r.width * r.depth }))
    .filter(r => r.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);

  for (const { room } of roomsWithDeficit) {
    const minArea = NBC_MIN_AREAS[room.type];
    if (!minArea) continue;
    let currentArea = room.width * room.depth;
    let remainingDeficit = minArea - currentArea;
    if (remainingDeficit <= 0) continue;

    const neighbors = findAllAdjacentRooms(room, rooms);
    if (neighbors.length === 0) continue;

    // Compute spare area each neighbor could donate.
    const donors = neighbors
      .map(n => {
        const donorArea = n.width * n.depth;
        const donorMinArea = NBC_MIN_AREAS[n.type] || 2.0;
        const spareBySpecMin = donorArea - donorMinArea;
        const spareByCap = donorArea * 0.30;
        const spareArea = Math.max(0, Math.min(spareBySpecMin, spareByCap));
        return { room: n, spareArea };
      })
      .filter(d => d.spareArea >= 0.1)
      .sort((a, b) => b.spareArea - a.spareArea);

    if (donors.length === 0) continue;

    for (const donor of donors) {
      if (remainingDeficit <= 0.01) break;

      const neighbor = donor.room;
      const donateArea = Math.min(donor.spareArea, remainingDeficit);
      if (donateArea < 0.05) continue;

      const isHorizAdj =
        Math.abs(neighbor.x - (room.x + room.width)) < 0.3 ||
        Math.abs(room.x - (neighbor.x + neighbor.width)) < 0.3;

      if (isHorizAdj) {
        const expandAmount = donateArea / room.depth;
        const clampedExpand = Math.min(expandAmount, neighbor.width * 0.30);
        if (clampedExpand <= 0) continue;
        if (neighbor.x > room.x) {
          room.width += clampedExpand;
          neighbor.x += clampedExpand;
          neighbor.width -= clampedExpand;
        } else {
          room.x -= clampedExpand;
          room.width += clampedExpand;
          neighbor.width -= clampedExpand;
        }
        currentArea = room.width * room.depth;
        remainingDeficit = minArea - currentArea;
      } else {
        const expandAmount = donateArea / room.width;
        const clampedExpand = Math.min(expandAmount, neighbor.depth * 0.30);
        if (clampedExpand <= 0) continue;
        if (neighbor.y > room.y) {
          room.depth += clampedExpand;
          neighbor.y += clampedExpand;
          neighbor.depth -= clampedExpand;
        } else {
          room.y -= clampedExpand;
          room.depth += clampedExpand;
          neighbor.depth -= clampedExpand;
        }
        currentArea = room.width * room.depth;
        remainingDeficit = minArea - currentArea;
      }
    }
  }

  return rooms;
}

// ---------------------------------------------------------------------------
// ROOM REMOVAL — drop non-essential rooms when individual rooms can't meet
// their NBC minimums even after expansion.
// ---------------------------------------------------------------------------

/**
 * After a room is removed from a floor and its space merged into a
 * neighbor, check whether any room on that floor still fails its NBC
 * minimum area. If so, run multiNeighborBorrow so the freed-up space
 * (now sitting inside the neighbor that absorbed the removed room) can be
 * redirected toward the still-failing room instead of being stranded in
 * whichever neighbor happened to be largest at removal time.
 */
function redistributeToFailingRooms(rooms: Room[]): Room[] {
  const stillFailing = rooms.some(r => {
    const min = NBC_MIN_AREAS[r.type];
    return min !== undefined && (r.width * r.depth) < min;
  });

  if (!stillFailing) return rooms;

  return multiNeighborBorrow(rooms);
}

/**
 * Remove non-essential rooms from a single floor when one or more rooms
 * still fail their individual NBC minimum area, even after expansion.
 * Expands adjacent rooms to fill gaps after removal.
 */
function removeNonEssentialFromFloor(rooms: Room[], buildableArea: number): Room[] {
  // Check if any room fails its NBC minimum area
  const hasAreaFailures = rooms.some(r => {
    const min = NBC_MIN_AREAS[r.type];
    return min !== undefined && (r.width * r.depth) < min;
  });

  if (!hasAreaFailures) return rooms;

  let result = [...rooms];

  for (const removeType of REMOVAL_PRIORITY) {
    // Recheck after each removal
    const stillFailing = result.some(r => {
      const min = NBC_MIN_AREAS[r.type];
      return min !== undefined && (r.width * r.depth) < min;
    });
    if (!stillFailing) break;

    const idx = result.findIndex(r => r.type === removeType);
    if (idx === -1) continue;

    const removed = result[idx];
    const neighbor = findLargestAdjacentRoom(removed, result);

    result.splice(idx, 1);

    if (neighbor) {
      const isHorizAdj =
        Math.abs(neighbor.x - (removed.x + removed.width)) < 0.3 ||
        Math.abs(removed.x - (neighbor.x + neighbor.width)) < 0.3;

      if (isHorizAdj) {
        if (neighbor.x > removed.x) {
          neighbor.x = removed.x;
          neighbor.width += removed.width;
        } else {
          neighbor.width += removed.width;
        }
      } else {
        if (neighbor.y > removed.y) {
          neighbor.y = removed.y;
          neighbor.depth += removed.depth;
        } else {
          neighbor.depth += removed.depth;
        }
      }

      if (removeType === 'dining' && neighbor.type === 'hall') {
        neighbor.name = 'Living/Dining';
      }

      // Instead of always leaving the freed space parked in whichever
      // neighbor absorbed the removed room, redirect it toward any room
      // still failing its NBC minimum area.
      result = redistributeToFailingRooms(result);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// GROUND COVERAGE FIX — total ground floor footprint can exceed the NBC
// maximum coverage (65% for plots under 200 m²) after room expansion.
// Remove rooms from the removal priority list until coverage is compliant,
// then redistribute the freed-up footprint to any rooms still below their
// NBC minimum (e.g. undersized toilets).
// ---------------------------------------------------------------------------

function calculateFloorFootprintArea(rooms: Room[]): number {
  return rooms.reduce((sum, r) => sum + r.width * r.depth, 0);
}

/**
 * Calculates ground floor coverage as a percentage of plot area.
 */
function calculateGroundCoveragePct(groundFloorRooms: Room[], plotArea: number): number {
  if (plotArea <= 0) return 0;
  return (calculateFloorFootprintArea(groundFloorRooms) / plotArea) * 100;
}

/**
 * Fixes ground floor coverage that exceeds the NBC maximum (65% for plots
 * under 200 m²). Removes rooms from REMOVAL_PRIORITY (passage, store,
 * utility, puja, dining) one at a time, merging each removed room's
 * footprint into its largest adjacent neighbor, until coverage is at or
 * below the limit. The freed footprint absorbed by neighbors is then
 * redistributed to any rooms still below their NBC minimum (e.g.
 * undersized toilets) via another NBC minimum-area fix pass.
 */
function fixGroundCoverage(groundFloorRooms: Room[], plotArea: number): Room[] {
  // NBC max ground coverage rule applies to plots under 200 m²
  if (plotArea >= NBC_MAX_COVERAGE_PLOT_AREA_THRESHOLD || plotArea <= 0) {
    return groundFloorRooms;
  }

  let result = [...groundFloorRooms];
  let coverage = calculateGroundCoveragePct(result, plotArea);
  if (coverage <= NBC_MAX_GROUND_COVERAGE_PCT) return result;

  let removedAny = false;

  for (const removeType of REMOVAL_PRIORITY) {
    if (coverage <= NBC_MAX_GROUND_COVERAGE_PCT) break;

    const idx = result.findIndex(r => r.type === removeType);
    if (idx === -1) continue;

    const removed = result[idx];
    const neighbor = findLargestAdjacentRoom(removed, result);

    result.splice(idx, 1);
    removedAny = true;

    if (neighbor) {
      const isHorizAdj =
        Math.abs(neighbor.x - (removed.x + removed.width)) < 0.3 ||
        Math.abs(removed.x - (neighbor.x + neighbor.width)) < 0.3;

      if (isHorizAdj) {
        if (neighbor.x > removed.x) {
          neighbor.x = removed.x;
          neighbor.width += removed.width;
        } else {
          neighbor.width += removed.width;
        }
      } else {
        if (neighbor.y > removed.y) {
          neighbor.y = removed.y;
          neighbor.depth += removed.depth;
        } else {
          neighbor.depth += removed.depth;
        }
      }

      if (removeType === 'dining' && neighbor.type === 'hall') {
        neighbor.name = 'Living/Dining';
      }
    }

    coverage = calculateGroundCoveragePct(result, plotArea);
  }

  // Redistribute the freed footprint (now absorbed into neighboring rooms)
  // to rooms still below their NBC minimum — e.g. undersized toilets —
  // by re-running the NBC minimum-area fix pass on the updated room set.
  if (removedAny) {
    result = fixNBCMinimumAreas(result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// KITCHEN EXTERIOR WALL FIX — ensure kitchen sits on an exterior wall so it
// has access for smoke exhaust and LPG storage per NBC requirements.
// ---------------------------------------------------------------------------

function isOnExteriorWall(room: Room, allRooms: Room[]): boolean {
  const sameFloor = allRooms.filter(r => r.floor === room.floor);
  if (sameFloor.length === 0) return true;
  const minX = Math.min(...sameFloor.map(r => r.x));
  const maxX = Math.max(...sameFloor.map(r => r.x + r.width));
  const minY = Math.min(...sameFloor.map(r => r.y));
  const maxY = Math.max(...sameFloor.map(r => r.y + r.depth));
  const tolerance = 0.15;
  return (
    Math.abs(room.x - minX) < tolerance ||
    Math.abs(room.x + room.width - maxX) < tolerance ||
    Math.abs(room.y - minY) < tolerance ||
    Math.abs(room.y + room.depth - maxY) < tolerance
  );
}

function fixKitchenExteriorWall(rooms: Room[]): Room[] {
  const kitchens = rooms.filter(r => r.type === 'kitchen');
  for (const kitchen of kitchens) {
    if (isOnExteriorWall(kitchen, rooms)) continue;

    // Find an adjacent room that IS on an exterior wall and swap positions
    const sameFloor = rooms.filter(r => r.floor === kitchen.floor && r.id !== kitchen.id);
    const candidates = sameFloor.filter(r =>
      isOnExteriorWall(r, rooms) &&
      r.type !== 'parking' && r.type !== 'staircase' &&
      r.type !== 'toilet'
    );

    if (candidates.length === 0) continue;

    // Prefer swapping with adjacent rooms
    const adjacent = candidates.filter(r => {
      const hOverlap = Math.min(kitchen.y + kitchen.depth, r.y + r.depth) - Math.max(kitchen.y, r.y);
      const vOverlap = Math.min(kitchen.x + kitchen.width, r.x + r.width) - Math.max(kitchen.x, r.x);
      return (hOverlap > 0.1 && (Math.abs(r.x - (kitchen.x + kitchen.width)) < 0.3 || Math.abs(kitchen.x - (r.x + r.width)) < 0.3)) ||
             (vOverlap > 0.1 && (Math.abs(r.y - (kitchen.y + kitchen.depth)) < 0.3 || Math.abs(kitchen.y - (r.y + r.depth)) < 0.3));
    });

    const swapTarget = adjacent.length > 0 ? adjacent[0] : candidates[0];

    // Swap positions
    const tmpX = kitchen.x, tmpY = kitchen.y, tmpW = kitchen.width, tmpD = kitchen.depth;
    kitchen.x = swapTarget.x; kitchen.y = swapTarget.y; kitchen.width = swapTarget.width; kitchen.depth = swapTarget.depth;
    swapTarget.x = tmpX; swapTarget.y = tmpY; swapTarget.width = tmpW; swapTarget.depth = tmpD;
  }
  return rooms;
}

// ---------------------------------------------------------------------------
// MAIN AUTO-FIX ENTRY POINT
// ---------------------------------------------------------------------------

/**
 * Auto-fix layout — multi-phase approach, run inside an outer convergence loop:
 *  Phase 1: Vastu room swaps
 *  Phase 2: NBC expansion (borrow space from single largest neighbor) — 5 passes
 *  Phase 2.5: Multi-neighbor borrowing for rooms that still fail their NBC
 *             minimum area because their single largest neighbor was already
 *             at its own NBC minimum and couldn't donate enough alone.
 *  Phase 3: Room removal when individual rooms still fail NBC minimums
 *  Phase 4: Re-run NBC expansion after removal — 5 more passes
 *  Phase 5: Kitchen exterior wall fix
 *  Phase 6: Ground floor coverage fix (NBC max 65% coverage for plots < 200 m²)
 *
 * Fail-closed: returns null on any error.
 */
export function autoFixLayout(layout: Layout, facing: Facing): Layout | null {
  try {
    const optimized = deepClone(layout);
    const { plotWidthM, plotDepthM } = optimized;
    const buildableW = optimized.buildableWidthM || plotWidthM;
    const buildableD = optimized.buildableDepthM || plotDepthM;
    const buildableArea = buildableW * buildableD;
    const plotArea = plotWidthM * plotDepthM;

    // Outer convergence loop — max 3 full cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      // ===== PHASE 1 & 2: Vastu swap + NBC expansion (5 passes) =====
      for (let pass = 0; pass < 5; pass++) {
        for (const fl of optimized.floors) {
          fl.rooms = optimizeFloorVastu(fl.rooms, plotWidthM, plotDepthM, facing);
        }
        for (const fl of optimized.floors) {
          fl.rooms = fixNBCMinimumAreas(fl.rooms);
        }
        const passRooms = optimized.floors.flatMap(f => f.rooms);
        const passNBC = checkNBCCompliance(passRooms, plotArea, optimized.builtUpAreaSqM, optimized.floors.length);
        if (passNBC.issues.filter(i => i.severity === 'error').length === 0) break;
      }

      // ===== PHASE 2.5: Multi-neighbor borrowing =====
      // If any room is still below its NBC minimum area after Phase 2 (e.g.
      // because its single largest neighbor was already at its own minimum
      // and fixNBCMinimumAreas refused to shrink it further), give every
      // adjacent room a chance to donate spare area proportionally before
      // falling back to removing rooms entirely.
      {
        let areaFailuresRemain = optimized.floors.some(fl =>
          fl.rooms.some(r => {
            const min = NBC_MIN_AREAS[r.type];
            return min !== undefined && (r.width * r.depth) < min;
          })
        );
        if (areaFailuresRemain) {
          for (const fl of optimized.floors) {
            fl.rooms = multiNeighborBorrow(fl.rooms);
          }
        }
      }

      // ===== PHASE 3: Room removal if individual rooms still fail =====
      let allRooms = optimized.floors.flatMap(f => f.rooms);
      let nbcResult = checkNBCCompliance(allRooms, plotArea, optimized.builtUpAreaSqM, optimized.floors.length);
      const areaErrors = nbcResult.issues.filter(i =>
        i.severity === 'error' && i.issue.includes('below NBC minimum')
      );

      if (areaErrors.length > 0) {
        for (const fl of optimized.floors) {
          fl.rooms = removeNonEssentialFromFloor(fl.rooms, buildableArea);
        }

        // ===== PHASE 4: Re-run expansion after room removal =====
        for (let pass = 0; pass < 5; pass++) {
          for (const fl of optimized.floors) {
            fl.rooms = optimizeFloorVastu(fl.rooms, plotWidthM, plotDepthM, facing);
          }
          for (const fl of optimized.floors) {
            fl.rooms = fixNBCMinimumAreas(fl.rooms);
          }
          const passRooms = optimized.floors.flatMap(f => f.rooms);
          const passNBC = checkNBCCompliance(passRooms, plotArea, optimized.builtUpAreaSqM, optimized.floors.length);
          if (passNBC.issues.filter(i => i.severity === 'error').length === 0) break;
        }
      }

      // ===== PHASE 5: Kitchen exterior wall fix =====
      for (const fl of optimized.floors) {
        fl.rooms = fixKitchenExteriorWall(fl.rooms);
      }

      // ===== PHASE 6: Ground Coverage Check =====
      // Total ground floor footprint can exceed the NBC max coverage of 65%
      // (for plots under 200 m²) after expansion. Remove rooms from the
      // removal priority list until coverage is compliant, then redistribute
      // the freed area to any rooms still below their NBC minimums.
      if (optimized.floors.length > 0) {
        const groundFloor = optimized.floors[0];
        groundFloor.rooms = fixGroundCoverage(groundFloor.rooms, plotArea);
      }

      // Check convergence
      allRooms = optimized.floors.flatMap(f => f.rooms);
      nbcResult = checkNBCCompliance(allRooms, plotArea, optimized.builtUpAreaSqM, optimized.floors.length);
      if (nbcResult.issues.filter(i => i.severity === 'error').length === 0) break;
    }

    // ===== FINAL RECALCULATION =====
    const allRooms = optimized.floors.flatMap(f => f.rooms);

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
    console.error('AutoFix failed:', error);
    return null;
  }
}
