export type Facing = 'North' | 'South' | 'East' | 'West';
export type ParkingType = 'Stilt' | 'Open' | 'None';
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
  severity: 'error' | 'warning';
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
}

/* ---------- Expanded BOQ ---------- */

export interface BOQLineItem {
  sno: number;
  description: string;
  quantity: number;
  unit: string;
  rate: number;        // INR per unit
  amount: number;      // quantity * rate
  category: 'structural' | 'masonry' | 'finishing' | 'mep' | 'doors_windows' | 'misc';
  remark?: string;
}

export interface DoorScheduleItem {
  mark: string;        // D1, D2...
  location: string;
  type: string;        // "Flush", "Panel", "UPVC"
  widthMM: number;
  heightMM: number;
  qty: number;
  material: string;
}

export interface WindowScheduleItem {
  mark: string;        // W1, W2...
  location: string;
  type: string;        // "Sliding", "Casement"
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
  // Expanded fields
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

export type AppStep = 'requirements' | 'layouts' | 'floorplan' | 'isometric' | 'working' | 'boq' | 'interior';

/* ========== INTERIOR DESIGN MODULE ========== */

export type InteriorStyle = 'modern_minimalist' | 'contemporary_indian' | 'traditional' | 'industrial' | 'scandinavian';

export type RoomFinishType = 'bedroom' | 'master_bedroom' | 'living' | 'kitchen' | 'dining' | 'bathroom' | 'puja' | 'balcony' | 'entrance';

export interface ColorPalette {
  primary: string;      // hex
  secondary: string;    // hex
  accent: string;       // hex
  wall: string;         // hex
  ceiling: string;      // hex
  name: string;         // e.g. "Warm Neutrals"
}

export interface MaterialSpec {
  id: string;
  name: string;
  type: 'flooring' | 'wall_finish' | 'ceiling' | 'countertop' | 'cabinet' | 'hardware';
  brand?: string;
  finish: string;       // e.g. "Matt", "Glossy", "Satin"
  color: string;
  ratePerUnit: number;  // INR
  unit: string;         // "sqft", "rft", "nos"
}

export interface FurnitureItem {
  id: string;
  name: string;           // e.g. "Queen Bed", "L-Shape Sofa"
  category: 'bed' | 'sofa' | 'dining_table' | 'wardrobe' | 'tv_unit' | 'study_table' | 'dressing' | 'shoe_rack' | 'kitchen_cabinet' | 'crockery' | 'pooja_unit' | 'console' | 'side_table' | 'bookshelf' | 'bar_unit';
  widthMM: number;
  depthMM: number;
  heightMM: number;
  material: string;       // "Plywood + Laminate", "Solid Wood", etc.
  estimatedCost: number;  // INR
  color: string;          // hex for rendering
}

export interface RoomInterior {
  roomId: string;         // matches Room.id from layout
  roomName: string;
  roomType: RoomFinishType;
  style: InteriorStyle;
  palette: ColorPalette;
  flooring: MaterialSpec;
  wallFinish: MaterialSpec;
  ceilingType: 'plain' | 'false_ceiling_peripheral' | 'false_ceiling_full' | 'wooden_ceiling';
  ceilingHeight: number;  // mm, default 2900 for false ceiling
  furniture: FurnitureItem[];
  electricalPoints: {
    switches: number;
    sockets: number;
    dataPoints: number;
    lightPoints: number;
    fanPoints: number;
    acPoints: number;
  };
  specialFeatures: string[];  // "accent wall", "wall niche", "mirror panel" etc.
}

export interface InteriorMoodBoard {
  style: InteriorStyle;
  styleName: string;
  description: string;
  palette: ColorPalette;
  keyMaterials: string[];
  keyFurniture: string[];
  imagePrompt: string;    // for AI render
}

export interface InteriorExecutionPhase {
  id: string;
  phase: string;
  description: string;
  trade: string;          // "Civil", "Carpenter", "Electrician", "Plumber", "Painter", "Tiling"
  durationDays: number;
  startDay: number;       // relative day from project start
  dependencies: string[]; // phase ids
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
