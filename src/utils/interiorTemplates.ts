import type {
  InteriorStyle,
  InteriorMoodBoard,
  RoomFinishType,
  RoomType,
  FurnitureItem,
  MaterialSpec,
  ColorPalette,
} from '../types';

/* ================================================================
   STYLE TEMPLATES
   ================================================================ */

const modernMinimalistPalette: ColorPalette = {
  primary: '#C4A882',
  secondary: '#333333',
  accent: '#D4A853',
  wall: '#FFFFFF',
  ceiling: '#F5F5F5',
  name: 'Modern Neutrals',
};

const contemporaryIndianPalette: ColorPalette = {
  primary: '#8B6914',
  secondary: '#CD5C45',
  accent: '#DAA520',
  wall: '#FFF8E7',
  ceiling: '#FFFFF0',
  name: 'Warm Indian Tones',
};

const traditionalPalette: ColorPalette = {
  primary: '#4A2C2A',
  secondary: '#800020',
  accent: '#C9A84C',
  wall: '#F5E6D3',
  ceiling: '#FFFFFF',
  name: 'Classic Heritage',
};

const industrialPalette: ColorPalette = {
  primary: '#A0785A',
  secondary: '#1A1A1A',
  accent: '#B7410E',
  wall: '#E8E8E8',
  ceiling: '#C0C0C0',
  name: 'Urban Raw',
};

const scandinavianPalette: ColorPalette = {
  primary: '#D4B896',
  secondary: '#7BA7BC',
  accent: '#9DC183',
  wall: '#FFFFFF',
  ceiling: '#FFFFFF',
  name: 'Nordic Light',
};

