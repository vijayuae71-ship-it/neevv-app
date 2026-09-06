// Office drawing prompt templates for neevv Generation Pro architectural drawing engine
// Follows the pattern established in drawingPrompts.ts (residential), but for
// commercial/office fit-out and shell-and-core drawings.

import type { Layout, OfficeRequirements, FloorLayout } from '../types';

export type OfficeDrawingType =
  | 'floorPlan'
  | 'furniturePlan'
  | 'partitionPlan'
  | 'rcp'
  | 'electrical'
  | 'dataNetwork'
  | 'hvac'
  | 'fireSafety'
  | 'plumbing'
  | 'section'
  | 'elevation'
  | 'signage';

export interface OfficeDrawingTypeInfo {
  id: OfficeDrawingType;
  label: string;
  icon: string;
  description: string;
  category: 'Floor Plans' | 'Interior' | 'MEP' | 'Fire & Safety' | 'Elevations & 3D';
}

export const OFFICE_DRAWING_TYPES: OfficeDrawingTypeInfo[] = [
  { id: 'floorPlan', label: 'Floor Plan', icon: 'Layers', description: '2D plan with room layouts, doors, windows, and dimensions', category: 'Floor Plans' },
  { id: 'furniturePlan', label: 'Furniture Layout Plan', icon: 'Armchair', description: 'Workstation, cabin, and meeting room furniture arrangement', category: 'Interior' },
  { id: 'partitionPlan', label: 'Partition Plan', icon: 'Grid3x3', description: 'Glass and gypsum partition layout with door swings', category: 'Interior' },
  { id: 'rcp', label: 'Reflected Ceiling Plan (RCP)', icon: 'LayoutGrid', description: 'False ceiling grid, light fixtures, AC diffusers, sprinklers', category: 'Interior' },
  { id: 'electrical', label: 'Electrical Layout', icon: 'Zap', description: 'Power points, floor boxes, DB schedule, UPS circuits', category: 'MEP' },
  { id: 'dataNetwork', label: 'Data & Network Layout', icon: 'Network', description: 'CAT6A points, patch panels, cable tray routing', category: 'MEP' },
  { id: 'hvac', label: 'HVAC Layout', icon: 'Wind', description: 'VRV/VRF units, ductwork, diffusers, thermostat zoning', category: 'MEP' },
  { id: 'fireSafety', label: 'Fire Safety Layout', icon: 'ShieldAlert', description: 'Sprinklers, smoke detectors, exit signage, travel distances', category: 'Fire & Safety' },
  { id: 'plumbing', label: 'Plumbing Layout', icon: 'Droplets', description: 'Washroom, pantry water supply and drainage layout', category: 'MEP' },
  { id: 'section', label: 'Building Section', icon: 'SplitSquareVertical', description: 'Cross-section showing internal structure and ceiling heights', category: 'Elevations & 3D' },
  { id: 'elevation', label: 'Front Elevation', icon: 'Building', description: 'Front facade view showing glazing, cladding, and signage zone', category: 'Elevations & 3D' },
  { id: 'signage', label: 'Signage & Wayfinding Plan', icon: 'SignpostBig', description: 'Reception branding, wayfinding signage, room number plates', category: 'Interior' },
];

/* ========================================================================
 * Design seed — deterministic per-layout style variation
 * ===================================================================== */

export interface OfficeDesignSeed {
  palette: string;
  facade: string;
  ceilingStyle: string;
  flooringStyle: string;
  signageStyle: string;
  seedId: string;
}

const OFFICE_COLOR_PALETTES = [
  'Corporate Neutral: warm grey walls, navy accent panels, brushed aluminium trims, white ceiling',
  'Startup Vibrant: white walls, one bold accent wall (teal/orange), black metal frames, exposed concrete ceiling',
  'Biophilic Green: off-white walls, sage green accents, natural wood battens, living green wall feature',
  'Minimal Monochrome: light grey walls, charcoal accents, matte black hardware, white gypsum ceiling',
  'Coworking Eclectic: exposed brick accent, mixed wood tones, colourful modular furniture, industrial ceiling',
];

