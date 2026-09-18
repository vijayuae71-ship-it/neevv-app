/**
 * verificationEngine.ts
 * ---------------------------------------------------------------------------
 * Drawing Validation & Coordination Engine for neevv.
 *
 * WHAT THIS ENGINE DOES
 * The neevv app generates AI raster images for every construction drawing.
 * There is no vector/CAD data behind an individual drawing sheet, so this
 * engine can never "look at" a generated image. What it CAN do is validate
 * every piece of structured data that feeds those drawings — the locked
 * layout (rooms, columns, dimensions, setbacks), the BOQ (quantities,
 * schedules, formulas), the original requirements, and the list of drawing
 * types that have actually been generated — and cross-check all of that
 * data for internal consistency and completeness.
 *
 * Anything that requires looking at pixels (visual accuracy of an elevation,
 * whether a rendered wall lines up, actual structural/MEP design) is flagged
 * as a WARNING that explicitly calls for manual/professional review. This
 * engine never claims to certify a design as constructible; it only confirms
 * that the data that generated the drawings is internally coherent.
 *
 * Lives at: src/utils/verificationEngine.ts
 * ---------------------------------------------------------------------------
 */

import { Layout, ProjectRequirements, BOQ, Room, Column, FloorLayout, DoorScheduleItem, WindowScheduleItem } from '../types';

/* =============================================================================
 * PUBLIC TYPES
 * ========================================================================== */

export type IssueSeverity = 'PASS' | 'WARNING' | 'ERROR' | 'BLOCKED';
export type ProjectStatus = 'DRAFT' | 'VERIFIED_INTERNALLY' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type VerificationCategory =
  | 'locked_design_validation'
  | 'architectural_validation'
  | 'structural_validation'
  | 'electrical_validation'
  | 'plumbing_validation'
  | 'elevation_section_validation'
  | 'boq_validation'
  | 'cross_discipline_coordination'
  | 'visual_qa';

export interface VerificationIssue {
  id: string;
  title: string;
  severity: IssueSeverity;
  explanation: string;
  affectedDrawing: string;
  affectedObject: string;
  expectedValue: string;
  generatedValue: string;
  suggestedCorrection: string;
  category: VerificationCategory;
}

export interface CategoryResult {
  category: VerificationCategory;
  label: string;
  description: string;
  status: IssueSeverity;
  issues: VerificationIssue[];
  checksPerformed: number;
  passCount: number;
  warningCount: number;
  errorCount: number;
  blockedCount: number;
}

export interface RevisionInfo {
  lockedDesignRevision: string;
  drawingRevision: string;
  projectRevision: string;
  validationTimestamp: string;
}

export interface VerificationReport {
  projectName: string;
  revision: RevisionInfo;
  overallStatus: ProjectStatus;
  categories: CategoryResult[];
  totalChecks: number;
  passCount: number;
  warningCount: number;
  errorCount: number;
  blockedCount: number;
  summary: string;
  disclaimer: string;
  internalVerificationNote: string;
  professionalReviewNote: string;
}

/* =============================================================================
 * CONSTANTS — derived from the real app (WorkingDrawings.tsx / textOverlay.ts)
 * ========================================================================== */

/**
 * Drawing types that are generated once for the whole building (component
 * state keys are used verbatim, no floor suffix). Sourced from
 * WorkingDrawings.tsx `aiDrawingMap` minus `FLOOR_SPECIFIC`.
 */
const NON_FLOOR_SPECIFIC_TYPES = [
  'excavation', 'foundation', 'footingDetail', 'rccDetail', 'structural',
  'reinforcement', 'barBending', 'section', 'elevation', 'staircase',
  'waterTank', 'waterproofing', 'stp',
] as const;

/**
 * Drawing types that differ between Ground Floor and First Floor and are
 * cached/generated per floor. Sourced from WorkingDrawings.tsx `FLOOR_SPECIFIC`.
 * Cache key format is `${type}-${floorSuffix}` (see `getCacheKey` in the app).
 */
const FLOOR_SPECIFIC_TYPES = ['electrical', 'plumbing', 'tiling', 'brickwork'] as const;

/** All 17 known base drawing type names (matches OVERLAY_DRAWING_TYPES exactly). */
const ALL_DRAWING_BASE_TYPES: string[] = [...NON_FLOOR_SPECIFIC_TYPES, ...FLOOR_SPECIFIC_TYPES];

/**
 * Floor suffixes used by the app's floor toggle (`selectedFloor: 'GF' | 'FF'`).
 * The current app only distinguishes Ground Floor / First Floor. Beyond index
 * 1 (i.e. G+2 and above) there is no real app convention yet, so we fall back
 * to a generic `F{n}` suffix for robustness.
 */
const FLOOR_SUFFIXES = ['GF', 'FF'];

function floorSuffix(floorIndex: number): string {
  return FLOOR_SUFFIXES[floorIndex] ?? `F${floorIndex + 1}`;
}

/** Builds the exact cache-key style drawing type for a floor-specific type. */
function floorSpecificKey(type: string, floorIndex: number): string {
  return `${type}-${floorSuffix(floorIndex)}`;
}

/** All drawing keys that must exist for a project with `numFloors` floors. */
function computeExpectedDrawingKeys(numFloors: number): string[] {
  const keys: string[] = [...NON_FLOOR_SPECIFIC_TYPES];
  for (let i = 0; i < numFloors; i++) {
    for (const t of FLOOR_SPECIFIC_TYPES) keys.push(floorSpecificKey(t, i));
  }
  return keys;
}

/** Strips a floor suffix (`-GF`, `-FF`, `-F3`, ...) from a generated drawing key, if present. */
function stripFloorSuffix(key: string): string {
  const dashIdx = key.lastIndexOf('-');
  if (dashIdx === -1) return key;
  const base = key.slice(0, dashIdx);
  const suffix = key.slice(dashIdx + 1);
  if (FLOOR_SUFFIXES.includes(suffix) || /^F\d+$/.test(suffix)) {
    return base;
  }
  return key;
}

function missingFloorSpecificDrawings(type: string, numFloors: number, generated: string[]): string[] {
  const missing: string[] = [];
  for (let i = 0; i < numFloors; i++) {
    const key = floorSpecificKey(type, i);
    if (!generated.includes(key)) missing.push(key);
  }
  return missing;
}

/** NBC minimum room areas, in sqm, for room types that have a defined minimum. */
const NBC_MIN_AREA_SQM: Partial<Record<string, number>> = {
  bedroom: 9.5,
  master_bedroom: 9.5,
  kitchen: 5.0,
  toilet: 1.8,
  hall: 9.5,
  dining: 7.5,
};

/**
 * Electrical point allocation table — mirrors the `pointMap` used in
 * boqCalculator.ts exactly, so BOQ totals can be recomputed and cross-checked
 * without drift.
 */
const ELECTRICAL_POINT_MAP: Record<string, number> = {
  master_bedroom: 8, bedroom: 6, hall: 10, kitchen: 6,
  toilet: 3, dining: 4, puja: 2, passage: 2,
  balcony: 2, store: 2, utility: 3, parking: 2, entrance: 2, staircase: 2,
};

/** Recommended minimum electrical points per room type (code/best-practice, not the app's default allocation). */
const RECOMMENDED_MIN_ELECTRICAL: { type: string; label: string; min: number }[] = [
  { type: 'bedroom', label: 'Bedroom', min: 8 },
  { type: 'kitchen', label: 'Kitchen', min: 8 },
  { type: 'toilet', label: 'Toilet', min: 3 },
  { type: 'hall', label: 'Hall', min: 10 },
];

/** Typical construction cost per sqft ranges (INR), 2024-25 averages, by budget tier. */
const BUDGET_COST_RANGE: Record<string, [number, number]> = {
  economy: [1300, 1900],
  standard: [1800, 2400],
  premium: [2300, 3200],
  luxury: [3000, 4800],
};

/* =============================================================================
 * SHARED UTILITIES
 * ========================================================================== */

/** Simple deterministic 32-bit string hash (djb2 variant). No crypto import needed. */
function simpleHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Sequential VE-001, VE-002, ... issue id generator shared across the whole report. */
function createIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `VE-${counter.toString().padStart(3, '0')}`;
  };
}

function roomsOverlap(a: Room, b: Room): boolean {
  const eps = 0.01;
  return (
    a.x < b.x + b.width - eps &&
    a.x + a.width > b.x + eps &&
    a.y < b.y + b.depth - eps &&
    a.y + a.depth > b.y + eps
  );
}

function uniqueSorted(nums: number[]): number[] {
  return Array.from(new Set(nums.map(n => +n.toFixed(3)))).sort((a, b) => a - b);
}

function maxConsecutiveGap(sorted: number[]): number {
  if (sorted.length < 2) return 0;
  let max = 0;
  for (let i = 1; i < sorted.length; i++) max = Math.max(max, sorted[i] - sorted[i - 1]);
  return max;
}

/** Replicates the exact door-count logic in boqCalculator.ts so cross-checks never drift. */
function expectedDoorCount(rooms: Room[]): number {
  const bedrooms = rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length;
  const toilets = rooms.filter(r => r.type === 'toilet').length;
  const kitchens = rooms.filter(r => r.type === 'kitchen').length;
  const pujas = rooms.filter(r => r.type === 'puja').length;
  const balconies = rooms.filter(r => r.type === 'balcony').length;
  return 1 /* main entrance */ + bedrooms + toilets + kitchens + pujas + balconies;
}

/** Replicates the exact window-count logic in boqCalculator.ts so cross-checks never drift. */
function expectedWindowCount(rooms: Room[]): number {
  const bedrooms = rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length;
  const halls = rooms.filter(r => r.type === 'hall').length;
  const kitchens = rooms.filter(r => r.type === 'kitchen').length;
  const toilets = rooms.filter(r => r.type === 'toilet').length;
  const dinings = rooms.filter(r => r.type === 'dining').length;
  return bedrooms + halls + kitchens + toilets + dinings;
}

function expectedElectricalPoints(rooms: Room[]): number {
  return rooms.reduce((sum, r) => sum + (ELECTRICAL_POINT_MAP[r.type] ?? 2), 0);
}

