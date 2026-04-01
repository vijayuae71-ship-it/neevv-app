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
  | '3d_exterior'
  | 'staircase_detail'
  | 'water_tank'
  | 'waterproofing'
  | 'stp_detail'
  | 'tiling_layout'
  | 'brickwork_detail';

export interface DrawingTypeInfo {
  id: DrawingType;
  label: string;
  icon: string;
  description: string;
  category: 'Floor Plans' | 'Elevations & 3D' | 'Structural' | 'MEP';
}

interface DesignSeed {
  palette: string;
  facade: string;
  windows: string;
  landscape: string;
  roof: string;
  seedId: string;
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
  // Working Drawing Details
  { id: 'staircase_detail', label: 'Staircase Detail', icon: 'Layers', description: 'Staircase plan, section, riser/tread detail with reinforcement', category: 'Structural' },
  { id: 'water_tank', label: 'Water Tank Detail', icon: 'Droplets', description: 'Overhead and underground water tank design with reinforcement', category: 'Structural' },
  { id: 'waterproofing', label: 'Waterproofing Detail', icon: 'Layers', description: 'Waterproofing layers for bathroom, terrace, and basement', category: 'Structural' },
  { id: 'stp_detail', label: 'STP Detail', icon: 'Droplets', description: 'Sewage treatment plant layout and section', category: 'MEP' },
  { id: 'tiling_layout', label: 'Tiling Layout', icon: 'Grid3x3', description: 'Floor and wall tiling pattern with cutting plan', category: 'Structural' },
  { id: 'brickwork_detail', label: 'Brickwork Detail', icon: 'Landmark', description: 'Brick masonry bonding pattern and wall section', category: 'Structural' },
];

const BASE_PROMPT = `Generate a PROFESSIONAL architectural/engineering drawing to the standard of a licensed architectural firm's CAD output. This must look like a real construction document — NOT a sketch, NOT a diagram, NOT an illustration.

MANDATORY DRAFTING STANDARDS (IS 962:1989 / SP 46:2003):
• Line hierarchy: Walls 0.7mm (external) / 0.4mm (internal), Dimensions 0.18mm, Hatching 0.13mm, Grid lines 0.09mm dashed
• All text HORIZONTAL (never rotated except on vertical dimension lines)
• Dimension chains with tick marks (not arrows) — every dimension in mm
• Grid lines: dashed lines extending beyond drawing with circle terminators containing alphanumeric labels
• Room labels: Name + Area centered at geometric centroid, minimum 300mm clear from any wall
• North arrow on every plan drawing (top-right corner)
• Scale notation: "Scale 1:100" with graphic scale bar
• Section marks: Circle with section letter, directional arrow showing cut direction
• All hatching at 45° for concrete, earth fill pattern for ground, brick pattern for masonry
• Door: solid leaf line pivoting from hinge point + 90° quarter-circle arc
• Window: double parallel lines breaking through wall line + center mullion line
• Column: crosshatched filled rectangle with ID label above (C1) and size below (230×300mm)

TITLE BLOCK (bottom-right, 180mm × 40mm):
neevv | Architecture • Structure • MEP • Interiors
Project: [from requirements] | Drawing: [type] | Scale: 1:100 | Sheet: A3
NBC 2016 Compliant ✓ | IS 456:2000 ✓

CRITICAL: Black and white only. No color fills. No gradients. No artistic rendering (except 3D views). This is a CONSTRUCTION DOCUMENT.
CRITICAL SPELLING: Triple-check every word. Common correct spellings: Reinforcement, Electrical, Plumbing, Foundation, Staircase, Waterproofing, Excavation, Structural, Elevation, Building, Schedule, Residential, Distribution, Drainage, Treatment, Ceiling, Exhaust, Kitchen, Bathroom, Bedroom, Dining, Living.
`;