const OFFICE_FACADE_STYLES = [
  'Full-height curtain wall glazing with vertical aluminium mullions and a recessed entrance canopy',
  'Punched ribbon windows with precast concrete banding and a double-height glazed lobby',
  'Structural glazing with external sun-shading fins and branded signage band above entrance',
  'Combination facade: glazed ground floor storefront, perforated metal screen on upper floors',
];

const OFFICE_CEILING_STYLES = [
  'Exposed services ceiling with painted black ductwork and pendant fixtures (industrial look)',
  'Peripheral false ceiling (600mm band) with center exposed slab and track lighting',
  'Full false ceiling grid 600×600mm with 2×2 LED panels, uniform coverage',
  'Wood-slat false ceiling feature over reception/lounge, plain gypsum elsewhere',
];

const OFFICE_FLOORING_STYLES = [
  'Raised access flooring 100mm with carpet tiles 500×500mm in workstation zones, vitrified tiles in wet areas',
  'Polished concrete/epoxy flooring in open areas, engineered wood in cabins',
  'Carpet tiles throughout with vinyl plank in pantry/cafeteria',
  'Vitrified tiles 600×600mm in corridors, carpet tiles in cabins and conference rooms',
];

const OFFICE_SIGNAGE_STYLES = [
  'Backlit acrylic logo signage at reception, brushed metal room number plates',
  'Minimal cut-out letter signage, wayfinding with pictograms and floor directories',
  'Illuminated wayfinding totems at corridor junctions, branded wall graphics at reception',
  'Engraved wood-look signage plates with braille tags per accessibility norms',
];

export function getOfficeDesignSeed(layoutId: string): OfficeDesignSeed {
  // Derive a stable numeric seed from the layoutId string so the same
  // layout always produces the same design DNA across drawing calls.
  let hash = 0;
  for (let i = 0; i < layoutId.length; i++) {
    hash = (hash * 31 + layoutId.charCodeAt(i)) >>> 0;
  }

  return {
    palette: OFFICE_COLOR_PALETTES[hash % OFFICE_COLOR_PALETTES.length],
    facade: OFFICE_FACADE_STYLES[(hash + 1) % OFFICE_FACADE_STYLES.length],
    ceilingStyle: OFFICE_CEILING_STYLES[(hash + 2) % OFFICE_CEILING_STYLES.length],
    flooringStyle: OFFICE_FLOORING_STYLES[(hash + 3) % OFFICE_FLOORING_STYLES.length],
    signageStyle: OFFICE_SIGNAGE_STYLES[(hash + 4) % OFFICE_SIGNAGE_STYLES.length],
    seedId: hash.toString(36).toUpperCase(),
  };
}

/* ========================================================================
 * Base prompt: shared drafting standards + spelling glossary
 * ===================================================================== */