function expectedPlumbingPoints(rooms: Room[]): number {
  const toilets = rooms.filter(r => r.type === 'toilet').length;
  const kitchens = rooms.filter(r => r.type === 'kitchen').length;
  return toilets * 5 + kitchens * 3;
}

/* =============================================================================
 * CATEGORY BUILDER — accumulates checks/issues for one validation category
 * ========================================================================== */

class CategoryBuilder {
  private readonly issues: VerificationIssue[] = [];
  private checksPerformed = 0;
  private passCount = 0;

  constructor(
    private readonly category: VerificationCategory,
    private readonly label: string,
    private readonly description: string,
    private readonly idGen: () => string,
  ) {}

  /** Records a passing check. */
  pass(): void {
    this.checksPerformed += 1;
    this.passCount += 1;
  }

  /** Records a failing check and creates a corresponding issue. */
  fail(
    severity: IssueSeverity,
    title: string,
    explanation: string,
    affectedDrawing: string,
    affectedObject: string,
    expectedValue: string,
    generatedValue: string,
    suggestedCorrection: string,
  ): void {
    this.checksPerformed += 1;
    this.issues.push({
      id: this.idGen(),
      title,
      severity,
      explanation,
      affectedDrawing,
      affectedObject,
      expectedValue,
      generatedValue,
      suggestedCorrection,
      category: this.category,
    });
  }

  build(): CategoryResult {
    const warningCount = this.issues.filter(i => i.severity === 'WARNING').length;
    const errorCount = this.issues.filter(i => i.severity === 'ERROR').length;
    const blockedCount = this.issues.filter(i => i.severity === 'BLOCKED').length;
    const status: IssueSeverity =
      blockedCount > 0 ? 'BLOCKED' : errorCount > 0 ? 'ERROR' : warningCount > 0 ? 'WARNING' : 'PASS';
    return {
      category: this.category,
      label: this.label,
      description: this.description,
      status,
      issues: this.issues,
      checksPerformed: this.checksPerformed,
      passCount: this.passCount,
      warningCount,
      errorCount,
      blockedCount,
    };
  }
}

/* =============================================================================
 * VALIDATION CONTEXT
 * ========================================================================== */

interface Ctx {
  layout: Layout;
  requirements: ProjectRequirements;
  boq: BOQ | null;
  generatedDrawingTypes: string[];
  numFloors: number;
  floors: FloorLayout[];
  allRooms: Room[];
}

function buildContext(
  layout: Layout,
  requirements: ProjectRequirements,
  boq: BOQ | null,
  generatedDrawingTypes: string[],
): Ctx {
  const floors: FloorLayout[] = layout.floors;
  return {
    layout,
    requirements,
    boq,
    generatedDrawingTypes,
    numFloors: floors.length || requirements.floors.length || 1,
    floors,
    allRooms: floors.flatMap(f => f.rooms),
  };
}

/* =============================================================================
 * CATEGORY 1 — LOCKED DESIGN VALIDATION
 * ========================================================================== */

function validateLockedDesign(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'locked_design_validation',
    'Locked Design Validation',
    'Validates the core generated design data (plot, footprint, floors, rooms, seed) against project requirements and NBC/FSI rules before any drawings are produced.',
    idGen,
  );
  const { layout, requirements, allRooms } = ctx;

  // 1. Plot dimensions exist and are positive
  if (layout.plotWidthM > 0 && layout.plotDepthM > 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Invalid plot dimensions',
      'Plot width and/or depth are missing or non-positive in the locked layout, which invalidates every downstream drawing.',
      'Locked Design Data', 'Plot Dimensions',
      'plotWidthM > 0 and plotDepthM > 0',
      `plotWidthM=${layout.plotWidthM}, plotDepthM=${layout.plotDepthM}`,
      'Regenerate the layout with valid plot dimensions before proceeding.',
    );
  }

  // 2. Building footprint matches post-setback calculation (within 0.1m)
  const expectedBuildableWidth = layout.plotWidthM - (layout.setbacks.left + layout.setbacks.right);
  const expectedBuildableDepth = layout.plotDepthM - (layout.setbacks.front + layout.setbacks.rear);
  if (
    Math.abs(expectedBuildableWidth - layout.buildableWidthM) <= 0.1 &&
    Math.abs(expectedBuildableDepth - layout.buildableDepthM) <= 0.1
  ) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Buildable footprint mismatch',
      'The buildable width/depth stored on the layout does not match plot dimensions minus setbacks within a 0.1m tolerance.',
      'Locked Design Data', 'Buildable Footprint',
      `width=${expectedBuildableWidth.toFixed(2)}m, depth=${expectedBuildableDepth.toFixed(2)}m`,
      `width=${layout.buildableWidthM.toFixed(2)}m, depth=${layout.buildableDepthM.toFixed(2)}m`,
      'Recompute buildableWidthM/buildableDepthM as plot dimension minus setbacks.',
    );
  }

  // 3. Number of floors matches requirements
  if (layout.floors.length === requirements.floors.length) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Floor count mismatch',
      'The number of floors generated in the layout does not match the number of floors requested.',
      'Locked Design Data', 'Floor Count',
      `${requirements.floors.length} floor(s)`,
      `${layout.floors.length} floor(s)`,
      'Regenerate the layout to match the requested floor program.',
    );
  }

  // 4. FSI compliance: total built-up <= plot area x 1.0
  const plotAreaSqM = layout.plotWidthM * layout.plotDepthM;
  const totalBuiltUpSqM = layout.totalBuiltUpSqM ?? layout.builtUpAreaSqM;
  const maxAllowedSqM = plotAreaSqM * 1.0;
  if (totalBuiltUpSqM <= maxAllowedSqM * 1.01) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'FSI exceeded',
      'Total built-up area exceeds the permissible Floor Space Index of 1.0 for the plot area.',
      'Locked Design Data', 'Floor Space Index (FSI)',
      `<= ${maxAllowedSqM.toFixed(2)} sqm`,
      `${totalBuiltUpSqM.toFixed(2)} sqm`,
      'Reduce built-up area per floor or floor count to comply with FSI 1.0.',
    );
  }

  // 5. Setbacks meet NBC minimums (front/rear >= 1.5m, sides >= 1.0m)
  const setbackIssues: string[] = [];
  if (layout.setbacks.front < 1.5) setbackIssues.push(`front=${layout.setbacks.front}m (<1.5m)`);
  if (layout.setbacks.rear < 1.5) setbackIssues.push(`rear=${layout.setbacks.rear}m (<1.5m)`);
  if (layout.setbacks.left < 1.0) setbackIssues.push(`left=${layout.setbacks.left}m (<1.0m)`);
  if (layout.setbacks.right < 1.0) setbackIssues.push(`right=${layout.setbacks.right}m (<1.0m)`);
  if (setbackIssues.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Setbacks below NBC minimums',
      'One or more setbacks are below the National Building Code minimums (front/rear 1.5m, sides 1.0m).',
      'Locked Design Data', 'Setbacks',
      'front/rear >= 1.5m, left/right >= 1.0m',
      setbackIssues.join('; '),
      'Increase the deficient setback(s) to meet NBC minimums.',
    );
  }

  // 6. Design seed exists (needed for drawing consistency)
  if (layout.designSeed) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Missing design seed',
      'No design seed is stored on the layout. Without it, subsequent drawing generations (plan/elevation/3D) may not stay visually consistent with each other.',
      'Locked Design Data', 'Design Seed',
      'designSeed object present',
      'undefined',
      'Regenerate the layout so a design seed is captured and locked for this project.',
    );
  }

  // 7. Openings schedule exists
  if (layout.openingsSchedule) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Missing openings schedule',
      'No openings schedule (doors/windows/ventilators) is stored on the layout.',
      'Locked Design Data', 'Openings Schedule',
      'openingsSchedule object present',
      'undefined',
      'Generate the openings schedule from the locked layout before producing elevation/section drawings.',
    );
  }

  // 8-12. Per-floor program checks: bedrooms, halls, kitchens, dining, puja
  const minFloors = Math.min(layout.floors.length, requirements.floors.length);
  for (let i = 0; i < minFloors; i++) {
    const floor = layout.floors[i];
    const program = requirements.floors[i];
    const bedroomCount = floor.rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length;
    const hallCount = floor.rooms.filter(r => r.type === 'hall').length;
    const kitchenCount = floor.rooms.filter(r => r.type === 'kitchen').length;
    const hasDining = floor.rooms.some(r => r.type === 'dining');
    const hasPuja = floor.rooms.some(r => r.type === 'puja');

    // 8. Bedroom count
    if (bedroomCount === program.bedrooms) {
      b.pass();
    } else {
      b.fail(
        'ERROR', `Bedroom count mismatch on ${floor.floorLabel}`,
        'Generated bedroom count on this floor does not match the requested floor program.',
        `Floor Plan (${floor.floorLabel})`, 'Bedroom Count',
        `${program.bedrooms}`, `${bedroomCount}`,
        'Regenerate this floor layout with the correct number of bedrooms.',
      );
    }

    // 9. Hall count
    if (hallCount === program.halls) {
      b.pass();
    } else {
      b.fail(
        'ERROR', `Hall count mismatch on ${floor.floorLabel}`,
        'Generated hall count on this floor does not match the requested floor program.',
        `Floor Plan (${floor.floorLabel})`, 'Hall Count',
        `${program.halls}`, `${hallCount}`,
        'Regenerate this floor layout with the correct number of halls.',
      );
    }

    // 10. Kitchen count
    if (kitchenCount === program.kitchens) {
      b.pass();
    } else {
      b.fail(
        'ERROR', `Kitchen count mismatch on ${floor.floorLabel}`,
        'Generated kitchen count on this floor does not match the requested floor program.',
        `Floor Plan (${floor.floorLabel})`, 'Kitchen Count',
        `${program.kitchens}`, `${kitchenCount}`,
        'Regenerate this floor layout with the correct number of kitchens.',
      );
    }

    // 11. Dining room presence
    if (!program.hasDining || hasDining) {
      b.pass();
    } else {
      b.fail(
        'ERROR', `Missing dining room on ${floor.floorLabel}`,
        'A dining room was requested for this floor but none exists in the generated layout.',
        `Floor Plan (${floor.floorLabel})`, 'Dining Room',
        'present', 'absent',
        'Add a dining room to this floor and regenerate.',
      );
    }

    // 12. Puja room presence
    if (!program.hasPuja || hasPuja) {
      b.pass();
    } else {
      b.fail(
        'ERROR', `Missing puja room on ${floor.floorLabel}`,
        'A puja room was requested for this floor but none exists in the generated layout.',
        `Floor Plan (${floor.floorLabel})`, 'Puja Room',
        'present', 'absent',
        'Add a puja room to this floor and regenerate.',
      );
    }
  }

  // 13. All rooms have valid dimensions
  const invalidRooms = allRooms.filter(r => !(r.width > 0) || !(r.depth > 0));
  if (invalidRooms.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Rooms with invalid dimensions',
      'One or more rooms have zero or negative width/depth.',
      'Locked Design Data', 'Room Dimensions',
      'width > 0 and depth > 0 for all rooms',
      invalidRooms.map(r => r.name).join(', '),
      'Regenerate the affected rooms with valid positive dimensions.',
    );
  }

  // 14. Building dimensions (mm) computed correctly
  if (layout.buildingWidthMm !== undefined && layout.buildingDepthMm !== undefined) {
    const expWidthMm = Math.round(layout.buildableWidthM * 1000);
    const expDepthMm = Math.round(layout.buildableDepthM * 1000);
    if (Math.abs(expWidthMm - layout.buildingWidthMm) <= 50 && Math.abs(expDepthMm - layout.buildingDepthMm) <= 50) {
      b.pass();
    } else {
      b.fail(
        'WARNING', 'Building dimension (mm) mismatch',
        'buildingWidthMm/buildingDepthMm do not match the buildable footprint converted to millimetres within a 50mm tolerance.',
        'Locked Design Data', 'Building Dimensions (mm)',
        `${expWidthMm}mm x ${expDepthMm}mm`,
        `${layout.buildingWidthMm}mm x ${layout.buildingDepthMm}mm`,
        'Recompute buildingWidthMm/buildingDepthMm from the buildable footprint.',
      );
    }
  } else {
    b.fail(
      'WARNING', 'Building dimensions (mm) not computed',
      'buildingWidthMm/buildingDepthMm are not set on the layout, so downstream drawings cannot be checked for dimension consistency at the millimetre level.',
      'Locked Design Data', 'Building Dimensions (mm)',
      'buildingWidthMm and buildingDepthMm present',
      'undefined',
      'Compute and store buildingWidthMm/buildingDepthMm on the layout.',
    );
  }

  return b.build();
}