function generateDesignSeed(): DesignSeed {
  const timestamp = Date.now();
  const random = Math.random();
  // Use timestamp + random to pick from design variation pools
  const seed = (timestamp % 10000) + Math.floor(random * 10000);

  // 5 variation pools — each picked by seed modulo
  const colorPalettes = [
    'Warm Earth: cream walls, terracotta accents, wooden brown frames, burnt sienna highlights',
    'Cool Coastal: off-white walls, sea-grey stone cladding, teak window frames, slate blue accents',
    'Nordic Minimal: pure white walls, charcoal trim, natural oak wood, matte black metal accents',
    'Desert Sand: sandstone beige walls, dark brown wood, brass metal accents, ivory trim',
    'Forest Green: sage green accent wall, white primary, dark walnut wood, copper metal details',
    'Urban Grey: light grey walls, anthracite frames, brushed steel accents, white concrete texture',
    'Tropical Warm: mango yellow accent, white walls, rosewood frames, terracotta roof tiles',
    'Mediterranean: ivory stucco walls, cobalt blue accents, wrought iron details, clay tile roof',
  ];

  const facadeCompositions = [
    'Asymmetric: larger window grouping on left, cantilevered box element on right, recessed entrance',
    'Symmetric Classical: centered entrance with flanking windows, balanced facade, crown moulding at parapet',
    'Stacked Volumes: ground floor recessed, first floor projected creating covered porch, vertical emphasis',
    'Horizontal Bands: continuous window bands with solid spandrel panels between floors, floating slab look',
    'Mixed Texture: lower half stone/brick cladding, upper half smooth plaster, material transition at sill level',
    'Double Height Feature: one double-height glazed element (staircase/living), rest standard openings',
    'Courtyard Reveal: recessed central bay creating shadow play, side wings project forward',
    'Stepped Terrace: first floor set back on one side creating terrace garden, dynamic silhouette',
  ];

  const windowPatterns = [
    'Large fixed panes with slim operable side lights, minimal mullions',
    'Traditional proportioned windows with visible frames, operable casements',
    'Floor-to-ceiling sliding doors at living, punched square windows elsewhere',
    'Ribbon windows (horizontal strip) at kitchen/bath, tall windows at living/bed',
    'Arched top windows at ground floor, rectangular at first floor',
    'Corner windows at living room, standard elsewhere, frosted at bathrooms',
    'Juliet balcony french doors at bedrooms, triple pane at living, clerestory at staircase',
    'Deep-set recessed windows with 300mm reveal creating shadow lines',
  ];

  const landscapeStyles = [
    'Japanese minimal: gravel path, single feature tree, stepping stones, bamboo screening',
    'Tropical lush: palm trees, flowering shrubs, paved driveway with grass pavers, compound wall with creeper',
    'Formal garden: symmetrical planting, low box hedges, paved walkway, gate with pillars',
    'Xeriscaping: succulents, decorative pebbles, minimal water use, native grasses',
    'Kitchen garden: herb planters at entrance, fruit tree, vegetable raised beds on side',
    'Contemporary: ornamental grasses, cor-ten steel planters, polished concrete pathway',
    'Courtyard focus: internal open-to-sky space, potted plants, water feature, stone flooring',
    'Canopy garden: large shade tree at entrance, flowering ground cover, natural stone path',
  ];

  const roofVariations = [
    'Flat roof with concealed parapet, clean horizontal skyline, parapet coping detail',
    'Mono-pitch sloped roof (5°) with visible edge, modern asymmetric look',
    'Combination: flat main roof with pitched element over staircase/entrance canopy',
    'Butterfly roof (inverted V) at one bay, flat elsewhere, rainwater channel at valley',
    'Flat roof with pergola structure over terrace area, partial shade design',
    'Hip roof with modern proportions, low pitch 15°, wide fascia board',
    'Flat roof with raised planter parapet, green roof potential on one bay',
    'Shed roof (single slope rear-to-front) with clerestory window at high end',
  ];

  return {
    palette: colorPalettes[seed % colorPalettes.length],
    facade: facadeCompositions[(seed + 3) % facadeCompositions.length],
    windows: windowPatterns[(seed + 7) % windowPatterns.length],
    landscape: landscapeStyles[(seed + 11) % landscapeStyles.length],
    roof: roofVariations[(seed + 13) % roofVariations.length],
    seedId: seed.toString(36).toUpperCase(),
  };
}

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