const OFFICE_BASE_PROMPT = `Generate a PROFESSIONAL commercial architectural/MEP drawing to the standard of a licensed architectural firm's CAD output, produced by neevv Generation Pro. This must look like a real construction document — NOT a sketch, NOT a diagram, NOT an illustration.

MANDATORY DRAFTING STANDARDS (IS 962:1989 / SP 46:2003):
• Line hierarchy: Walls 0.7mm (external) / 0.4mm (internal partitions), Dimensions 0.18mm, Hatching 0.13mm, Grid lines 0.09mm dashed
• All text HORIZONTAL (never rotated except on vertical dimension lines)
• Dimension chains with tick marks (not arrows) — every dimension in mm
• Grid lines: dashed lines extending beyond drawing with circle terminators containing alphanumeric labels
• Room labels: Name + Area centered at geometric centroid, minimum 300mm clear from any wall
• North arrow on every plan drawing (top-right corner)
• Scale notation: "Scale 1:100" with graphic scale bar
• Section marks: Circle with section letter, directional arrow showing cut direction
• Glass partitions: double parallel thin lines with "GLZ" hatch note
• Gypsum partitions: single medium line with "GYP 75mm" label
• Column: crosshatched filled rectangle with ID label above (C1) and size below (300×450mm)

TITLE BLOCK (bottom-right, 180mm × 40mm):
neevv Generation Pro | Architecture • Structure • MEP • Interiors
Project: [from requirements] | Drawing: [type] | Scale: 1:100 | Sheet: A3
NBC 2016 Compliant ✓ | IS 456:2000 ✓ | IS 15105 (Sprinklers) ✓

CRITICAL: Black and white only. No color fills. No gradients. No artistic rendering (except elevation/3D views). This is a CONSTRUCTION DOCUMENT.
CRITICAL SPELLING: Triple-check every word. You MUST use these EXACT spellings:
SCHEDULE (not Shedule), REINFORCEMENT (not Reinforement), WORKSTATION (not Workstasion),
CONFERENCE (not Conferance), CAFETERIA (not Cafeteria misspelled as Cafateria), RECEPTION (not Receiption),
ELECTRICAL (not Electrial), VENTILATION (not Ventiliation), SPRINKLER (not Sprinker),
ABBREVIATION (not Aberiviation), PARTITION, CORRIDOR, LOBBY, PANTRY, WASHROOM, SERVER, BOARDROOM,
STRUCTURAL, ARCHITECTURE, DISTRIBUTION, CIRCULATION.
If generating any table or text label, spell-check every word against this list.
`;

/* ========================================================================
 * Helpers to derive geometry / schedule text from the Layout object
 * ===================================================================== */

function getFloorLayout(layout: Layout, floorIndex: number): FloorLayout | undefined {
  return layout?.floors?.[floorIndex];
}

function formatRoomSchedule(floorLayout: FloorLayout | undefined): string {
  if (!floorLayout || !floorLayout.rooms || floorLayout.rooms.length === 0) {
    return 'Standard commercial rooms per program';
  }
  return floorLayout.rooms
    .map((room) => {
      const areaSqm = (room.width * room.depth).toFixed(1);
      return `${room.name} (${Math.round(room.width * 1000)}mm × ${Math.round(
        room.depth * 1000
      )}mm = ${areaSqm}m²) at (${room.x.toFixed(1)}, ${room.y.toFixed(1)})`;
    })
    .join('. ');
}

function getColumnScheduleText(floorLayout: FloorLayout | undefined): string {
  if (!floorLayout || !floorLayout.columns || floorLayout.columns.length === 0) {
    return 'Standard 6m × 6m column grid';
  }
  return floorLayout.columns
    .map((col, i) => `C${i + 1} at (${col.x.toFixed(1)}m, ${col.y.toFixed(1)}m)`)
    .join(', ');
}

function countRoomsOfType(floorLayout: FloorLayout | undefined, typePrefix: string): number {
  if (!floorLayout) return 0;
  return floorLayout.rooms.filter((r) => (r.type as string).startsWith(typePrefix)).length;
}

function countWorkstationSeats(floorLayout: FloorLayout | undefined): number {
  if (!floorLayout) return 0;
  const wsRoom = floorLayout.rooms.find((r) => (r.type as string) === 'workstation_open');
  if (!wsRoom) return 0;
  // Estimate seat count from area at ~4.5sqm/seat.
  const area = wsRoom.width * wsRoom.depth;
  return Math.max(1, Math.round(area / 4.5));
}

function buildingFootprintText(layout: Layout): { widthMM: number; depthMM: number } {
  const widthMM = layout.buildingWidthMm ?? Math.round((layout.buildableWidthM || 0) * 1000);
  const depthMM = layout.buildingDepthMm ?? Math.round((layout.buildableDepthM || 0) * 1000);
  return { widthMM, depthMM };
}

/* ========================================================================
 * Main prompt builder
 * ===================================================================== */

