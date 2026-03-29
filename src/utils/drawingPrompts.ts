// Drawing prompt templates for neevv Generation Pro architectural drawing engine

export type DrawingType =
  | 'ground_floor'
  | 'first_floor'
  | 'front_elevation'
  | 'side_elevation'
  | 'section_aa'
  | 'excavation'
  | 'column_layout'
  | 'column_detail'
  | 'footing_detail'
  | 'beam_slab'
  | 'bar_bending'
  | 'electrical'
  | 'plumbing'
  | '3d_exterior';

export interface DrawingTypeInfo {
  id: DrawingType;
  label: string;
  icon: string;
  description: string;
  category: 'Floor Plans' | 'Elevations & 3D' | 'Structural' | 'MEP';
}

export const DRAWING_TYPES: DrawingTypeInfo[] = [
  // Floor Plans
  { id: 'ground_floor', label: 'Ground Floor Plan', icon: 'Layers', description: '2D plan with room layouts, doors, windows, and dimensions', category: 'Floor Plans' },
  { id: 'first_floor', label: 'First Floor Plan', icon: 'Layers', description: '2D plan with first floor room layouts and dimensions', category: 'Floor Plans' },
  // Elevations & 3D
  { id: 'front_elevation', label: 'Front Elevation', icon: 'Building', description: 'Front view showing facade, windows, doors, and heights', category: 'Elevations & 3D' },
  { id: 'side_elevation', label: 'Side Elevation', icon: 'Building', description: 'Side view showing building depth and profile', category: 'Elevations & 3D' },
  { id: '3d_exterior', label: '3D Exterior View', icon: 'Box', description: 'Photorealistic 3D perspective rendering', category: 'Elevations & 3D' },
  { id: 'section_aa', label: 'Section A-A', icon: 'SplitSquareVertical', description: 'Cross-section showing internal structure and heights', category: 'Elevations & 3D' },
  // Structural
  { id: 'excavation', label: 'Excavation Plan', icon: 'Shovel', description: 'Excavation pit positions and volumes', category: 'Structural' },
  { id: 'column_layout', label: 'Column Layout', icon: 'Grid3x3', description: 'Column grid positions with dimensions', category: 'Structural' },
  { id: 'column_detail', label: 'Column Detail', icon: 'Columns3', description: 'Reinforcement detail of RCC column section', category: 'Structural' },
  { id: 'footing_detail', label: 'Footing Detail', icon: 'Landmark', description: 'Isolated footing plan and section with reinforcement', category: 'Structural' },
  { id: 'beam_slab', label: 'Beam & Slab Detail', icon: 'RectangleHorizontal', description: 'RCC beam-slab junction and reinforcement details', category: 'Structural' },
  { id: 'bar_bending', label: 'Bar Bending Schedule', icon: 'BarChart3', description: 'Complete BBS table with steel quantities', category: 'Structural' },
  // MEP
  { id: 'electrical', label: 'Electrical Layout', icon: 'Zap', description: 'Light points, switches, sockets, and circuit routing', category: 'MEP' },
  { id: 'plumbing', label: 'Plumbing Layout', icon: 'Droplets', description: 'Water supply, drainage, and fixture locations', category: 'MEP' },
];

const BASE_PROMPT = 'Generate a professional architectural drawing. Black and white, clean lines, proper architectural conventions. Scale 1:100. Title block at bottom with: neevv | Architecture • Structure • MEP • Interiors. NBC 2016 Compliant badge. ';

function formatRoomList(rooms: any[]): string {
  if (!rooms || rooms.length === 0) return 'Standard residential rooms';
  return rooms.map((room: any) => {
    const width = room.width || room.w || 0;
    const depth = room.depth || room.d || room.height || 0;
    const area = (width * depth).toFixed(1);
    const x = room.x || 0;
    const y = room.y || 0;
    return `${room.name || room.type || 'Room'} (${width}m × ${depth}m = ${area}m²) at position (${x}, ${y})`;
  }).join('. ');
}

function getColumnPositions(layout: any): string {
  if (!layout?.columns || layout.columns.length === 0) return 'Standard column grid';
  return layout.columns.map((col: any, i: number) => {
    return `C${i + 1} at (${col.x || col.gridX || 0}, ${col.y || col.gridY || 0})`;
  }).join(', ');
}

function getPlotDimensions(layout: any): { plotW: number; plotD: number } {
  const plotW = layout?.plot?.width || layout?.plotWidth || layout?.dimensions?.width || 30;
  const plotD = layout?.plot?.depth || layout?.plotDepth || layout?.dimensions?.depth || 40;
  return { plotW, plotD };
}

function getFloorRooms(layout: any, floorIndex: number): any[] {
  if (layout?.floors && layout.floors[floorIndex]) {
    return layout.floors[floorIndex].rooms || [];
  }
  if (floorIndex === 0 && layout?.groundFloor?.rooms) {
    return layout.groundFloor.rooms;
  }
  if (floorIndex === 1 && layout?.firstFloor?.rooms) {
    return layout.firstFloor.rooms;
  }
  return [];
}

