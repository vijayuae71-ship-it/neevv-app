import { Layout, Room, Facing } from '../types';
import { getRoomZone, calculateVastuScore, VASTU_IDEAL_ZONES, VASTU_TABOO } from './vastuEngine';
import { checkNBCCompliance } from './nbcCompliance';

// ============================================================================
// VASTU & NBC AUTO-FIX ENGINE v4
// Multi-phase: pre-shrink to fit → swap for Vastu → expand for NBC →
// REMOVE non-essential rooms when buildable area is physically too small
// for all rooms at NBC minimums.
// Phase 0: proportional pre-shrink so over-programmed floors create slack
//          that later expansion passes can redistribute.
// Phase 2.5: multi-neighbor borrowing when a single neighbor can't cover the
// full deficit (fixes rooms plateauing below their NBC minimum area).
// Phase 4: re-run expansion after room removal to fill freed space.
// Phase 4.5: chain wall-shifting — moves area through a chain of adjacent
//            rooms when a failing room has no directly adjacent surplus.
// Phase 5: fix kitchen exterior wall access.
// Phase 6: fix ground floor coverage exceeding the NBC maximum, WITHOUT
//          re-expanding rooms afterward (that re-expansion previously
//          pushed coverage back above the limit and caused an oscillation
//          with the area-minimum fixes).
//
// The outer convergence loop only runs Vastu swaps in its first cycle —
// swapping room positions in later cycles could undo NBC wall adjustments
// made in an earlier cycle, causing regressions.
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
 * floor (not just the single largest one). Used by multiNeighborBorrow and
 * chainRedistribute to spread a room's area deficit across every available
 * neighbor, or walk the adjacency graph, instead of relying on one neighbor
 * that may already be at its own NBC minimum.
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

interface RoomSnapshot {
  x: number;
  y: number;
  width: number;
  depth: number;
}

function snapshotRoom(r: Room): RoomSnapshot {
  return { x: r.x, y: r.y, width: r.width, depth: r.depth };
}

function restoreRoom(r: Room, snap: RoomSnapshot): void {
  r.x = snap.x;
  r.y = snap.y;
  r.width = snap.width;
  r.depth = snap.depth;
}

function calculateFloorFootprintArea(rooms: Room[]): number {
  return rooms.reduce((sum, r) => sum + r.width * r.depth, 0);
}

/**
 * Proportionally scales every room on a floor (about the floor's own
 * bounding-box origin) so the total footprint fits within `targetArea`.
 * Both width and depth are scaled by sqrt(ratio) so each room keeps its
 * aspect ratio, and since it's a uniform similarity transform about a
 * shared origin, every room stays exactly as adjacent to its neighbors as
 * it was before — no gaps or overlaps are introduced.
 *
 * Used both for the Phase 0 pre-shrink (fit the buildable envelope) and for
 * the ground-coverage fix (shrink to the NBC max-coverage target) so both
 * cases share one well-tested implementation.
 */
function scaleFloorToArea(rooms: Room[], targetArea: number): Room[] {
  if (rooms.length === 0 || targetArea <= 0) return rooms;
  const totalArea = calculateFloorFootprintArea(rooms);
  if (totalArea <= targetArea) return rooms;

  const ratio = targetArea / totalArea;
  // Defensive floor: never shrink a floor to less than 40% of its current
  // linear scale in one shot, however extreme the over-programming is.
  const scale = Math.max(Math.sqrt(ratio), 0.4);

  const minX = Math.min(...rooms.map(r => r.x));
  const minY = Math.min(...rooms.map(r => r.y));

  for (const room of rooms) {
    room.x = minX + (room.x - minX) * scale;
    room.y = minY + (room.y - minY) * scale;
    room.width *= scale;
    room.depth *= scale;
  }

  return rooms;
}