export function getOfficeDrawingPrompt(
  type: OfficeDrawingType,
  layout: Layout,
  officeReq: OfficeRequirements,
  floor: number = 0
): string {
  const floorLayout = getFloorLayout(layout, floor);
  const floorLabel = floorLayout?.floorLabel || `Floor ${floor + 1}`;
  const seed = getOfficeDesignSeed(layout.id);

  const { widthMM, depthMM } = buildingFootprintText(layout);
  const roomSchedule = formatRoomSchedule(floorLayout);
  const columnSchedule = getColumnScheduleText(floorLayout);

  const city = officeReq.city || 'India';
  const state = officeReq.state || 'India';
  const facing = officeReq.facing || 'East';
  const companyName = officeReq.companyName || 'Client Company';
  const employeeCount = officeReq.employeeCount || 0;
  const numFloors = officeReq.floors?.length || layout.floors?.length || 1;

  const seatCount = countWorkstationSeats(floorLayout);
  const cabinCount =
    countRoomsOfType(floorLayout, 'cabin_manager') +
    countRoomsOfType(floorLayout, 'cabin_director') +
    countRoomsOfType(floorLayout, 'cabin_md');
  const conferenceCount =
    countRoomsOfType(floorLayout, 'conference_small') +
    countRoomsOfType(floorLayout, 'conference_large') +
    countRoomsOfType(floorLayout, 'board_room');
  const washroomCount =
    countRoomsOfType(floorLayout, 'washroom_male') +
    countRoomsOfType(floorLayout, 'washroom_female') +
    countRoomsOfType(floorLayout, 'washroom_handicap');

  const projectContext = `
PROJECT: ${companyName} — ${officeReq.plotWidthFt}ft × ${officeReq.plotDepthFt}ft ${facing}-facing commercial office building (${numFloors} floor(s)), ${city}, ${state}. Layout Strategy: ${layout.name}.
DESIGN DNA (Seed: ${seed.seedId}): COLOR PALETTE — ${seed.palette}. FACADE — ${seed.facade}. CEILING — ${seed.ceilingStyle}. FLOORING — ${seed.flooringStyle}. SIGNAGE — ${seed.signageStyle}.
BUILDING FOOTPRINT (post-setback): ${widthMM}mm × ${depthMM}mm. Setbacks: Front ${layout.setbacks?.front ?? 3.0}m, Rear ${layout.setbacks?.rear ?? 3.0}m, Left ${layout.setbacks?.left ?? 1.5}m, Right ${layout.setbacks?.right ?? 1.5}m.
FLOOR: ${floorLabel} (Floor index ${floor}). Total employees (whole building): ${employeeCount}. This floor: ~${seatCount} workstation seats, ${cabinCount} cabins, ${conferenceCount} meeting/conference rooms, ${washroomCount} washrooms.
ROOM SCHEDULE (this floor): ${roomSchedule}
COLUMN GRID (6m × 6m structural grid): ${columnSchedule}
`;

  const dimensionRule = `
DIMENSION VERIFICATION (use ONLY these numbers — do not invent dimensions):
• BUILDING footprint this floor: ${widthMM}mm × ${depthMM}mm.
• Column size: 300mm × 450mm. Column grid spacing: 6000mm (6m) center-to-center — do not confuse column size with spacing.
• External wall: 230mm thick (double line). Internal partition (gypsum): 75mm (GYP 75mm). Glass partition: 12mm toughened glass in aluminium frame.
• Corridor minimum width: 1500mm (NBC commercial circulation requirement) — show corridors at this width or greater.
• Room dimensions per schedule above — verify sum of room widths + partition thickness = building footprint width; sum of room depths + partition thickness = building footprint depth.
`;

  const fireLegend = `
FIRE SAFETY REQUIREMENTS (NBC 2016 Part 4, IS 15105, IS 2054):
• Sprinkler heads (IS 15105) at 3m × 3m grid spacing, pendant type, shown as circle-in-square symbol.
• Smoke detectors at 1 per 80 sqm, ceiling-mounted, shown as circle with "SD" label.
• Fire exit signage (IS 2054) at every corridor junction and exit door, shown as rectangle with running-man pictogram and "EXIT" label, illuminated.
• Maximum travel distance to nearest exit: 30m — verify corridor layout satisfies this and annotate travel-distance dimension lines from the farthest workstation to the nearest exit.
• Fire hose reel cabinets at staircase/lobby, hydrant riser shown schematically.
• Fire-rated door (FD-60) at server room and electrical room, labeled "FD-60".
`;

  const hvacLegend = `
HVAC SYSTEM (VRV/VRF):
• Outdoor VRV/VRF condenser units on terrace/service yard (shown in schematic callout), indoor cassette/ducted units per zone.
• Ceiling-mounted 4-way cassette units (600×600mm) in open workstation areas, ducted split/hi-wall units in cabins and conference rooms.
• FAHU (Fresh Air Handling Unit) at core/service area supplying treated fresh air via ductwork to diffusers.
• Supply air diffusers (square, 4-way throw) and return air grilles shown on RCP/HVAC plan, ductwork routed above false ceiling.
• Thermostat zoning: separate zone per cabin/conference room, shared zone for open workstation areas — show zone boundaries as dashed lines with zone labels (Z1, Z2, Z3...).
`;

  const electricalLegend = `
ELECTRICAL LAYOUT:
• Two circuit types clearly distinguished: REGULAR power (normal DB) vs UPS power (critical loads — servers, key workstations), shown with different line styles and labeled "REG" / "UPS".
• Floor boxes for workstation power+data clusters, shown as square symbol with "FB" label, one per 4-6 seats.
• Distribution Board (DB) schedule table: DB ID, Location, Incoming Load (kW), No. of Ways, MCB Rating (each way), Connected Load.
• MCB ratings: Lighting circuits 6A/10A, Socket circuits 16A/20A, AC circuits 20A/32A, UPS circuits 16A dedicated.
• Earthing point near each DB, shown as triangle symbol.
`;

  const dataLegend = `
DATA & NETWORK LAYOUT:
• CAT6A data points at every workstation cluster and cabin, shown as rectangle with "D" label, minimum 2 points per workstation pair.
• Patch panel and network rack located in Server Room, shown as rectangle labeled "RACK".
• Cable trays routed above false ceiling along corridors, shown as parallel hatched lines labeled "CABLE TRAY 150mm/300mm".
• Wi-Fi access points ceiling-mounted at approx. 1 per 150 sqm, shown as circle with "AP" label.
`;

  const rcpLegend = `
REFLECTED CEILING PLAN (RCP) REQUIREMENTS:
• False ceiling grid: 600mm × 600mm modular grid shown as thin dashed lines across the full ceiling.
• 2×2 LED panel lights (600×600mm) placed on the grid at regular intervals per room, shown as filled square with cross pattern.
• AC cassette units (600×600mm, 4-way) shown as square with diagonal cross and airflow arrows.
• Sprinkler heads shown per Fire Safety legend, coordinated to avoid clash with light fixtures and diffusers.
• Access panels (600×600mm) near AHU/duct valves and above electrical junction boxes, shown as square with "AP" hatch and "ACCESS PANEL" label.
• Ceiling height annotated: false ceiling at 2750mm AFFL (Above Finished Floor Level), exposed slab zones (if any) noted separately.
`;

  const plumbingLegend = `
PLUMBING LAYOUT:
• Water supply lines (solid line) and drainage lines (dashed line) to all washrooms and pantry.
• Fixtures: WC, urinal, wash basin (washrooms); sink, RO unit point (pantry).
• Floor traps at each washroom and pantry, shown as circle symbol.
• Soil/vent stack shown vertically aligned across floors, sized and labeled.
• Water meter and inlet connection point at service entry.
`;

  const signageLegend = `
SIGNAGE & WAYFINDING:
• Reception branding wall with backlit/illuminated company logo signage — location marked and dimensioned.
• Wayfinding directional signage at every corridor junction and near lift lobby/staircase, shown as arrow-pictogram symbol with destination labels.
• Room number/name plates at every cabin, conference room, and washroom door, shown as small rectangle "NP" label.
• Accessibility signage (braille tags, wheelchair pictogram) at accessible washroom and main entrance.
• Fire exit signage cross-referenced with Fire Safety Layout — do not duplicate design, only wayfinding-branding elements shown here.
`;

  const prompts: Record<OfficeDrawingType, string> = {
    floorPlan: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}
2D Floor Plan of ${floorLabel} for a commercial office building. Building footprint: ${widthMM}mm × ${depthMM}mm. Show external walls (230mm double line) and internal gypsum partitions (75mm) per Room Schedule above. Show workstation zone as an open area (no internal partitions), cabins as enclosed rooms with glazed/gypsum walls, conference rooms, reception, pantry, washrooms, server room, electrical room, and AHU room clearly labeled with name + area at centroid. Doors: solid leaf line + 90° arc swing. Corridors minimum 1500mm wide, clearly delineated. Dimension chains along top and left edges with tick marks, overall ${widthMM}mm × ${depthMM}mm. Column grid circles at 6m spacing matching Column Grid above. North arrow top-right. NO furniture, NO colored fills — clean architectural drafting style, black and white only.`,

    furniturePlan: `${OFFICE_BASE_PROMPT}${projectContext}
CROSS-DRAWING REFERENCE: Room layout MUST match the Floor Plan exactly — same walls, same room boundaries.
Furniture Layout Plan for ${floorLabel}. Show room outlines (thin line, de-emphasized) with furniture placed inside: workstation clusters (bench-desk pods of 4-6 seats with task chairs) filling the open workstation zone (~${seatCount} seats total), executive desk + visitor chairs + credenza in each cabin, conference table with chairs sized to room (small conference: 6-8 seats; large conference/board room: 12-16 seats), reception desk + waiting lounge seating, pantry counter with high stools, break-room seating clusters. All furniture drawn to true scale in plan (top-view symbols). Furniture schedule table: Item, Dimensions (mm), Quantity, Location.`,

    partitionPlan: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}
CROSS-DRAWING REFERENCE: Partition positions MUST align with room boundaries in Floor Plan.
Partition Layout Plan for ${floorLabel}. Distinguish partition types clearly: GLASS partitions (double thin parallel lines, "GLZ 12mm toughened" label) around conference rooms and cabins facing corridors for visual openness; GYPSUM partitions (single medium line, "GYP 75mm" label) around washrooms, server room, and electrical room for acoustic/privacy needs. Show door swings (90° arc) at every partition opening. Partition schedule table: Type, Location, Length (m), Height (mm — full height 3000mm or partial height 1200mm for low screens).`,

    rcp: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}${rcpLegend}
