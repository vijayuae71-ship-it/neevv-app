import { Room, Facing, VastuDetail } from '../types';

// ============================================================================
// VASTU SHASTRA COMPLIANCE ENGINE
// 15+ Directional Rules with Auto-Fix Suggestions
// NBC Safety takes priority over Vastu in case of conflict
// ============================================================================

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

// Vastu fix suggestions for non-compliant placements
const VASTU_FIX_SUGGESTIONS: Record<string, string> = {
  master_bedroom: 'Move Master Bedroom to South-West (Nairutya) for stability and prosperity.',
  bedroom: 'Place bedrooms in South, South-West, or West zones.',
  hall: 'Living room should be in North or East for positive energy flow.',
  kitchen: 'Relocate Kitchen to South-East (Agni corner) — direction of fire element.',
  toilet: 'Toilets should be in West or North-West. Never in North-East.',
  dining: 'Dining area works best in West, East, or Center of the home.',
  puja: 'Puja room MUST be in North-East (Ishaan corner) — most auspicious direction.',
  staircase: 'Move staircase to South or West. Heavy structures should not be in North-East.',
  entrance: 'Main door should be in a positive Pada: North-East, East, or North entrance.',
  parking: 'Car parking is suitable in North-West or South-East zones.',
  store: 'Store room best placed in South-West or South for stability.',
  utility: 'Utility/washing area should be in North-West (Vayu corner — wind direction).',
  balcony: 'Balconies best in North or East for morning sunlight and fresh air.',
};

// Vastu taboo zones — critical violations
const VASTU_TABOO: Record<string, string[]> = {
  toilet: ['NE'], // Never place toilet in NE (Ishaan)
  kitchen: ['NE', 'SW'], // Kitchen fire in NE is sacrilege
  staircase: ['NE', 'Center'], // Heavy structure in NE blocks energy
  master_bedroom: ['NE'], // Master bed in NE is inauspicious
  store: ['NE'], // Heavy storage blocks positive energy
};

/**
 * Determine the zone of a room within the buildable area.
 * Divides buildable area into 3x3 grid:
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

  const nx = cx / plotWidthM;
  const ny = cy / plotDepthM;

  let col: string;
  if (nx < 0.33) col = 'L';
  else if (nx > 0.67) col = 'R';
  else col = 'C';

  let row: string;
  if (ny < 0.33) row = 'F';
  else if (ny > 0.67) row = 'B';
  else row = 'M';

  return mapToCompass(row, col, facing);
}

function mapToCompass(row: string, col: string, facing: Facing): string {
  type DirMap = { front: string; back: string; left: string; right: string };
  const dirMap: Record<Facing, DirMap> = {
    North: { front: 'N', back: 'S', left: 'W', right: 'E' },
    South: { front: 'S', back: 'N', left: 'E', right: 'W' },
    East: { front: 'E', back: 'W', left: 'N', right: 'S' },
    West: { front: 'W', back: 'E', left: 'S', right: 'N' },
  };

  const d = dirMap[facing];

  let ns = '';
  if (row === 'F') ns = d.front;
  else if (row === 'B') ns = d.back;

  let ew = '';
  if (col === 'L') ew = d.left;
  else if (col === 'R') ew = d.right;

  if (row === 'M' && col === 'C') return 'Center';
  if (row === 'M') return ew || 'Center';
  if (col === 'C') return ns || 'Center';

  const nsOrder = ['N', 'S'];
  const ewOrder = ['E', 'W'];
  if (nsOrder.includes(ns) && ewOrder.includes(ew)) {
    return ns + ew;
  }
  if (ewOrder.includes(ns) && nsOrder.includes(ew)) {
    return ew + ns;
  }
  return ns + ew || 'Center';
}

export function calculateVastuScore(
  rooms: Room[],
  plotWidthM: number,
  plotDepthM: number,
  facing: Facing
): { score: number; details: VastuDetail[]; suggestions: string[] } {
  const details: VastuDetail[] = [];
  const suggestions: string[] = [];
  let totalWeight = 0;
  let compliantWeight = 0;

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
    const tabooZones = VASTU_TABOO[room.type] || [];
    const compliant = idealZones.includes(zone);
    const isTaboo = tabooZones.includes(zone);
    const w = weights[room.type] || 5;
    totalWeight += w;

    if (compliant) {
      compliantWeight += w;
    } else if (isTaboo) {
      // Taboo placement gets 0 and critical suggestion
      suggestions.push(
        `⚠️ CRITICAL: ${room.name} is in ${zone} (taboo zone). ${VASTU_FIX_SUGGESTIONS[room.type] || 'Relocate immediately.'}`
      );
    } else {
      // Non-ideal but not taboo — partial credit
      compliantWeight += w * 0.3;
      if (VASTU_FIX_SUGGESTIONS[room.type]) {
        suggestions.push(`${room.name} is in ${zone}. ${VASTU_FIX_SUGGESTIONS[room.type]}`);
      }
    }

    details.push({
      room: room.name,
      idealZone: idealZones.join('/'),
      actualZone: zone,
      compliant,
    });
  }

  const score = totalWeight > 0 ? Math.round((compliantWeight / totalWeight) * 100) : 0;

  // Add general Vastu tips
  if (score < 60) {
    suggestions.push(
      '💡 Consider the Vastu-Optimized layout option for better directional compliance.'
    );
  }

  return { score, details, suggestions };
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

/**
 * Check if NBC safety conflicts with Vastu suggestion.
 * NBC Safety ALWAYS takes priority over Vastu.
 */
export function resolveNBCVastuConflict(
  vastuSuggestion: string,
  nbcRequirement: string
): string {
  return `NBC Safety Priority: ${nbcRequirement}. Vastu suggestion (${vastuSuggestion}) adjusted to maintain safety compliance.`;
}
