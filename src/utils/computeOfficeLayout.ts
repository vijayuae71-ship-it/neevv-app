/**
 * computeOfficeLayout.ts
 *
 * Office space allocation module, following the pattern of the residential
 * computeProportionalLayout.ts. Computes buildable commercial floor area
 * from plot dimensions, applies NBC commercial coverage/FSI/setback rules,
 * and distributes that area to office rooms (workstations, cabins,
 * conference rooms, amenities) across three differentiated layout
 * strategies: Efficiency-First, Collaboration-First, Executive-First.
 *
 * This module does NOT do complex bin-packing — it places rooms on a
 * simple grid (row-based) sized to fit the buildable footprint, with a
 * structural column grid at 6m intervals, matching the level of detail
 * used elsewhere in the app for drawing-prompt generation.
 */

import type {
  OfficeRequirements,
  OfficeFloorProgram,
  Layout,
  FloorLayout,
  Room,
  Column,
  Setbacks,
} from '../types';

/* ========================================================================
 * NBC Commercial constants
 * ===================================================================== */

const SQM_PER_PERSON = 9.3; // 100 sqft per person minimum (NBC commercial)
const CORRIDOR_MIN_WIDTH_M = 1.5;
const WASHROOM_MALE_RATIO = 25; // 1 per 25 employees
const WASHROOM_FEMALE_RATIO = 15; // 1 per 15 employees

const MIN_ROOM_SQM: Record<string, number> = {
  workstation_open: 4.5, // per seat
  cabin_manager: 12,
  cabin_director: 18,
  cabin_md: 25,
  conference_small: 20,
  conference_large: 40,
  board_room: 55,
  reception: 15,
  pantry: 12,
  cafeteria: 1.5, // per employee
  server_room: 10,
  break_room: 15,
  washroom_male: 8,
  washroom_female: 8,
  washroom_handicap: 8,
  electrical_room: 6,
  ahu_room: 12,
};

const SETBACKS: Setbacks = {
  front: 3.0,
  rear: 3.0,
  left: 1.5,
  right: 1.5,
};

const DEFAULT_FSI = 1.5;

const COLUMN_GRID_M = 6.0;
const CORRIDOR_CIRCULATION_PCT = 0.15; // 15% of floor area reserved for corridors/circulation

/* ========================================================================
 * Helpers
 * ===================================================================== */

/** Coverage tier: ≤300sqm=65%, ≤500sqm=55%, >500sqm=50% */
function getCommercialCoveragePct(plotAreaSqm: number): number {
  if (plotAreaSqm <= 300) return 65;
  if (plotAreaSqm <= 500) return 55;
  return 50;
}

function roundTo(value: number, increment = 0.05): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function ftToM(ft: number): number {
  return ft * 0.3048;
}

/**
 * Compute the buildable footprint per floor (sqm), applying setbacks,
 * NBC coverage tier, and FSI constraints — whichever is tightest wins.
 */
function computeBuildableFootprint(
  plotWidthM: number,
  plotDepthM: number,
  numFloors: number
): {
  plotAreaSqm: number;
  footprintSqm: number;
  buildableWidthM: number;
  buildableDepthM: number;
  coveragePct: number;
} {
  const plotAreaSqm = plotWidthM * plotDepthM;
  const coveragePct = getCommercialCoveragePct(plotAreaSqm);
  const coverageMaxSqm = plotAreaSqm * (coveragePct / 100);

  const fsiMaxPerFloor = (plotAreaSqm * DEFAULT_FSI) / Math.max(numFloors, 1);

  const setbackAdjustedW = Math.max(0, plotWidthM - SETBACKS.left - SETBACKS.right);
  const setbackAdjustedD = Math.max(0, plotDepthM - SETBACKS.front - SETBACKS.rear);
  const setbackFootprintSqm =
    setbackAdjustedW > 0 && setbackAdjustedD > 0 ? setbackAdjustedW * setbackAdjustedD : Infinity;

  const footprintSqm = Math.min(coverageMaxSqm, fsiMaxPerFloor, setbackFootprintSqm);

  // Derive an effective buildable width/depth from the setback-adjusted
  // rectangle, scaled down if the coverage/FSI cap is tighter than the
  // physical setback rectangle.
  const scale =
    setbackFootprintSqm > 0 && setbackFootprintSqm !== Infinity
      ? Math.sqrt(footprintSqm / setbackFootprintSqm)
      : 1;
  const buildableWidthM = setbackAdjustedW > 0 ? setbackAdjustedW * Math.min(scale, 1) : Math.sqrt(footprintSqm);
  const buildableDepthM = setbackAdjustedD > 0 ? setbackAdjustedD * Math.min(scale, 1) : Math.sqrt(footprintSqm);

  return { plotAreaSqm, footprintSqm, buildableWidthM, buildableDepthM, coveragePct };
}