/**
 * Expands rooms that fail their NBC minimum area/width by borrowing space
 * from their single largest adjacent neighbor.
 *
 * When `floorAreaCap` is provided (used for the ground floor, where NBC
 * caps coverage at 65% of plot area for plots < 200 m²), every mutation is
 * checked against the cap afterward and reverted if it would push the
 * floor's total footprint over the limit — this is what makes NBC
 * expansion "coverage aware" instead of silently re-inflating a floor that
 * a prior coverage fix had already brought into compliance.
 */
function fixNBCMinimumAreas(rooms: Room[], floorAreaCap?: number): Room[] {
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

    const roomSnap = snapshotRoom(room);
    const neighborSnap = snapshotRoom(neighbor);

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

    if (floorAreaCap !== undefined && calculateFloorFootprintArea(rooms) > floorAreaCap + 0.01) {
      restoreRoom(room, roomSnap);
      restoreRoom(neighbor, neighborSnap);
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
        const roomSnap = snapshotRoom(room);
        const neighborSnap = snapshotRoom(neighbor);
        room.width = minWidth;
        if (Math.abs(neighbor.x - (room.x + room.width - needed)) < 0.3) {
          neighbor.x += needed;
          neighbor.width -= needed;
        }
        if (floorAreaCap !== undefined && calculateFloorFootprintArea(rooms) > floorAreaCap + 0.01) {
          restoreRoom(room, roomSnap);
          restoreRoom(neighbor, neighborSnap);
        }
      }
    } else if (room.depth < minWidth) {
      const needed = minWidth - room.depth;
      const neighbor = findLargestAdjacentRoom(room, rooms);
      if (neighbor && neighbor.depth > needed + 1.0) {
        const roomSnap = snapshotRoom(room);
        const neighborSnap = snapshotRoom(neighbor);
        room.depth = minWidth;
        if (Math.abs(neighbor.y - (room.y + room.depth - needed)) < 0.3) {
          neighbor.y += needed;
          neighbor.depth -= needed;
        }
        if (floorAreaCap !== undefined && calculateFloorFootprintArea(rooms) > floorAreaCap + 0.01) {
          restoreRoom(room, roomSnap);
          restoreRoom(neighbor, neighborSnap);
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
 *
 * `floorAreaCap`, when provided, reverts any single donation that would
 * push the floor's total footprint above the cap (see fixNBCMinimumAreas).
 */
function multiNeighborBorrow(rooms: Room[], floorAreaCap?: number): Room[] {
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

      const roomSnap = snapshotRoom(room);
      const neighborSnap = snapshotRoom(neighbor);

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
      }

      if (floorAreaCap !== undefined && calculateFloorFootprintArea(rooms) > floorAreaCap + 0.01) {
        restoreRoom(room, roomSnap);
        restoreRoom(neighbor, neighborSnap);
        continue;
      }

      currentArea = room.width * room.depth;
      remainingDeficit = minArea - currentArea;
    }
  }

  return rooms;
}

// ---------------------------------------------------------------------------
// CHAIN WALL-SHIFTING — handles rooms that fail their NBC minimum but have
// no directly adjacent room with spare area (e.g. Bedroom 2 is only
// adjacent to a passage and a toilet, both already at their own minimums,
// but a Hall two rooms away has plenty of surplus). Walks the shortest path
// of adjacent rooms from any surplus room to the failing room and shifts
// each wall along that chain so area flows through the intermediate rooms.
// ---------------------------------------------------------------------------

function getNbcDeficit(r: Room): number {
  const min = NBC_MIN_AREAS[r.type];
  if (min === undefined) return 0;
  return min - r.width * r.depth;
}

function getNbcSurplus(r: Room): number {
  const min = NBC_MIN_AREAS[r.type] ?? 2.0;
  return r.width * r.depth - min;
}

/**
 * Breadth-first search over the same-floor adjacency graph starting at
 * `start`, returning the shortest chain [surplusRoom, ..., start] to the
 * nearest room in `surplusRooms`, or null if none is reachable.
 */
