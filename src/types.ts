export type Facing = 'North' | 'South' | 'East' | 'West';
export type ParkingType = 'Stilt' | 'Open' | 'None';
export type BudgetRange = 'economy' | 'standard' | 'premium' | 'luxury';
export type ArchitecturalStyle = 'modern_minimalist' | 'contemporary_indian' | 'traditional' | 'tropical' | 'industrial';
export type RoomType =
  | 'bedroom'
  | 'master_bedroom'
  | 'hall'
  | 'kitchen'
  | 'toilet'
  | 'dining'
  | 'puja'
  | 'staircase'
  | 'parking'
  | 'balcony'
  | 'passage'
  | 'entrance'
  | 'store'
  | 'utility';

export interface FloorProgram {
  floorLabel: string;
  bedrooms: number;
  halls: number;
  kitchens: number;
  hasDining: boolean;
  hasPuja: boolean;
}

export interface ProjectRequirements {
  city: string;
  state: string;
  plotWidthFt: number;
  plotDepthFt: number;
  facing: Facing;
  vastuCompliance: boolean;
  parkingType: ParkingType;
  budget: BudgetRange;
  architecturalStyle: ArchitecturalStyle;
  floors: FloorProgram[];
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  depth: number;
  floor: number;
}

export interface Column {
  x: number;
  y: number;
  widthMM: number;
  depthMM: number;
}

export interface Setbacks {
  front: number;
  rear: number;
  left: number;
  right: number;
}

export interface NBCIssue {
  room: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
}

export interface VastuDetail {
  room: string;
  idealZone: string;
  actualZone: string;
  compliant: boolean;
}

export interface FloorLayout {
  floor: number;
  floorLabel: string;
  rooms: Room[];
  columns: Column[];
}

export interface Layout {
  id: string;
  name: string;
  strategy: string;
  description: string;
  floors: FloorLayout[];
  vastuScore: number;
  vastuDetails: VastuDetail[];
  nbcCompliant: boolean;
  nbcIssues: NBCIssue[];
  builtUpAreaSqM: number;
  builtUpAreaSqFt: number;
  setbacks: Setbacks;
  plotWidthM: number;
  plotDepthM: number;
  buildableWidthM: number;
  buildableDepthM: number;

  // === Setback-adjusted building dimensions (comprehensive fix) ===
  buildingWidthMm?: number;
  buildingDepthMm?: number;
  buildingFootprintSqM?: number;
  effectivePerFloorSqFt?: number;
  effectivePerFloorSqM?: number;
  totalBuiltUpSqFt?: number;
  totalBuiltUpSqM?: number;
  fsiValue?: number;
  nbcMaxCoveragePct?: number;
  constraintBrief?: string;
  downgradeNote?: string;
  numFloors?: number;
  plotWidthFt?: number;
  plotDepthFt?: number;
}

export interface BOQLineItem {
  sno: number;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  category: 'structural' | 'masonry' | 'finishing' | 'mep' | 'doors_windows' | 'misc';
  remark?: string;
}

export interface DoorScheduleItem {
  mark: string;
  location: string;
  type: string;
  widthMM: number;
  heightMM: number;
  qty: number;
  material: string;
}

export interface WindowScheduleItem {
  mark: string;
  location: string;
  type: string;
  widthMM: number;
  heightMM: number;
  qty: number;
  material: string;
}

export interface BOQ {
  totalBuiltUpAreaSqFt: number;
  totalBuiltUpAreaSqM: number;
  numFloors: number;
  concreteVolumeM3: number;
  steelWeightMT: number;
  brickCount: number;
  cementBags: number;
  sandCuM: number;
  aggregateCuM: number;
  paintAreaSqM: number;
  flooringAreaSqM: number;
  plumbingPoints: number;
  electricalPoints: number;
  lineItems: BOQLineItem[];
  doorSchedule: DoorScheduleItem[];
  windowSchedule: WindowScheduleItem[];
  totalCost: number;
  costPerSqFt: number;
  concreteBreakdown: {
    foundation: number;
    columns: number;
    beams: number;
    slabs: number;
    staircase: number;
    lintels: number;
  };
  waterproofingAreaSqM: number;
  plasteringAreaSqM: number;
}

export type AppStep = 'requirements' | 'layouts' | 'isometric' | 'working' | 'rates' | 'boq' | 'interior';

export interface MaterialRate {
  id: string;
  name: string;
  unit: string;
  defaultRate: number;
  customRate?: number;
  category: 'cement_concrete' | 'steel' | 'masonry' | 'sand_aggregate' | 'tiles_flooring' | 'paint_finish' | 'plumbing_fixtures' | 'electrical' | 'doors_windows' | 'waterproofing' | 'misc';
  remark?: string;
}

export interface LabourRate {
  id: string;
  trade: string;
  unit: string;
  defaultRate: number;
  customRate?: number;
  category: 'skilled' | 'semi_skilled' | 'unskilled' | 'specialist';
  remark?: string;
}

export interface CustomRateSheet {
  materials: MaterialRate[];
  labour: LabourRate[];
  lastUpdated?: string;
}

export type InteriorStyle = 'modern_minimalist' | 'contemporary_indian' | 'traditional' | 'industrial' | 'scandinavian';
export type RoomFinishType = 'bedroom' | 'master_bedroom' | 'living' | 'kitchen' | 'dining' | 'bathroom' | 'puja' | 'balcony' | 'entrance';

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  wall: string;
  ceiling: string;
  name: string;
}

export interface MaterialSpec {
  id: string;
  name: string;
  type: 'flooring' | 'wall_finish' | 'ceiling' | 'countertop' | 'cabinet' | 'hardware';
  brand?: string;
  finish: string;
  color: string;
  ratePerUnit: number;
  unit: string;
}

