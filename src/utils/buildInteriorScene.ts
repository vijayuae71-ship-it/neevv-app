import type {
  Room,
  RoomInterior,
  InteriorMoodBoard,
  InteriorScene,
  SceneFurnitureItem,
  SceneFixture,
  SceneOpening,
  SceneZone,
  SceneMaterials,
  SceneLighting,
  SceneDimensions,
  InteriorStyle,
  ColorPalette,
} from '../types';

/* ================================================================
   LOCKED INTERIOR SCENE BUILDER
   ----------------------------------------------------------------
   This is the SINGLE SOURCE OF TRUTH for what exists in a room.
   All room-type-specific furniture/fixture/material/dimension
   decisions are resolved HERE, exactly once, into a plain
   `InteriorScene` data object. The plan / elevation / 3D prompt
   builders in `interiorRenderPrompt.ts` do nothing but serialize
   this object — they contain NO room-type branching of their own,
   so the three views can never disagree about what is in the room.
   ================================================================ */

export const CLEAR_HEIGHT_MM = 3050;
export const FALSE_CEILING_MM = 2750;
export const WALL_THICKNESS_MM = 230;

/* ----------------------------------------------------------------
   Small unit helpers
   ---------------------------------------------------------------- */

const mToFtNum = (m: number): number => Math.round(m * 3.281);
const sqmToSqft = (sqm: number): number => Math.round(sqm * 10.764);