/** Count total employees across a floor program (used for washrooms/cafeteria sizing). */
function estimateFloorHeadcount(floor: OfficeFloorProgram, totalEmployeeCount: number, totalFloors: number): number {
  const explicitSeats =
    floor.workstations +
    floor.managerCabins +
    floor.directorCabins +
    (floor.mdCabin ? 1 : 0);
  if (explicitSeats > 0) return explicitSeats;
  // Fall back to an even split of the company headcount across floors.
  return Math.ceil(totalEmployeeCount / Math.max(totalFloors, 1));
}

function computeWashroomCounts(headcount: number): { male: number; female: number; handicap: number } {
  const male = Math.max(1, Math.ceil(headcount / WASHROOM_MALE_RATIO));
  const female = Math.max(1, Math.ceil(headcount / WASHROOM_FEMALE_RATIO));
  const handicap = 1;
  return { male, female, handicap };
}

/* ========================================================================
 * Layout strategy profiles
 * ===================================================================== */

interface StrategyProfile {
  name: string;
  description: string;
  strategyKey: 'efficiency' | 'collaboration' | 'executive';
  // Multipliers applied to base room sizes / counts to differentiate the
  // three layout strategies from one another.
  workstationSeatSqm: number;
  cabinScale: number;
  conferenceScale: number;
  breakRoomScale: number;
  cafeteriaScale: number;
}

const STRATEGY_PROFILES: StrategyProfile[] = [
  {
    name: 'Efficiency-First',
    description:
      'Maximizes seat density and open workstation area, with compact cabins and shared amenities — best for lean, high-headcount teams.',
    strategyKey: 'efficiency',
    workstationSeatSqm: MIN_ROOM_SQM.workstation_open * 0.92,
    cabinScale: 0.85,
    conferenceScale: 0.9,
    breakRoomScale: 0.85,
    cafeteriaScale: 0.9,
  },
  {
    name: 'Collaboration-First',
    description:
      'Prioritizes larger conference rooms, break-out zones, and cafeteria space to encourage cross-team collaboration and informal meetings.',
    strategyKey: 'collaboration',
    workstationSeatSqm: MIN_ROOM_SQM.workstation_open * 1.05,
    cabinScale: 1.0,
    conferenceScale: 1.35,
    breakRoomScale: 1.4,
    cafeteriaScale: 1.25,
  },
  {
    name: 'Executive-First',
    description:
      'Allocates generous director/MD cabins, a premium board room, and an upgraded reception, trading off some open workstation density.',
    strategyKey: 'executive',
    workstationSeatSqm: MIN_ROOM_SQM.workstation_open * 1.0,
    cabinScale: 1.4,
    conferenceScale: 1.1,
    breakRoomScale: 1.0,
    cafeteriaScale: 1.0,
  },
];

/* ========================================================================
 * Room allocation for a single floor under a given strategy
 * ===================================================================== */

interface RoomBudget {
  type: string;
  label: string;
  count: number;
  areaEachSqm: number;
}