export interface FurnitureItem {
  id: string;
  name: string;
  category: 'bed' | 'sofa' | 'dining_table' | 'wardrobe' | 'tv_unit' | 'study_table' | 'dressing' | 'shoe_rack' | 'kitchen_cabinet' | 'crockery' | 'pooja_unit' | 'console' | 'side_table' | 'bookshelf' | 'bar_unit';
  widthMM: number;
  depthMM: number;
  heightMM: number;
  material: string;
  estimatedCost: number;
  color: string;
}

export interface RoomInterior {
  roomId: string;
  roomName: string;
  roomType: RoomFinishType;
  style: InteriorStyle;
  palette: ColorPalette;
  flooring: MaterialSpec;
  wallFinish: MaterialSpec;
  ceilingType: 'plain' | 'false_ceiling_peripheral' | 'false_ceiling_full' | 'wooden_ceiling';
  ceilingHeight: number;
  furniture: FurnitureItem[];
  electricalPoints: {
    switches: number;
    sockets: number;
    dataPoints: number;
    lightPoints: number;
    fanPoints: number;
    acPoints: number;
  };
  specialFeatures: string[];
}

export interface InteriorMoodBoard {
  style: InteriorStyle;
  styleName: string;
  description: string;
  palette: ColorPalette;
  keyMaterials: string[];
  keyFurniture: string[];
  imagePrompt: string;
}

export interface InteriorExecutionPhase {
  id: string;
  phase: string;
  description: string;
  trade: string;
  durationDays: number;
  startDay: number;
  dependencies: string[];
  materials: string[];
  estimatedCost: number;
}

export interface InteriorBOQItem {
  sno: number;
  category: 'civil' | 'false_ceiling' | 'flooring' | 'woodwork' | 'painting' | 'electrical' | 'plumbing' | 'hardware' | 'furnishing' | 'miscellaneous';
  description: string;
  room: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  remark?: string;
}

export interface InteriorDesignData {
  rooms: RoomInterior[];
  moodBoards: InteriorMoodBoard[];
  executionPlan: InteriorExecutionPhase[];
  totalDurationDays: number;
  boqItems: InteriorBOQItem[];
  totalCost: number;
  costBreakdown: {
    civil: number;
    falseCeiling: number;
    flooring: number;
    woodwork: number;
    painting: number;
    electrical: number;
    plumbing: number;
    hardware: number;
    furnishing: number;
    miscellaneous: number;
  };
}

/* ================================================================
   LOCKED INTERIOR SCENE TYPES
   ----------------------------------------------------------------
   Append to the END of src/types.ts.

   These types back the "Locked Interior Scene" architecture: a
   single resolved `InteriorScene` object is built once per room
   (see src/utils/buildInteriorScene.ts) and consumed by every
   render prompt (plan / elevation / 3D) so all three views describe
   identical furniture, fixtures, materials, and dimensions.

   All types below reference only types already defined earlier in
   this file (InteriorStyle, ColorPalette) — no new imports needed.
   ================================================================ */

export type SceneFurnitureWall = 'north' | 'south' | 'east' | 'west' | 'center';
export type SceneFixtureWall = 'north' | 'south' | 'east' | 'west' | 'floor' | 'ceiling';
export type SceneOpeningWall = 'north' | 'south' | 'east' | 'west';
export type SceneOpeningType = 'door' | 'window';

export interface SceneFurnitureItem {
  name: string;
  category: string;
  widthMM: number;
  depthMM: number;
  heightMM: number;
  material: string;
  color: string;
  wall: SceneFurnitureWall;
  description: string;
}

export interface SceneFixture {
  name: string;
  widthMM: number;
  depthMM: number;
  heightMM: number;
  mountHeightMM: number;
  wall: SceneFixtureWall;
  material: string;
  description: string;
}

export interface SceneOpening {
  type: SceneOpeningType;
  wall: SceneOpeningWall;
  widthMM: number;
  heightMM: number;
  sillHeightMM: number;
  openDirection?: string;
  material: string;
}

export interface SceneZone {
  name: string;
  description: string;
  color: string;
}

export interface SceneMaterials {
  flooring: {
    name: string;
    finish: string;
    tileSize?: string;
  };
  wallFinish: {
    name: string;
    finish: string;
  };
  accentWall?: {
    name: string;
    description: string;
  };
  ceiling: {
    type: string;
    height: number;
    falseCeilingHeight?: number;
    finish: string;
  };
  countertop?: {
    name: string;
    thickness: number;
    finish: string;
  };
}

export interface SceneLighting {
  description: string;
  fixtures: string[];
}

export interface SceneDimensions {
  counterHeight?: number;
  upperCabinetBottom?: number;
  backsplashHeight?: number;
  plinthHeight?: number;
  dadoHeight?: number;
}

export interface InteriorScene {
  roomId: string;
  roomName: string;
  roomType: string;
  widthMM: number;
  depthMM: number;
  widthFt: number;
  depthFt: number;
  areaSqft: number;
  clearHeightMM: number; // 3050
  falseCeilingHeightMM: number; // 2750
  wallThicknessMM: number; // 230
  style: InteriorStyle;
  styleName: string;
  palette: ColorPalette;
  materials: SceneMaterials;
  furniture: SceneFurnitureItem[];
  fixtures: SceneFixture[];
  openings: SceneOpening[];
  zones: SceneZone[];
  keyDimensions: SceneDimensions;
  lighting: SceneLighting;
  specificNotes: string;
  electricalPoints: {
    switches: number;
    sockets: number;
    dataPoints: number;
    lightPoints: number;
    fanPoints: number;
    acPoints: number;
  };
}