function humanizeStyle(style: InteriorStyle): string {
  return style
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Resolve the per-room style/palette. Prefers the room's own configured
 *  interior (RoomInterior), falling back to the supplied moodBoard. This
 *  is what lets each room keep its own style even though a single global
 *  moodBoard is threaded through the component tree. */
function resolveStyle(
  interior: RoomInterior | undefined,
  moodBoard: InteriorMoodBoard,
): { style: InteriorStyle; styleName: string; palette: ColorPalette } {
  const style = interior?.style || moodBoard.style;
  const palette = interior?.palette || moodBoard.palette;
  const styleName = style === moodBoard.style ? moodBoard.styleName : humanizeStyle(style);
  return { style, styleName, palette };
}

/** Convert a plain FurnitureItem (from RoomInterior.furniture) into a
 *  SceneFurnitureItem for generic/unrecognized room types. */
function mapGenericFurniture(interior: RoomInterior | undefined): SceneFurnitureItem[] {
  if (!interior?.furniture?.length) return [];
  return interior.furniture.map(f => ({
    name: f.name,
    category: f.category,
    widthMM: f.widthMM,
    depthMM: f.depthMM,
    heightMM: f.heightMM,
    material: f.material,
    color: f.color,
    wall: 'center' as const,
    description: `${f.name} — ${f.material} finish, ${f.color} tone`,
  }));
}

/* ================================================================
   ROOM-TYPE RESOLVERS
   Each resolver returns the parts of the scene it owns; the parts
   it doesn't touch stay at sensible defaults set by the caller.
   ================================================================ */

interface ResolvedRoomContent {
  furniture: SceneFurnitureItem[];
  fixtures: SceneFixture[];
  openings: SceneOpening[];
  zones: SceneZone[];
  materials: Partial<SceneMaterials>;
  keyDimensions: SceneDimensions;
  lighting: SceneLighting;
  specificNotes: string;
}

function resolveBathroom(areaSqft: number, interior: RoomInterior | undefined): ResolvedRoomContent {
  const compact = areaSqft < 40;

  const fixtures: SceneFixture[] = [
    {
      name: compact ? 'Wall-Hung EWC' : 'Floor-Mount EWC with Concealed Cistern',
      widthMM: 380,
      depthMM: 560,
      heightMM: compact ? 400 : 750,
      mountHeightMM: compact ? 400 : 0,
      wall: compact ? 'east' : 'floor',
      material: 'Vitreous China, White',
      description: compact
        ? 'Wall-hung EWC with concealed cistern and dual-flush plate, floating above finished floor'
        : 'Floor-mount EWC with concealed cistern, dual-flush plate on wall',
    },
    {
      name: compact ? 'Wall-Mount Wash Basin 450mm' : 'Counter-Top Wash Basin on Vanity 600mm',
      widthMM: compact ? 450 : 600,
      depthMM: compact ? 350 : 450,
      heightMM: 150,
      mountHeightMM: 800,
      wall: 'west',
      material: 'Vitreous China / Quartz Counter',
      description: 'Single-lever mixer tap, wash basin at standard counter height',
    },
    {
      name: compact ? 'Corner Shower (Tempered Glass Partition)' : 'Shower Enclosure 900×900mm',
      widthMM: compact ? 700 : 900,
      depthMM: compact ? 700 : 900,
      heightMM: 2000,
      mountHeightMM: 0,
      wall: 'south',
      material: '8mm Tempered Clear Glass + SS 304 Fittings',
      description: 'Rain shower head + adjustable hand shower on slide bar, frameless glass partition',
    },
    {
      name: 'Health Faucet',
      widthMM: 100,
      depthMM: 100,
      heightMM: 300,
      mountHeightMM: 600,
      wall: 'east',
      material: 'Chrome',
      description: 'Jet spray health faucet mounted beside WC',
    },
    {
      name: 'Towel Rail 600mm',
      widthMM: 600,
      depthMM: 60,
      heightMM: 60,
      mountHeightMM: 1500,
      wall: 'west',
      material: 'SS 304 Brushed',
      description: 'Wall-mounted towel rail',
    },
    {
      name: 'LED Backlit Mirror',
      widthMM: 600,
      depthMM: 30,
      heightMM: 700,
      mountHeightMM: 1050,
      wall: 'west',
      material: 'Mirror + LED Border',
      description: 'Mirror above vanity with warm-white LED backlight border',
    },
    {
      name: compact ? 'Recessed Niche 300×300mm' : 'Recessed Niche 400×300mm',
      widthMM: compact ? 300 : 400,
      depthMM: 100,
      heightMM: 300,
      mountHeightMM: 1200,
      wall: 'south',
      material: 'Accent Tile Lining',
      description: 'Recessed wall niche for toiletries with accent tile',
    },
    {
      name: 'Floor Trap 150×150mm',
      widthMM: 150,
      depthMM: 150,
      heightMM: 10,
      mountHeightMM: 0,
      wall: 'floor',
      material: 'SS Grating',
      description: 'Floor trap with grating, floor slopes 1:40 towards it',
    },
  ];

  const openings: SceneOpening[] = [
    {
      type: 'door',
      wall: 'north',
      widthMM: 750,
      heightMM: 2100,
      sillHeightMM: 0,
      openDirection: 'outward',
      material: 'Laminate Flush Door',
    },
    {
      type: 'window',
      wall: 'south',
      widthMM: 600,
      heightMM: 450,
      sillHeightMM: 2100,
      material: 'Frosted Glass, Aluminium Frame',
    },
  ];

  const zones: SceneZone[] = [
    { name: 'DRY ZONE', description: 'Vanity + WC area', color: 'light blue tint' },
    { name: 'WET ZONE', description: 'Shower area behind glass partition', color: 'medium blue tint' },
    { name: 'CIRCULATION', description: `Clear path ${compact ? "2'-0\"" : "2'-6\""} min width`, color: 'dashed outline' },
  ];

  return {
    furniture: [],
    fixtures,
    openings,
    zones,
    materials: {
      flooring: {
        name: interior?.flooring?.name || 'Anti-Skid Ceramic Tiles',
        finish: 'Matt Anti-Skid, 1:40 slope to floor trap',
        tileSize: '300×300 mm',
      },
      wallFinish: {
        name: interior?.wallFinish?.name || 'Ceramic Wall Tiles',
        finish: 'Full-height tiling up to dado, paint above',
      },
    },
    keyDimensions: { dadoHeight: 2100 },
    lighting: {
      description: 'Warm white 3000K LED mirror backlight, recessed IP65-rated ceiling downlights, accent light in niche',
      fixtures: ['LED mirror backlight', 'IP65 recessed downlight ×2', 'Niche accent light', 'Exhaust fan at 2400mm'],
    },
    specificNotes: `${compact ? 'Compact' : 'Standard'} bathroom (${areaSqft} sq.ft). Floor slope 1:40 towards floor trap. Wall tiling to 2100mm (7'-0"), paint above to ceiling.`,
  };
}

function resolveKitchen(
  areaSqft: number,
  widthFt: number,
  interior: RoomInterior | undefined,
): ResolvedRoomContent {
  const compact = areaSqft < 55;
  const layout = compact ? 'L-shaped' : widthFt >= 8 ? 'U-shaped' : 'L-shaped';

  const furniture: SceneFurnitureItem[] = [
    {
      name: 'Lower Cabinets',
      category: 'kitchen_cabinet',
      widthMM: 3000,
      depthMM: 600,
      heightMM: 850,
      material: 'Marine Ply Carcass + PU/Acrylic Laminate Shutters',
      color: '#2E3440',
      wall: 'south',
      description: 'Tandem-box drawers, corner carousel, bottle pull-out, soft-close hinges',
    },
    {
      name: 'Upper Cabinets',
      category: 'kitchen_cabinet',
      widthMM: 3000,
      depthMM: 350,
      heightMM: 750,
      material: 'Marine Ply Carcass + PU/Acrylic Laminate Shutters',
      color: '#F5F0EA',
      wall: 'south',
      description: 'Soft-close hinges, bottom edge at 1450mm from FFL',
    },
    {
      name: 'Tall Pantry Unit',
      category: 'kitchen_cabinet',
      widthMM: 600,
      depthMM: 600,
      heightMM: 2100,
      material: 'Marine Ply Carcass + Laminate',
      color: '#F5F0EA',
      wall: 'east',
      description: 'Full-height pull-out pantry shelves',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Countertop — 20mm Quartz',
      widthMM: 3000,
      depthMM: 600,
      heightMM: 20,
      mountHeightMM: 850,
      wall: 'south',
      material: 'Polished White Quartz / Engineered Marble, Waterfall Edge',
      description: 'Continuous counter over lower cabinets',
    },
    {
      name: 'Backsplash — Subway Tile',
      widthMM: 3000,
      depthMM: 10,
      heightMM: 600,
      mountHeightMM: 870,
      wall: 'south',
      material: 'Subway Tile / Nano White Glass',
      description: 'Full-height between counter and upper cabinets',
    },
    {
      name: 'Auto-Clean Chimney Hood 60cm',
      widthMM: 600,
      depthMM: 450,
      heightMM: 500,
      mountHeightMM: 1450,
      wall: 'south',
      material: 'Stainless Steel + Glass Canopy, Filterless',
      description: 'Mounted above hob',
    },
    {
      name: '3-Burner Glass Top Hob',
      widthMM: 600,
      depthMM: 500,
      heightMM: 50,
      mountHeightMM: 850,
      wall: 'south',
      material: 'Toughened Glass, Auto-Ignition',
      description: 'Built into countertop',
    },
    {
      name: 'SS 304 Under-Mount Sink',
      widthMM: 600,
      depthMM: 450,
      heightMM: 250,
      mountHeightMM: 600,
      wall: 'south',
      material: 'SS 304, Satin Finish',
      description: 'Double-bowl under-mount sink with gooseneck mixer faucet',
    },
    {
      name: 'Under-Cabinet LED Strip',
      widthMM: 3000,
      depthMM: 20,
      heightMM: 20,
      mountHeightMM: 1450,
      wall: 'south',
      material: 'Warm White 3000K LED',
      description: 'Continuous strip beneath upper cabinets',
    },
    {
      name: 'SS Kick Plinth',
      widthMM: 3000,
      depthMM: 20,
      heightMM: 100,
      mountHeightMM: 0,
      wall: 'south',
      material: 'Stainless Steel',
      description: 'Plinth at base of lower cabinets',
    },
  ];

  const openings: SceneOpening[] = [
    {
      type: 'door',
      wall: 'north',
      widthMM: 900,
      heightMM: 2100,
      sillHeightMM: 0,
      openDirection: 'inward',
      material: 'Laminate Flush Door',
    },
    {
      type: 'window',
      wall: 'west',
      widthMM: 1200,
      heightMM: 900,
      sillHeightMM: 1050,
      material: 'Aluminium Sliding, Clear Glass',
    },
  ];

  const zones: SceneZone[] = [
    { name: 'COOKING ZONE', description: 'Hob + chimney', color: 'warm orange tint' },
    { name: 'WASH ZONE', description: 'Sink area', color: 'light blue tint' },
    { name: 'PREP ZONE', description: 'Counter workspace', color: 'light green tint' },
    { name: 'STORAGE ZONE', description: 'Tall unit + pantry', color: 'light yellow tint' },
    { name: 'CIRCULATION', description: `${compact ? "3'-6\"" : "4'-0\""} clear path`, color: 'dashed outline' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: {
        name: interior?.flooring?.name || 'Vitrified Tiles',
        finish: 'Glossy',
        tileSize: '600×600 mm',
      },
      wallFinish: {
        name: interior?.wallFinish?.name || 'Kitchen Dado Tiles + Paint',
        finish: 'Glossy dado, paint above',
      },
      countertop: {
        name: 'Polished White Quartz / Engineered Marble',
        thickness: 20,
        finish: 'Polished, Waterfall Edge',
      },
    },
    keyDimensions: {
      counterHeight: 850,
      upperCabinetBottom: 1450,
      backsplashHeight: 600,
      plinthHeight: 100,
    },
    lighting: {
      description: 'Continuous warm white 3000K under-cabinet LED strip, recessed ceiling downlights over work zones, integrated chimney light',
      fixtures: ['Under-cabinet LED strip', 'Recessed downlights ×3', 'Chimney hood light'],
    },
    specificNotes: `${layout} kitchen layout (${areaSqft} sq.ft, ${widthFt}'-0" wide). Work triangle between sink–hob–pantry must be efficient. Counter height 850mm, upper cabinet bottom at 1450mm.`,
  };
}

function resolveBedroom(
  isMaster: boolean,
  interior: RoomInterior | undefined,
  moodBoardStyle: InteriorStyle,
): ResolvedRoomContent {
  const wardrobeWidth = isMaster ? 2400 : 1800;

  const furniture: SceneFurnitureItem[] = [
    {
      name: isMaster ? 'King Bed 1800×2000mm' : 'Queen Bed 1500×2000mm',
      category: 'bed',
      widthMM: isMaster ? 1800 : 1500,
      depthMM: 2000,
      heightMM: 450,
      material: 'Upholstered Headboard + Solid Wood Frame',
      color: '#8B6914',
      wall: 'north',
      description: 'Bed head against wall opposite door entry',
    },
  ];

  if (isMaster) {
    furniture.push(
      { name: 'Side Table (Left)', category: 'side_table', widthMM: 500, depthMM: 400, heightMM: 500, material: 'Laminate Finish', color: '#333333', wall: 'west', description: 'Bedside table with lamp' },
      { name: 'Side Table (Right)', category: 'side_table', widthMM: 500, depthMM: 400, heightMM: 500, material: 'Laminate Finish', color: '#333333', wall: 'east', description: 'Bedside table with lamp' },
    );
  } else {
    furniture.push(
      { name: 'Side Table', category: 'side_table', widthMM: 450, depthMM: 400, heightMM: 500, material: 'Laminate Finish', color: '#333333', wall: 'east', description: 'Bedside table with lamp' },
    );
  }

  furniture.push({
    name: 'Wardrobe',
    category: 'wardrobe',
    widthMM: wardrobeWidth,
    depthMM: 600,
    heightMM: 2400,
    material: 'Marine Ply + Laminate Shutters, Loft Above',
    color: '#4A2C2A',
    wall: 'south',
    description: 'Full-height wardrobe with loft section, positioned near door wall for easy access',
  });

  if (isMaster) {
    furniture.push(
      { name: 'Dressing Table', category: 'dressing', widthMM: 1200, depthMM: 450, heightMM: 750, material: 'Laminate + Mirror', color: '#333333', wall: 'west', description: 'Dressing table with mirror and stool' },
      { name: 'TV Unit', category: 'tv_unit', widthMM: 1500, depthMM: 400, heightMM: 450, material: 'Laminate + Back Panel', color: '#333333', wall: 'south', description: 'Wall-mounted TV unit with floating shelf' },
    );
  } else {
    furniture.push(
      { name: 'Study Table', category: 'study_table', widthMM: 1200, depthMM: 600, heightMM: 750, material: 'Laminate Finish', color: '#333333', wall: 'west', description: 'Study table with bookshelf above' },
    );
  }

  const fixtures: SceneFixture[] = [
    {
      name: 'Split AC Unit',
      widthMM: 900,
      depthMM: 250,
      heightMM: 300,
      mountHeightMM: 2400,
      wall: 'east',
      material: 'White Plastic Body',
      description: 'Wall-mounted split AC indoor unit',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 900, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Laminate Flush Door' },
    {
      type: 'window',
      wall: 'north',
      widthMM: isMaster ? 1500 : 1200,
      heightMM: 1200,
      sillHeightMM: 900,
      material: 'Aluminium Sliding, Clear Glass',
    },
  ];

  const zones: SceneZone[] = [
    { name: 'SLEEPING ZONE', description: `Bed area with ${isMaster ? '2' : '1'} side clearance`, color: 'soft lavender tint' },
    { name: 'STORAGE ZONE', description: 'Wardrobe wall', color: 'warm beige tint' },
    { name: 'ACTIVITY ZONE', description: isMaster ? 'Dressing + TV' : 'Study area', color: 'light green tint' },
    { name: 'CIRCULATION', description: "Min 2'-6\" clearance around bed", color: 'dashed outline' },
  ];

  const accentWall =
    moodBoardStyle === 'contemporary_indian'
      ? { name: 'Textured Paint / Ethnic Wallpaper', description: 'Accent wall behind bed headboard' }
      : moodBoardStyle === 'industrial'
      ? { name: 'Exposed Brick Cladding', description: 'Accent wall behind bed headboard' }
      : { name: 'Feature Wallpaper / Panel Moulding', description: 'Accent wall behind bed headboard' };

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Wooden Laminate Flooring', finish: 'Matt Natural' },
      wallFinish: { name: interior?.wallFinish?.name || 'Premium Emulsion Paint', finish: 'Matt' },
      accentWall,
    },
    keyDimensions: {},
    lighting: {
      description: 'Warm ambient cove LED in false ceiling (2700K), bedside lamps/wall sconces, recessed downlights',
      fixtures: ['Peripheral cove LED', 'Bedside lamp ×' + (isMaster ? '2' : '1'), 'Recessed downlights ×2'],
    },
    specificNotes: `Bed head against wall opposite door entry. Wardrobe near door wall. Min 750mm clearance on dressing side. Wardrobe: ${wardrobeWidth}mm wide.`,
  };
}