export const STYLE_TEMPLATES: Record<InteriorStyle, InteriorMoodBoard> = {
  modern_minimalist: {
    style: 'modern_minimalist',
    styleName: 'Modern Minimalist',
    description:
      'Clean lines, minimal décor, and integrated storage define this style. Neutral tones with warm wood accents and brass highlights create a sophisticated, clutter-free interior with concealed lighting and handleless cabinetry.',
    palette: modernMinimalistPalette,
    keyMaterials: [
      'Italian vitrified tiles (600×1200 mm)',
      'PU finish laminates',
      'Handleless profile cabinets',
      'Concealed LED strip lights',
      'Back-painted glass panels',
      'Micro-cement texture walls',
    ],
    keyFurniture: [
      'Platform bed with integrated headboard storage',
      'Wall-mounted floating TV unit',
      'Modular L-shape sofa in neutral fabric',
      'Handleless wardrobes with internal organisers',
      'Slim-profile console tables',
    ],
    imagePrompt:
      'Ultra-modern minimalist Indian apartment interior, white walls, warm wood accents, brass fixtures, concealed LED lighting, handleless cabinets, Italian vitrified flooring, clean geometric lines, large windows with sheer curtains, professional interior photography, 8k',
  },

  contemporary_indian: {
    style: 'contemporary_indian',
    styleName: 'Contemporary Indian',
    description:
      'A modern interpretation of Indian design traditions — solid teak furniture meets contemporary silhouettes, brass hardware complements jali patterns, and handloom textiles add warmth. Terracotta and gold accents tie the palette together.',
    palette: contemporaryIndianPalette,
    keyMaterials: [
      'Indian marble / granite flooring',
      'Solid teak wood furniture',
      'Brass hardware and fixtures',
      'Jali (lattice) pattern screens',
      'Handloom textile upholstery',
      'Ethnic printed wallpapers',
    ],
    keyFurniture: [
      'Teak king bed with carved headboard',
      'Brass-inlay console table',
      'Jali-panel wardrobe doors',
      'Cane-back dining chairs',
      'Carved wooden pooja mandir',
    ],
    imagePrompt:
      'Contemporary Indian apartment interior, warm cream walls, teak wood furniture, brass accents, jali pattern screens, terracotta pots, handloom cushions, Indian marble flooring, gold accents, ambient lighting, professional photography, 8k',
  },

  traditional: {
    style: 'traditional',
    styleName: 'Traditional',
    description:
      'Classic Indian traditional interiors with richly carved wood furniture, ornate hardware, granite and marble surfaces, deep maroon fabrics, and antique gold embellishments. A grand, opulent atmosphere.',
    palette: traditionalPalette,
    keyMaterials: [
      'Granite / marble flooring',
      'Carved solid wood furniture',
      'Ornate brass / antique hardware',
      'Rich silk and brocade fabrics',
      'POP cornices and ceiling medallions',
      'Hand-painted tiles',
    ],
    keyFurniture: [
      'Four-poster carved king bed',
      'Ornate rosewood wardrobe',
      'Carved diwan-style sofa set',
      'Marble-top dining table with carved legs',
      'Traditional wooden swing (jhula)',
    ],
    imagePrompt:
      'Traditional Indian luxury apartment interior, carved dark wood furniture, marble flooring, ornate gold hardware, deep maroon silk upholstery, POP ceiling with cornices, antique brass lamps, rich textures, grand and opulent, professional photography, 8k',
  },

  industrial: {
    style: 'industrial',
    styleName: 'Industrial',
    description:
      'Urban loft aesthetics with raw textures — exposed concrete, brick walls, black steel frames, and reclaimed wood. Statement pendant lighting and metal fixtures anchor the design.',
    palette: industrialPalette,
    keyMaterials: [
      'Concrete finish tiles / micro-cement',
      'Metal fixtures and black steel frames',
      'Exposed brick or brick-look cladding',
      'Raw / reclaimed wood shelving',
      'Black matte hardware',
      'Edison-bulb pendant lights',
    ],
    keyFurniture: [
      'Steel-frame platform bed with wood slats',
      'Reclaimed wood and metal TV unit',
      'Leather and steel bar stools',
      'Pipe-frame open bookshelf',
      'Industrial metal locker wardrobe',
    ],
    imagePrompt:
      'Industrial loft style Indian apartment interior, exposed concrete ceiling, brick accent wall, black steel frame furniture, reclaimed wood shelves, Edison bulb pendant lights, raw textures, urban feel, professional photography, 8k',
  },

  scandinavian: {
    style: 'scandinavian',
    styleName: 'Scandinavian',
    description:
      'Light, airy, and functional — white surfaces, light oak wood, natural linen and cotton textiles, woven rugs, and pops of dusty blue and sage green. Hygge-inspired warmth with maximal natural light.',
    palette: scandinavianPalette,
    keyMaterials: [
      'Light oak wood flooring / laminate',
      'Matt white cabinets',
      'Natural linen and cotton textiles',
      'Woven jute / wool rugs',
      'Ceramic tiles in white and pastel',
      'Birch plywood accents',
    ],
    keyFurniture: [
      'Slim oak-leg platform bed',
      'White matt finish wardrobe with wooden handles',
      'Linen upholstered sofa in light grey',
      'Round oak dining table with spindle chairs',
      'Open-frame oak bookshelf',
    ],
    imagePrompt:
      'Scandinavian style Indian apartment interior, pure white walls, light oak wood flooring, natural linen textiles, woven rug, dusty blue and sage accents, large windows with sheer curtains, indoor plants, hygge warmth, professional photography, 8k',
  },
};

/* ================================================================
   HELPERS
   ================================================================ */

let _furnitureIdCounter = 0;
function nextFurnitureId(): string {
  _furnitureIdCounter += 1;
  return `furn_${_furnitureIdCounter}`;
}

/** Style-based cost multiplier (base = Modern Minimalist 1.0) */
function costMultiplier(style: InteriorStyle): number {
  switch (style) {
    case 'modern_minimalist':
      return 1.0;
    case 'contemporary_indian':
      return 1.5;
    case 'traditional':
      return 1.8;
    case 'industrial':
      return 0.9;
    case 'scandinavian':
      return 1.2;
  }
}

function furnitureColor(style: InteriorStyle): string {
  return STYLE_TEMPLATES[style].palette.primary;
}