function findShortestChainToSurplus(start: Room, allRooms: Room[], surplusRooms: Room[]): Room[] | null {
  const surplusIds = new Set(surplusRooms.map(r => r.id));
  const visited = new Set<string>([start.id]);
  const parent = new Map<string, Room>();
  const queue: Room[] = [start];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    if (current.id !== start.id && surplusIds.has(current.id)) {
      const path: Room[] = [current];
      let node = current;
      while (parent.has(node.id)) {
        node = parent.get(node.id) as Room;
        path.push(node);
      }
      return path; // [surplusRoom, ...intermediates..., start]
    }

    for (const n of findAllAdjacentRooms(current, allRooms)) {
      if (visited.has(n.id)) continue;
      visited.add(n.id);
      parent.set(n.id, current);
      queue.push(n);
    }
  }

  return null;
}

/**
 * Shifts the shared wall between each consecutive pair of rooms in `chain`
 * (ordered surplus → ... → failing room), passing `desiredTransfer` m² of
 * area down the chain. Intermediate rooms receive area from the room
 * "above" them in the chain and immediately hand the same amount to the
 * next room, so they end up net-neutral (aside from the geometric
 * approximation already used elsewhere in this file, where a wall shift is
 * computed from one room's own depth/width). Returns the area actually
 * delivered to the final (failing) room.
 */
function shiftWallsAlongChain(chain: Room[], desiredTransfer: number): number {
  if (chain.length < 2 || desiredTransfer <= 0.01) return 0;

  const surplusRoom = chain[0];
  const availableAtSource = Math.max(0, getNbcSurplus(surplusRoom));
  let transferAmt = Math.min(desiredTransfer, availableAtSource);
  if (transferAmt < 0.05) return 0;

  for (let i = 0; i < chain.length - 1; i++) {
    const donor = chain[i];
    const recipient = chain[i + 1];

    const isHorizAdj =
      Math.abs(donor.x - (recipient.x + recipient.width)) < 0.3 ||
      Math.abs(recipient.x - (donor.x + donor.width)) < 0.3;

    if (isHorizAdj) {
      if (recipient.depth <= 0) return 0;
      const expandAmount = transferAmt / recipient.depth;
      const clampedExpand = Math.min(expandAmount, donor.width * 0.4);
      if (clampedExpand <= 0.01) return 0;
      if (donor.x > recipient.x) {
        recipient.width += clampedExpand;
        donor.x += clampedExpand;
        donor.width -= clampedExpand;
      } else {
        recipient.x -= clampedExpand;
        recipient.width += clampedExpand;
        donor.width -= clampedExpand;
      }
      transferAmt = clampedExpand * recipient.depth;
    } else {
      if (recipient.width <= 0) return 0;
      const expandAmount = transferAmt / recipient.width;
      const clampedExpand = Math.min(expandAmount, donor.depth * 0.4);
      if (clampedExpand <= 0.01) return 0;
      if (donor.y > recipient.y) {
        recipient.depth += clampedExpand;
        donor.y += clampedExpand;
        donor.depth -= clampedExpand;
      } else {
        recipient.y -= clampedExpand;
        recipient.depth += clampedExpand;
        donor.depth -= clampedExpand;
      }
      transferAmt = clampedExpand * recipient.width;
    }
  }

  return transferAmt;
}

/**
 * For every room still below its NBC minimum area, finds the nearest room
 * (by adjacency hops) that has surplus area and shifts walls along that
 * chain to move area toward the failing room. Repeats until no failing
 * room can be reached from any surplus room, or no more progress is made.
 */