function resolveLiving(interior: RoomInterior | undefined, moodBoardStyle: InteriorStyle): ResolvedRoomContent {
  const sofaMaterial = moodBoardStyle === 'industrial' ? 'Leather Upholstery' : 'Fabric Upholstery';

  const furniture: SceneFurnitureItem[] = [
    { name: 'L-Shape Sofa', category: 'sofa', widthMM: 2700, depthMM: 1800, heightMM: 850, material: sofaMaterial, color: '#C4A882', wall: 'south', description: '3+2 seating L-shape sofa facing TV wall' },
    { name: 'Center Table', category: 'console', widthMM: 1200, depthMM: 600, heightMM: 400, material: 'Wood/Glass Top', color: '#333333', wall: 'center', description: 'Center table between sofa and TV unit' },
    { name: 'TV Unit', category: 'tv_unit', widthMM: 2100, depthMM: 400, heightMM: 450, material: 'Laminate + Back Panel', color: '#333333', wall: 'north', description: 'Wall-mounted TV unit with back panel feature wall' },
    { name: 'Bookshelf / Display Unit', category: 'bookshelf', widthMM: 900, depthMM: 300, heightMM: 1800, material: 'Laminate Finish', color: '#333333', wall: 'east', description: 'Open display shelving' },
    { name: 'Console Table', category: 'console', widthMM: 1200, depthMM: 350, heightMM: 850, material: 'Laminate Finish', color: '#333333', wall: 'west', description: 'Console table near entrance' },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: '55" TV',
      widthMM: 1230,
      depthMM: 60,
      heightMM: 710,
      mountHeightMM: 900,
      wall: 'north',
      material: 'Matte Black Frame',
      description: 'Wall-mounted flat-screen TV, centered on TV unit',
    },
    {
      name: 'Split AC Unit',
      widthMM: 900,
      depthMM: 250,
      heightMM: 300,
      mountHeightMM: 2400,
      wall: 'east',
      material: 'White Plastic Body',
      description: 'Wall-mounted split AC indoor unit',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 1000, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Laminate Flush Door' },
    { type: 'window', wall: 'west', widthMM: 1800, heightMM: 1200, sillHeightMM: 900, material: 'Aluminium Sliding / French, Clear Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'SEATING ZONE', description: 'Sofa + center table', color: 'warm beige tint' },
    { name: 'ENTERTAINMENT ZONE', description: 'TV unit wall', color: 'light blue tint' },
    { name: 'CIRCULATION', description: "Min 3'-0\" main pathway", color: 'dashed outline' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Vitrified Tiles', finish: 'Glossy', tileSize: '600×600 mm' },
      wallFinish: { name: interior?.wallFinish?.name || 'Emulsion Paint', finish: 'Matt' },
      accentWall: { name: 'PU Panel / Wallpaper / Textured Paint', description: 'TV feature wall treatment behind TV unit' },
    },
    keyDimensions: {},
    lighting: {
      description: 'Cove LED (warm white 3000K) around false ceiling perimeter, recessed downlights, wall-wash lights on feature wall',
      fixtures: ['Peripheral cove LED', 'Recessed downlights ×4', 'Feature wall-wash light'],
    },
    specificNotes: `TV wall opposite sofa. Main circulation path from entrance to other rooms. Sofa facing entertainment zone.`,
  };
}

function resolveGeneric(interior: RoomInterior | undefined): ResolvedRoomContent {
  return {
    furniture: mapGenericFurniture(interior),
    fixtures: [],
    openings: [
      { type: 'door', wall: 'south', widthMM: 900, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Laminate Flush Door' },
      { type: 'window', wall: 'north', widthMM: 1200, heightMM: 1200, sillHeightMM: 900, material: 'Aluminium Sliding, Clear Glass' },
    ],
    zones: [
      { name: 'MAIN ZONE', description: 'Primary function area', color: 'neutral tint' },
      { name: 'CIRCULATION', description: "Clear path minimum 2'-6\"", color: 'dashed outline' },
    ],
    materials: {
      flooring: { name: interior?.flooring?.name || 'Vitrified Tiles', finish: 'Glossy' },
      wallFinish: { name: interior?.wallFinish?.name || 'Emulsion Paint', finish: 'Matt' },
    },
    keyDimensions: {},
    lighting: {
      description: 'Warm white ceiling lights with accent lighting as needed',
      fixtures: ['Ceiling light point', 'Accent light'],
    },
    specificNotes: 'Generic room — layout follows configured furniture list.',
  };
}

/* ================================================================
   MAIN ENTRY POINT
   ================================================================ */

export function buildInteriorScene(
  room: Room,
  interior: RoomInterior | undefined,
  moodBoard: InteriorMoodBoard,
): InteriorScene {
  const widthFt = mToFtNum(room.width);
  const depthFt = mToFtNum(room.depth);
  const widthMM = Math.round(room.width * 1000);
  const depthMM = Math.round(room.depth * 1000);
  const areaSqft = sqmToSqft(room.width * room.depth);

  const { style, styleName, palette } = resolveStyle(interior, moodBoard);

  let resolved: ResolvedRoomContent;
  const defaultCeilingType = 'false_ceiling_peripheral';

  switch (room.type) {
    case 'toilet':
      resolved = resolveBathroom(areaSqft, interior);
      break;
    case 'kitchen':
      resolved = resolveKitchen(areaSqft, widthFt, interior);
      break;
    case 'master_bedroom':
      resolved = resolveBedroom(true, interior, style);
      break;
    case 'bedroom':
      resolved = resolveBedroom(false, interior, style);
      break;
    case 'hall':
      resolved = resolveLiving(interior, style);
      break;
    default:
      resolved = resolveGeneric(interior);
      break;
  }

  const ceilingType = interior?.ceilingType || defaultCeilingType;
  const isFalseCeiling = ceilingType !== 'plain';

  const materials: SceneMaterials = {
    flooring: resolved.materials.flooring || { name: 'Vitrified Tiles', finish: 'Glossy' },
    wallFinish: resolved.materials.wallFinish || { name: 'Emulsion Paint', finish: 'Matt' },
    accentWall: resolved.materials.accentWall,
    ceiling: {
      type: ceilingType,
      height: CLEAR_HEIGHT_MM,
      falseCeilingHeight: isFalseCeiling ? FALSE_CEILING_MM : undefined,
      finish: 'Gypsum board, matt paint finish',
    },
    countertop: resolved.materials.countertop,
  };

  const electricalPoints = interior?.electricalPoints || {
    switches: 2,
    sockets: 3,
    dataPoints: 1,
    lightPoints: 2,
    fanPoints: 1,
    acPoints: 0,
  };

  return {
    roomId: room.id,
    roomName: room.name,
    roomType: room.type,
    widthMM,
    depthMM,
    widthFt,
    depthFt,
    areaSqft,
    clearHeightMM: CLEAR_HEIGHT_MM,
    falseCeilingHeightMM: FALSE_CEILING_MM,
    wallThicknessMM: WALL_THICKNESS_MM,
    style,
    styleName,
    palette,
    materials,
    furniture: resolved.furniture,
    fixtures: resolved.fixtures,
    openings: resolved.openings,
    zones: resolved.zones,
    keyDimensions: resolved.keyDimensions,
    lighting: resolved.lighting,
    specificNotes: resolved.specificNotes,
    electricalPoints,
  };
}