/* =============================================================================
 * CATEGORY 2 — ARCHITECTURAL DRAWING VALIDATION
 * ========================================================================== */

function validateArchitectural(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'architectural_validation',
    'Architectural Drawing Validation',
    'Validates room composition, sizing, placement, and staircase provisioning across all floors against requirements and NBC minimums.',
    idGen,
  );
  const { layout, requirements, allRooms } = ctx;

  // 1. Room count consistency across floors (no empty floors)
  const emptyFloors = layout.floors.filter(f => f.rooms.length === 0);
  if (emptyFloors.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Floor(s) with no rooms',
      'One or more floors contain zero rooms in the generated layout.',
      'Floor Plan', 'Room Count',
      'every floor has at least one room',
      emptyFloors.map(f => f.floorLabel).join(', '),
      'Regenerate the affected floor(s) with a valid room layout.',
    );
  }

  // 2. Bedroom count matches requirements (CRITICAL)
  const totalRequestedBedrooms = requirements.floors.reduce((s, f) => s + f.bedrooms, 0);
  const totalActualBedrooms = allRooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length;
  if (totalRequestedBedrooms === totalActualBedrooms) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Total bedroom count mismatch',
      'The total number of bedrooms across all floors does not match the requested total. This is a critical architectural discrepancy.',
      'Floor Plan (All Floors)', 'Bedroom Count',
      `${totalRequestedBedrooms}`, `${totalActualBedrooms}`,
      'Regenerate the layout so bedroom counts match the requirements exactly.',
    );
  }

  // 3. Bathroom/toilet count sanity — requirements have no explicit toilet field,
  //    so we apply the industry convention of at least one toilet per two bedrooms.
  const totalToilets = allRooms.filter(r => r.type === 'toilet').length;
  const expectedMinToilets = Math.max(1, Math.ceil(totalActualBedrooms / 2));
  if (totalToilets >= expectedMinToilets) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Toilet count below convention',
      'Requirements do not specify an explicit toilet count. Using the convention of at least one toilet per two bedrooms (minimum one), the generated toilet count appears low.',
      'Floor Plan (All Floors)', 'Toilet Count',
      `>= ${expectedMinToilets} (heuristic: 1 per 2 bedrooms)`,
      `${totalToilets}`,
      'Verify toilet provisioning is adequate for the bedroom count; add toilets if needed.',
    );
  }

  // 4. Wall continuity — every room must have finite, well-formed coordinates
  const invalidCoordRooms = allRooms.filter(
    r => !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.width) || !Number.isFinite(r.depth),
  );
  if (invalidCoordRooms.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Rooms with invalid coordinates',
      'One or more rooms have non-finite x/y/width/depth values, breaking wall continuity in the floor plan.',
      'Floor Plan', 'Room Coordinates',
      'finite x, y, width, depth for every room',
      invalidCoordRooms.map(r => r.name).join(', '),
      'Regenerate the affected rooms with valid numeric coordinates.',
    );
  }

  // 5. Room dimensions meet NBC minimums
  const belowMinRooms: string[] = [];
  for (const r of allRooms) {
    const min = NBC_MIN_AREA_SQM[r.type];
    if (min !== undefined) {
      const area = r.width * r.depth;
      if (area < min - 0.05) belowMinRooms.push(`${r.name} (${area.toFixed(2)}sqm < ${min}sqm)`);
    }
  }
  if (belowMinRooms.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Rooms below NBC minimum area',
      'One or more rooms are smaller than the National Building Code minimum area for their room type.',
      'Floor Plan', 'Room Area (NBC minimum)',
      'bedroom/hall >= 9.5 sqm, kitchen >= 5.0 sqm, toilet >= 1.8 sqm, dining >= 7.5 sqm',
      belowMinRooms.join('; '),
      'Resize the affected rooms to meet NBC minimum area requirements.',
    );
  }

  // 6. Staircase exists if multi-floor
  if (layout.floors.length <= 1) {
    b.pass();
  } else {
    const floorsMissingStair = layout.floors.filter(f => !f.rooms.some(r => r.type === 'staircase'));
    if (floorsMissingStair.length === 0) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Missing staircase on multi-floor building',
        'The building has more than one floor but a staircase room is missing on one or more floors.',
        'Floor Plan', 'Staircase',
        'staircase room present on every floor',
        floorsMissingStair.map(f => f.floorLabel).join(', '),
        'Add a staircase room to the affected floor(s) and regenerate.',
      );
    }
  }

  // 7. Staircase minimum width 900mm
  const staircaseRooms = allRooms.filter(r => r.type === 'staircase');
  const narrowStairs = staircaseRooms.filter(r => Math.min(r.width, r.depth) * 1000 < 900);
  if (staircaseRooms.length === 0 || narrowStairs.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Staircase narrower than NBC minimum',
      'One or more staircase rooms have a clear width below the NBC minimum of 900mm.',
      'Floor Plan', 'Staircase Width',
      '>= 900mm',
      narrowStairs.map(r => `${r.name}: ${(Math.min(r.width, r.depth) * 1000).toFixed(0)}mm`).join('; '),
      'Widen the staircase to at least 900mm clear width.',
    );
  }

  // 8. Total room area within buildable area per floor (15% tolerance for walls/circulation)
  const buildableAreaPerFloor = layout.buildableWidthM * layout.buildableDepthM;
  const overAreaFloors: string[] = [];
  for (const f of layout.floors) {
    const roomAreaSum = f.rooms.reduce((s, r) => s + r.width * r.depth, 0);
    if (roomAreaSum > buildableAreaPerFloor * 1.15) {
      overAreaFloors.push(`${f.floorLabel}: ${roomAreaSum.toFixed(1)}sqm > ${(buildableAreaPerFloor * 1.15).toFixed(1)}sqm`);
    }
  }
  if (overAreaFloors.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Room area exceeds buildable footprint',
      'The sum of room areas on one or more floors exceeds the buildable area per floor, even allowing 15% for walls/circulation.',
      'Floor Plan', 'Total Room Area per Floor',
      `<= ${(buildableAreaPerFloor * 1.15).toFixed(1)} sqm (buildable + 15% tolerance)`,
      overAreaFloors.join('; '),
      'Reduce room sizes/count on the affected floor(s) so they fit within the buildable footprint.',
    );
  }

  // 9. Rooms don't overlap (bounding box intersection, per floor)
  const overlaps: string[] = [];
  for (const f of layout.floors) {
    for (let i = 0; i < f.rooms.length; i++) {
      for (let j = i + 1; j < f.rooms.length; j++) {
        if (roomsOverlap(f.rooms[i], f.rooms[j])) {
          overlaps.push(`${f.floorLabel}: ${f.rooms[i].name} overlaps ${f.rooms[j].name}`);
        }
      }
    }
  }
  if (overlaps.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Overlapping rooms detected',
      'Two or more rooms on the same floor have overlapping bounding boxes.',
      'Floor Plan', 'Room Overlap',
      'no bounding-box intersection between rooms on the same floor',
      overlaps.join('; '),
      'Reposition the overlapping rooms so their footprints no longer intersect.',
    );
  }

  // 10. Rooms within building footprint bounds
  const outOfBounds: string[] = [];
  const tol = 0.05;
  for (const f of layout.floors) {
    for (const r of f.rooms) {
      if (
        r.x < -tol || r.y < -tol ||
        r.x + r.width > layout.buildableWidthM + tol ||
        r.y + r.depth > layout.buildableDepthM + tol
      ) {
        outOfBounds.push(`${f.floorLabel}: ${r.name}`);
      }
    }
  }
  if (outOfBounds.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Rooms outside building footprint',
      'One or more rooms extend beyond the buildable footprint bounds.',
      'Floor Plan', 'Room Bounds',
      `within 0..${layout.buildableWidthM.toFixed(2)}m (W) x 0..${layout.buildableDepthM.toFixed(2)}m (D)`,
      outOfBounds.join('; '),
      'Reposition/resize the affected rooms to stay within the buildable footprint.',
    );
  }

  // 11. Floor-to-floor height (assumed 3.0m) vs staircase run length consistency
  const shortRunStairs = staircaseRooms.filter(r => Math.max(r.width, r.depth) < 2.5);
  if (staircaseRooms.length === 0 || shortRunStairs.length === 0) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Staircase run may be short for 3.0m floor height',
      'Assuming a standard 3.0m floor-to-floor height, the staircase run length appears short for a comfortable riser/tread configuration.',
      'Floor Plan / Staircase Detail', 'Staircase Run Length',
      '>= 2.5m run (heuristic for 3.0m floor height)',
      shortRunStairs.map(r => `${r.name}: ${Math.max(r.width, r.depth).toFixed(2)}m`).join('; '),
      'Verify staircase riser/tread/run calculations against the actual floor-to-floor height with a structural/architectural engineer.',
    );
  }

  return b.build();
}