function chainRedistribute(rooms: Room[]): Room[] {
  let guard = 0;
  while (guard < 20) {
    guard++;

    const failing = rooms
      .map(r => ({ room: r, deficit: getNbcDeficit(r) }))
      .filter(d => d.deficit > 0.05)
      .sort((a, b) => b.deficit - a.deficit);

    if (failing.length === 0) break;

    let anyTransfer = false;

    for (const { room: failingRoom } of failing) {
      const currentDeficit = getNbcDeficit(failingRoom);
      if (currentDeficit <= 0.05) continue;

      const surplusRooms = rooms.filter(r => r.id !== failingRoom.id && getNbcSurplus(r) > 0.1);
      if (surplusRooms.length === 0) continue;

      const chain = findShortestChainToSurplus(failingRoom, rooms, surplusRooms);
      if (!chain || chain.length < 2) continue;

      const transferred = shiftWallsAlongChain(chain, currentDeficit);
      if (transferred > 0.01) anyTransfer = true;
    }

    if (!anyTransfer) break;
  }

  return rooms;
}

// ---------------------------------------------------------------------------
// STAIRCASE PROPORTIONS — staircases need BOTH their area (>= 3.0 m²) and
// minor width (>= 1.0 m) fixed together. Expanding only one dimension via
// the generic single-neighbor donor logic can leave a staircase area
// compliant but too narrow, or vice versa, and the standard donor caps
// (30-50% of the neighbor) are often too conservative to move the small
// absolute amount (often well under 1.5 m²) a staircase actually needs.
// ---------------------------------------------------------------------------

function fixStaircaseProportions(rooms: Room[]): Room[] {
  const minArea = NBC_MIN_AREAS.staircase;
  const minWidth = NBC_MIN_WIDTHS.staircase;
  const donorCapPct = 0.5;

  for (const stair of rooms.filter(r => r.type === 'staircase')) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const area = stair.width * stair.depth;
      const minorDim = Math.min(stair.width, stair.depth);
      if (area >= minArea - 0.02 && minorDim >= minWidth - 0.02) break;

      const donors = findAllAdjacentRooms(stair, rooms)
        .map(n => ({ room: n, spare: n.width * n.depth - (NBC_MIN_AREAS[n.type] ?? 2.0) }))
        .filter(d => d.spare > 0.05)
        .sort((a, b) => b.spare - a.spare);

      if (donors.length === 0) break;

      let madeProgress = false;

      for (const { room: neighbor } of donors) {
        const areaDeficit = Math.max(0, minArea - stair.width * stair.depth);
        const widthDeficit = Math.max(0, minWidth - Math.min(stair.width, stair.depth));
        if (areaDeficit <= 0.02 && widthDeficit <= 0.02) break;

        const isHorizAdj =
          Math.abs(neighbor.x - (stair.x + stair.width)) < 0.3 ||
          Math.abs(stair.x - (neighbor.x + neighbor.width)) < 0.3;

        if (isHorizAdj) {
          // This link grows stair.width.
          const neededForWidth = stair.width < minWidth ? widthDeficit : 0;
          const neededForArea = stair.depth > 0 ? areaDeficit / stair.depth : 0;
          const wanted = Math.max(neededForWidth, neededForArea);
          const clampedExpand = Math.min(wanted, neighbor.width * donorCapPct);
          if (clampedExpand <= 0.01) continue;
          if (neighbor.x > stair.x) {
            stair.width += clampedExpand;
            neighbor.x += clampedExpand;
            neighbor.width -= clampedExpand;
          } else {
            stair.x -= clampedExpand;
            stair.width += clampedExpand;
            neighbor.width -= clampedExpand;
          }
          madeProgress = true;
        } else {
          // This link grows stair.depth.
          const neededForWidth = stair.depth < minWidth ? widthDeficit : 0;
          const neededForArea = stair.width > 0 ? areaDeficit / stair.width : 0;
          const wanted = Math.max(neededForWidth, neededForArea);
          const clampedExpand = Math.min(wanted, neighbor.depth * donorCapPct);
          if (clampedExpand <= 0.01) continue;
          if (neighbor.y > stair.y) {
            stair.depth += clampedExpand;
            neighbor.y += clampedExpand;
            neighbor.depth -= clampedExpand;
          } else {
            stair.y -= clampedExpand;
            stair.depth += clampedExpand;
            neighbor.depth -= clampedExpand;
          }
          madeProgress = true;
        }
      }

      if (!madeProgress) break;
    }
  }

  return rooms;
}