export function buildDrawingPrompt(drawingType: DrawingType, layout: any, requirements: any): string {
  const { plotW, plotD } = getPlotDimensions(layout);
  const groundFloorRooms = getFloorRooms(layout, 0);
  const firstFloorRooms = getFloorRooms(layout, 1);
  const columnPositions = getColumnPositions(layout);
  const totalSteel = layout?.steel?.total || requirements?.steelEstimate || '2.8';
  const electricalLoad = layout?.electrical?.totalLoad || requirements?.electricalLoad || '5.5';
  const balconyPosition = layout?.balcony?.position || 'west side';

  const prompts: Record<DrawingType, string> = {
    ground_floor: `${BASE_PROMPT}2D Ground Floor Plan of a ${plotW}ft x ${plotD}ft residential building. Plot boundary: thick outer walls (230mm). Internal partitions: thin lines (115mm). Show: ${formatRoomList(groundFloorRooms)}. Doors: solid leaf line + 90° arc swing. Windows: double parallel lines breaking walls on exterior walls. Staircase: parallel tread lines with UP arrow. Labels: room name + dimensions + area centered in each room. Dimensions: chain dimensions on top and left edges with tick marks. North arrow top-right. Grid circles at column positions. NO furniture. NO colored fills - all rooms white. Clean architectural drafting style.`,

    first_floor: `${BASE_PROMPT}2D First Floor Plan of a ${plotW}ft x ${plotD}ft residential building. Plot boundary: thick outer walls (230mm). Internal partitions: thin lines (115mm). Show: ${formatRoomList(firstFloorRooms)}. Doors: solid leaf line + 90° arc swing. Windows: double parallel lines breaking walls on exterior walls. Staircase: parallel tread lines with DOWN arrow. Labels: room name + dimensions + area centered in each room. Dimensions: chain dimensions on top and left edges with tick marks. North arrow top-right. Grid circles at column positions. NO furniture. NO colored fills - all rooms white. Clean architectural drafting style.`,

    front_elevation: `${BASE_PROMPT}Front Elevation of a G+1 residential building. ${plotW}ft wide. Contemporary Modern style (Dubai-Bangalore Hybrid). Ground floor height 3.0m, First floor 3.0m, parapet 0.9m. Show: main entrance door (east-facing), windows with frames, balcony at first floor (${balconyPosition}), texture: white stone facade, wood louvers, glass railings. Plinth level +450mm. Floor level markings on left. Dimension heights on right.`,

    side_elevation: `${BASE_PROMPT}Side Elevation of a G+1 residential building. ${plotD}ft deep. Contemporary Modern style (Dubai-Bangalore Hybrid). Ground floor height 3.0m, First floor 3.0m, parapet 0.9m. Show: side windows with frames, building depth profile, staircase window, texture: white stone facade, wood louvers. Plinth level +450mm. Floor level markings on left. Dimension heights on right. Roof drainage slope visible.`,

    section_aa: `${BASE_PROMPT}Building Section A-A through a G+1 residential building. Show: foundation (isolated footing 1200x1200x1500mm deep), plinth beam at +450mm, ground floor rooms with 3.0m clear height, 150mm RCC slab, first floor rooms with 3.0m clear height, roof slab, parapet 900mm. Concrete hatching on structural elements. Level markers: GL ±0.000, Plinth +0.450, GF Slab +3.150, FF Slab +6.300, Parapet +7.200. Staircase visible in section. Earth hatching below ground.`,

    excavation: `${BASE_PROMPT}Excavation Plan for ${plotW}ft x ${plotD}ft plot. Show plot boundary, column positions marked with crosses at: ${columnPositions}. Each excavation pit: 1200mm x 1200mm x 1500mm deep. Dimensions between column centers. Earth hatching around pits. Table showing: Pit ID, Size, Depth, Volume.`,

    column_layout: `${BASE_PROMPT}Column Layout Plan for ${plotW}ft x ${plotD}ft residential building. Grid lines A-E (horizontal) and 1-4 (vertical). Column positions at: ${columnPositions}. Each column: 230mm x 300mm shown as filled rectangles. Grid circles at edges with labels. Dimensions between all grid lines. Column schedule table: Column ID, Size, Grid Position.`,

    column_detail: `${BASE_PROMPT}Reinforcement Detail of a 230mm x 300mm RCC Column. Show: Cross-section with 4 nos 12mm dia main bars at corners + 2 nos 12mm dia extra on long face = 6 nos total. 8mm stirrups at 150mm c/c (closer at 100mm near joints). Side view showing lap length = 40d = 480mm. Clear cover: 40mm. Concrete grade: M20, Steel: Fe500D. Dimensions annotated. Bar bending detail for one stirrup.`,

    footing_detail: `${BASE_PROMPT}Isolated Footing Detail Drawing. Plan view: 1200mm x 1200mm footing with 230mm x 300mm column at center. Section view: 1500mm deep, 300mm footing thickness, pedestal 300mm. Reinforcement: 10mm bars at 150mm c/c both ways in footing. Concrete hatching. PCC bed 150mm thick below footing. Dimensions fully annotated. M20 concrete, Fe500D steel.`,

    beam_slab: `${BASE_PROMPT}RCC Beam and Slab Detail. Typical beam section: 230mm wide x 400mm deep. Top steel: 2-12mm, Bottom steel: 3-16mm, Stirrups: 8mm@150mm c/c. Slab: 150mm thick, 8mm bars @150mm c/c both ways. Show beam-slab junction detail. Development length at supports. Slab reinforcement plan showing main and distribution bars.`,

    bar_bending: `${BASE_PROMPT}Bar Bending Schedule table for G+1 residential building. Columns: Member, Bar Mark, Dia(mm), Shape Code, No of Bars, Cutting Length(m), Total Length(m), Unit Weight(kg/m), Total Weight(kg). Include: Footings (F1-F16), Columns (C1-C16), Plinth Beams, Ground Floor Beams, GF Slab, FF Beams, FF Slab, Staircase. Shape code diagrams: 00=straight, 21=cranked, 38=rectangular stirrup, 51=L-bend. Summary: Total Steel = ${totalSteel} Tons Fe500D. With 3% Buffer = ${(parseFloat(totalSteel) * 1.03).toFixed(2)} Tons.`,

    electrical: `${BASE_PROMPT}Electrical Layout Plan for Ground Floor of ${plotW}ft x ${plotD}ft house.

ROOM LAYOUT: Show all room outlines with thick external walls and thin internal partitions. Label each room clearly at center.

ELECTRICAL SYMBOLS ON PLAN - use these EXACT symbols consistently:
- Light Point: Circle with X inside, label "L" next to it
- Fan Point: Circle with "F" inside
- Switch Board: Small rectangle with "SB" label
- Power Socket: Rectangle with "S" label  
- AC Point: Rectangle with "AC" label
- Exhaust Fan: Circle with "EF" label

Place symbols in correct positions within each room. Show circuit routing with dashed lines from DB to each room.

DB (Distribution Board) location near main entrance. Earthing point symbol near DB.

MANDATORY LEGEND TABLE (bottom-left):
Create a clear bordered table titled "LEGEND" with 3 columns: SYMBOL | DESCRIPTION | ABBREVIATION
Row 1: Circle with X | Light Point | L
Row 2: Circle with F | Ceiling Fan Point | F  
Row 3: Rectangle with SB | Switch Board | SB
Row 4: Rectangle with S | Power Socket (5A/15A) | S
Row 5: Rectangle with AC | AC Point (20A) | AC
Row 6: Circle with EF | Exhaust Fan | EF
Row 7: Dashed line | Circuit Wiring | --
Row 8: Rectangle with DB | Distribution Board | DB
Row 9: Triangle | Earthing Point | E

LOAD CALCULATION TABLE (bottom-center):
Columns: Room Name | Lights | Fans | Sockets | AC | Power Socket | Load (W)
Row: Living Room | 3 | 1 | 3 | 0 | 0 | 900
Row: Dining Room | 2 | 1 | 2 | 0 | 0 | 600
Row: Kitchen | 2 | 1 | 2 | 0 | 1 | 1100
Row: Guest Bedroom | 2 | 1 | 2 | 1 | 0 | 1500
Row: Car Parking | 1 | 0 | 1 | 0 | 0 | 200
Row: Staircase | 1 | 0 | 1 | 0 | 0 | 200
TOTAL CONNECTED LOAD: ${electricalLoad} kW

Ensure ALL spelling is correct - no typos. Double-check: "Electrical", "Socket", "Distribution", "Earthing", "Ceiling", "Exhaust".
NBC 2016 Compliant badge and neevv Architecture • Structure • MEP • Interiors branding at bottom-right.`,

    plumbing: `${BASE_PROMPT}Plumbing Layout Plan for Ground Floor. Show room outlines with: water supply lines (solid blue), drainage lines (dashed green), floor traps (circle), fixtures: WC, wash basin, kitchen sink, washing machine point. Inlet from municipal supply. Overhead tank connection. Soil pipe stack location. Vent pipe. STP connection. Plumbing Stack A1: Kitchen (GF) to Master Toilet (FF) vertically aligned. Pipe sizes annotated.`,

    '3d_exterior': `${BASE_PROMPT}3D Perspective Rendering of a G+1 residential house, Contemporary Modern style (Dubai-Bangalore Hybrid aesthetic). White stone facade, wood louvers on windows, glass balcony railings, flat roof with hidden parapet. Main entrance on east side with canopy. First floor balcony on west. Warm LED strip lighting at parapet. Landscaping with minimal garden. Car parking visible at ground floor NW corner. Photorealistic render, golden hour lighting, slight upward camera angle.`,
  };

  return prompts[drawingType] || `${BASE_PROMPT}Architectural drawing for ${drawingType}.`;
}