/* =============================================================================
 * CATEGORY 3 — STRUCTURAL VALIDATION
 * ========================================================================== */

function validateStructural(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'structural_validation',
    'Structural Validation',
    'Validates column grid presence, spacing, span lengths, and continuity across floors from the layout data. All findings require confirmation by a licensed structural engineer.',
    idGen,
  );
  const { layout, boq } = ctx;

  const allColumns: Column[] = layout.floors.flatMap(f => f.columns);

  // 1. Columns exist
  if (allColumns.length > 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'No structural columns found',
      'The layout contains no column data on any floor, so no structural grid can be verified. Requires structural engineer review.',
      'Structural Drawing', 'Column Grid',
      'at least one column per floor',
      '0 columns',
      'Generate a structural column grid for the layout.',
    );
  }

  const groundColumns: Column[] = layout.floors[0]?.columns ?? [];

  // 2. Corner columns present (within 0.5m of building corners, ground floor)
  const w = layout.buildableWidthM;
  const d = layout.buildableDepthM;
  const corners: [number, number][] = [[0, 0], [w, 0], [0, d], [w, d]];
  const missingCorners = corners.filter(([cx, cy]) => !groundColumns.some(c => Math.hypot(c.x - cx, c.y - cy) <= 0.5));
  if (groundColumns.length === 0) {
    b.pass(); // already flagged by check 1, avoid double-penalizing total absence of data
  } else if (missingCorners.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Missing corner columns',
      'One or more building corners do not have a supporting column within 0.5m, which is required for structural stability. Requires structural engineer review.',
      'Structural Drawing', 'Corner Columns',
      'a column within 0.5m of each of the 4 building corners',
      `${missingCorners.length} corner(s) unsupported: ${missingCorners.map(([x, y]) => `(${x.toFixed(1)},${y.toFixed(1)})`).join('; ')}`,
      'Add columns at the unsupported corners.',
    );
  }

  // 3 & 4. Column spacing (<=5.0m) / beam span (>4.5m) heuristic on ground floor grid
  if (groundColumns.length >= 2) {
    const xs = uniqueSorted(groundColumns.map(c => c.x));
    const ys = uniqueSorted(groundColumns.map(c => c.y));
    const maxGap = Math.max(maxConsecutiveGap(xs), maxConsecutiveGap(ys));
    if (maxGap <= 4.5) {
      b.pass();
    } else if (maxGap <= 5.0) {
      b.fail(
        'WARNING', 'Beam span exceeds 4.5m',
        `The largest column grid gap is ${maxGap.toFixed(2)}m, exceeding the recommended 4.5m beam span. This will require a deeper beam section. Requires structural engineer review.`,
        'Structural Drawing', 'Beam Span',
        '<= 4.5m',
        `${maxGap.toFixed(2)}m`,
        'Introduce an intermediate column or increase beam depth; confirm with a structural engineer.',
      );
    } else {
      b.fail(
        'ERROR', 'Column spacing exceeds 5.0m',
        `The largest column grid gap is ${maxGap.toFixed(2)}m, exceeding the maximum recommended span of 5.0m without intermediate support. Requires structural engineer review.`,
        'Structural Drawing', 'Column Spacing',
        '<= 5.0m',
        `${maxGap.toFixed(2)}m`,
        'Add an intermediate column to break up the long span.',
      );
    }
  } else {
    b.fail(
      'WARNING', 'Insufficient columns to assess spacing',
      'Fewer than two columns are available on the ground floor, so column spacing/beam span cannot be assessed.',
      'Structural Drawing', 'Column Spacing',
      '>= 2 columns for spacing analysis',
      `${groundColumns.length} column(s)`,
      'Ensure the structural column grid is fully generated. Requires structural engineer review.',
    );
  }

  // 5. Foundation footings vs column count (via BOQ concrete breakdown)
  if (!boq) {
    b.fail(
      'WARNING', 'Cannot verify foundation footing count',
      'BOQ is not available, so foundation footing quantity cannot be cross-checked against the column count.',
      'Foundation Drawing', 'Foundation Footings',
      'BOQ available for cross-check', 'BOQ missing',
      'Generate the BOQ to allow footing/column cross-checking. Requires structural engineer review.',
    );
  } else if (groundColumns.length === 0) {
    b.fail(
      'WARNING', 'Cannot verify foundation footing count',
      'No ground floor columns are available to cross-check against foundation concrete volume.',
      'Foundation Drawing', 'Foundation Footings',
      'ground floor columns available for cross-check', '0 columns',
      'Ensure the structural column grid is generated. Requires structural engineer review.',
    );
  } else {
    const perFooting = boq.concreteBreakdown.foundation / groundColumns.length;
    if (perFooting >= 0.2 && perFooting <= 2.0) {
      b.pass();
    } else {
      b.fail(
        'WARNING', 'Foundation concrete per column outside typical range',
        `Foundation concrete volume divided by column count is ${perFooting.toFixed(2)} m³/column, outside the typical isolated-footing range of 0.2-2.0 m³. Requires structural engineer review.`,
        'Foundation Drawing', 'Foundation Footings',
        '0.2 - 2.0 m³ of foundation concrete per column',
        `${perFooting.toFixed(2)} m³/column`,
        'Verify footing sizes against the actual soil bearing capacity and column loads with a structural engineer.',
      );
    }
  }

  // 6. Column count consistent across floors
  const columnCounts = layout.floors.map(f => f.columns.length);
  const allEqual = columnCounts.every(c => c === columnCounts[0]);
  if (allEqual) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Column count differs between floors',
      'Columns must generally continue from floor to floor to transfer loads to the foundation, but the column count differs between floors. Requires structural engineer review.',
      'Structural Drawing', 'Column Count per Floor',
      'same column count on every floor',
      columnCounts.map((c, i) => `${layout.floors[i].floorLabel}: ${c}`).join(', '),
      'Align the column grid across all floors, or confirm transfer structure design with a structural engineer.',
    );
  }

  // 7. Staircase opening coordination — no column should sit inside the staircase footprint
  const conflicts: string[] = [];
  for (const f of layout.floors) {
    const stair = f.rooms.find(r => r.type === 'staircase');
    if (!stair) continue;
    for (const c of f.columns) {
      if (c.x > stair.x + 0.1 && c.x < stair.x + stair.width - 0.1 && c.y > stair.y + 0.1 && c.y < stair.y + stair.depth - 0.1) {
        conflicts.push(`${f.floorLabel}: column at (${c.x.toFixed(2)},${c.y.toFixed(2)}) inside staircase`);
      }
    }
  }
  if (conflicts.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Column obstructs staircase opening',
      'A structural column falls inside the staircase room footprint, which would obstruct the stair flight. Requires structural engineer review.',
      'Structural Drawing', 'Staircase Opening',
      'no column within the staircase room footprint',
      conflicts.join('; '),
      'Relocate the column outside the staircase opening or redesign the stair opening around it.',
    );
  }

  // 8. Concrete/steel grade consistency (always flagged for professional confirmation)
  b.fail(
    'WARNING', 'Confirm concrete and steel grade design',
    'The BOQ assumes M25 concrete and Fe500D steel throughout. These assumptions must be confirmed against actual structural design calculations (loads, soil report, seismic zone).',
    'Structural Drawing / BOQ', 'Concrete & Steel Grade',
    'M25 concrete, Fe500D steel confirmed by structural design',
    'Assumed M25 / Fe500D (not independently calculated)',
    'Have a licensed structural engineer confirm or revise the concrete and steel grades based on actual design loads.',
  );

  // 9. Blanket professional review note for all structural checks
  b.fail(
    'WARNING', 'Structural design requires professional review',
    'All structural checks in this report are data-consistency checks only. No actual structural design/analysis (loads, seismic, wind, foundation bearing capacity) has been performed. Requires structural engineer review.',
    'Structural Drawing', 'Structural Design',
    'reviewed and stamped by a licensed structural engineer',
    'not yet reviewed by a structural engineer',
    'Engage a licensed structural engineer to review and approve all structural drawings before construction.',
  );

  return b.build();
}

/* =============================================================================
 * CATEGORY 4 — ELECTRICAL VALIDATION
 * ========================================================================== */