Reflected Ceiling Plan (RCP) for ${floorLabel}. Show the 600×600mm ceiling grid across the full floor plate, with 2×2 LED panel lights positioned per the RCP requirements above, AC cassette units in open and cabin zones, sprinkler heads on a coordinated 3m×3m offset grid (avoiding clashes with lights/diffusers), and access panels near AHU/electrical zones. Annotate false ceiling height 2750mm AFFL. Legend table listing all ceiling-mounted elements with symbol, description, and quantity.`,

    electrical: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}${electricalLegend}
Electrical Layout Plan for ${floorLabel}. Show room outlines per Floor Plan. Overlay REGULAR and UPS power circuits per the legend above, floor boxes at workstation clusters, switch/socket points in cabins and amenity rooms, DB location near core/lift lobby. Provide the DB Schedule table (DB ID, Location, Incoming Load kW, No. of Ways, MCB Rating per way, Connected Load) and a Load Calculation table by room (Room Name, Lighting Points, Socket Points, AC Points, Connected Load W). Legend table listing every electrical symbol used with description and abbreviation.`,

    dataNetwork: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}${dataLegend}
Data & Network Layout Plan for ${floorLabel}. Show CAT6A data points at every workstation cluster (minimum 2 per pair of seats) and in each cabin/conference room, patch panel and network rack in the Server Room, cable tray routing along corridor ceilings connecting all zones back to the Server Room, and Wi-Fi access points at ceiling level per the legend density (~1 per 150 sqm). Data point schedule table: Location, No. of CAT6A Points, Cable Tray Size, Distance to Rack (m).`,

    hvac: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}${hvacLegend}
HVAC Layout Plan for ${floorLabel}. Show VRV/VRF indoor units per room type per the legend above (cassette units in open workstation zone, ducted/hi-wall units in cabins and conference rooms), FAHU location and fresh-air ductwork routing to diffusers, supply/return grilles on the ceiling plan, and thermostat zone boundaries (Z1, Z2, Z3...) as dashed lines with labels. Include an equipment schedule table: Unit ID, Type, Capacity (Tons), Zone Served, Location.`,

    fireSafety: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}${fireLegend}