// ---------------------------------------------------------------------------
// ROOM REMOVAL — drop non-essential rooms when individual rooms can't meet
// their NBC minimums even after expansion.
// ---------------------------------------------------------------------------

/**
 * Merges a removed room's footprint into an adjacent room that will absorb
 * it, growing the neighbor on whichever side is adjacent to the removed
 * room.
 */
function mergeRemovedRoomInto(neighbor: Room, removed: Room): void {
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
}

/**
 * From a list of candidate rooms, picks the one with the largest NBC
 * minimum-area deficit (if any). Used to prefer merging freed footprint
 * into a room that actually needs it, rather than whichever neighbor
 * happens to be geometrically largest.
 */
function pickFailingAdjacent(candidates: Room[]): Room | null {
  const failing = candidates
    .map(r => ({ room: r, deficit: getNbcDeficit(r) }))
    .filter(c => c.deficit > 0.01)
    .sort((a, b) => b.deficit - a.deficit);
  return failing.length > 0 ? failing[0].room : null;
}

/**
 * After a room is removed from a floor and its space merged into a
 * neighbor, check whether any room on that floor still fails its NBC
 * minimum area. If so, first try multiNeighborBorrow so the freed-up space
 * (now sitting inside the neighbor that absorbed the removed room) can be
 * redirected toward the still-failing room. If every direct neighbor is
 * already sitting at its own NBC minimum (so multiNeighborBorrow finds no
 * donors), fall back to chainRedistribute, which can reach a surplus room
 * a few hops away through the adjacency graph.
 */
function redistributeToFailingRooms(rooms: Room[]): Room[] {
  const isStillFailing = (list: Room[]): boolean =>
    list.some(r => getNbcDeficit(r) > 0.05);

  if (!isStillFailing(rooms)) return rooms;

  let result = multiNeighborBorrow(rooms);
  if (isStillFailing(result)) {
    result = chainRedistribute(result);
  }
  return result;
}

/**
 * Remove non-essential rooms from a single floor when one or more rooms
 * still fail their individual NBC minimum area, even after expansion.
 * Expands adjacent rooms to fill gaps after removal, preferring to merge
 * into whichever adjacent room is itself failing its NBC minimum (so the
 * freed space goes where it's actually needed) and only falling back to
 * the largest neighbor when no adjacent room is failing.
 */