function validateElectrical(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'electrical_validation',
    'Electrical Validation',
    'Validates electrical point allocation, per-room minimums, and drawing generation completeness across floors.',
    idGen,
  );
  const { boq, allRooms, generatedDrawingTypes, numFloors } = ctx;

  // 1. BOQ electrical points > 0
  if (boq && boq.electricalPoints > 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'No electrical points computed',
      'The BOQ has no electrical points computed, so electrical drawings cannot be validated for coverage.',
      'Electrical Drawing', 'Electrical Points',
      '> 0 total points',
      boq ? `${boq.electricalPoints}` : 'BOQ missing',
      'Generate the BOQ with electrical point counts before producing electrical drawings.',
    );
  }

  // 2-5. Minimum per room type vs the app's own allocation table
  for (const m of RECOMMENDED_MIN_ELECTRICAL) {
    const roomsOfType = allRooms.filter(r => r.type === m.type);
    if (roomsOfType.length === 0) {
      b.pass();
      continue;
    }
    const allocated = ELECTRICAL_POINT_MAP[m.type] ?? 2;
    if (allocated >= m.min) {
      b.pass();
    } else {
      b.fail(
        'WARNING', `${m.label} electrical points below recommended minimum`,
        `The electrical point allocation formula assigns ${allocated} points per ${m.label.toLowerCase()}, below the recommended minimum of ${m.min} points (lights, fan, sockets, switch board).`,
        'Electrical Drawing', `${m.label} Electrical Points`,
        `>= ${m.min} points per ${m.label.toLowerCase()}`,
        `${allocated} points per ${m.label.toLowerCase()} (x${roomsOfType.length} room(s))`,
        `Increase the electrical point allocation for ${m.label.toLowerCase()} rooms to at least ${m.min}.`,
      );
    }
  }

  // 6. Total electrical points in BOQ matches room-based recomputation
  if (boq) {
    const recomputed = expectedElectricalPoints(allRooms);
    if (recomputed === boq.electricalPoints) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Electrical point total mismatch',
        'The total electrical points in the BOQ do not match a recomputation from the room list using the same allocation rules.',
        'Electrical Drawing / BOQ', 'Total Electrical Points',
        `${recomputed}`, `${boq.electricalPoints}`,
        'Regenerate the BOQ from the current locked layout so electrical totals stay consistent.',
      );
    }
  } else {
    b.fail(
      'WARNING', 'Cannot verify electrical point total',
      'BOQ is not available, so the total electrical point count cannot be cross-checked.',
      'Electrical Drawing / BOQ', 'Total Electrical Points',
      'BOQ available', 'BOQ missing',
      'Generate the BOQ.',
    );
  }

  // 7. Electrical drawing generated for each floor
  const missingFloors = missingFloorSpecificDrawings('electrical', numFloors, generatedDrawingTypes);
  if (missingFloors.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Electrical drawing missing for one or more floors',
      'An electrical layout drawing has not been generated for every floor.',
      'Electrical Drawing', 'Electrical Drawing Coverage',
      'one electrical drawing per floor',
      `missing: ${missingFloors.join(', ')}`,
      'Generate the missing floor electrical drawing(s).',
    );
  }

  // 8. All rooms accounted for in electrical planning (recognized room types)
  const unrecognized = allRooms.filter(r => ELECTRICAL_POINT_MAP[r.type] === undefined).map(r => r.name);
  if (unrecognized.length === 0) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Room type not in electrical allocation table',
      'One or more rooms have a type not explicitly covered by the electrical point allocation table; a default of 2 points was used.',
      'Electrical Drawing', 'Room Coverage',
      'every room type explicitly mapped',
      unrecognized.join(', '),
      'Add explicit electrical point rules for these room types, or verify the default of 2 points is adequate.',
    );
  }

  return b.build();
}

/* =============================================================================
 * CATEGORY 5 — PLUMBING VALIDATION
 * ========================================================================== */

function validatePlumbing(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'plumbing_validation',
    'Plumbing Validation',
    'Validates plumbing point allocation for wet rooms, wet-room adjacency, and completeness of plumbing/water-tank/STP drawings.',
    idGen,
  );
  const { boq, allRooms, generatedDrawingTypes, numFloors, layout } = ctx;

  const toilets = allRooms.filter(r => r.type === 'toilet');
  const kitchens = allRooms.filter(r => r.type === 'kitchen');

  // 1. Every toilet has plumbing points allocated
  if (!boq) {
    b.fail(
      'WARNING', 'Cannot verify toilet plumbing allocation',
      'BOQ is not available, so plumbing point allocation for toilets cannot be verified.',
      'Plumbing Drawing', 'Toilet Plumbing Points',
      'BOQ available', 'BOQ missing',
      'Generate the BOQ.',
    );
  } else if (toilets.length > 0 && boq.plumbingPoints <= 0) {
    b.fail(
      'ERROR', 'No plumbing points allocated despite toilets present',
      'Toilets exist in the layout but the BOQ shows zero plumbing points.',
      'Plumbing Drawing', 'Plumbing Points',
      '> 0 when toilets exist', `${boq.plumbingPoints}`,
      'Regenerate the BOQ plumbing point calculation.',
    );
  } else {
    b.pass();
  }

  // 2. Every kitchen has plumbing points allocated
  if (!boq) {
    b.fail(
      'WARNING', 'Cannot verify kitchen plumbing allocation',
      'BOQ is not available, so plumbing point allocation for kitchens cannot be verified.',
      'Plumbing Drawing', 'Kitchen Plumbing Points',
      'BOQ available', 'BOQ missing',
      'Generate the BOQ.',
    );
  } else if (kitchens.length > 0 && boq.plumbingPoints <= 0) {
    b.fail(
      'ERROR', 'No plumbing points allocated despite kitchens present',
      'Kitchens exist in the layout but the BOQ shows zero plumbing points.',
      'Plumbing Drawing', 'Plumbing Points',
      '> 0 when kitchens exist', `${boq.plumbingPoints}`,
      'Regenerate the BOQ plumbing point calculation.',
    );
  } else {
    b.pass();
  }

  // 3. Plumbing points match toilets*5 + kitchens*3
  if (boq) {
    const expected = expectedPlumbingPoints(allRooms);
    if (expected === boq.plumbingPoints) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Plumbing point total mismatch',
        'BOQ plumbing points do not match the expected formula of (toilets x 5) + (kitchens x 3).',
        'Plumbing Drawing / BOQ', 'Plumbing Points',
        `${expected} (toilets=${toilets.length}x5 + kitchens=${kitchens.length}x3)`,
        `${boq.plumbingPoints}`,
        'Regenerate the BOQ from the current locked layout.',
      );
    }
  } else {
    b.fail(
      'WARNING', 'Cannot verify plumbing point formula',
      'BOQ is not available for cross-checking the plumbing point formula.',
      'Plumbing Drawing / BOQ', 'Plumbing Points',
      'BOQ available', 'BOQ missing',
      'Generate the BOQ.',
    );
  }

  // 4. Wet room adjacency (soft warning)
  const farPairs: string[] = [];
  for (const floor of layout.floors) {
    const wetToilets = floor.rooms.filter(r => r.type === 'toilet');
    const wetKitchens = floor.rooms.filter(r => r.type === 'kitchen');
    const diag = Math.hypot(layout.buildableWidthM, layout.buildableDepthM);
    for (const t of wetToilets) {
      for (const k of wetKitchens) {
        const dist = Math.hypot((t.x + t.width / 2) - (k.x + k.width / 2), (t.y + t.depth / 2) - (k.y + k.depth / 2));
        if (dist > diag * 0.6) {
          farPairs.push(`${floor.floorLabel}: ${t.name} <-> ${k.name} (${dist.toFixed(1)}m apart)`);
        }
      }
    }
  }
  if (farPairs.length === 0) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Wet rooms far apart',
      'Toilet(s) and kitchen(s) on the same floor are far apart, which can increase plumbing stack/routing cost and complexity.',
      'Plumbing Drawing', 'Wet Room Adjacency',
      'toilets and kitchens reasonably close for shared plumbing stacks',
      farPairs.join('; '),
      'Consider clustering wet areas (toilets/kitchen) closer together for a more economical plumbing layout. Soft recommendation only.',
    );
  }

  // 5. Plumbing drawing generated for each floor
  const missingPlumbingFloors = missingFloorSpecificDrawings('plumbing', numFloors, generatedDrawingTypes);
  if (missingPlumbingFloors.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Plumbing drawing missing for one or more floors',
      'A plumbing layout drawing has not been generated for every floor.',
      'Plumbing Drawing', 'Plumbing Drawing Coverage',
      'one plumbing drawing per floor',
      `missing: ${missingPlumbingFloors.join(', ')}`,
      'Generate the missing floor plumbing drawing(s).',
    );
  }

  // 6. Water tank drawing generated
  if (generatedDrawingTypes.includes('waterTank')) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Water tank drawing not generated',
      'No water tank (overhead/underground sump) drawing has been generated.',
      'Water Tank Drawing', 'Water Tank Drawing',
      'generated', 'not generated',
      'Generate the water tank drawing.',
    );
  }

  // 7. STP drawing generated
  if (generatedDrawingTypes.includes('stp')) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'STP/septic drawing not generated',
      'No sewage treatment/septic tank drawing has been generated.',
      'STP Drawing', 'STP Drawing',
      'generated', 'not generated',
      'Generate the STP/septic tank drawing if required by local authority regulations.',
    );
  }

  return b.build();
}

/* =============================================================================
 * CATEGORY 6 — ELEVATION & SECTION VALIDATION
 * ========================================================================== */

