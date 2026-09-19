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

/* ----------------------------------------------------------------
   NEW RESOLVERS — residential extras (dining, pooja, study, balcony)
   ---------------------------------------------------------------- */

function resolveDining(
  areaSqft: number,
  interior: RoomInterior | undefined,
  moodBoardStyle: InteriorStyle,
): ResolvedRoomContent {
  const compact = areaSqft < 80;
  const seats = compact ? 4 : 6;
  const tableWidthMM = compact ? 1200 : 1800;
  const tableDepthMM = compact ? 750 : 900;

  const furniture: SceneFurnitureItem[] = [
    {
      name: `Dining Table (${seats}-Seater)`,
      category: 'dining_table',
      widthMM: tableWidthMM,
      depthMM: tableDepthMM,
      heightMM: 750,
      material: 'Engineered Wood Top + Metal/Wood Legs',
      color: '#6B4A2F',
      wall: 'center',
      description: `${seats}-seater dining table centered in the room, long axis parallel to the entry wall`,
    },
    {
      name: `Dining Chairs (Set of ${seats})`,
      category: 'dining_chair',
      widthMM: 450,
      depthMM: 500,
      heightMM: 900,
      material: 'Upholstered Seat, Wood/Metal Frame',
      color: '#3D3D3D',
      wall: 'center',
      description: `${seats} chairs arranged around the dining table, evenly spaced`,
    },
    {
      name: 'Sideboard / Crockery Unit',
      category: 'crockery',
      widthMM: compact ? 1200 : 1500,
      depthMM: 450,
      heightMM: 850,
      material: 'Marine Ply + Laminate Shutters, Glass-Front Upper Section',
      color: '#4A2C2A',
      wall: 'east',
      description: 'Crockery storage with display shelving above, positioned along the wall clear of the circulation path',
    },
    {
      name: 'Serving Console',
      category: 'console',
      widthMM: 900,
      depthMM: 400,
      heightMM: 800,
      material: 'Laminate Finish',
      color: '#333333',
      wall: 'west',
      description: 'Serving console for buffet-style plating, near the kitchen pass-through',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Pendant Light Cluster',
      widthMM: 600,
      depthMM: 600,
      heightMM: 400,
      mountHeightMM: 1900,
      wall: 'ceiling',
      material: 'Metal + Glass, Matte Black Finish',
      description: 'Cluster of 3 pendant lights hanging above the dining table centerline',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 900, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Laminate Flush Door' },
    { type: 'window', wall: 'east', widthMM: 1200, heightMM: 1200, sillHeightMM: 900, material: 'Aluminium Sliding, Clear Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'DINING ZONE', description: 'Table + chairs seating area', color: 'warm beige tint' },
    { name: 'SERVING ZONE', description: 'Sideboard + serving console', color: 'light yellow tint' },
    { name: 'CIRCULATION', description: "Min 2'-6\" clearance around table", color: 'dashed outline' },
  ];

  const accentWall =
    moodBoardStyle === 'contemporary_indian'
      ? { name: 'Textured Paint / Ethnic Wallpaper', description: 'Accent wall behind sideboard' }
      : moodBoardStyle === 'industrial'
      ? { name: 'Exposed Brick Cladding', description: 'Accent wall behind sideboard' }
      : { name: 'Feature Wallpaper / Panel Moulding', description: 'Accent wall behind sideboard' };

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Vitrified Tiles', finish: 'Glossy', tileSize: '600×600 mm' },
      wallFinish: { name: interior?.wallFinish?.name || 'Emulsion Paint', finish: 'Matt' },
      accentWall,
    },
    keyDimensions: {},
    lighting: {
      description: 'Warm white 3000K pendant cluster over table, peripheral cove LED, recessed downlights for ambient fill',
      fixtures: ['Pendant light cluster', 'Peripheral cove LED', 'Recessed downlights ×2'],
    },
    specificNotes: `${seats}-seater dining table centered with min 2'-6" clearance on all sides for chair pull-out. Sideboard positioned clear of the main circulation path.`,
  };
}