// Derive architectural consistency brief from layout data
function buildArchitecturalBrief(layout: any, requirements: any): string {
  const { plotW, plotD } = getPlotDimensions(layout);
  const facing = requirements?.facing || 'East';
  const floors = layout?.floors || [];

  // Determine which rooms touch each external wall
  const wallRooms: Record<string, string[]> = { front: [], rear: [], left: [], right: [] };
  const wetAreas: string[] = [];
  let staircasePos = '';

  for (let fi = 0; fi < floors.length; fi++) {
    const floorLabel = fi === 0 ? 'GF' : fi === 1 ? 'FF' : `${fi}F`;
    const rooms = floors[fi]?.rooms || [];
    const buildW = layout?.buildableWidthM || plotW * 0.3048;
    const buildD = layout?.buildableDepthM || plotD * 0.3048;

    for (const room of rooms) {
      const rx = room.x || 0;
      const ry = room.y || 0;
      const rw = room.width || 0;
      const rd = room.depth || 0;
      const rName = `${room.name || room.type} (${floorLabel})`;

      // Check which external walls this room touches
      if (ry <= 0.5) wallRooms.front.push(rName);
      if (ry + rd >= buildD - 0.5) wallRooms.rear.push(rName);
      if (rx <= 0.5) wallRooms.left.push(rName);
      if (rx + rw >= buildW - 0.5) wallRooms.right.push(rName);

      // Track wet areas for plumbing stacks
      const rType = (room.type || room.name || '').toLowerCase();
      if (['kitchen', 'bathroom', 'toilet', 'wc', 'utility', 'wash'].some(t => rType.includes(t))) {
        wetAreas.push(`${rName} at (${rx.toFixed(1)}, ${ry.toFixed(1)})`);
      }

      // Track staircase position
      if (rType.includes('stair')) {
        staircasePos = `${rName} at (${rx.toFixed(1)}, ${ry.toFixed(1)}), size ${rw.toFixed(1)}m × ${rd.toFixed(1)}m`;
      }
    }
  }

  // Map wall positions to compass based on facing
  const compassMap: Record<string, Record<string, string>> = {
    'North': { front: 'North', rear: 'South', left: 'West', right: 'East' },
    'South': { front: 'South', rear: 'North', left: 'East', right: 'West' },
    'East':  { front: 'East', rear: 'West', left: 'North', right: 'South' },
    'West':  { front: 'West', rear: 'East', left: 'South', right: 'North' },
  };
  const compass = compassMap[facing] || compassMap['East'];

  let brief = `\nARCHITECTURAL CONSISTENCY BRIEF (all drawings MUST match this layout):`;
  brief += `\n- FRONT WALL (${compass.front}-facing): ${wallRooms.front.join(', ') || 'None'} → windows/openings here visible in Front Elevation`;
  brief += `\n- REAR WALL (${compass.rear}-facing): ${wallRooms.rear.join(', ') || 'None'}`;
  brief += `\n- LEFT WALL (${compass.left}-facing): ${wallRooms.left.join(', ') || 'None'} → visible in Side Elevation`;
  brief += `\n- RIGHT WALL (${compass.right}-facing): ${wallRooms.right.join(', ') || 'None'}`;
  if (staircasePos) brief += `\n- STAIRCASE: ${staircasePos} → staircase window must appear on corresponding external wall in elevations`;
  if (wetAreas.length > 0) brief += `\n- WET AREAS (plumbing stacks): ${wetAreas.join('; ')} → must align vertically across floors`;
  brief += `\n- ENTRANCE: Main door on ${compass.front} wall (${facing}-facing)`;
  brief += `\n- BUILDING PROFILE: Plinth +450mm, GF ceiling 3.0m, FF ceiling 3.0m, Parapet 0.9m, Total height ~7.35m`;
  brief += `\n- ALL drawings must show the SAME room arrangement, wall positions, and opening locations.\n`;

  return brief;
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

  // Customer requirements context
  const facing = requirements?.facing || 'East';
  const vastuCompliant = requirements?.vastuCompliance !== false;
  const numFloors = requirements?.floors?.length || layout?.floors?.length || 2;
  const floorLabel = numFloors === 1 ? 'G' : numFloors === 2 ? 'G+1' : numFloors === 3 ? 'G+2' : `G+${numFloors - 1}`;
  const budget = requirements?.budget || 'standard';
  const archStyle = requirements?.architecturalStyle || 'contemporary_indian';
  const city = requirements?.city || '';
  const state = requirements?.state || '';
  const plotArea = Math.round(plotW * plotD);

  // Generate unique design seed for this client
  const seed = generateDesignSeed();

  // Budget-driven material specifications — makes every budget tier look different
  const budgetMaterials: Record<string, string> = {
    economy: `MATERIAL SPEC (Economy ₹1200-1500/sqft): ACC/Ultratech OPC 43 cement, Fe500 TMT bars, first-quality country burnt bricks, basic vitrified tiles 2x2ft, Asian Tractor Emulsion paint, PVC doors for wet areas, MS window frames, basic CP fittings, MCB-based distribution board.`,
    standard: `MATERIAL SPEC (Standard ₹1500-2000/sqft): Ultratech/Ambuja PPC cement, Fe500D TMT bars, AAC blocks 200mm, double-charge vitrified tiles 600x600, Asian Royale Luxury Emulsion, WPC door frames with flush doors, powder-coated aluminium sliding windows, Jaquar/Hindware CP fittings, ELCB+MCB board with copper wiring.`,
    premium: `MATERIAL SPEC (Premium ₹2000-2800/sqft): Ultratech Premium cement, Fe500D Tata Tiscon bars, AAC blocks with external stone cladding, Italian marble/large-format porcelain 800x1600, Dulux Velvet Touch paint with texture feature walls, teak wood door frames, UPVC double-glazed windows, Grohe/Kohler premium fittings, smart home-ready electrical with modular Legrand switches.`,
    luxury: `MATERIAL SPEC (Luxury ₹2800+/sqft): Premium cement with admixtures, Fe500D CRS bars, RCC frame with ALC infill + Italian stone/HPL cladding, imported marble flooring + designer accent tiles, premium texture paint + PU finish feature walls, solid teak/mahogany doors, thermally-broken aluminium windows with Low-E glass, Duravit/Hansgrohe designer fittings, full home automation (KNX/C-Bus), VRV HVAC ready, landscape-integrated design.`,
  };

  // Architectural style — changes how the building LOOKS
  const styleContext: Record<string, string> = {
    modern_minimalist: `ARCHITECTURAL STYLE: Modern Minimalist — Clean geometric forms, flat roof with concealed parapet, large unframed glass openings, cantilevered concrete elements, monochrome palette (white/grey/charcoal) with one accent material (wood/corten). No ornamental details. Shadow gaps instead of mouldings. Flush-mounted fixtures.`,
    contemporary_indian: `ARCHITECTURAL STYLE: Contemporary Indian — Blend of modern lines with Indian elements. Projected chajjas over windows, jaali/perforated screen as privacy element, exposed brick or stone accent feature, warm earth tones (terracotta/sandstone/cream). Sit-out or verandah integrated. Pitched or combination roof with modern profile.`,
    traditional: `ARCHITECTURAL STYLE: Traditional Indian — Sloped clay/Mangalore tile roof with visible rafters, ornamental columns at porch, carved wood door frame with brass fittings, courtyard influence, arched openings or niches, lime-washed or textured plaster walls in warm colours. Tulsi vrindavan in courtyard. Classic proportions.`,
    tropical: `ARCHITECTURAL STYLE: Tropical/Kerala — Steep sloped roof with clay tiles, wide overhanging eaves (900mm+), open verandahs with timber columns, laterite stone base plinth, large openings for cross-ventilation, courtyard/nadumuttam influence, jackwood/teak ceiling, rain-chain detailing. Lush landscape integration.`,
    industrial: `ARCHITECTURAL STYLE: Industrial — Exposed concrete/fair-face finish, steel I-beam/channel visible elements, metal cladding panels, large factory-style steel windows with multiple panes, flat roof with exposed services, muted palette (concrete grey/black/rust), open-plan feel with double-height spaces where possible.`,
  };

  // Regional climate adaptation — makes a Kerala house look different from a Rajasthan house
  const regionMap: Record<string, string> = {
    'Kerala': 'CLIMATE: Hot-humid tropical. Steep pitched roof (min 30°) for monsoon drainage, wide overhangs 750mm+, cross-ventilation mandatory, raised plinth 600mm+ for flooding, laterite stone locally available.',
    'Karnataka': 'CLIMATE: Moderate/warm. Combination roof suitable, 450-600mm overhangs, good ventilation design, standard plinth 450mm.',
    'Tamil Nadu': 'CLIMATE: Hot-humid coastal. Flat/low-pitch RCC roof with waterproofing, 600mm overhangs on south/west, rain water harvesting mandatory, terrace garden potential.',
    'Rajasthan': 'CLIMATE: Hot-arid desert. Thick walls 300mm+ for thermal mass, small windows on west, jaali screens for ventilation without heat, lime plaster exterior, light colours to reflect heat, internal courtyard essential.',
    'Maharashtra': 'CLIMATE: Varied (coastal to semi-arid). Sloped roof for Konkan, flat for Pune/Nashik. Monsoon-resistant detailing, 450mm overhangs, good drainage design.',
    'Gujarat': 'CLIMATE: Hot semi-arid to arid. Earthquake Zone III-IV — seismic detailing required. Thick walls, shaded openings, internal courtyard tradition.',
    'Uttar Pradesh': 'CLIMATE: Composite (hot summers, cold winters). Insulated roof, operable windows for seasonal control, 450mm overhangs south/west, fog-resistant materials.',
    'West Bengal': 'CLIMATE: Hot-humid. High rainfall design, steep drainage slopes, raised plinth 450mm+, wide verandahs, cross-ventilation priority.',
    'Telangana': 'CLIMATE: Hot semi-arid. Double roof/filler slab for insulation, light-coloured exterior, shaded west windows, rainwater harvesting.',
    'Punjab': 'CLIMATE: Composite (extreme summers, cold winters). Insulated cavity walls, orientation for winter sun, operable fenestration, 300mm overhangs.',
    'Delhi': 'CLIMATE: Composite extreme. Earthquake Zone IV — seismic design critical. Insulated roof + walls, solar shading devices on south/west, air-tight construction for pollution.',
    'Goa': 'CLIMATE: Tropical coastal. Portuguese influence appropriate, laterite stone, pitched tile roof, wide balcaos (verandahs), monsoon detailing, salt-resistant materials.',
  };
  const regionalContext = regionMap[state] || `CLIMATE: Design for local ${state} conditions — appropriate roof form, overhang depth, ventilation strategy, and locally available materials.`;

  // Computed grid spans for dimensional accuracy
  const plotWidthMM = Math.round(plotW * 304.8); // ft to mm
  const plotDepthMM = Math.round(plotD * 304.8); // ft to mm
  const numGridW = 4; // typical 4 spans along width
  const numGridD = 3; // typical 3 spans along depth
  const spanW = Math.round(plotWidthMM / numGridW); // mm per span along width
  const spanD = Math.round(plotDepthMM / numGridD); // mm per span along depth
  // Compute room dimensions in mm for each floor
  const groundFloorRoomsMM = groundFloorRooms.map((r: any) => {
    const w = r.width || r.w || 0;
    const d = r.depth || r.d || r.height || 0;
    return `${r.name || r.type}: ${Math.round(w * 1000)}mm × ${Math.round(d * 1000)}mm`;
  }).join(', ');
  const firstFloorRoomsMM = firstFloorRooms.map((r: any) => {
    const w = r.width || r.w || 0;
    const d = r.depth || r.d || r.height || 0;
    return `${r.name || r.type}: ${Math.round(w * 1000)}mm × ${Math.round(d * 1000)}mm`;
  }).join(', ');

  const dimensionalRule = `
CRITICAL DIMENSIONAL ACCURACY RULE:
- Total plot width = ${plotWidthMM}mm (${plotW}ft). Total plot depth = ${plotDepthMM}mm (${plotD}ft).
- Structural grid along width: ${numGridW} spans × ${spanW}mm = ${numGridW * spanW}mm.
- Structural grid along depth: ${numGridD} spans × ${spanD}mm = ${numGridD * spanD}mm.
- ALL individual dimensions MUST ADD UP to the total plot dimension. VERIFY: sum of all horizontal spans = ${plotWidthMM}mm, sum of all vertical spans = ${plotDepthMM}mm.
- Column SIZE is 230mm × 300mm (the physical cross-section of one column).
- Column CENTER-TO-CENTER SPACING is ${spanW}mm horizontally and ${spanD}mm vertically (distance between columns).
- NEVER use 300mm as column spacing — 300mm is column SIZE. Spacing is ${spanW}mm and ${spanD}mm.
- Ground floor rooms (mm): ${groundFloorRoomsMM || 'per layout'}.
- First floor rooms (mm): ${firstFloorRoomsMM || 'per layout'}.
- VERIFY: Sum of all room widths along any row + wall thicknesses (230mm external, 115mm internal) = ${plotWidthMM}mm.
- Building heights: Plinth +450mm, GF Floor-to-FF Floor 3000mm, FF Floor-to-Roof 3000mm, Parapet 900mm, Total height 7350mm.
`;

  // Dimension verification block for plan/layout drawings
  const dimensionVerification = `
DIMENSION VERIFICATION (the AI MUST follow these exact numbers):
• Plot: ${plotWidthMM}mm × ${plotDepthMM}mm (${plotW}ft × ${plotD}ft)
• Grid: ${numGridW} spans @ ${spanW}mm = ${numGridW * spanW}mm width ✓
• Grid: ${numGridD} spans @ ${spanD}mm = ${numGridD * spanD}mm depth ✓
• External wall: 230mm thick (shown as double line)
• Internal partition: 115mm thick (shown as single thick line)
• Column: 230mm × 300mm (NEVER confuse with spacing)
• Room dimensions: ${groundFloorRoomsMM || 'per layout'}
• VERIFY: All horizontal room widths + wall thicknesses = ${plotWidthMM}mm
• VERIFY: All vertical room depths + wall thicknesses = ${plotDepthMM}mm
• DO NOT INVENT DIMENSIONS. Use ONLY the numbers provided above.
`;

  // IS Code professional standards
  const isCodeStandards = `
PROFESSIONAL DRAFTING STANDARDS (IS 962:1989, SP 46:2003):
- Line weights: External walls 0.7mm, internal partitions 0.4mm, dimensions 0.18mm, hatching 0.13mm
- External walls: 230mm double-line, internal partitions: 150mm
- Columns: Crosshatched with ID label (C1, C2...) and size (230×300mm)
- Door swings: 90° arc, hinge anchored on wall
- All dimensions in mm (e.g., 3000mm × 3800mm)
- North arrow with compass orientation on every plan
- Scale bar and ratio on every drawing
- Section marks with directional arrows
- Grid lines with alphanumeric labels (A,B,C... / 1,2,3...)
- Room labels at geometric centroid, 300mm clear from walls`;

  const materialSpec = budgetMaterials[budget] || budgetMaterials.standard;
  const styleSpec = styleContext[archStyle] || styleContext.contemporary_indian;

  // Vastu placement rules (only if customer opted for Vastu)
  const vastuContext = vastuCompliant ? `
VASTU COMPLIANCE (${facing}-facing plot):
- Main entrance: ${facing} side (auspicious entry)
- Kitchen: South-East (SE) zone — fire element
- Master Bedroom: South-West (SW) zone — stability
- Pooja Room: North-East (NE) zone — sacred corner
- Staircase: South or West side (never NE)
- Toilets: North-West (NW) or West — never NE
- Living Room: North or East — maximum light
- Water Tank: South-West (overhead), North-East (underground)
` : '';

  // NBC 2016 compliance rules
  const nbcContext = `
NBC 2016 COMPLIANCE:
- Bedroom min: 9.5 m² (at least one), others min 7.5 m², min width 2.4m
- Kitchen min: 5.0 m², min width 1.8m
- Living/Dining combined min: 9.5 m²
- Bathroom min: 1.8 m², WC min: 1.1 m²
- Car parking: min 2.5m × 5.0m (3000mm clear width)
- Staircase: min 900mm width, riser max 190mm, tread min 250mm, headroom min 2.1m
- Corridor min width: 1.0m
- Clear ceiling height: min 2.75m habitable, 2.4m kitchen/bath
- Setbacks as per local bylaws
- Fire safety: NBC Part 4 compliance
`;

  // Architectural consistency brief — ensures all drawings match the plan
  const architecturalBrief = buildArchitecturalBrief(layout, requirements);

  // Design DNA block — makes each client's design visually unique
  const designDNA = `
DESIGN DNA (Seed: ${seed.seedId}) — THIS MAKES THIS CLIENT'S DESIGN UNIQUE:
- COLOR PALETTE: ${seed.palette}
- FACADE COMPOSITION: ${seed.facade}
- WINDOW PATTERN: ${seed.windows}
- LANDSCAPE: ${seed.landscape}
- ROOF FORM: ${seed.roof}
These design choices MUST be reflected consistently in Front Elevation, Side Elevation, 3D Exterior, and Section drawings.
`;

  // Dynamic context injected into every prompt — this makes every client's output UNIQUE
  const projectContext = `
PROJECT: ${plotW}ft × ${plotD}ft (${plotArea} sq.ft) ${facing}-facing ${floorLabel} Residential Building, ${city || 'India'}, ${state || 'India'}.
${materialSpec}
${styleSpec}
${regionalContext}
${designDNA}${isCodeStandards}${dimensionalRule}${vastuContext}${nbcContext}${architecturalBrief}`;

  const prompts: Record<DrawingType, string> = {
    ground_floor: `${BASE_PROMPT}${projectContext}${dimensionVerification}
CROSS-DRAWING REFERENCE: This is the MASTER drawing — all other drawings derive from this layout.
2D Ground Floor Plan of a ${plotW}ft × ${plotD}ft (${plotWidthMM}mm × ${plotDepthMM}mm) residential building. Plot boundary: thick outer walls (230mm). Internal partitions: thin lines (115mm). Show: ${formatRoomList(groundFloorRooms)}. Room dimensions in mm: ${groundFloorRoomsMM || 'per layout'}. Doors: solid leaf line + 90° arc swing. Windows: double parallel lines breaking walls on exterior walls. Staircase: parallel tread lines with UP arrow. Labels: room name + dimensions + area centered in each room. Dimensions: chain dimensions on top and left edges with tick marks — overall ${plotWidthMM}mm width and ${plotDepthMM}mm depth. VERIFY: Sum of all room widths along any row + wall thicknesses = ${plotWidthMM}mm. North arrow top-right. Grid circles at column positions matching ${spanW}mm × ${spanD}mm structural grid. NO furniture. NO colored fills - all rooms white. Clean architectural drafting style.`,

    first_floor: `${BASE_PROMPT}${projectContext}${dimensionVerification}
CROSS-DRAWING REFERENCE: Must match Ground Floor external walls exactly. Staircase position identical. Wet areas vertically aligned with GF.
2D First Floor Plan of a ${plotW}ft × ${plotD}ft (${plotWidthMM}mm × ${plotDepthMM}mm) residential building. Plot boundary: thick outer walls (230mm). Internal partitions: thin lines (115mm). Show: ${formatRoomList(firstFloorRooms)}. Room dimensions in mm: ${firstFloorRoomsMM || 'per layout'}. Doors: solid leaf line + 90° arc swing. Windows: double parallel lines breaking walls on exterior walls. Staircase: parallel tread lines with DOWN arrow. Labels: room name + dimensions + area centered in each room. Dimensions: chain dimensions on top and left edges with tick marks — overall ${plotWidthMM}mm width and ${plotDepthMM}mm depth. VERIFY: Sum of all room widths along any row + wall thicknesses = ${plotWidthMM}mm. North arrow top-right. Grid circles at column positions matching ${spanW}mm × ${spanD}mm structural grid. NO furniture. NO colored fills - all rooms white. Clean architectural drafting style.`,

    front_elevation: `${BASE_PROMPT}${projectContext}
CROSS-DRAWING REFERENCE: Windows and doors on front wall MUST match rooms shown touching front wall in floor plan. Building width = plot width ${plotWidthMM}mm.
Front Elevation of a ${floorLabel} residential building. Total width: ${plotWidthMM}mm (${plotW}ft).
DESIGN DNA APPLICATION: Use FACADE COMPOSITION — ${seed.facade}. Use COLOR PALETTE — ${seed.palette}. Use WINDOW PATTERN — ${seed.windows}. Use ROOF FORM — ${seed.roof}.
EXPLICIT HEIGHTS: Plinth +450mm above GL, GF floor-to-FF floor 3000mm, FF floor-to-roof slab 3000mm, Parapet 900mm. Total building height: 7350mm above GL.
Level markings on left: GL ±0.000, Plinth +0.450, FF Floor +3.450, Roof +6.450, Parapet Top +7.350.
Width must match plot: ${plotWidthMM}mm total. Show overall width dimension at bottom.
Show: main entrance door (${facing}-facing), windows with frames matching floor plan positions, balcony at first floor (${balconyPosition}), facade materials per Design DNA palette. Dimension heights on right.`,

    side_elevation: `${BASE_PROMPT}${projectContext}
CROSS-DRAWING REFERENCE: Windows on side wall MUST match rooms touching left wall in floor plan. Building depth = plot depth ${plotDepthMM}mm.
Side Elevation of a ${floorLabel} residential building. Total width (depth of plot): ${plotDepthMM}mm (${plotD}ft).
DESIGN DNA APPLICATION: Use FACADE COMPOSITION — ${seed.facade}. Use COLOR PALETTE — ${seed.palette}. Use WINDOW PATTERN — ${seed.windows}. Use ROOF FORM — ${seed.roof}.
EXPLICIT HEIGHTS: Plinth +450mm above GL, GF floor-to-FF floor 3000mm, FF floor-to-roof slab 3000mm, Parapet 900mm. Total building height: 7350mm above GL.
Level markings on left: GL ±0.000, Plinth +0.450, FF Floor +3.450, Roof +6.450, Parapet Top +7.350.
Width must match plot depth: ${plotDepthMM}mm total. Show overall width dimension at bottom.
Show: side windows with frames matching floor plan positions, building depth profile, staircase window, facade materials per Design DNA palette. Dimension heights on right. Roof drainage slope visible.`,

    section_aa: `${BASE_PROMPT}${projectContext}
CROSS-DRAWING REFERENCE: Room widths in section MUST match floor plan dimensions. Heights MUST match elevation level marks.
Building Section A-A through a ${floorLabel} residential building. Section width = ${plotWidthMM}mm (cutting across the building width). Room widths visible in section must match floor plan dimensions.
DESIGN DNA APPLICATION: Use ROOF FORM — ${seed.roof}. Material call-outs per COLOR PALETTE — ${seed.palette}.
Show: foundation (isolated footing 1200×1200×1500mm deep), plinth beam at +450mm, ground floor rooms with 3000mm clear height, 150mm RCC slab, first floor rooms with 3000mm clear height, roof slab, parapet 900mm. Total height above GL: 7350mm. Concrete hatching on structural elements. Level markers: GL ±0.000, Plinth +0.450, GF Slab +3.150, FF Slab +6.300, Parapet +7.200. Overall width dimension at bottom: ${plotWidthMM}mm. Staircase visible in section. Earth hatching below ground.`,

    excavation: `${BASE_PROMPT}${projectContext}${dimensionVerification}
CROSS-DRAWING REFERENCE: Pit positions MUST match column layout grid exactly.
Excavation Plan for ${plotW}ft × ${plotD}ft (${plotWidthMM}mm × ${plotDepthMM}mm) plot. Show plot boundary, column positions marked with crosses at: ${columnPositions}. Excavation pits at ${spanW}mm c/c horizontally and ${spanD}mm c/c vertically, matching the structural grid. Each excavation pit: 1200mm × 1200mm × 1500mm deep. Overall dimensions: ${plotWidthMM}mm total width, ${plotDepthMM}mm total depth. Individual pit spacing dimensions: ${spanW}mm between vertical grid lines, ${spanD}mm between horizontal grid lines. Earth hatching around pits. Table showing: Pit ID, Size, Depth, Volume.`,

    column_layout: `${BASE_PROMPT}${projectContext}${dimensionVerification}
CROSS-DRAWING REFERENCE: Column grid MUST align with wall junctions shown in floor plan. Every T-junction and corner has a column.
Column Layout Plan for ${plotW}ft x ${plotD}ft (${plotWidthMM}mm × ${plotDepthMM}mm) residential building.
GRID LINES: ${numGridW + 1} vertical grid lines labeled 1, 2, 3, 4, 5 spaced at ${spanW}mm center-to-center. ${numGridD + 1} horizontal grid lines labeled A, B, C, D spaced at ${spanD}mm center-to-center.
DIMENSION CHECK: ${numGridW} spans × ${spanW}mm = ${numGridW * spanW}mm total width ✓. ${numGridD} spans × ${spanD}mm = ${numGridD * spanD}mm total depth ✓.
Column positions at: ${columnPositions}. Each column: 230mm × 300mm shown as filled/crosshatched rectangles.
CRITICAL: Column SIZE is 230×300mm. Column CENTER-TO-CENTER SPACING is ${spanW}mm horizontally and ${spanD}mm vertically. These are completely different numbers.
Grid circles at edges with labels. Overall dimensions on outside edges: ${plotWidthMM}mm total width, ${plotDepthMM}mm total depth. Individual span dimensions between each pair of grid lines.
Column schedule table: Column ID, Size (230×300mm), Grid Position.`,

    column_detail: `${BASE_PROMPT}${projectContext}
Reinforcement Detail of a 230mm x 300mm RCC Column. Show: Cross-section with 4 nos 12mm dia main bars at corners + 2 nos 12mm dia extra on long face = 6 nos total. 8mm stirrups at 150mm c/c (closer at 100mm near joints). Side view showing lap length = 40d = 480mm. Clear cover: 40mm. Concrete grade: M20, Steel: Fe500D. Dimensions annotated. Bar bending detail for one stirrup.`,

    footing_detail: `${BASE_PROMPT}${projectContext}
Isolated Footing Detail Drawing. Plan view: 1200mm x 1200mm footing with 230mm x 300mm column at center. Section view: 1500mm deep, 300mm footing thickness, pedestal 300mm. Reinforcement: 10mm bars at 150mm c/c both ways in footing. Concrete hatching. PCC bed 150mm thick below footing. Dimensions fully annotated. M20 concrete, Fe500D steel.`,

    beam_slab: `${BASE_PROMPT}${projectContext}
CROSS-DRAWING REFERENCE: Beam grid MUST match column layout. Span dimensions identical.
RCC Beam and Slab Detail. Beam spans matching structural grid: ${spanW}mm and ${spanD}mm spans. Typical beam section: 230mm wide × 400mm deep. Top steel: 2-12mm, Bottom steel: 3-16mm, Stirrups: 8mm@150mm c/c. Slab: 150mm thick, 8mm bars @150mm c/c both ways. Slab panel sizes: ${spanW}mm × ${spanD}mm between beam center-lines. Show beam-slab junction detail. Development length at supports. Slab reinforcement plan showing main and distribution bars.`,

    bar_bending: `${BASE_PROMPT}${projectContext}
Bar Bending Schedule table for ${floorLabel} residential building. Column spacing: ${spanW}mm × ${spanD}mm grid. Beam lengths: ${spanW}mm and ${spanD}mm clear span + bearing. Columns: Member, Bar Mark, Dia(mm), Shape Code, No of Bars, Cutting Length(m), Total Length(m), Unit Weight(kg/m), Total Weight(kg). Include: Footings (F1-F16), Columns (C1-C16), Plinth Beams, Ground Floor Beams, GF Slab, FF Beams, FF Slab, Staircase. Shape code diagrams: 00=straight, 21=cranked, 38=rectangular stirrup, 51=L-bend. Summary: Total Steel = ${totalSteel} Tons Fe500D. With 3% Buffer = ${(Number(totalSteel) * 1.03).toFixed(2)} Tons.`,

    electrical: `${BASE_PROMPT}${projectContext}${dimensionVerification}
CROSS-DRAWING REFERENCE: Room layout MUST match ground floor plan exactly — same room sizes, positions, names.
Electrical Layout Plan for Ground Floor of ${plotW}ft x ${plotD}ft house.

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

    plumbing: `${BASE_PROMPT}${projectContext}${dimensionVerification}
CROSS-DRAWING REFERENCE: Room layout MUST match ground floor plan. Wet area positions from brief.
Plumbing Layout Plan for Ground Floor. Show room outlines with: water supply lines (solid blue), drainage lines (dashed green), floor traps (circle), fixtures: WC, wash basin, kitchen sink, washing machine point. Inlet from municipal supply. Overhead tank connection. Soil pipe stack location. Vent pipe. STP connection. Plumbing Stack A1: Kitchen (GF) to Master Toilet (FF) vertically aligned. Pipe sizes annotated.`,

    '3d_exterior': `${BASE_PROMPT}
PROJECT: ${plotW}ft × ${plotD}ft (${plotArea} sq.ft) ${facing}-facing ${floorLabel} Residential Building, ${city || 'India'}, ${state || 'India'}.
${materialSpec}
${styleSpec}
${regionalContext}
${designDNA}
CROSS-DRAWING REFERENCE: 3D view must match the facade, windows, and proportions shown in Front and Side Elevations.
3D Perspective Rendering of a ${floorLabel} residential house.
DESIGN DNA APPLICATION — USE ALL OF THESE:
- FACADE COMPOSITION: ${seed.facade}
- COLOR PALETTE: ${seed.palette}
- WINDOW PATTERN: ${seed.windows}
- LANDSCAPE: ${seed.landscape}
- ROOF FORM: ${seed.roof}
Main entrance on ${facing} side with canopy. First floor balcony on ${balconyPosition}. Facade materials and colors per Design DNA palette. Landscaping per Design DNA landscape style. Roof form per Design DNA roof variation. Photorealistic render, golden hour lighting, slight upward camera angle.`,

    staircase_detail: `${BASE_PROMPT}${projectContext}
Staircase Detail Drawing for a ${floorLabel} residential building. Staircase well size from floor plan: reference ARCHITECTURAL CONSISTENCY BRIEF for exact position. PLAN VIEW: Dog-leg staircase in a ${plotW > 25 ? '3.0m x 5.5m' : '2.5m x 4.5m'} stairwell. Show: two flights with mid-landing, 10 risers per flight (150mm each), tread width 250mm, landing 1200mm wide, handrail on both sides. SECTION VIEW: Show waist slab 150mm thick, reinforcement 12mm bars at 150mm c/c main + 8mm at 200mm c/c distribution. Headroom clearance 2100mm minimum marked. Level markings: Ground +0.000, Mid-landing +1.500, First Floor +3.000. Nosing detail 25mm. Anti-skid groove on treads. M20 concrete, Fe500D steel. All dimensions annotated.`,

    water_tank: `${BASE_PROMPT}${projectContext}
Water Tank Detail Drawing. OVERHEAD TANK (OHT): Plan and section of rectangular RCC tank ${plotW > 25 ? '2.0m x 2.0m x 1.2m' : '1.5m x 1.5m x 1.0m'} capacity ${plotW > 25 ? '4800L' : '2250L'}. Wall thickness 200mm, base slab 200mm, top slab 120mm. Reinforcement: 10mm bars at 150mm c/c both ways in walls and base. Haunches at wall-base junction. Inlet pipe, outlet pipe, overflow pipe, drain valve, manhole 600x600mm. Waterproofing membrane layer shown. UNDERGROUND SUMP: Plan and section 2.0m x 2.0m x 1.5m deep. 300mm thick walls, 300mm base with PCC bed. Level indicators. M25 concrete for water-retaining structures. All dimensions and bar details annotated.`,

    waterproofing: `${BASE_PROMPT}${projectContext}
Waterproofing Detail Drawing. Show THREE detail sections: 1) BATHROOM WATERPROOFING: Floor section showing tiles → tile adhesive → waterproofing membrane (APP/SBS) → screed 40mm → RCC slab 150mm. Membrane turned up 200mm on walls (chase detail). Floor slope 1:40 towards drain. 2) TERRACE WATERPROOFING: Section showing weather coat → China mosaic tiles → waterproofing membrane → screed with slope 1:100 → RCC slab. Parapet junction detail with cove fillet. Drain outlet detail. 3) BASEMENT/PLINTH: Section showing DPC (damp proof course) at plinth level +450mm. Bituminous coating on external face of basement wall. Weep holes at 1.0m spacing. Each detail fully dimensioned with material callouts and layer thicknesses.`,

    stp_detail: `${BASE_PROMPT}${projectContext}