function furnitureMaterial(style: InteriorStyle): string {
  switch (style) {
    case 'modern_minimalist':
      return 'Plywood + PU Laminate';
    case 'contemporary_indian':
      return 'Solid Teak + Veneer';
    case 'traditional':
      return 'Solid Rosewood / Sheesham';
    case 'industrial':
      return 'Reclaimed Wood + Metal Frame';
    case 'scandinavian':
      return 'Birch Plywood + White Laminate';
  }
}

function scaleCost(base: number, style: InteriorStyle): number {
  return Math.round(base * costMultiplier(style));
}

/* ================================================================
   DEFAULT FURNITURE BY ROOM TYPE
   ================================================================ */

export function getDefaultFurniture(
  roomType: RoomFinishType,
  style: InteriorStyle,
): FurnitureItem[] {
  const mat = furnitureMaterial(style);
  const col = furnitureColor(style);
  const sc = (base: number) => scaleCost(base, style);

  const item = (
    name: string,
    category: FurnitureItem['category'],
    w: number,
    d: number,
    h: number,
    baseCost: number,
    defaultSelected: boolean,
  ): FurnitureItem => ({
    id: nextFurnitureId(),
    name,
    category,
    widthMM: w,
    depthMM: d,
    heightMM: h,
    material: mat,
    estimatedCost: sc(baseCost),
    color: col,
    defaultSelected,
  });

  switch (roomType) {
    case 'master_bedroom':
      return [
        item('King Bed', 'bed', 1800, 2000, 450, 85000, true),
        item('Side Table (L)', 'side_table', 500, 400, 500, 12000, true),
        item('Side Table (R)', 'side_table', 500, 400, 500, 12000, true),
        item('Wardrobe', 'wardrobe', 2400, 600, 2400, 140000, true),
        item('Dressing Table', 'dressing', 1200, 450, 750, 45000, false),
        item('TV Unit', 'tv_unit', 1500, 400, 450, 38000, false),
        item('Bookshelf', 'bookshelf', 900, 300, 1800, 32000, false),
        item('Chest of Drawers', 'wardrobe', 900, 450, 850, 30000, false),
        item('Study Table', 'study_table', 1200, 600, 750, 35000, false),
      ];

    case 'bedroom':
      return [
        item('Queen Bed', 'bed', 1500, 2000, 450, 65000, true),
        item('Side Table', 'side_table', 450, 400, 500, 10000, true),
        item('Wardrobe', 'wardrobe', 1800, 600, 2400, 110000, true),
        item('Study Table', 'study_table', 1200, 600, 750, 35000, false),
        item('Dressing Table', 'dressing', 1000, 450, 750, 35000, false),
        item('Bookshelf', 'bookshelf', 800, 300, 1800, 28000, false),
        item('Chest of Drawers', 'wardrobe', 900, 450, 850, 30000, false),
      ];

    case 'living':
      return [
        item('L-Shape Sofa', 'sofa', 2700, 1800, 850, 95000, true),
        item('Center Table', 'console', 1200, 600, 400, 28000, true),
        item('TV Unit', 'tv_unit', 2100, 400, 450, 55000, true),
        item('Bookshelf', 'bookshelf', 900, 300, 1800, 32000, false),
        item('Console Table', 'console', 1200, 350, 850, 25000, false),
        item('Display Cabinet', 'crockery', 1200, 400, 1800, 48000, false),
        item('Side Table', 'side_table', 450, 450, 500, 12000, false),
        item('Recliner', 'sofa', 900, 950, 1000, 55000, false),
      ];

    case 'kitchen':
      return [
        item('Upper Cabinets — Marine Ply + Acrylic/Laminate Finish (wall-mounted)', 'kitchen_cabinet', 3000, 350, 750, 85000, true),
        item('Lower Cabinets — Marine Ply + Granite/Quartz Counter', 'kitchen_cabinet', 3000, 600, 900, 110000, true),
        item('Tall Unit — Pull-Out Pantry (Tandem Box)', 'kitchen_cabinet', 600, 600, 2100, 65000, false),
        item('Auto-Clean Chimney Hood 60cm — Filterless', 'kitchen_cabinet', 600, 450, 500, 18000, true),
        item('Backsplash — Subway Tile / Nano White Glass / PU Finish', 'kitchen_cabinet', 3000, 10, 600, 22000, false),
        item('Countertop — Quartz Stone / Engineered Marble 20mm', 'kitchen_cabinet', 3000, 600, 20, 45000, true),
        item('Sink — 24×18 SS 304 Under-Mount Double Bowl', 'kitchen_cabinet', 600, 450, 250, 12000, true),
        item('Hob — 3-Burner Built-In Glass Top Auto-Ignition', 'kitchen_cabinet', 600, 500, 50, 15000, false),
        item('Corner Carousel — Magic Corner / Lazy Susan', 'kitchen_cabinet', 900, 900, 750, 18000, false),
        item('Cutlery Tray + Thali Basket Inserts', 'kitchen_cabinet', 600, 450, 100, 5500, false),
        item('Bottle Pull-Out (150mm)', 'kitchen_cabinet', 150, 500, 750, 7000, false),
        item('Under-Cabinet LED Strip Light', 'kitchen_cabinet', 3000, 20, 20, 4500, false),
        item('Kitchen Island', 'kitchen_cabinet', 1800, 900, 900, 120000, false),
        item('Wine Rack', 'bar_unit', 600, 350, 900, 22000, false),
        item('Bar Counter', 'bar_unit', 1500, 600, 1050, 55000, false),
        item('Microwave Cabinet', 'kitchen_cabinet', 600, 600, 600, 18000, false),
      ];

    case 'dining':
      return [
        item('6-Seater Dining Table', 'dining_table', 1500, 900, 750, 65000, true),
        item('Dining Chairs (Set of 6)', 'chair', 450, 500, 900, 48000, true),
        item('Crockery Unit', 'crockery', 1500, 400, 2100, 58000, false),
        item('Bar Unit', 'bar_unit', 1200, 450, 1800, 65000, false),
        item('Buffet Table', 'console', 1500, 450, 850, 40000, false),
      ];

    case 'bathroom':
      return [
        item('Toilet / WC', 'bathroom_fixture', 700, 400, 800, 12000, true),
        item('Wash Basin', 'bathroom_fixture', 600, 450, 850, 8500, true),
        item('Shower Set', 'bathroom_fixture', 250, 250, 2000, 11000, true),
        item('Wall Mirror', 'bathroom_fixture', 750, 40, 600, 4500, true),
        item('Towel Rack', 'bathroom_fixture', 600, 100, 100, 2500, true),
        item('Vanity Unit', 'kitchen_cabinet', 900, 450, 850, 28000, false),
        item('Mirror Cabinet', 'kitchen_cabinet', 750, 150, 600, 12000, false),
        item('Bathtub', 'bathroom_fixture', 1700, 750, 600, 55000, false),
        item('Bidet', 'bathroom_fixture', 550, 350, 400, 18000, false),
        item('Heated Towel Rail', 'bathroom_fixture', 500, 100, 900, 24000, false),
      ];

    case 'puja':
      return [
        item('Puja Unit / Mandir', 'pooja_unit', 900, 400, 1500, 48000, true),
        item('Bell Mount Bracket', 'pooja_unit', 100, 100, 300, 3500, false),
        item('Decorative Items', 'pooja_unit', 400, 300, 400, 8000, false),
      ];

    case 'study':
      return [
        item('Study Desk', 'study_table', 1200, 600, 750, 35000, true),
        item('Study Chair', 'chair', 550, 550, 950, 12000, true),
        item('Bookshelf', 'bookshelf', 900, 300, 1800, 32000, true),
        item('Filing Cabinet', 'wardrobe', 600, 450, 1000, 18000, false),
        item('Printer Table', 'study_table', 750, 500, 750, 10000, false),
      ];

    case 'entrance':
      return [
        item('Shoe Rack', 'shoe_rack', 900, 350, 1200, 22000, true),
        item('Console Table', 'console', 1200, 350, 850, 25000, false),
        item('Wall Mirror', 'console', 600, 50, 900, 8000, false),
      ];

    case 'balcony':
      return [
        item('Balcony Chair', 'sofa', 600, 600, 850, 15000, true),
        item('Balcony Chair', 'sofa', 600, 600, 850, 15000, true),
        item('Small Table', 'console', 600, 600, 500, 10000, true),
        item('Planter Box', 'console', 300, 300, 400, 5000, false),
      ];

    default:
      return [];
  }
}