function resolvePooja(areaSqft: number, interior: RoomInterior | undefined): ResolvedRoomContent {
  const compact = areaSqft < 30;

  const furniture: SceneFurnitureItem[] = [
    {
      name: compact ? 'Wall-Mount Mandir Unit' : 'Mandir / Temple Unit',
      category: 'pooja_unit',
      widthMM: compact ? 900 : 1200,
      depthMM: compact ? 350 : 450,
      heightMM: compact ? 1500 : 1800,
      material: 'Carved Teak Wood, Natural Polish',
      color: '#5C3A21',
      wall: 'east',
      description: 'Temple unit on the east wall (Vastu-ideal), carved wood facade with deity alcove and door shutters',
    },
    {
      name: 'Storage Unit (Puja Accessories)',
      category: 'storage',
      widthMM: 600,
      depthMM: 350,
      heightMM: 450,
      material: 'Marine Ply + Laminate',
      color: '#4A2C2A',
      wall: 'east',
      description: 'Low storage below/beside the mandir for puja accessories and books',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Temple Bell (Ghanti)',
      widthMM: 150,
      depthMM: 150,
      heightMM: 250,
      mountHeightMM: 1800,
      wall: 'east',
      material: 'Brass',
      description: 'Hanging brass bell at the mandir entrance, rung on entering the prayer zone',
    },
    {
      name: 'Oil Lamp / Diya Shelf',
      widthMM: 400,
      depthMM: 150,
      heightMM: 100,
      mountHeightMM: 900,
      wall: 'east',
      material: 'Brass / Stone',
      description: 'Small ledge shelf for the oil lamp, positioned beside the mandir',
    },
    {
      name: 'Incense Holder',
      widthMM: 100,
      depthMM: 100,
      heightMM: 150,
      mountHeightMM: 900,
      wall: 'east',
      material: 'Brass',
      description: 'Agarbatti/incense stand on the offering shelf',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 750, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Carved Wood Flush Door' },
    { type: 'window', wall: 'east', widthMM: 450, heightMM: 450, sillHeightMM: 900, material: 'Aluminium Fixed, Clear Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'PRAYER ZONE', description: 'Floor seating / prayer mat facing the mandir', color: 'soft saffron tint' },
    { name: 'OFFERING ZONE', description: 'Mandir + offering shelf on the east wall', color: 'warm gold tint' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'White Marble', finish: 'Polished', tileSize: '600×600 mm' },
      wallFinish: { name: interior?.wallFinish?.name || 'Textured Paint with Motif Border', finish: 'Matt' },
      accentWall: { name: 'Marble / Stone Cladding with Temple Motif', description: 'Backdrop cladding behind the mandir unit' },
    },
    keyDimensions: {},
    lighting: {
      description: 'Warm white 2700K focused light on the mandir alcove, small brass diya-style accent lamp, soft ambient ceiling light',
      fixtures: ['Mandir alcove spotlight', 'Diya accent lamp', 'Ceiling light point'],
    },
    specificNotes: `Mandir on the east wall per Vastu; ${compact ? 'compact' : 'standard'} prayer room (${areaSqft} sq.ft) with floor seating/prayer mat in front, morning light from the east window.`,
  };
}

function resolveStudy(
  areaSqft: number,
  interior: RoomInterior | undefined,
  moodBoardStyle: InteriorStyle,
): ResolvedRoomContent {
  const compact = areaSqft < 60;

  const furniture: SceneFurnitureItem[] = [
    {
      name: 'Study Desk',
      category: 'study_table',
      widthMM: compact ? 1050 : 1350,
      depthMM: 600,
      heightMM: 750,
      material: 'Engineered Wood, Laminate Finish',
      color: '#3D3D3D',
      wall: 'north',
      description: 'Desk positioned against the window wall for natural daylight while working',
    },
    {
      name: 'Ergonomic Chair',
      category: 'chair',
      widthMM: 600,
      depthMM: 600,
      heightMM: 1100,
      material: 'Mesh Back, Adjustable Height',
      color: '#1A1A1A',
      wall: 'north',
      description: 'Task chair tucked under the desk, facing the window',
    },
    {
      name: 'Bookshelf',
      category: 'bookshelf',
      widthMM: 900,
      depthMM: 300,
      heightMM: 2000,
      material: 'Laminate Finish, Open Shelving',
      color: '#333333',
      wall: 'east',
      description: 'Full-height open bookshelf along the side wall',
    },
    {
      name: 'Filing Unit',
      category: 'filing_cabinet',
      widthMM: 450,
      depthMM: 450,
      heightMM: 650,
      material: 'Powder-Coated Steel / Laminate',
      color: '#4A4A4A',
      wall: 'west',
      description: 'Mobile 2-drawer filing cabinet under/beside the desk',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Desk Lamp',
      widthMM: 200,
      depthMM: 200,
      heightMM: 400,
      mountHeightMM: 750,
      wall: 'north',
      material: 'Metal, Adjustable Arm',
      description: 'Task lamp on the desk surface for focused reading light',
    },
    {
      name: 'Pin / Notice Board',
      widthMM: 900,
      depthMM: 30,
      heightMM: 600,
      mountHeightMM: 1200,
      wall: 'north',
      material: 'Cork Board, Wood Frame',
      description: 'Wall-mounted pin board above the desk for notes and schedules',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 900, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Laminate Flush Door' },
    { type: 'window', wall: 'north', widthMM: 1200, heightMM: 1200, sillHeightMM: 900, material: 'Aluminium Sliding, Clear Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'WORK ZONE', description: 'Desk + chair facing the window', color: 'light blue tint' },
    { name: 'READING/STORAGE ZONE', description: 'Bookshelf + filing unit', color: 'warm beige tint' },
  ];

  const accentWall =
    moodBoardStyle === 'industrial'
      ? { name: 'Exposed Brick / Metal Shelving Accent', description: 'Feature wall behind the bookshelf' }
      : { name: 'Textured Paint / Panel Moulding', description: 'Feature wall behind the bookshelf' };

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
      description: 'Task lamp on desk, recessed ceiling downlights for ambient fill, natural daylight from the north window',
      fixtures: ['Desk task lamp', 'Recessed downlights ×2'],
    },
    specificNotes: `Desk placed to catch north daylight without glare on screens. Min 750mm clearance behind the chair for movement. ${compact ? 'Compact' : 'Standard'} study room (${areaSqft} sq.ft).`,
  };
}

function resolveBalcony(areaSqft: number, interior: RoomInterior | undefined): ResolvedRoomContent {
  const compact = areaSqft < 25;

  const furniture: SceneFurnitureItem[] = [
    {
      name: 'Outdoor Chairs (Pair)',
      category: 'chair',
      widthMM: 500,
      depthMM: 500,
      heightMM: 800,
      material: 'Weather-Resistant Rattan/Metal',
      color: '#6B4A2F',
      wall: 'center',
      description: 'Pair of compact outdoor chairs facing the open railing side',
    },
    {
      name: 'Small Side Table',
      category: 'side_table',
      widthMM: compact ? 400 : 500,
      depthMM: compact ? 400 : 500,
      heightMM: 500,
      material: 'Weather-Resistant Metal/Wood',
      color: '#333333',
      wall: 'center',
      description: 'Small table between the two chairs',
    },
    {
      name: 'Planter Boxes',
      category: 'planter',
      widthMM: 300,
      depthMM: 300,
      heightMM: 400,
      material: 'Weatherproof Fibre/Terracotta',
      color: '#8B6914',
      wall: 'north',
      description: 'Row of planter boxes along the parapet/railing wall',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Railing (North)',
      widthMM: 2400,
      depthMM: 50,
      heightMM: 1000,
      mountHeightMM: 0,
      wall: 'north',
      material: 'MS/SS Balustrade with Glass Infill',
      description: 'Open-side safety railing, 1000mm high per code',
    },
    {
      name: 'Railing (East)',
      widthMM: 2400,
      depthMM: 50,
      heightMM: 1000,
      mountHeightMM: 0,
      wall: 'east',
      material: 'MS/SS Balustrade with Glass Infill',
      description: 'Open-side safety railing, 1000mm high per code',
    },
    {
      name: 'Ceiling Light',
      widthMM: 250,
      depthMM: 250,
      heightMM: 150,
      mountHeightMM: 2700,
      wall: 'ceiling',
      material: 'Weatherproof IP65 Fixture',
      description: 'Weatherproof ceiling light for evening use',
    },
  ];

  const openings: SceneOpening[] = [];

  const zones: SceneZone[] = [
    { name: 'SEATING ZONE', description: 'Chairs + side table facing the open side', color: 'light green tint' },
    { name: 'PLANTER ZONE', description: 'Planter boxes along the railing wall', color: 'warm green tint' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Anti-Skid Outdoor Tiles', finish: 'Matt Anti-Skid, Slope to Drain' },
      wallFinish: { name: interior?.wallFinish?.name || 'Weatherproof Exterior Paint', finish: 'Matt' },
    },
    keyDimensions: {},
    lighting: {
      description: 'Weatherproof IP65 ceiling light for ambient evening lighting',
      fixtures: ['Weatherproof ceiling light'],
    },
    specificNotes: `Open balcony accessed via sliding/French door from the adjoining room (no independent door of its own). Railing 1000mm high on the open north/east sides. ${compact ? 'Compact' : 'Standard'} balcony (${areaSqft} sq.ft).`,
  };
}

/* ----------------------------------------------------------------
   NEW RESOLVERS — office room types
   ---------------------------------------------------------------- */

function resolveOfficeCabin(
  areaSqft: number,
  interior: RoomInterior | undefined,
  moodBoardStyle: InteriorStyle,
): ResolvedRoomContent {
  const compact = areaSqft < 120;

  const furniture: SceneFurnitureItem[] = [
    {
      name: 'Executive Desk',
      category: 'study_table',
      widthMM: compact ? 1500 : 1800,
      depthMM: 800,
      heightMM: 750,
      material: 'Engineered Wood, Veneer Finish',
      color: '#3D2B1F',
      wall: 'north',
      description: 'Executive desk facing the door, back to the window wall',
    },
    {
      name: 'Executive Chair',
      category: 'chair',
      widthMM: 650,
      depthMM: 650,
      heightMM: 1150,
      material: 'Leather Upholstery, High-Back',
      color: '#1A1A1A',
      wall: 'north',
      description: 'High-back executive chair behind the desk',
    },
    {
      name: 'Visitor Chairs (Pair)',
      category: 'chair',
      widthMM: 550,
      depthMM: 550,
      heightMM: 900,
      material: 'Fabric Upholstery, Metal Frame',
      color: '#8B6914',
      wall: 'south',
      description: 'Two visitor chairs facing the desk across from the executive chair',
    },
    {
      name: 'Filing Cabinet',
      category: 'filing_cabinet',
      widthMM: 900,
      depthMM: 450,
      heightMM: 1200,
      material: 'Powder-Coated Steel / Laminate',
      color: '#4A4A4A',
      wall: 'west',
      description: 'Lockable filing cabinet along the side wall',
    },
    {
      name: 'Bookshelf / Display Unit',
      category: 'bookshelf',
      widthMM: 900,
      depthMM: 350,
      heightMM: 1800,
      material: 'Laminate Finish',
      color: '#333333',
      wall: 'east',
      description: 'Display shelving for awards, books, and decor',
    },
  ];

  if (!compact) {
    furniture.push({
      name: 'Small Meeting Table (4-Seater)',
      category: 'conference_table',
      widthMM: 1200,
      depthMM: 900,
      heightMM: 750,
      material: 'Engineered Wood, Veneer Finish',
      color: '#3D2B1F',
      wall: 'east',
      description: '4-seater round/rectangular meeting table for informal discussions within the cabin',
    });
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
    {
      name: 'Nameplate / Logo Panel',
      widthMM: 600,
      depthMM: 20,
      heightMM: 300,
      mountHeightMM: 1600,
      wall: 'north',
      material: 'Acrylic / Backlit Signage',
      description: 'Designation nameplate mounted on the wall behind the desk',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 900, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Glazed Aluminium-Framed Door' },
    { type: 'window', wall: 'north', widthMM: 1500, heightMM: 1200, sillHeightMM: 900, material: 'Aluminium Sliding, Clear Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'WORK ZONE', description: 'Executive desk + chair', color: 'light blue tint' },
    { name: 'MEETING ZONE', description: compact ? 'Visitor chairs facing desk' : 'Visitor chairs + small meeting table', color: 'warm beige tint' },
  ];

  const accentWall =
    moodBoardStyle === 'contemporary_indian'
      ? { name: 'Textured Paint / Wood Panel Moulding', description: 'Feature wall behind the executive desk' }
      : moodBoardStyle === 'industrial'
      ? { name: 'Exposed Concrete / Metal Cladding', description: 'Feature wall behind the executive desk' }
      : { name: 'Veneer Panel with Backlit Logo', description: 'Feature wall behind the executive desk' };

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Engineered Wood / Laminate Flooring', finish: 'Matt Natural' },
      wallFinish: { name: interior?.wallFinish?.name || 'Premium Emulsion Paint', finish: 'Matt' },
      accentWall,
    },
    keyDimensions: {},
    lighting: {
      description: 'Recessed ceiling downlights over the desk and meeting area, warm white 3000K, peripheral cove LED',
      fixtures: ['Recessed downlights ×3', 'Peripheral cove LED'],
    },
    specificNotes: `${compact ? 'Compact' : 'Standard'} executive cabin (${areaSqft} sq.ft). Desk faces the door for visibility; visitor seating faces the desk across the cabin.`,
  };
}

function resolveConference(areaSqft: number, interior: RoomInterior | undefined): ResolvedRoomContent {
  const large = areaSqft >= 200;
  const seats = large ? 10 : 6;

  const furniture: SceneFurnitureItem[] = [
    {
      name: `Conference Table (${seats}-Seater)`,
      category: 'conference_table',
      widthMM: large ? 4200 : 2400,
      depthMM: 1200,
      heightMM: 750,
      material: 'Engineered Wood, Veneer Finish',
      color: '#3D2B1F',
      wall: 'center',
      description: `${seats}-seater conference table centered in the room, long axis parallel to the presentation wall`,
    },
    {
      name: `Conference Chairs (Set of ${seats})`,
      category: 'chair',
      widthMM: 600,
      depthMM: 600,
      heightMM: 1050,
      material: 'Mesh Back, Adjustable Height',
      color: '#1A1A1A',
      wall: 'center',
      description: `${seats} chairs arranged around the conference table`,
    },
    {
      name: 'Credenza / Side Cabinet',
      category: 'console',
      widthMM: large ? 1800 : 1200,
      depthMM: 450,
      heightMM: 800,
      material: 'Laminate Finish',
      color: '#333333',
      wall: 'west',
      description: 'Storage credenza for AV equipment, stationery, and refreshments',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: large ? '75" Presentation Screen' : '55" Presentation Screen',
      widthMM: large ? 1680 : 1230,
      depthMM: 60,
      heightMM: large ? 970 : 710,
      mountHeightMM: 1000,
      wall: 'north',
      material: 'Matte Black Frame',
      description: 'Wall-mounted display for presentations and video conferencing, centered on the table',
    },
    {
      name: 'Whiteboard',
      widthMM: 1800,
      depthMM: 30,
      heightMM: 1200,
      mountHeightMM: 900,
      wall: 'east',
      material: 'Melamine Whiteboard, Aluminium Frame',
      description: 'Wall-mounted whiteboard for notes and diagrams',
    },
    {
      name: 'Split AC Unit',
      widthMM: 900,
      depthMM: 250,
      heightMM: 300,
      mountHeightMM: 2400,
      wall: 'west',
      material: 'White Plastic Body',
      description: 'Wall-mounted split AC indoor unit',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 1000, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Glazed Aluminium-Framed Door' },
    { type: 'window', wall: 'north', widthMM: 1200, heightMM: 900, sillHeightMM: 900, material: 'Frosted Glass, Aluminium Frame' },
  ];

  const zones: SceneZone[] = [
    { name: 'MEETING ZONE', description: 'Conference table + chairs', color: 'light blue tint' },
    { name: 'PRESENTATION ZONE', description: 'Screen + whiteboard wall', color: 'warm beige tint' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Carpet Tiles', finish: 'Loop Pile, Acoustic' },
      wallFinish: { name: interior?.wallFinish?.name || 'Acoustic Panel + Emulsion Paint', finish: 'Matt' },
    },
    keyDimensions: {},
    lighting: {
      description: 'Recessed ceiling downlights with dimmer control, indirect cove lighting to reduce screen glare',
      fixtures: ['Recessed dimmable downlights ×4', 'Peripheral cove LED'],
    },
    specificNotes: `${large ? 'Large' : 'Small'} conference room (${areaSqft} sq.ft) seating ${seats}. Presentation screen centered on the north wall, visible from every seat.`,
  };
}

function resolveReception(
  areaSqft: number,
  interior: RoomInterior | undefined,
  moodBoardStyle: InteriorStyle,
): ResolvedRoomContent {
  const compact = areaSqft < 150;

  const furniture: SceneFurnitureItem[] = [
    {
      name: 'Reception Desk',
      category: 'reception_desk',
      widthMM: compact ? 1800 : 2400,
      depthMM: 700,
      heightMM: 1100,
      material: 'Laminate + Stone/Corian Countertop',
      color: '#333333',
      wall: 'north',
      description: 'Reception counter facing the main entrance, staffed side against the north wall',
    },
    {
      name: 'Waiting Sofa (3-Seater)',
      category: 'sofa',
      widthMM: 1800,
      depthMM: 800,
      heightMM: 800,
      material: 'Fabric Upholstery',
      color: '#C4A882',
      wall: 'west',
      description: 'Waiting area seating for visitors',
    },
    {
      name: 'Coffee Table',
      category: 'console',
      widthMM: 900,
      depthMM: 500,
      heightMM: 400,
      material: 'Wood/Glass Top',
      color: '#333333',
      wall: 'center',
      description: 'Coffee table in front of the waiting sofa',
    },
    {
      name: 'Single Waiting Chairs (Pair)',
      category: 'chair',
      widthMM: 600,
      depthMM: 600,
      heightMM: 800,
      material: 'Fabric Upholstery, Metal Frame',
      color: '#8B6914',
      wall: 'east',
      description: 'Additional single seating for overflow visitors',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Company Signage / Logo Wall',
      widthMM: 1500,
      depthMM: 30,
      heightMM: 800,
      mountHeightMM: 1200,
      wall: 'north',
      material: 'Backlit Acrylic / Metal Letters',
      description: 'Illuminated company logo mounted behind the reception desk',
    },
    {
      name: 'Planter',
      widthMM: 400,
      depthMM: 400,
      heightMM: 900,
      mountHeightMM: 0,
      wall: 'east',
      material: 'Ceramic Pot + Live/Artificial Plant',
      description: 'Floor planter near the waiting area',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 1200, heightMM: 2100, sillHeightMM: 0, openDirection: 'outward', material: 'Glazed Aluminium-Framed Double Door' },
    { type: 'window', wall: 'east', widthMM: 1800, heightMM: 1200, sillHeightMM: 900, material: 'Aluminium Framed, Clear Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'RECEPTION ZONE', description: 'Reception desk facing the entrance', color: 'light blue tint' },
    { name: 'WAITING ZONE', description: 'Sofa + chairs + coffee table', color: 'warm beige tint' },
  ];

  const accentWall =
    moodBoardStyle === 'industrial'
      ? { name: 'Exposed Brick / Metal Cladding with Backlit Logo', description: 'Feature wall behind the reception desk' }
      : { name: 'Stone Cladding / Veneer Panel with Backlit Logo', description: 'Feature wall behind the reception desk' };

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Polished Vitrified Tiles', finish: 'Glossy', tileSize: '800×800 mm' },
      wallFinish: { name: interior?.wallFinish?.name || 'Designer Wallpaper / Stone Cladding', finish: 'Matt' },
      accentWall,
    },
    keyDimensions: {},
    lighting: {
      description: 'Backlit signage wall, recessed downlights over the desk and waiting area, warm white 3000K accent on planters',
      fixtures: ['Backlit logo signage', 'Recessed downlights ×4', 'Accent planter light'],
    },
    specificNotes: `${compact ? 'Compact' : 'Standard'} reception (${areaSqft} sq.ft). Desk visible and reachable immediately from the main entrance; waiting area kept clear of the entry path.`,
  };
}

function resolvePantry(areaSqft: number, interior: RoomInterior | undefined): ResolvedRoomContent {
  const compact = areaSqft < 60;

  const furniture: SceneFurnitureItem[] = [
    {
      name: 'Pantry Counter with Cabinets',
      category: 'kitchen_cabinet',
      widthMM: compact ? 1500 : 1800,
      depthMM: 600,
      heightMM: 850,
      material: 'Marine Ply Carcass + Laminate Shutters',
      color: '#2E3440',
      wall: 'south',
      description: 'Base cabinets with countertop for tea/coffee prep, sink, and small appliance storage',
    },
    {
      name: 'Small Dining Table (4-Seater)',
      category: 'dining_table',
      widthMM: compact ? 900 : 1200,
      depthMM: 750,
      heightMM: 750,
      material: 'Laminate Finish',
      color: '#6B4A2F',
      wall: 'center',
      description: 'Compact table for staff to eat/take breaks',
    },
    {
      name: 'Dining Chairs (Set of 4)',
      category: 'dining_chair',
      widthMM: 420,
      depthMM: 450,
      heightMM: 850,
      material: 'Laminate/Plastic Shell, Metal Frame',
      color: '#3D3D3D',
      wall: 'center',
      description: '4 chairs arranged around the small dining table',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'SS Under-Mount Sink',
      widthMM: 500,
      depthMM: 400,
      heightMM: 200,
      mountHeightMM: 650,
      wall: 'south',
      material: 'SS 304, Satin Finish',
      description: 'Single-bowl sink with gooseneck mixer faucet',
    },
    {
      name: 'Microwave Shelf',
      widthMM: 500,
      depthMM: 450,
      heightMM: 350,
      mountHeightMM: 900,
      wall: 'south',
      material: 'Laminate Finish',
      description: 'Open shelf above the counter for the microwave',
    },
    {
      name: 'Under-Counter Refrigerator',
      widthMM: 550,
      depthMM: 550,
      heightMM: 850,
      mountHeightMM: 0,
      wall: 'south',
      material: 'Stainless Steel Body',
      description: 'Small under-counter refrigerator zone at the end of the counter run',
    },
    {
      name: 'Water Dispenser',
      widthMM: 350,
      depthMM: 350,
      heightMM: 1000,
      mountHeightMM: 0,
      wall: 'west',
      material: 'Plastic/Steel Body',
      description: 'Hot & cold water dispenser, floor-standing',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 900, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Laminate Flush Door' },
    { type: 'window', wall: 'north', widthMM: 900, heightMM: 900, sillHeightMM: 900, material: 'Aluminium Sliding, Frosted Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'PREP ZONE', description: 'Counter + sink + microwave', color: 'warm orange tint' },
    { name: 'EATING ZONE', description: 'Small dining table + chairs', color: 'light green tint' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Anti-Skid Vitrified Tiles', finish: 'Matt Anti-Skid', tileSize: '600×600 mm' },
      wallFinish: { name: interior?.wallFinish?.name || 'Dado Tiles + Paint', finish: 'Glossy dado, paint above' },
      countertop: { name: 'Polished Quartz', thickness: 20, finish: 'Polished' },
    },
    keyDimensions: { counterHeight: 850 },
    lighting: {
      description: 'Recessed ceiling downlights over the counter and dining table, warm white 3000K',
      fixtures: ['Recessed downlights ×3'],
    },
    specificNotes: `${compact ? 'Compact' : 'Standard'} office pantry (${areaSqft} sq.ft). Counter run along the south wall; small dining table kept clear of the counter workspace.`,
  };
}

function resolveOpenOffice(areaSqft: number, interior: RoomInterior | undefined): ResolvedRoomContent {
  const clusters = Math.max(1, Math.round(areaSqft / 60));

  const furniture: SceneFurnitureItem[] = [
    {
      name: `Workstation Clusters (4-Person Bench Desks ×${clusters})`,
      category: 'workstation',
      widthMM: 2800,
      depthMM: 2800,
      heightMM: 750,
      material: 'Laminate Worktop + Metal Frame Legs',
      color: '#D9D2C4',
      wall: 'center',
      description: `${clusters} back-to-back 4-person bench desk clusters arranged in a grid across the floor plate`,
    },
    {
      name: 'Partition Panels',
      category: 'partition',
      widthMM: 1200,
      depthMM: 30,
      heightMM: 1200,
      material: 'Fabric-Wrapped Acoustic Panel, Metal Frame',
      color: '#8C8C8C',
      wall: 'center',
      description: 'Low acoustic screens between workstation benches for visual/sound separation',
    },
    {
      name: 'Shared Printer Zone Unit',
      category: 'printer_stand',
      widthMM: 900,
      depthMM: 600,
      heightMM: 900,
      material: 'Laminate Finish',
      color: '#333333',
      wall: 'east',
      description: 'Shared printer/scanner station with stationery storage below',
    },
    {
      name: 'Breakout Seating (Pair + Table)',
      category: 'breakout',
      widthMM: 1400,
      depthMM: 700,
      heightMM: 800,
      material: 'Fabric Upholstery + Laminate Table',
      color: '#C4A882',
      wall: 'west',
      description: 'Informal breakout seating for quick huddles, away from the main desk grid',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Split AC Units (Multiple)',
      widthMM: 900,
      depthMM: 250,
      heightMM: 300,
      mountHeightMM: 2400,
      wall: 'north',
      material: 'White Plastic Body',
      description: 'Wall-mounted split AC indoor units distributed across the north wall',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 1000, heightMM: 2100, sillHeightMM: 0, openDirection: 'inward', material: 'Glazed Aluminium-Framed Door' },
    { type: 'window', wall: 'north', widthMM: 2400, heightMM: 1200, sillHeightMM: 900, material: 'Aluminium Framed, Clear Glass' },
  ];

  const zones: SceneZone[] = [
    { name: 'WORKSTATION ZONE', description: `${clusters} bench-desk clusters in a grid layout`, color: 'light blue tint' },
    { name: 'CIRCULATION', description: "Min 3'-6\" main aisles between desk rows", color: 'dashed outline' },
    { name: 'BREAKOUT ZONE', description: 'Informal seating away from the desk grid', color: 'warm beige tint' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Carpet Tiles / Anti-Static Raised Flooring', finish: 'Loop Pile' },
      wallFinish: { name: interior?.wallFinish?.name || 'Emulsion Paint', finish: 'Matt' },
    },
    keyDimensions: {},
    lighting: {
      description: 'Suspended linear LED fixtures over desk rows, recessed downlights in breakout zone, daylight-linked dimming near windows',
      fixtures: ['Suspended linear LED ×' + clusters, 'Recessed downlights ×2 (breakout)'],
    },
    specificNotes: `Open office floor plate (${areaSqft} sq.ft) with ${clusters} desk cluster(s). Main aisles min 3'-6" wide; breakout seating kept clear of the primary circulation path.`,
  };
}

function resolveServerRoom(areaSqft: number, interior: RoomInterior | undefined): ResolvedRoomContent {
  const racks = Math.max(1, Math.round(areaSqft / 20));

  const furniture: SceneFurnitureItem[] = [
    {
      name: `Server Rack Enclosures (×${racks})`,
      category: 'server_rack',
      widthMM: 600,
      depthMM: 1000,
      heightMM: 2000,
      material: 'Powder-Coated Steel, 42U Enclosure',
      color: '#1A1A1A',
      wall: 'east',
      description: `${racks} 42U server rack enclosures lined along the wall with rear service clearance`,
    },
    {
      name: 'UPS Unit',
      category: 'ups',
      widthMM: 800,
      depthMM: 600,
      heightMM: 1000,
      material: 'Powder-Coated Steel Cabinet',
      color: '#2E2E2E',
      wall: 'west',
      description: 'Uninterruptible power supply unit with battery bank',
    },
  ];

  const fixtures: SceneFixture[] = [
    {
      name: 'Overhead Cable Tray',
      widthMM: 300,
      depthMM: 100,
      heightMM: 100,
      mountHeightMM: 2600,
      wall: 'ceiling',
      material: 'Perforated Galvanised Steel',
      description: 'Overhead cable tray routing power and data cabling to the racks',
    },
    {
      name: 'Precision Cooling / Split AC Unit',
      widthMM: 900,
      depthMM: 250,
      heightMM: 300,
      mountHeightMM: 2400,
      wall: 'north',
      material: 'White Plastic Body, Dedicated Precision Unit',
      description: 'Dedicated cooling unit maintaining constant temperature/humidity for the racks',
    },
    {
      name: 'Fire Suppression Panel',
      widthMM: 400,
      depthMM: 150,
      heightMM: 500,
      mountHeightMM: 1500,
      wall: 'south',
      material: 'Clean-Agent (FM200) Control Panel',
      description: 'Clean-agent fire suppression control panel near the entry',
    },
    {
      name: 'Raised Access Flooring',
      widthMM: 600,
      depthMM: 600,
      heightMM: 150,
      mountHeightMM: 0,
      wall: 'floor',
      material: 'Anti-Static Raised Floor Panels on Pedestals',
      description: '600×600mm raised floor panels for under-floor cabling and cooling airflow',
    },
  ];

  const openings: SceneOpening[] = [
    { type: 'door', wall: 'south', widthMM: 900, heightMM: 2100, sillHeightMM: 0, openDirection: 'outward', material: 'Fire-Rated Steel Door with Access Control' },
  ];

  const zones: SceneZone[] = [
    { name: 'RACK ZONE', description: `${racks} server rack enclosure(s) along the wall`, color: 'cool grey tint' },
    { name: 'COOLING ZONE', description: 'Precision cooling unit airflow path', color: 'light blue tint' },
    { name: 'ACCESS ZONE', description: 'Clear service aisle in front of the racks', color: 'dashed outline' },
  ];

  return {
    furniture,
    fixtures,
    openings,
    zones,
    materials: {
      flooring: { name: interior?.flooring?.name || 'Anti-Static Raised Access Flooring', finish: 'Anti-Static, 600×600mm Panels' },
      wallFinish: { name: interior?.wallFinish?.name || 'Fire-Rated Board + Paint', finish: 'Matt' },
    },
    keyDimensions: {},
    lighting: {
      description: 'Bright uniform ceiling lighting for maintenance visibility, emergency battery-backed light',
      fixtures: ['Ceiling light points ×' + Math.max(2, racks), 'Emergency battery light'],
    },
    specificNotes: `No windows for security/thermal control. Racks require min 1000mm rear and front service clearance. ${racks} rack enclosure(s) sized to a ${areaSqft} sq.ft room.`,
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

  // NOTE: 'pooja', 'study', 'cabin', 'conference', 'open_office', and
  // 'server_room' are not yet part of the `RoomType` / `OfficeRoomType`
  // unions in types.ts ('puja' is the existing residential literal, and
  // the office-room enum uses different literals such as 'cabin_manager',
  // 'conference_small', etc.). Those unions need to be broadened for this
  // switch to type-check without `room.type` being widened/cast. See the
  // Feedback section of the delegated task for details.
  switch (room.type as string) {
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
    case 'dining':
      resolved = resolveDining(areaSqft, interior, style);
      break;
    case 'puja':
      resolved = resolvePooja(areaSqft, interior);
      break;
    case 'study':
      resolved = resolveStudy(areaSqft, interior, style);
      break;
    case 'balcony':
      resolved = resolveBalcony(areaSqft, interior);
      break;
    case 'cabin_manager':
    case 'cabin_director':
    case 'cabin_md':
      resolved = resolveOfficeCabin(areaSqft, interior, style);
      break;
    case 'conference_small':
    case 'conference_large':
    case 'board_room':
      resolved = resolveConference(areaSqft, interior);
      break;
    case 'reception':
      resolved = resolveReception(areaSqft, interior, style);
      break;
    case 'pantry':
      resolved = resolvePantry(areaSqft, interior);
      break;
    case 'workstation_open':
      resolved = resolveOpenOffice(areaSqft, interior);
      break;
    case 'server_room':
      resolved = resolveServerRoom(areaSqft, interior);
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

  // Room-type-specific electrical defaults
  const defaultElectrical = (() => {
    switch (room.type as string) {
      case 'toilet':
        return { switches: 2, sockets: 1, dataPoints: 0, lightPoints: 2, fanPoints: 0, acPoints: 0 };
        // Bathrooms: exhaust fan (not ceiling fan) is in fixtures, no data points needed
      case 'kitchen':
        return { switches: 3, sockets: 4, dataPoints: 0, lightPoints: 3, fanPoints: 0, acPoints: 0 };
        // Kitchens: chimney/exhaust in fixtures, multiple sockets for appliances
      case 'master_bedroom':
        return { switches: 4, sockets: 4, dataPoints: 1, lightPoints: 3, fanPoints: 1, acPoints: 1 };
      case 'bedroom':
        return { switches: 3, sockets: 3, dataPoints: 1, lightPoints: 2, fanPoints: 1, acPoints: 1 };
      case 'hall':
        return { switches: 4, sockets: 4, dataPoints: 1, lightPoints: 4, fanPoints: 1, acPoints: 1 };
      case 'dining':
        return { switches: 3, sockets: 3, dataPoints: 0, lightPoints: 3, fanPoints: 1, acPoints: 0 };
        // Dining: pendant light circuit + ambient, ceiling fan, no AC by default
      case 'puja':
        return { switches: 2, sockets: 1, dataPoints: 0, lightPoints: 2, fanPoints: 0, acPoints: 0 };
        // Pooja room: focused mandir light + ambient light, no fan/AC typically
      case 'study':
        return { switches: 3, sockets: 4, dataPoints: 2, lightPoints: 2, fanPoints: 1, acPoints: 1 };
        // Study: extra sockets/data points for laptop, monitor, router
      case 'balcony':
        return { switches: 1, sockets: 1, dataPoints: 0, lightPoints: 1, fanPoints: 0, acPoints: 0 };
        // Balcony: single weatherproof light point + socket for outdoor use
      case 'cabin_manager':
    case 'cabin_director':
    case 'cabin_md':
        return { switches: 3, sockets: 5, dataPoints: 2, lightPoints: 3, fanPoints: 0, acPoints: 1 };
        // Cabin: sockets/data for desk, laptop, printer; dedicated split AC
      case 'conference_small':
    case 'conference_large':
    case 'board_room':
        return { switches: 3, sockets: 8, dataPoints: 4, lightPoints: 4, fanPoints: 0, acPoints: 1 };
        // Conference: many sockets/data points for laptops + AV equipment
      case 'reception':
        return { switches: 3, sockets: 4, dataPoints: 2, lightPoints: 4, fanPoints: 0, acPoints: 1 };
        // Reception: desk sockets/data, signage lighting circuit
      case 'pantry':
        return { switches: 3, sockets: 6, dataPoints: 0, lightPoints: 3, fanPoints: 1, acPoints: 0 };
        // Pantry: sockets for microwave, fridge, water dispenser, kettle
      case 'workstation_open':
        return { switches: 4, sockets: 12, dataPoints: 8, lightPoints: 6, fanPoints: 0, acPoints: 2 };
        // Open office: per-cluster sockets/data points, multiple AC points across the floor
      case 'server_room':
        return { switches: 2, sockets: 6, dataPoints: 0, lightPoints: 3, fanPoints: 0, acPoints: 2 };
        // Server room: dedicated UPS-backed sockets, precision cooling AC points, no ceiling fan
      default:
        return { switches: 2, sockets: 3, dataPoints: 1, lightPoints: 2, fanPoints: 1, acPoints: 0 };
    }
  })();
  const electricalPoints = interior?.electricalPoints || defaultElectrical;

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
