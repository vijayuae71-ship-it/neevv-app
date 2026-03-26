import { Room, Facing, VastuDetail } from '../types';

// Vastu ideal zones for each room type, based on compass directions
// Zones: NE, NW, SE, SW, N, S, E, W, Center
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

/**
 * Determine the zone of a room within the buildable area.
 * We divide the buildable area into a 3x3 grid:
 *   NW | N  | NE
 *   W  | C  | E
 *   SW | S  | SE
 * Front of plot depends on facing direction.
 */
export function getRoomZone(
  room: Room,
  plotWidthM: number,
  plotDepthM: number,
  facing: Facing
): string {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.depth / 2;

  // Normalize to 0-1 range
  const nx = cx / plotWidthM;
  const ny = cy / plotDepthM;

  // Determine column: left, center, right
  let col: string;
  if (nx < 0.33) col = 'L';
  else if (nx > 0.67) col = 'R';
  else col = 'C';

  // Determine row: front, center, back
  let row: string;
  if (ny < 0.33) row = 'F';
  else if (ny > 0.67) row = 'B';
  else row = 'M';

  // Map to compass direction based on facing
  return mapToCompass(row, col, facing);
}

function mapToCompass(row: string, col: string, facing: Facing): string {
  // Row F = front of plot (facing direction), B = rear
  // We need to convert plot-relative (F/M/B x L/C/R) to compass directions

  // For a North-facing plot: front=North, back=South, left=West, right=East
  // For a South-facing plot: front=South, back=North, left=East, right=West
  // For an East-facing plot: front=East, back=West, left=North, right=South
  // For a West-facing plot: front=West, back=East, left=South, right=North

  type DirMap = { front: string; back: string; left: string; right: string };
  const dirMap: Record<Facing, DirMap> = {
    North: { front: 'N', back: 'S', left: 'W', right: 'E' },
    South: { front: 'S', back: 'N', left: 'E', right: 'W' },
    East: { front: 'E', back: 'W', left: 'N', right: 'S' },
    West: { front: 'W', back: 'E', left: 'S', right: 'N' },
  };

  const d = dirMap[facing];

  // Map row to NS component
  let ns = '';
  if (row === 'F') ns = d.front;
  else if (row === 'B') ns = d.back;

  // Map col to EW component
  let ew = '';
  if (col === 'L') ew = d.left;
  else if (col === 'R') ew = d.right;

  if (row === 'M' && col === 'C') return 'Center';
  if (row === 'M') return ew || 'Center';
  if (col === 'C') return ns || 'Center';

  // Corner: combine NS + EW but in standard order (N/S first, then E/W)
  const nsOrder = ['N', 'S'];
  const ewOrder = ['E', 'W'];
  if (nsOrder.includes(ns) && ewOrder.includes(ew)) {
    return ns + ew; // NE, NW, SE, SW
  }
  // If facing is E/W, the mapping might produce E/W as ns
  // We need to normalize
  if (ewOrder.includes(ns) && nsOrder.includes(ew)) {
    return ew + ns; // Rearrange to standard form
  }
  return ns + ew || 'Center';
}

export function calculateVastuScore(
  rooms: Room[],
  plotWidthM: number,
  plotDepthM: number,
  facing: Facing
): { score: number; details: VastuDetail[] } {
  const details: VastuDetail[] = [];
  let totalWeight = 0;
  let compliantWeight = 0;

  // Weight: main rooms count more
  const weights: Record<string, number> = {
    master_bedroom: 15,
    bedroom: 10,
    hall: 15,
    kitchen: 15,
    toilet: 8,
    dining: 5,
    puja: 10,
    staircase: 7,
    entrance: 10,
    parking: 5,
    store: 3,
    utility: 3,
    balcony: 3,
    passage: 2,
  };

  for (const room of rooms) {
    const zone = getRoomZone(room, plotWidthM, plotDepthM, facing);
    const idealZones = VASTU_IDEAL_ZONES[room.type] || ['Center'];
    const compliant = idealZones.includes(zone);
    const w = weights[room.type] || 5;
    totalWeight += w;
    if (compliant) compliantWeight += w;

    details.push({
      room: room.name,
      idealZone: idealZones.join('/'),
      actualZone: zone,
      compliant,
    });
  }

  const score = totalWeight > 0 ? Math.round((compliantWeight / totalWeight) * 100) : 0;
  return { score, details };
}

/**
 * Get ideal zone for a room type given facing.
 * Returns the preferred zone as {row, col} in plot-relative coordinates.
 */
export function getIdealPlotPosition(
  roomType: string,
  facing: Facing
): { rowPref: 'front' | 'mid' | 'back'; colPref: 'left' | 'center' | 'right' } {
  const idealZones = VASTU_IDEAL_ZONES[roomType] || ['Center'];
  const primaryZone = idealZones[0];

  // Reverse map: compass zone -> plot-relative position
  type DirMap = { front: string; back: string; left: string; right: string };
  const dirMap: Record<Facing, DirMap> = {
    North: { front: 'N', back: 'S', left: 'W', right: 'E' },
    South: { front: 'S', back: 'N', left: 'E', right: 'W' },
    East: { front: 'E', back: 'W', left: 'N', right: 'S' },
    West: { front: 'W', back: 'E', left: 'S', right: 'N' },
  };

  const d = dirMap[facing];
  const reverseNS: Record<string, string> = {
    [d.front]: 'front',
    [d.back]: 'back',
  };
  const reverseEW: Record<string, string> = {
    [d.left]: 'left',
    [d.right]: 'right',
  };

  let rowPref: 'front' | 'mid' | 'back' = 'mid';
  let colPref: 'left' | 'center' | 'right' = 'center';

  if (primaryZone === 'Center') {
    return { rowPref: 'mid', colPref: 'center' };
  }

  for (const ch of ['N', 'S']) {
    if (primaryZone.includes(ch) && reverseNS[ch]) {
      rowPref = reverseNS[ch] as 'front' | 'mid' | 'back';
    }
  }
  for (const ch of ['E', 'W']) {
    if (primaryZone.includes(ch) && reverseEW[ch]) {
      colPref = reverseEW[ch] as 'left' | 'center' | 'right';
    }
  }

  return { rowPref, colPref };
}