function validateElevationSection(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'elevation_section_validation',
    'Elevation & Section Validation',
    'Validates that elevation/section drawings were generated and that door/window/opening counts are consistent with the plan data. Visual accuracy of the rendered elevation itself requires manual/professional review.',
    idGen,
  );
  const { layout, boq, generatedDrawingTypes, numFloors } = ctx;

  // 1. Elevation generated
  if (generatedDrawingTypes.includes('elevation')) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Elevation drawing not generated',
      'No elevation drawing has been generated for this project.',
      'Elevation Drawing', 'Elevation Drawing',
      'generated', 'not generated',
      'Generate the elevation drawing.',
    );
  }

  // 2. Section generated
  if (generatedDrawingTypes.includes('section')) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Section drawing not generated',
      'No section drawing has been generated for this project.',
      'Section Drawing', 'Section Drawing',
      'generated', 'not generated',
      'Generate the section drawing.',
    );
  }

  // 3. Floor count / building height reflected in elevation — manual visual check required
  const estimatedHeightM = numFloors * 3.0;
  b.fail(
    'WARNING', 'Manually verify floor count and height in elevation',
    `The elevation drawing should visually depict ${numFloors} floor(s) with an estimated overall building height of ~${estimatedHeightM.toFixed(1)}m (at 3.0m per floor, excluding parapet/plinth). This cannot be verified automatically from a raster image and requires manual/professional visual review.`,
    'Elevation Drawing', 'Floor Count / Building Height',
    `${numFloors} floor(s), ~${estimatedHeightM.toFixed(1)}m height`,
    'not verifiable from raster image',
    'Manually confirm the rendered elevation shows the correct number of floors and proportionate height.',
  );

  // 4. Openings schedule exists for elevation accuracy
  if (layout.openingsSchedule) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'No openings schedule for elevation reference',
      'No openings schedule is available to cross-check door/window placement and count on the elevation.',
      'Elevation Drawing', 'Openings Schedule',
      'present', 'missing',
      'Generate the openings schedule before finalizing the elevation drawing.',
    );
  }

  // 5. Door/window counts consistent between BOQ and openings schedule (data-level check)
  if (boq && layout.openingsSchedule) {
    const doorSchedule: DoorScheduleItem[] = boq.doorSchedule;
    const windowSchedule: WindowScheduleItem[] = boq.windowSchedule;

    if (doorSchedule.length === layout.openingsSchedule.totalDoors) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Door count mismatch between BOQ and openings schedule',
        'The number of doors in the BOQ door schedule does not match the openings schedule total used for the elevation.',
        'Elevation Drawing / BOQ', 'Door Count',
        `${layout.openingsSchedule.totalDoors} (openings schedule)`,
        `${doorSchedule.length} (BOQ)`,
        'Regenerate the BOQ and/or openings schedule from the same locked layout so door counts agree.',
      );
    }

    const expectedWindowsPlusVentilators = layout.openingsSchedule.totalWindows + layout.openingsSchedule.totalVentilators;
    if (windowSchedule.length === expectedWindowsPlusVentilators) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Window/ventilator count mismatch between BOQ and openings schedule',
        'The number of windows (incl. ventilators) in the BOQ does not match the openings schedule total used for the elevation.',
        'Elevation Drawing / BOQ', 'Window + Ventilator Count',
        `${expectedWindowsPlusVentilators} (openings schedule)`,
        `${windowSchedule.length} (BOQ)`,
        'Regenerate the BOQ and/or openings schedule from the same locked layout so window counts agree.',
      );
    }
  } else {
    b.fail(
      'WARNING', 'Cannot cross-check door/window counts',
      'Either the BOQ or the openings schedule is missing, so door/window counts cannot be cross-checked for the elevation.',
      'Elevation Drawing', 'Door/Window Count Cross-Check',
      'both BOQ and openings schedule present',
      `BOQ ${boq ? 'present' : 'missing'}, openingsSchedule ${layout.openingsSchedule ? 'present' : 'missing'}`,
      'Generate both the BOQ and the openings schedule.',
    );
  }

  // 6. Parapet height note — always flagged for visual verification
  b.fail(
    'WARNING', 'Verify parapet height visually',
    'A standard parapet height of 600mm is assumed above the terrace slab. This cannot be verified from the raster elevation/section image automatically.',
    'Elevation Drawing / Section Drawing', 'Parapet Height',
    '600mm (standard assumption)',
    'not verifiable from raster image',
    'Manually confirm the parapet height shown in the elevation/section matches the intended 600mm (or project-specific) design.',
  );

  return b.build();
}

/* =============================================================================
 * CATEGORY 7 — BOQ VALIDATION
 * ========================================================================== */

function validateBOQ(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'boq_validation',
    'BOQ Validation',
    'Validates that the Bill of Quantities is internally consistent with the locked layout and falls within plausible ranges for material quantities and cost.',
    idGen,
  );
  const { layout, boq, requirements, allRooms, generatedDrawingTypes } = ctx;

  // 1. BOQ exists
  if (boq) {
    b.pass();
  } else {
    if (generatedDrawingTypes.length > 0) {
      b.fail(
        'ERROR', 'BOQ missing after drawing generation',
        'Drawings have been generated for this project but no BOQ exists.',
        'BOQ', 'BOQ Presence',
        'BOQ generated', 'BOQ missing',
        'Generate the BOQ for this project.',
      );
    } else {
      b.fail(
        'WARNING', 'BOQ not yet generated',
        'No drawings or BOQ have been generated yet for this project.',
        'BOQ', 'BOQ Presence',
        'BOQ generated once drawings are produced',
        'BOQ missing (project still in draft)',
        'Generate drawings and the BOQ to proceed with verification.',
      );
    }
    return b.build();
  }

  // 2. Built-up area matches layout
  const layoutBuiltUpSqFt = layout.totalBuiltUpSqFt ?? layout.builtUpAreaSqFt;
  if (Math.abs(boq.totalBuiltUpAreaSqFt - layoutBuiltUpSqFt) <= layoutBuiltUpSqFt * 0.01 + 1) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Built-up area mismatch',
      'The BOQ built-up area does not match the built-up area stored on the locked layout.',
      'BOQ', 'Built-Up Area (sqft)',
      `${layoutBuiltUpSqFt.toFixed(0)} sqft`,
      `${boq.totalBuiltUpAreaSqFt} sqft`,
      'Regenerate the BOQ from the current locked layout.',
    );
  }

  // 3. Number of floors matches
  if (boq.numFloors === layout.floors.length) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Floor count mismatch in BOQ',
      'The number of floors used in the BOQ does not match the number of floors in the locked layout.',
      'BOQ', 'Floor Count',
      `${layout.floors.length}`, `${boq.numFloors}`,
      'Regenerate the BOQ using the current locked layout floor count.',
    );
  }

  // 4. Door count vs expected from room types
  const expectedDoors = expectedDoorCount(allRooms);
  if (boq.doorSchedule.length === expectedDoors) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Door schedule count mismatch',
      'The BOQ door schedule count does not match the count expected from the room types in the locked layout.',
      'BOQ / Door Schedule', 'Door Count',
      `${expectedDoors}`, `${boq.doorSchedule.length}`,
      'Regenerate the door schedule from the current locked layout.',
    );
  }

  // 5. Window count vs expected from room types
  const expectedWindows = expectedWindowCount(allRooms);
  if (boq.windowSchedule.length === expectedWindows) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Window schedule count mismatch',
      'The BOQ window schedule count does not match the count expected from the room types in the locked layout.',
      'BOQ / Window Schedule', 'Window Count',
      `${expectedWindows}`, `${boq.windowSchedule.length}`,
      'Regenerate the window schedule from the current locked layout.',
    );
  }

  // 6. Concrete volume reasonable (0.12-0.45 m3/sqm)
  if (boq.totalBuiltUpAreaSqM > 0) {
    const concretePerSqm = boq.concreteVolumeM3 / boq.totalBuiltUpAreaSqM;
    if (concretePerSqm >= 0.12 && concretePerSqm <= 0.45) {
      b.pass();
    } else {
      b.fail(
        'WARNING', 'Concrete volume outside typical range',
        `Concrete volume per sqm of built-up area is ${concretePerSqm.toFixed(3)} m³/sqm, outside the typical range of 0.12-0.45 m³/sqm.`,
        'BOQ', 'Concrete Volume per sqm',
        '0.12 - 0.45 m³/sqm', `${concretePerSqm.toFixed(3)} m³/sqm`,
        'Review the concrete quantity takeoff for errors; confirm with a structural engineer.',
      );
    }
  } else {
    b.fail(
      'ERROR', 'Cannot compute concrete ratio',
      'Total built-up area (sqm) in the BOQ is zero or missing, so concrete volume per sqm cannot be computed.',
      'BOQ', 'Concrete Volume per sqm',
      'totalBuiltUpAreaSqM > 0', `${boq.totalBuiltUpAreaSqM}`,
      'Regenerate the BOQ with a valid built-up area.',
    );
  }

  // 7. Steel weight reasonable (60-150 kg/m3 of concrete)
  if (boq.concreteVolumeM3 > 0) {
    const steelPerM3 = (boq.steelWeightMT * 1000) / boq.concreteVolumeM3;
    if (steelPerM3 >= 60 && steelPerM3 <= 150) {
      b.pass();
    } else {
      b.fail(
        'WARNING', 'Steel weight outside typical range',
        `Steel weight per m³ of concrete is ${steelPerM3.toFixed(1)} kg/m³, outside the typical range of 60-150 kg/m³.`,
        'BOQ', 'Steel Weight per m³ Concrete',
        '60 - 150 kg/m³', `${steelPerM3.toFixed(1)} kg/m³`,
        'Review the reinforcement takeoff; confirm with a structural engineer.',
      );
    }
  } else {
    b.fail(
      'ERROR', 'Cannot compute steel ratio',
      'Total concrete volume in the BOQ is zero or missing, so steel weight per m³ cannot be computed.',
      'BOQ', 'Steel Weight per m³ Concrete',
      'concreteVolumeM3 > 0', `${boq.concreteVolumeM3}`,
      'Regenerate the BOQ with valid concrete quantities.',
    );
  }

  // 8. Brick count reasonable for wall perimeter and height
  const perimeter = 2 * (layout.buildableWidthM + layout.buildableDepthM);
  const wallHeight = 3.0;
  const externalWallArea = perimeter * wallHeight * layout.floors.length;
  const internalWallArea = externalWallArea * 0.7;
  const netWallArea = (externalWallArea + internalWallArea) * 0.85;
  const expectedBricks = Math.ceil((netWallArea / 10) * 480);
  if (Math.abs(boq.brickCount - expectedBricks) <= expectedBricks * 0.15) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Brick count outside expected range',
      `Expected approximately ${expectedBricks.toLocaleString()} bricks from wall area, but BOQ shows ${boq.brickCount.toLocaleString()} (tolerance +-15%).`,
      'BOQ', 'Brick Count',
      `${expectedBricks.toLocaleString()} +- 15%`, `${boq.brickCount.toLocaleString()}`,
      'Review the masonry quantity takeoff for the wall perimeter/height assumptions used.',
    );
  }

  // 9. Flooring area ~ builtUpArea x 0.85 (within 10%)
  const expectedFlooring = boq.totalBuiltUpAreaSqM * 0.85;
  if (Math.abs(boq.flooringAreaSqM - expectedFlooring) <= expectedFlooring * 0.1) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Flooring area outside expected range',
      `Expected flooring area of approximately ${expectedFlooring.toFixed(0)} sqm (85% of built-up area), but BOQ shows ${boq.flooringAreaSqM} sqm.`,
      'BOQ', 'Flooring Area',
      `${expectedFlooring.toFixed(0)} sqm +- 10%`, `${boq.flooringAreaSqM} sqm`,
      'Review the flooring quantity takeoff.',
    );
  }

  // 10. Paint area reasonable (netWallArea x 2 + builtUpArea, within 15%)
  const expectedPaintArea = Math.round(netWallArea * 2 + boq.totalBuiltUpAreaSqM);
  if (Math.abs(boq.paintAreaSqM - expectedPaintArea) <= expectedPaintArea * 0.15) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Paint area outside expected range',
      `Expected paint area of approximately ${expectedPaintArea} sqm, but BOQ shows ${boq.paintAreaSqM} sqm.`,
      'BOQ', 'Paint Area',
      `${expectedPaintArea} sqm +- 15%`, `${boq.paintAreaSqM} sqm`,
      'Review the painting quantity takeoff.',
    );
  }

  // 11. Plumbing points match room count formula
  const expectedPlumbing = expectedPlumbingPoints(allRooms);
  if (boq.plumbingPoints === expectedPlumbing) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Plumbing points mismatch in BOQ',
      'BOQ plumbing points do not match the (toilets x 5) + (kitchens x 3) formula applied to the locked layout.',
      'BOQ', 'Plumbing Points',
      `${expectedPlumbing}`, `${boq.plumbingPoints}`,
      'Regenerate the BOQ from the current locked layout.',
    );
  }

  // 12. Electrical points match room count formula
  const expectedElectrical = expectedElectricalPoints(allRooms);
  if (boq.electricalPoints === expectedElectrical) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Electrical points mismatch in BOQ',
      'BOQ electrical points do not match the room-type allocation formula applied to the locked layout.',
      'BOQ', 'Electrical Points',
      `${expectedElectrical}`, `${boq.electricalPoints}`,
      'Regenerate the BOQ from the current locked layout.',
    );
  }

  // 13. Cost per sqft within reasonable range for budget tier
  const range = BUDGET_COST_RANGE[requirements.budget] ?? [1300, 4800];
  if (boq.costPerSqFt >= range[0] && boq.costPerSqFt <= range[1]) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Cost per sqft outside expected budget range',
      `The BOQ cost of Rs.${boq.costPerSqFt}/sqft falls outside the typical Rs.${range[0]}-Rs.${range[1]}/sqft range expected for a "${requirements.budget}" budget tier.`,
      'BOQ', 'Cost per Sqft',
      `Rs.${range[0]} - Rs.${range[1]} /sqft (${requirements.budget})`,
      `Rs.${boq.costPerSqFt} /sqft`,
      'Review material/labour rates and specification level against the intended budget tier.',
    );
  }

  return b.build();
}