function removeNonEssentialFromFloor(rooms: Room[], buildableArea: number): Room[] {
  // Check if any room fails its NBC minimum area
  const hasAreaFailures = rooms.some(r => getNbcDeficit(r) > 0.05);

  if (!hasAreaFailures) return rooms;

  let result = [...rooms];

  for (const removeType of REMOVAL_PRIORITY) {
    // Recheck after each removal
    const stillFailing = result.some(r => getNbcDeficit(r) > 0.05);
    if (!stillFailing) break;

    const idx = result.findIndex(r => r.type === removeType);
    if (idx === -1) continue;

    const removed = result[idx];
    const adjacentRooms = findAllAdjacentRooms(removed, result);
    const failingNeighbor = pickFailingAdjacent(adjacentRooms);
    const neighbor = failingNeighbor ?? findLargestAdjacentRoom(removed, result);

    result.splice(idx, 1);

    if (neighbor) {
      mergeRemovedRoomInto(neighbor, removed);

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
// then shrink the remaining footprint down to the coverage target and only
// move area BETWEEN rooms (never re-expanding the floor as a whole) to fix
// any resulting NBC minimum-area violations.
// ---------------------------------------------------------------------------

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
 * footprint preferentially into an adjacent room that is failing its own
 * NBC minimum (falling back to the largest neighbor otherwise), until
 * coverage is at or below the limit.
 *
 * Crucially, this does NOT call fixNBCMinimumAreas afterward — that
 * re-expansion is exactly what previously pushed coverage back above the
 * limit, oscillating between coverage and area-minimum fixes. Instead, the
 * remaining footprint is proportionally shrunk down to exactly the
 * coverage target, and any resulting NBC minimum-area violations are fixed
 * only by moving area between existing rooms (multiNeighborBorrow, capped
 * so the shrink is never undone).
 */
function fixGroundCoverage(groundFloorRooms: Room[], plotArea: number): Room[] {
  // NBC max ground coverage rule applies to plots under 200 m²
  if (plotArea >= NBC_MAX_COVERAGE_PLOT_AREA_THRESHOLD || plotArea <= 0) {
    return groundFloorRooms;
  }

  let result = [...groundFloorRooms];
  let coverage = calculateGroundCoveragePct(result, plotArea);
  if (coverage <= NBC_MAX_GROUND_COVERAGE_PCT) return result;

  const targetArea = plotArea * (NBC_MAX_GROUND_COVERAGE_PCT / 100);

  for (const removeType of REMOVAL_PRIORITY) {
    if (coverage <= NBC_MAX_GROUND_COVERAGE_PCT) break;

    const idx = result.findIndex(r => r.type === removeType);
    if (idx === -1) continue;

    const removed = result[idx];
    const adjacentRooms = findAllAdjacentRooms(removed, result);
    const failingNeighbor = pickFailingAdjacent(adjacentRooms);
    const neighbor = failingNeighbor ?? findLargestAdjacentRoom(removed, result);

    result.splice(idx, 1);

    if (neighbor) {
      mergeRemovedRoomInto(neighbor, removed);

      if (removeType === 'dining' && neighbor.type === 'hall') {
        neighbor.name = 'Living/Dining';
      }
    }

    coverage = calculateGroundCoveragePct(result, plotArea);
  }

  // Shrink the remaining footprint proportionally down to the coverage
  // target (rather than re-expanding via fixNBCMinimumAreas).
  const currentTotal = calculateFloorFootprintArea(result);
  if (currentTotal > targetArea && targetArea > 0) {
    result = scaleFloorToArea(result, targetArea);
  }

  // Redistribute area between rooms (zero net change to the floor's total
  // footprint) to patch up any NBC minimum-area violations the shrink
  // introduced, capped so this never pushes coverage back above target.
  result = multiNeighborBorrow(result, targetArea);

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
 *  Phase 0: Global proportional pre-shrink — if a floor's total room area
 *           already exceeds the buildable envelope, shrink every room on
 *           that floor (preserving aspect ratio and adjacency) so it fits,
 *           manufacturing the slack the expansion phases below redistribute.
 *  Phase 1: Vastu room swaps (cycle 0 only — swapping positions in later
 *           cycles could undo NBC wall adjustments made in an earlier
 *           cycle, causing regressions).
 *  Phase 2: NBC expansion (borrow space from single largest neighbor) — 5
 *           passes, coverage-aware on the ground floor.
 *  Phase 2.5: Multi-neighbor borrowing for rooms that still fail their NBC
 *             minimum area because their single largest neighbor was
 *             already at its own NBC minimum and couldn't donate enough
 *             alone, plus dedicated staircase area/width handling.
 *  Phase 3: Room removal when individual rooms still fail NBC minimums
 *  Phase 4: Re-run NBC expansion after removal — 5 more passes
 *  Phase 4.5: Chain wall-shifting — moves area through a chain of adjacent
 *             rooms when a failing room has no directly adjacent surplus.
 *  Phase 5: Kitchen exterior wall fix
 *  Phase 6: Ground floor coverage fix (NBC max 65% coverage for plots < 200
 *           m²) — shrinks rather than re-expanding, so it can't oscillate
 *           against Phase 2/4.
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

    const groundCoverageApplies = plotArea > 0 && plotArea < NBC_MAX_COVERAGE_PLOT_AREA_THRESHOLD;
    const groundFloorAreaCap = groundCoverageApplies
      ? plotArea * (NBC_MAX_GROUND_COVERAGE_PCT / 100)
      : undefined;

    // ===== PHASE 0: Global proportional pre-shrink =====
    for (const fl of optimized.floors) {
      fl.rooms = scaleFloorToArea(fl.rooms, buildableArea);
    }

    // Outer convergence loop — max 3 full cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      const runVastuSwap = cycle === 0;

      // ===== PHASE 1 & 2: Vastu swap (cycle 0 only) + NBC expansion =====
      for (let pass = 0; pass < 5; pass++) {
        if (runVastuSwap) {
          for (const fl of optimized.floors) {
            fl.rooms = optimizeFloorVastu(fl.rooms, plotWidthM, plotDepthM, facing);
          }
        }
        optimized.floors.forEach((fl, idx) => {
          const cap = idx === 0 ? groundFloorAreaCap : undefined;
          fl.rooms = fixNBCMinimumAreas(fl.rooms, cap);
        });
        const passRooms = optimized.floors.flatMap(f => f.rooms);
        const passNBC = checkNBCCompliance(passRooms, plotArea, optimized.builtUpAreaSqM, optimized.floors.length);
        if (passNBC.issues.filter(i => i.severity === 'error').length === 0) break;
      }

      // ===== PHASE 2.5: Multi-neighbor borrowing + staircase proportions =====
      // If any room is still below its NBC minimum area after Phase 2 (e.g.
      // because its single largest neighbor was already at its own minimum
      // and fixNBCMinimumAreas refused to shrink it further), give every
      // adjacent room a chance to donate spare area proportionally before
      // falling back to removing rooms entirely.
      {
        const areaFailuresRemain = optimized.floors.some(fl => fl.rooms.some(r => getNbcDeficit(r) > 0.05));
        if (areaFailuresRemain) {
          optimized.floors.forEach((fl, idx) => {
            const cap = idx === 0 ? groundFloorAreaCap : undefined;
            fl.rooms = multiNeighborBorrow(fl.rooms, cap);
          });
        }
        for (const fl of optimized.floors) {
          fl.rooms = fixStaircaseProportions(fl.rooms);
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
          if (runVastuSwap) {
            for (const fl of optimized.floors) {
              fl.rooms = optimizeFloorVastu(fl.rooms, plotWidthM, plotDepthM, facing);
            }
          }
          optimized.floors.forEach((fl, idx) => {
            const cap = idx === 0 ? groundFloorAreaCap : undefined;
            fl.rooms = fixNBCMinimumAreas(fl.rooms, cap);
          });
          const passRooms = optimized.floors.flatMap(f => f.rooms);
          const passNBC = checkNBCCompliance(passRooms, plotArea, optimized.builtUpAreaSqM, optimized.floors.length);
          if (passNBC.issues.filter(i => i.severity === 'error').length === 0) break;
        }
      }

      // ===== PHASE 4.5: Chain wall-shifting =====
      // Handles rooms (e.g. a Bedroom 2 that isn't adjacent to any surplus
      // room, only to other rooms already at their own NBC minimums) by
      // walking the shortest chain of adjacent rooms from a surplus room to
      // the failing one and shifting each wall along the way.
      for (const fl of optimized.floors) {
        fl.rooms = chainRedistribute(fl.rooms);
        fl.rooms = fixStaircaseProportions(fl.rooms);
      }

      // ===== PHASE 5: Kitchen exterior wall fix =====
      for (const fl of optimized.floors) {
        fl.rooms = fixKitchenExteriorWall(fl.rooms);
      }

      // ===== PHASE 6: Ground Coverage Check =====
      // Total ground floor footprint can exceed the NBC max coverage of 65%
      // (for plots under 200 m²) after expansion. Remove rooms from the
      // removal priority list until coverage is compliant, then shrink the
      // remaining footprint to the target — no re-expansion, so this can't
      // trade off against the area-minimum fixes above.
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