/* ================================================================
   DEFAULT MATERIALS BY ROOM TYPE
   ================================================================ */

let _matIdCounter = 0;
function nextMatId(): string {
  _matIdCounter += 1;
  return `mat_${_matIdCounter}`;
}

interface RoomMaterialDefaults {
  flooring: MaterialSpec;
  wallFinish: MaterialSpec;
}

export function getDefaultMaterials(
  roomType: RoomFinishType,
  style: InteriorStyle,
): RoomMaterialDefaults {
  const palette = STYLE_TEMPLATES[style].palette;

  // Flooring specs per style
  const flooringByStyle: Record<InteriorStyle, () => MaterialSpec> = {
    modern_minimalist: () => ({
      id: nextMatId(),
      name: 'Italian Vitrified Tiles',
      type: 'flooring',
      brand: 'Kajaria / Somany',
      finish: 'Glossy',
      color: '#E8E0D4',
      ratePerUnit: 110,
      unit: 'sqft',
    }),
    contemporary_indian: () => ({
      id: nextMatId(),
      name: 'Indian Marble',
      type: 'flooring',
      brand: 'Rajasthan Marble',
      finish: 'Polished',
      color: '#F5F0E8',
      ratePerUnit: 220,
      unit: 'sqft',
    }),
    traditional: () => ({
      id: nextMatId(),
      name: 'Granite / Marble',
      type: 'flooring',
      brand: 'Premium Indian Stone',
      finish: 'Mirror Polished',
      color: '#E8DDD0',
      ratePerUnit: 260,
      unit: 'sqft',
    }),
    industrial: () => ({
      id: nextMatId(),
      name: 'Concrete Finish Tiles',
      type: 'flooring',
      brand: 'Johnson / Orient Bell',
      finish: 'Matt',
      color: '#C0B8AE',
      ratePerUnit: 120,
      unit: 'sqft',
    }),
    scandinavian: () => ({
      id: nextMatId(),
      name: 'Light Wood Laminate',
      type: 'flooring',
      brand: 'Pergo / Greenply',
      finish: 'Matt Natural',
      color: '#D4C8B0',
      ratePerUnit: 160,
      unit: 'sqft',
    }),
  };

  // Wall finish specs per style
  const wallByStyle: Record<InteriorStyle, () => MaterialSpec> = {
    modern_minimalist: () => ({
      id: nextMatId(),
      name: 'Premium Emulsion Paint',
      type: 'wall_finish',
      brand: 'Asian Paints Royale',
      finish: 'Matt',
      color: palette.wall,
      ratePerUnit: 22,
      unit: 'sqft',
    }),
    contemporary_indian: () => ({
      id: nextMatId(),
      name: 'Texture Paint',
      type: 'wall_finish',
      brand: 'Asian Paints Royale Play',
      finish: 'Textured',
      color: palette.wall,
      ratePerUnit: 42,
      unit: 'sqft',
    }),
    traditional: () => ({
      id: nextMatId(),
      name: 'Designer Wallpaper + Paint',
      type: 'wall_finish',
      brand: 'Nilaya / Asian Paints',
      finish: 'Satin',
      color: palette.wall,
      ratePerUnit: 55,
      unit: 'sqft',
    }),
    industrial: () => ({
      id: nextMatId(),
      name: 'Concrete Texture Paint',
      type: 'wall_finish',
      brand: 'Dulux / Berger',
      finish: 'Raw Textured',
      color: palette.wall,
      ratePerUnit: 38,
      unit: 'sqft',
    }),
    scandinavian: () => ({
      id: nextMatId(),
      name: 'Matt White Emulsion',
      type: 'wall_finish',
      brand: 'Asian Paints / Dulux',
      finish: 'Matt',
      color: palette.wall,
      ratePerUnit: 20,
      unit: 'sqft',
    }),
  };

  // Bathroom overrides
  if (roomType === 'bathroom') {
    return {
      flooring: {
        id: nextMatId(),
        name: 'Anti-Skid Ceramic Tiles',
        type: 'flooring',
        brand: 'Kajaria / Johnson',
        finish: 'Matt Anti-Skid',
        color: '#D0C8C0',
        ratePerUnit: 95,
        unit: 'sqft',
      },
      wallFinish: {
        id: nextMatId(),
        name: 'Ceramic Wall Tiles (up to 7 ft)',
        type: 'wall_finish',
        brand: 'Kajaria / Somany',
        finish: 'Glossy',
        color: '#F0EDE8',
        ratePerUnit: 90,
        unit: 'sqft',
      },
    };
  }

  // Kitchen overrides (dado tiling)
  if (roomType === 'kitchen') {
    return {
      flooring: flooringByStyle[style](),
      wallFinish: {
        id: nextMatId(),
        name: 'Kitchen Dado Tiles + Paint',
        type: 'wall_finish',
        brand: 'Kajaria / Somany',
        finish: 'Glossy',
        color: '#F5F0EA',
        ratePerUnit: 85,
        unit: 'sqft',
      },
    };
  }

  // Balcony overrides
  if (roomType === 'balcony') {
    return {
      flooring: {
        id: nextMatId(),
        name: 'Outdoor Anti-Skid Tiles',
        type: 'flooring',
        brand: 'Johnson / Orient Bell',
        finish: 'Matt Anti-Skid',
        color: '#C8BFA8',
        ratePerUnit: 75,
        unit: 'sqft',
      },
      wallFinish: {
        id: nextMatId(),
        name: 'Exterior Emulsion Paint',
        type: 'wall_finish',
        brand: 'Asian Paints Apex',
        finish: 'Matt',
        color: palette.wall,
        ratePerUnit: 18,
        unit: 'sqft',
      },
    };
  }

  return {
    flooring: flooringByStyle[style](),
    wallFinish: wallByStyle[style](),
  };
}