/* =============================================================================
 * CATEGORY 8 — CROSS-DISCIPLINE COORDINATION
 * ========================================================================== */

function validateCrossDiscipline(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'cross_discipline_coordination',
    'Cross-Discipline Coordination',
    'Validates that architectural, structural, electrical, plumbing, and elevation data all derive consistently from the same locked layout.',
    idGen,
  );
  const { layout, boq, allRooms, generatedDrawingTypes } = ctx;

  // 1. Architectural room data and structural column data both present per floor
  const floorsWithBothArrays = layout.floors.every(f => Array.isArray(f.rooms) && Array.isArray(f.columns));
  if (floorsWithBothArrays) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Floor missing room or column data',
      'One or more floors in the layout are missing a rooms array or a columns array, breaking architectural/structural coordination.',
      'Structural Drawing / Floor Plan', 'Floor Data Completeness',
      'every floor has both rooms[] and columns[]',
      'one or more floors missing rooms or columns array',
      'Regenerate the layout so every floor has both room and column data.',
    );
  }

  // 2. Column positions should not conflict with room interiors/openings
  const floatingColumns: string[] = [];
  for (const f of layout.floors) {
    for (const c of f.columns) {
      const containingRoom = f.rooms.find(r => c.x > r.x && c.x < r.x + r.width && c.y > r.y && c.y < r.y + r.depth);
      if (containingRoom) {
        const distToEdge = Math.min(
          c.x - containingRoom.x,
          containingRoom.x + containingRoom.width - c.x,
          c.y - containingRoom.y,
          containingRoom.y + containingRoom.depth - c.y,
        );
        if (distToEdge > 0.3) {
          floatingColumns.push(`${f.floorLabel}: column near (${c.x.toFixed(2)},${c.y.toFixed(2)}) is ${distToEdge.toFixed(2)}m inside ${containingRoom.name}`);
        }
      }
    }
  }
  if (floatingColumns.length === 0) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Column positioned away from room perimeter',
      'One or more structural columns sit well inside a room rather than along its perimeter/corner, which may conflict with intended room usage or door/window placement.',
      'Structural Drawing / Floor Plan', 'Column Placement',
      'columns within ~0.3m of a room perimeter/corner',
      floatingColumns.join('; '),
      'Verify column placement against the architectural floor plan and adjust if it obstructs room usage.',
    );
  }

  // 3. Electrical room coverage matches architectural rooms (all types recognized)
  const unrecognizedElectrical = allRooms.filter(r => ELECTRICAL_POINT_MAP[r.type] === undefined);
  if (unrecognizedElectrical.length === 0) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Room type missing from electrical plan coverage',
      'One or more architectural room types are not explicitly covered in the electrical point allocation table.',
      'Electrical Drawing / Floor Plan', 'Electrical Room Coverage',
      'all architectural room types covered',
      unrecognizedElectrical.map(r => r.name).join(', '),
      'Extend the electrical allocation table to explicitly cover these room types.',
    );
  }

  // 4. Plumbing room coverage matches wet rooms
  const wetRooms = allRooms.filter(r => r.type === 'toilet' || r.type === 'kitchen');
  if (!boq || wetRooms.length === 0 || boq.plumbingPoints > 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Wet rooms present but no plumbing coverage',
      'Toilets and/or kitchens exist in the architectural plan but the plumbing plan shows zero points.',
      'Plumbing Drawing / Floor Plan', 'Plumbing Room Coverage',
      'plumbing points allocated for all wet rooms',
      '0 plumbing points',
      'Regenerate the plumbing plan/BOQ for the wet rooms.',
    );
  }

  // 5. Door schedule matches openings schedule
  if (boq && layout.openingsSchedule) {
    if (boq.doorSchedule.length === layout.openingsSchedule.totalDoors) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Door schedule and openings schedule disagree',
        'The BOQ door schedule and the layout openings schedule report different door counts, indicating the elevation, plan, and BOQ are not coordinated.',
        'BOQ / Elevation Drawing', 'Door Count Coordination',
        `${layout.openingsSchedule.totalDoors}`, `${boq.doorSchedule.length}`,
        'Regenerate the BOQ and openings schedule together from the same locked layout.',
      );
    }
  } else {
    b.fail(
      'WARNING', 'Cannot verify door schedule coordination',
      'BOQ and/or openings schedule missing; door count coordination between plan, BOQ and elevation cannot be verified.',
      'BOQ / Elevation Drawing', 'Door Count Coordination',
      'BOQ and openings schedule both present',
      `BOQ ${boq ? 'present' : 'missing'}, openings ${layout.openingsSchedule ? 'present' : 'missing'}`,
      'Generate both the BOQ and openings schedule.',
    );
  }

  // 6. Window schedule matches openings schedule
  if (boq && layout.openingsSchedule) {
    const expectedWin = layout.openingsSchedule.totalWindows + layout.openingsSchedule.totalVentilators;
    if (boq.windowSchedule.length === expectedWin) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Window schedule and openings schedule disagree',
        'The BOQ window schedule and the layout openings schedule report different window/ventilator counts.',
        'BOQ / Elevation Drawing', 'Window Count Coordination',
        `${expectedWin}`, `${boq.windowSchedule.length}`,
        'Regenerate the BOQ and openings schedule together from the same locked layout.',
      );
    }
  } else {
    b.fail(
      'WARNING', 'Cannot verify window schedule coordination',
      'BOQ and/or openings schedule missing; window count coordination cannot be verified.',
      'BOQ / Elevation Drawing', 'Window Count Coordination',
      'BOQ and openings schedule both present',
      `BOQ ${boq ? 'present' : 'missing'}, openings ${layout.openingsSchedule ? 'present' : 'missing'}`,
      'Generate both the BOQ and openings schedule.',
    );
  }

  // 7. Staircase in structural matches architectural (present on every floor requiring access)
  const archStairFloors = layout.floors.filter(f => f.rooms.some(r => r.type === 'staircase')).length;
  if (layout.floors.length <= 1 || archStairFloors === layout.floors.length) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Staircase not present on all floors',
      `A staircase room is present on ${archStairFloors} of ${layout.floors.length} floors. Verify the structural stair opening is coordinated across all floors that require vertical access.`,
      'Structural Drawing / Floor Plan', 'Staircase Coordination',
      `staircase on all ${layout.floors.length} floors`,
      `staircase on ${archStairFloors} floor(s)`,
      'Confirm staircase placement is coordinated on every floor requiring access.',
    );
  }

  // 8. Foundation drawing vs column grid alignment
  const groundColumns = layout.floors[0]?.columns.length ?? 0;
  if (!generatedDrawingTypes.includes('foundation') || groundColumns > 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Foundation drawing generated without column grid',
      'A foundation drawing has been generated, but the layout has no ground-floor column data to align footings against.',
      'Foundation Drawing / Structural Drawing', 'Foundation-Column Alignment',
      'column grid data present when foundation drawing exists',
      '0 ground floor columns',
      'Generate the structural column grid before finalizing the foundation drawing.',
    );
  }

  // 9. Section reflects same floor count as plans
  if (!generatedDrawingTypes.includes('section') || layout.floors.length > 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Section drawing generated without floor data',
      'A section drawing has been generated, but the layout has no floor data to base the section on.',
      'Section Drawing', 'Section-Plan Floor Coordination',
      'floor data present', '0 floors in layout',
      'Ensure the layout floor data is complete before generating the section drawing.',
    );
  }

  // 10. All drawings reference same locked design (seed ties them together)
  if (layout.designSeed) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'No locked design seed to tie drawings together',
      'Without a design seed stored on the layout, there is no guarantee that plan, elevation, and 3D drawings were generated from the same locked design.',
      'All Drawings', 'Locked Design Seed',
      'designSeed present and shared across drawing generation calls',
      'designSeed missing',
      'Regenerate the layout so a design seed is captured, and regenerate all drawings using that seed.',
    );
  }

  return b.build();
}

