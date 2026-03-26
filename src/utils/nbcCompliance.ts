import { Room, Setbacks, NBCIssue } from '../types';

// NBC 2016 Minimum Room Areas (sq.m)
const MIN_AREAS: Record<string, number> = {
  master_bedroom: 9.5,
  bedroom: 9.5,
  hall: 9.5,
  kitchen: 5.0,
  toilet: 2.8,
  dining: 7.5,
  puja: 2.0,
  staircase: 3.0,
  parking: 12.5, // For one car
  entrance: 2.0,
  store: 2.0,
  utility: 2.0,
  balcony: 2.0,
  passage: 1.0,
};

// Minimum widths (meters)
const MIN_WIDTHS: Record<string, number> = {
  master_bedroom: 2.7,
  bedroom: 2.7,
  hall: 2.7,
  kitchen: 1.8,
  toilet: 1.2,
  dining: 2.4,
  staircase: 1.0,
  passage: 0.9,
  parking: 2.5,
};

/**
 * Calculate setbacks based on NBC 2016 norms.
 * Plot area in sq.m determines marginal open spaces.
 */
export function calculateSetbacks(plotAreaSqM: number, plotWidthM: number, plotDepthM: number): Setbacks {
  // NBC 2016 Table 17 (simplified for residential)
  if (plotAreaSqM <= 50) {
    return { front: 1.0, rear: 1.0, left: 0.0, right: 0.0 };
  } else if (plotAreaSqM <= 100) {
    return { front: 1.5, rear: 1.0, left: 0.75, right: 0.75 };
  } else if (plotAreaSqM <= 200) {
    return { front: 2.0, rear: 1.5, left: 1.0, right: 1.0 };
  } else if (plotAreaSqM <= 500) {
    return { front: 3.0, rear: 1.5, left: 1.5, right: 1.5 };
  } else {
    return { front: 4.5, rear: 2.0, left: 2.0, right: 2.0 };
  }
}

/**
 * Check NBC compliance for a set of rooms
 */
export function checkNBCCompliance(rooms: Room[]): { compliant: boolean; issues: NBCIssue[] } {
  const issues: NBCIssue[] = [];

  for (const room of rooms) {
    const area = room.width * room.depth;
    const minArea = MIN_AREAS[room.type];
    const minWidth = MIN_WIDTHS[room.type];
    const actualMinDim = Math.min(room.width, room.depth);

    if (minArea && area < minArea * 0.95) {
      // 5% tolerance for rounding
      issues.push({
        room: room.name,
        issue: `Area ${area.toFixed(1)} m² < minimum ${minArea} m² (NBC 2016)`,
        severity: 'error',
      });
    }

    if (minWidth && actualMinDim < minWidth * 0.95) {
      issues.push({
        room: room.name,
        issue: `Min dimension ${actualMinDim.toFixed(2)}m < minimum ${minWidth}m width (NBC 2016)`,
        severity: 'warning',
      });
    }

    // Staircase specific checks
    if (room.type === 'staircase') {
      if (room.width < 1.0 && room.depth < 1.0) {
        issues.push({
          room: room.name,
          issue: 'Staircase width must be ≥ 1.0m (NBC 2016)',
          severity: 'error',
        });
      }
    }
  }

  // Check habitable room ventilation (simplified: room should have external wall access)
  // This is a simplified check - real NBC requires 1/6th floor area as window opening

  return {
    compliant: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
  };
}

/**
 * Staircase riser/tread calculation
 */
export function getStaircaseSpec(floorHeight: number = 3.0) {
  const maxRiser = 0.19; // 190mm per NBC
  const numRisers = Math.ceil(floorHeight / maxRiser);
  const actualRiser = floorHeight / numRisers;
  const tread = 0.25; // 250mm standard residential
  const goingLength = (numRisers - 1) * tread;

  return {
    numRisers,
    riserHeight: Math.round(actualRiser * 1000), // mm
    treadWidth: tread * 1000, // mm
    totalGoing: goingLength,
    staircaseWidth: 1.0, // min 1m
    headroom: 2.2, // min 2.2m
  };
}