/* ================================================================
   ROOM-TYPE MAPPING (Layout RoomType → Interior RoomFinishType)
   ================================================================ */

export function mapRoomTypeToFinish(roomType: RoomType): RoomFinishType {
  switch (roomType as string) {
    case 'master_bedroom':
      return 'master_bedroom';
    case 'bedroom':
      return 'bedroom';
    case 'hall':
      return 'living';
    case 'kitchen':
      return 'kitchen';
    case 'toilet':
      return 'bathroom';
    case 'dining':
      return 'dining';
    case 'puja':
      return 'puja';
    case 'balcony':
      return 'balcony';
    case 'entrance':
      return 'entrance';
    case 'passage':
      return 'entrance';
    case 'store':
      return 'entrance';
    case 'utility':
      return 'kitchen';
    case 'staircase':
      return 'entrance';
    case 'study':
      return 'study';
    case 'parking':
      return 'entrance';
    case 'cabin':
      return 'study';
    case 'conference':
    case 'meeting_room':
      return 'living';
    case 'reception':
    case 'waiting_lounge':
      return 'entrance';
    case 'pantry':
    case 'cafeteria':
      return 'kitchen';
    case 'open_office':
    case 'break_room':
      return 'living';
    case 'server_room':
    case 'electrical_room':
    case 'ahu_room':
      return 'entrance';
    case 'washroom':
    case 'washroom_male':
    case 'washroom_female':
    case 'washroom_accessible':
      return 'bathroom';
    case 'cabin_manager':
    case 'cabin_director':
    case 'cabin_md':
      return 'study';
    case 'conference_small':
    case 'conference_large':
    case 'board_room':
    case 'workstation_open':
      return 'living';
    case 'washroom_handicap':
      return 'bathroom';
    default:
      return 'bedroom';
  }
}