function buildRoomBudgets(
  floor: OfficeFloorProgram,
  profile: StrategyProfile,
  headcount: number
): RoomBudget[] {
  const budgets: RoomBudget[] = [];

  if (floor.workstations > 0) {
    budgets.push({
      type: 'workstation_open',
      label: 'Open Workstations',
      count: 1, // treated as a single open-plan zone sized for all seats
      areaEachSqm: roundTo(floor.workstations * profile.workstationSeatSqm, 0.1),
    });
  }

  if (floor.managerCabins > 0) {
    budgets.push({
      type: 'cabin_manager',
      label: 'Manager Cabin',
      count: floor.managerCabins,
      areaEachSqm: roundTo(MIN_ROOM_SQM.cabin_manager * profile.cabinScale, 0.1),
    });
  }

  if (floor.directorCabins > 0) {
    budgets.push({
      type: 'cabin_director',
      label: 'Director Cabin',
      count: floor.directorCabins,
      areaEachSqm: roundTo(MIN_ROOM_SQM.cabin_director * profile.cabinScale, 0.1),
    });
  }

  if (floor.mdCabin) {
    budgets.push({
      type: 'cabin_md',
      label: 'MD Cabin',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.cabin_md * profile.cabinScale, 0.1),
    });
  }

  if (floor.conferenceSmall > 0) {
    budgets.push({
      type: 'conference_small',
      label: 'Conference Room (Small)',
      count: floor.conferenceSmall,
      areaEachSqm: roundTo(MIN_ROOM_SQM.conference_small * profile.conferenceScale, 0.1),
    });
  }

  if (floor.conferenceLarge > 0) {
    budgets.push({
      type: 'conference_large',
      label: 'Conference Room (Large)',
      count: floor.conferenceLarge,
      areaEachSqm: roundTo(MIN_ROOM_SQM.conference_large * profile.conferenceScale, 0.1),
    });
  }

  if (floor.boardRoom) {
    budgets.push({
      type: 'board_room',
      label: 'Board Room',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.board_room * profile.conferenceScale, 0.1),
    });
  }

  if (floor.hasReception) {
    budgets.push({
      type: 'reception',
      label: 'Reception',
      count: 1,
      areaEachSqm: roundTo(
        MIN_ROOM_SQM.reception * (profile.strategyKey === 'executive' ? 1.3 : 1.0),
        0.1
      ),
    });
    budgets.push({
      type: 'waiting_lounge',
      label: 'Waiting Lounge',
      count: 1,
      areaEachSqm: roundTo(10 * (profile.strategyKey === 'executive' ? 1.3 : 1.0), 0.1),
    });
  }

  if (floor.hasPantry) {
    budgets.push({
      type: 'pantry',
      label: 'Pantry',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.pantry * profile.breakRoomScale, 0.1),
    });
  }

  if (floor.hasCafeteria) {
    budgets.push({
      type: 'cafeteria',
      label: 'Cafeteria',
      count: 1,
      areaEachSqm: roundTo(
        Math.max(MIN_ROOM_SQM.cafeteria * headcount * profile.cafeteriaScale, MIN_ROOM_SQM.cafeteria * 10),
        0.1
      ),
    });
  }

  if (floor.hasServerRoom) {
    budgets.push({
      type: 'server_room',
      label: 'Server Room',
      count: 1,
      areaEachSqm: MIN_ROOM_SQM.server_room,
    });
  }

  if (floor.hasBreakRoom) {
    budgets.push({
      type: 'break_room',
      label: 'Break Room',
      count: 1,
      areaEachSqm: roundTo(MIN_ROOM_SQM.break_room * profile.breakRoomScale, 0.1),
    });
  }

  // Washrooms — auto-added based on headcount ratios
  const washroomCounts = computeWashroomCounts(headcount);
  budgets.push({
    type: 'washroom_male',
    label: 'Washroom (Male)',
    count: washroomCounts.male,
    areaEachSqm: MIN_ROOM_SQM.washroom_male,
  });
  budgets.push({
    type: 'washroom_female',
    label: 'Washroom (Female)',
    count: washroomCounts.female,
    areaEachSqm: MIN_ROOM_SQM.washroom_female,
  });
  budgets.push({
    type: 'washroom_handicap',
    label: 'Washroom (Accessible)',
    count: washroomCounts.handicap,
    areaEachSqm: MIN_ROOM_SQM.washroom_handicap,
  });

  // Electrical + AHU rooms — always included as core building services
  budgets.push({
    type: 'electrical_room',
    label: 'Electrical Room',
    count: 1,
    areaEachSqm: MIN_ROOM_SQM.electrical_room,
  });
  budgets.push({
    type: 'ahu_room',
    label: 'AHU Room',
    count: 1,
    areaEachSqm: MIN_ROOM_SQM.ahu_room,
  });

  return budgets;
}