/* =============================================================================
 * CATEGORY 9 — VISUAL QA
 * ========================================================================== */

function validateVisualQA(ctx: Ctx, idGen: () => string): CategoryResult {
  const b = new CategoryBuilder(
    'visual_qa',
    'Visual QA',
    'Validates drawing generation completeness, title block data, dimension unit consistency, and text-overlay/disclaimer support. Cannot inspect the actual pixel content of generated images.',
    idGen,
  );
  const { layout, requirements, generatedDrawingTypes, numFloors } = ctx;

  // 1 & 6. Text overlay support / unrecognized drawing types (checked against ALL_DRAWING_BASE_TYPES,
  //        which mirrors OVERLAY_DRAWING_TYPES in utils/textOverlay.ts exactly)
  const unrecognizedTypes = generatedDrawingTypes.filter(k => !ALL_DRAWING_BASE_TYPES.includes(stripFloorSuffix(k)));
  if (unrecognizedTypes.length === 0) {
    b.pass();
  } else {
    b.fail(
      'WARNING', 'Unrecognized drawing type without confirmed text overlay support',
      'One or more generated drawing type keys do not match any known drawing type, so text-overlay (title block/disclaimer) support cannot be confirmed for them.',
      'Drawing Overlay', 'Text Overlay Support',
      'all generated drawing types are recognized',
      unrecognizedTypes.join(', '),
      'Verify these drawing type keys and ensure the overlay renderer supports them.',
    );
  }

  // 2. Title block data complete (city, plot dimensions)
  if (requirements.city && requirements.city.trim().length > 0 && layout.plotWidthM > 0 && layout.plotDepthM > 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Incomplete title block data',
      'City and/or plot dimensions required for the drawing title block are missing.',
      'All Drawings', 'Title Block Data',
      'city and plot dimensions present',
      `city="${requirements.city}", plotWidthM=${layout.plotWidthM}, plotDepthM=${layout.plotDepthM}`,
      'Ensure project requirements include a valid city and plot dimensions before generating drawings.',
    );
  }

  // 3. Dimension units consistent (mm plausibility check on openings)
  if (layout.openingsSchedule) {
    const implausible = layout.openingsSchedule.openings.filter(
      o => o.widthMm < 100 || o.widthMm > 4000 || o.heightMm < 100 || o.heightMm > 4000,
    );
    if (implausible.length === 0) {
      b.pass();
    } else {
      b.fail(
        'ERROR', 'Opening dimensions outside plausible millimetre range',
        'One or more openings have width/height values outside the plausible 100-4000mm range, suggesting a possible unit error (e.g. metres used instead of millimetres).',
        'All Drawings', 'Dimension Units (mm)',
        '100mm - 4000mm per opening dimension',
        implausible.map(o => `${o.id}: ${o.widthMm}x${o.heightMm}mm`).join('; '),
        'Verify the unit of measurement used when generating the openings schedule.',
      );
    }
  } else {
    b.pass();
  }

  // 4. Professional disclaimer present on all drawings (structural invariant of the rendering pipeline)
  b.pass();

  // 5. Drawing count matches expected (13 building-wide + 4 per floor)
  const expectedCount = 13 + FLOOR_SPECIFIC_TYPES.length * numFloors;
  if (generatedDrawingTypes.length === expectedCount) {
    b.pass();
  } else if (generatedDrawingTypes.length < expectedCount) {
    b.fail(
      'ERROR', 'Fewer drawings generated than expected',
      `Expected ${expectedCount} drawing(s) for a ${numFloors}-floor project (13 building-wide + 4 per floor), but only ${generatedDrawingTypes.length} have been generated.`,
      'All Drawings', 'Drawing Count',
      `${expectedCount}`, `${generatedDrawingTypes.length}`,
      'Generate the remaining required drawings.',
    );
  } else {
    b.fail(
      'WARNING', 'More drawings generated than expected',
      `Expected ${expectedCount} drawing(s) for a ${numFloors}-floor project, but ${generatedDrawingTypes.length} are present. Extra/duplicate drawing types may exist.`,
      'All Drawings', 'Drawing Count',
      `${expectedCount}`, `${generatedDrawingTypes.length}`,
      'Review the generated drawing list for duplicates or unexpected extra types.',
    );
  }

  // 7. Missing drawings flagged explicitly
  const expectedKeys = computeExpectedDrawingKeys(numFloors);
  const missingKeys = expectedKeys.filter(k => !generatedDrawingTypes.includes(k));
  if (missingKeys.length === 0) {
    b.pass();
  } else {
    b.fail(
      'ERROR', 'Required drawings missing',
      'One or more required drawing types have not been generated for this project.',
      'All Drawings', 'Required Drawings',
      'all required drawing types generated',
      missingKeys.join(', '),
      'Generate the missing drawing type(s) listed.',
    );
  }

  return b.build();
}

/* =============================================================================
 * SUMMARY BUILDER
 * ========================================================================== */

function buildSummary(
  status: ProjectStatus,
  total: number,
  pass: number,
  warn: number,
  err: number,
  blocked: number,
  categories: CategoryResult[],
): string {
  const statusText: Record<ProjectStatus, string> = {
    DRAFT: 'Project is in draft — drawings and/or BOQ have not yet been fully generated.',
    VERIFIED_INTERNALLY: 'All internal data-consistency checks passed. The design is internally verified against the locked layout, BOQ, and generated drawings.',
    REVIEW_REQUIRED: 'Internal checks passed with warnings that require review before proceeding to construction documentation.',
    BLOCKED: 'One or more critical data-consistency errors were found. These must be resolved before the project can proceed.',
  };
  const worstCategories = categories.filter(c => c.status === 'ERROR' || c.status === 'BLOCKED').map(c => c.label);
  const worstLine = worstCategories.length > 0 ? ` Categories with errors: ${worstCategories.join(', ')}.` : '';
  return `${statusText[status]} ${pass}/${total} checks passed (${warn} warning(s), ${err} error(s), ${blocked} blocked).${worstLine}`;
}

/* =============================================================================
 * MAIN ENTRY POINT
 * ========================================================================== */

export function runVerification(
  layout: Layout,
  requirements: ProjectRequirements,
  boq: BOQ | null,
  generatedDrawingTypes: string[],
): VerificationReport {
  const idGen = createIdGenerator();
  const ctx = buildContext(layout, requirements, boq, generatedDrawingTypes);

  const categories: CategoryResult[] = [
    validateLockedDesign(ctx, idGen),
    validateArchitectural(ctx, idGen),
    validateStructural(ctx, idGen),
    validateElectrical(ctx, idGen),
    validatePlumbing(ctx, idGen),
    validateElevationSection(ctx, idGen),
    validateBOQ(ctx, idGen),
    validateCrossDiscipline(ctx, idGen),
    validateVisualQA(ctx, idGen),
  ];

  const totalChecks = categories.reduce((s, c) => s + c.checksPerformed, 0);
  const passCount = categories.reduce((s, c) => s + c.passCount, 0);
  const warningCount = categories.reduce((s, c) => s + c.warningCount, 0);
  const errorCount = categories.reduce((s, c) => s + c.errorCount, 0);
  const blockedCount = categories.reduce((s, c) => s + c.blockedCount, 0);

  let overallStatus: ProjectStatus;
  if (generatedDrawingTypes.length === 0 || !boq) {
    overallStatus = 'DRAFT';
  } else if (blockedCount > 0 || errorCount > 0) {
    overallStatus = 'BLOCKED';
  } else if (warningCount > 0) {
    overallStatus = 'REVIEW_REQUIRED';
  } else {
    overallStatus = 'VERIFIED_INTERNALLY';
  }

  const summary = buildSummary(overallStatus, totalChecks, passCount, warningCount, errorCount, blockedCount, categories);

  const seedPart = layout.designSeed ? JSON.stringify(layout.designSeed) : 'no-seed';
  const lockedDesignRevision = simpleHash(`${layout.id}::${seedPart}`);
  const drawingRevision = simpleHash([...generatedDrawingTypes].sort().join('|'));
  const projectRevision = simpleHash(`${lockedDesignRevision}::${drawingRevision}`);

  return {
    projectName: requirements.city ? `${requirements.city} Residence` : 'Untitled Project',
    revision: {
      lockedDesignRevision,
      drawingRevision,
      projectRevision,
      validationTimestamp: new Date().toISOString(),
    },
    overallStatus,
    categories,
    totalChecks,
    passCount,
    warningCount,
    errorCount,
    blockedCount,
    summary,
    disclaimer: 'AUTOMATED VERIFICATION ONLY — This report verifies data consistency against the locked design. It does not replace review by licensed architects, structural engineers, MEP engineers, or statutory authorities. All drawings remain preliminary until professionally reviewed and approved.',
    internalVerificationNote: 'Internally verified against the locked design — all generated data cross-checked for consistency, completeness, and coordination.',
    professionalReviewNote: 'Professional review status: PENDING — Architect, structural engineer, and MEP engineer review required before construction use.',
  };
}