Sewage Treatment Plant (STP) Detail for residential building. PLAN VIEW: Compact STP layout showing: Inlet chamber → Bar screen → Anaerobic baffled reactor (2 chambers) → Settling tank → Planted gravel filter → Treated water tank. All chambers with dimensions. SECTION A-A: Vertical section through all chambers showing water levels, baffle walls, gravel media, pipe inverts. Inlet invert level, outlet invert level. Chamber depths: 1.5m to 2.0m. Wall thickness 200mm RCC. FLOW DIAGRAM: Schematic showing treatment stages with arrows. Capacity: 1000-2000 LPD for residential use. Treated water quality: BOD < 30mg/L, TSS < 50mg/L per CPCB norms. All dimensions annotated.`,

    tiling_layout: `${BASE_PROMPT}${projectContext}${dimensionVerification}
Tiling Layout Plan for Ground Floor of ${plotW}ft x ${plotD}ft house. Show room outlines with tiling patterns: LIVING/DINING: 600x600mm vitrified tiles in stack bond pattern with tile layout grid, show cut tiles at edges with dimensions. KITCHEN: 600x600mm anti-skid tiles, 300x450mm wall tiles up to 600mm dado height. BATHROOM: 300x300mm anti-skid floor tiles with slope towards drain, 300x600mm wall tiles floor to ceiling (2.4m). BEDROOM: 600x600mm vitrified tiles. Show: tile starting point (center of room), cut tile widths at edges, threshold strips at door openings, skirting 100mm height. Tile quantity table: Room, Floor Area, Wall Area, Tile Size, Quantity (add 10% wastage). All dimensions in mm.`,

    brickwork_detail: `${BASE_PROMPT}${projectContext}
Brickwork Detail Drawing for residential building. WALL SECTION: Show 230mm external wall (English bond) and 115mm internal partition (stretcher bond). Layer detail: External plaster 20mm → Brick masonry 230mm → Internal plaster 15mm. Brick size: 230mm x 115mm x 75mm with 10mm mortar joints (1:6 cement:sand). BONDING PATTERNS: Plan view of English bond showing alternate header and stretcher courses. T-junction detail where internal wall meets external wall. LINTEL DETAIL: RCC lintel 230mm x 150mm over openings, bearing 150mm each side, 2-12mm bars top + 2-12mm bottom, 6mm stirrups at 150mm c/c. SILL DETAIL: Brick on edge sill with weathering slope and drip groove. Wall quantities per floor in table format. All dimensions annotated.`,
  };

  return prompts[drawingType] || `${BASE_PROMPT}Architectural drawing for ${drawingType}.`;
}