/* ========================================================================
 * Grid placement
 * ===================================================================== */

interface PlacedRoomBudget extends RoomBudget {
  widthM: number;
  depthM: number;
}

/**
 * Simple row-based grid placement: rooms are laid out left-to-right,
 * wrapping to a new row when the buildable width is exceeded. A corridor
 * strip of CORRIDOR_MIN_WIDTH_M runs along the depth axis between rows to
 * satisfy NBC circulation requirements.
 */
function placeRoomsOnGrid(
  budgets: RoomBudget[],
  buildableWidthM: number,
  buildableDepthM: number,
  floorIndex: number
): { rooms: Room[]; columns: Column[] } {
  const rooms: Room[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowMaxDepth = 0;
  let roomIdCounter = 0;

  // Expand each budget entry into individual room instances of a fixed
  // width/depth derived from its area via a 1.3:1 aspect ratio (a
  // reasonable default for office rooms of most types).
  const expanded: PlacedRoomBudget[] = [];
  for (const b of budgets) {
    for (let i = 0; i < b.count; i++) {
      const aspect = b.type === 'workstation_open' ? 2.2 : 1.3;
      const depthM = roundTo(Math.sqrt(b.areaEachSqm / aspect), 0.1);
      const widthM = roundTo(b.areaEachSqm / Math.max(depthM, 0.1), 0.1);
      expanded.push({ ...b, widthM, depthM });
    }
  }

  for (const item of expanded) {
    // Wrap to a new row if this room would exceed the buildable width.
    if (cursorX + item.widthM > buildableWidthM && cursorX > 0) {
      cursorX = 0;
      cursorY += rowMaxDepth + CORRIDOR_MIN_WIDTH_M;
      rowMaxDepth = 0;
    }

    roomIdCounter++;
    const name = item.count > 1 && expanded.filter((e) => e.type === item.type).length > 1
      ? `${item.label} ${roomIdCounter}`
      : item.label;

    rooms.push({
      id: `F${floorIndex}-R${roomIdCounter}`,
      name,
      type: item.type as Room['type'],
      x: roundTo(cursorX, 0.01),
      y: roundTo(cursorY, 0.01),
      width: item.widthM,
      depth: item.depthM,
      floor: floorIndex,
    });

    cursorX += item.widthM;
    rowMaxDepth = Math.max(rowMaxDepth, item.depthM);
  }

  // Structural column grid at 6m intervals across the buildable footprint.
  const columns: Column[] = [];
  const numColsW = Math.max(1, Math.floor(buildableWidthM / COLUMN_GRID_M));
  const numColsD = Math.max(1, Math.floor(buildableDepthM / COLUMN_GRID_M));
  for (let ix = 0; ix <= numColsW; ix++) {
    for (let iy = 0; iy <= numColsD; iy++) {
      columns.push({
        x: roundTo(Math.min(ix * COLUMN_GRID_M, buildableWidthM), 0.01),
        y: roundTo(Math.min(iy * COLUMN_GRID_M, buildableDepthM), 0.01),
        widthMM: 300,
        depthMM: 450,
      });
    }
  }

  return { rooms, columns };
}

/* ========================================================================
 * Main entry point
 * ===================================================================== */

/**
 * Compute three differentiated office layout options for the given
 * requirements: Efficiency-First, Collaboration-First, Executive-First.
 */
export function computeOfficeLayout(req: OfficeRequirements): { layouts: Layout[]; warnings: string[] } {
  const warnings: string[] = [];

  const plotWidthM = ftToM(req.plotWidthFt);
  const plotDepthM = ftToM(req.plotDepthFt);
  const numFloors = Math.max(req.floors.length, 1);

  const { plotAreaSqm, footprintSqm, buildableWidthM, buildableDepthM, coveragePct } =
    computeBuildableFootprint(plotWidthM, plotDepthM, numFloors);

  if (footprintSqm <= 0) {
    warnings.push('Plot dimensions and setbacks leave no buildable footprint. Check plot size and setback rules.');
  }

  // Circulation deduction (corridors + lobby waiting areas) applied to the
  // per-floor buildable footprint before room budgets are computed.
  const netFloorAreaSqm = footprintSqm * (1 - CORRIDOR_CIRCULATION_PCT);

  const layouts: Layout[] = STRATEGY_PROFILES.map((profile) => {
    const floorLayouts: FloorLayout[] = req.floors.map((floorReq, floorIndex) => {
      const headcount = estimateFloorHeadcount(floorReq, req.employeeCount, numFloors);

      const perPersonMinSqm = headcount * SQM_PER_PERSON;
      if (perPersonMinSqm > netFloorAreaSqm) {
        warnings.push(
          `${profile.name}: ${floorReq.floorLabel} requires at least ${perPersonMinSqm.toFixed(
            1
          )} sqm for ${headcount} occupants (NBC 9.3 sqm/person), but only ${netFloorAreaSqm.toFixed(
            1
          )} sqm is available. Consider reducing headcount or adding floors.`
        );
      }

      const budgets = buildRoomBudgets(floorReq, profile, headcount);
      const { rooms, columns } = placeRoomsOnGrid(budgets, buildableWidthM, buildableDepthM, floorIndex);

      return {
        floor: floorIndex,
        floorLabel: floorReq.floorLabel,
        rooms,
        columns,
      };
    });

    const builtUpAreaSqM = roundTo(footprintSqm * numFloors, 0.01);
    const builtUpAreaSqFt = roundTo(builtUpAreaSqM * 10.7639, 0.01);

    const layout: Layout = {
      id: `office-${profile.strategyKey}`,
      name: profile.name,
      strategy: profile.strategyKey,
      description: profile.description,
      floors: floorLayouts,
      vastuScore: 0, // Not applicable for commercial layouts
      vastuDetails: [],
      nbcCompliant: warnings.length === 0,
      nbcIssues: [],
      builtUpAreaSqM,
      builtUpAreaSqFt,
      setbacks: SETBACKS,
      plotWidthM: roundTo(plotWidthM, 0.01),
      plotDepthM: roundTo(plotDepthM, 0.01),
      buildableWidthM: roundTo(buildableWidthM, 0.01),
      buildableDepthM: roundTo(buildableDepthM, 0.01),
      buildingWidthMm: Math.round(buildableWidthM * 1000),
      buildingDepthMm: Math.round(buildableDepthM * 1000),
      buildingFootprintSqM: roundTo(footprintSqm, 0.01),
      effectivePerFloorSqFt: roundTo(footprintSqm * 10.7639, 0.01),
      effectivePerFloorSqM: roundTo(footprintSqm, 0.01),
      totalBuiltUpSqFt: builtUpAreaSqFt,
      totalBuiltUpSqM: builtUpAreaSqM,
      fsiValue: DEFAULT_FSI,
      nbcMaxCoveragePct: coveragePct,
      constraintBrief: `Buildable footprint capped at ${footprintSqm.toFixed(
        1
      )} sqm/floor (coverage ${coveragePct}%, FSI ${DEFAULT_FSI}, setbacks F${SETBACKS.front}m/R${SETBACKS.rear}m/L${SETBACKS.left}m/R${SETBACKS.right}m).`,
      numFloors,
      plotWidthFt: req.plotWidthFt,
      plotDepthFt: req.plotDepthFt,
    };

    return layout;
  });

  if (plotAreaSqm > 0 && footprintSqm / plotAreaSqm > 0.9) {
    warnings.push('Plot is very small relative to setback requirements; buildable footprint may be impractically tight.');
  }

  return { layouts, warnings };
}