Fire Safety Layout Plan for ${floorLabel}. Show sprinkler heads on a 3m×3m grid throughout, smoke detectors per the density in the legend, fire exit signage at every corridor junction and exit door with travel-distance dimension lines verifying maximum 30m travel to nearest exit from the farthest workstation, fire hose reel cabinet locations, and fire-rated doors (FD-60) at Server Room and Electrical Room. Provide a Fire Safety Equipment Schedule table: Item, Symbol, Quantity, Location, Applicable Standard (NBC Part 4 / IS 15105 / IS 2054).`,

    plumbing: `${OFFICE_BASE_PROMPT}${projectContext}${dimensionRule}${plumbingLegend}
Plumbing Layout Plan for ${floorLabel}. Show room outlines per Floor Plan with water supply (solid) and drainage (dashed) lines to all washrooms and the pantry, fixture locations (WC, urinal, wash basin, sink), floor traps, and vertical soil/vent stack position (vertically aligned across floors — reference the same stack position on every floor's plumbing plan). Pipe sizes annotated in mm.`,

    section: `${OFFICE_BASE_PROMPT}${projectContext}
CROSS-DRAWING REFERENCE: Room widths and ceiling heights in section MUST match Floor Plan and RCP dimensions.
Building Section through ${companyName}'s ${numFloors}-floor office building. Section cut across building width ${widthMM}mm. Show floor-to-floor height 4000mm (typical commercial), false ceiling void with services (ducts, cable trays, sprinkler pipework) between structural slab and 2750mm AFFL false ceiling line, raised access floor (if applicable) 100mm, and structural grid/columns at 6m spacing per Column Grid above. Show ground floor lobby double-height (if applicable), and terrace with VRV condenser units and OHT. Concrete hatching on structural elements. Level markers at each floor (GL ±0.000, Floor 1 +4.000, Floor 2 +8.000...). Overall building height dimensioned on the right.`,

    elevation: `${OFFICE_BASE_PROMPT}${projectContext}
CROSS-DRAWING REFERENCE: Facade openings must correspond to the floor plan's external wall openings.
Front Elevation of ${companyName}'s ${numFloors}-floor office building, ${facing}-facing. DESIGN DNA APPLICATION: Use FACADE — ${seed.facade}. Use COLOR PALETTE — ${seed.palette}. Show building width ${widthMM}mm, floor-to-floor height 4000mm per floor, main entrance canopy with signage band showing "${companyName}" branding, glazing/cladding pattern per the facade description, and a designated illuminated signage zone above the entrance. Level markings on the left (GL ±0.000, Floor 1 +4.000, Floor 2 +8.000...). Overall height and width dimensioned.`,

    signage: `${OFFICE_BASE_PROMPT}${projectContext}${signageLegend}
Signage & Wayfinding Plan for ${floorLabel}. Show room outlines per Floor Plan (de-emphasized) with signage element locations overlaid: reception branding wall signage (dimensioned and positioned), directional wayfinding signage at every corridor junction and near lift lobby/staircase, room number/name plates at every cabin, conference room, and washroom door, and accessibility signage at the accessible washroom and main entrance. Signage schedule table: Item, Type, Location, Size (mm), Mounting Height (mm AFFL).`,
  };

  return prompts[type] || `${OFFICE_BASE_PROMPT}${projectContext}Commercial architectural drawing for ${type}.`;
}
