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
  });

  switch (roomType) {
    case 'master_bedroom':
      return [
        item('King Bed', 'bed', 1800, 2000, 450, 85000),
        item('Side Table (L)', 'side_table', 500, 400, 500, 12000),
        item('Side Table (R)', 'side_table', 500, 400, 500, 12000),
        item('Wardrobe', 'wardrobe', 2400, 600, 2400, 140000),
        item('Dressing Table', 'dressing', 1200, 450, 750, 45000),
        item('TV Unit', 'tv_unit', 1500, 400, 450, 38000),
      ];

    case 'bedroom':
      return [
        item('Queen Bed', 'bed', 1500, 2000, 450, 65000),
        item('Side Table', 'side_table', 450, 400, 500, 10000),
        item('Wardrobe', 'wardrobe', 1800, 600, 2400, 110000),
        item('Study Table', 'study_table', 1200, 600, 750, 35000),
      ];

    case 'living':
      return [
        item('L-Shape Sofa', 'sofa', 2700, 1800, 850, 95000),
        item('Center Table', 'console', 1200, 600, 400, 28000),
        item('TV Unit', 'tv_unit', 2100, 400, 450, 55000),
        item('Bookshelf', 'bookshelf', 900, 300, 1800, 32000),
        item('Console Table', 'console', 1200, 350, 850, 25000),
      ];

    case 'kitchen':
      return [
        item('Upper Cabinets — Marine Ply + Acrylic/Laminate Finish (wall-mounted)', 'kitchen_cabinet', 3000, 350, 750, 85000),
        item('Lower Cabinets — Marine Ply + Granite/Quartz Counter', 'kitchen_cabinet', 3000, 600, 900, 110000),
        item('Tall Unit — Pull-Out Pantry (Tandem Box)', 'kitchen_cabinet', 600, 600, 2100, 65000),
        item('Auto-Clean Chimney Hood 60cm — Filterless', 'kitchen_cabinet', 600, 450, 500, 18000),
        item('Backsplash — Subway Tile / Nano White Glass / PU Finish', 'kitchen_cabinet', 3000, 10, 600, 22000),
        item('Countertop — Quartz Stone / Engineered Marble 20mm', 'kitchen_cabinet', 3000, 600, 20, 45000),
        item('Sink — 24×18 SS 304 Under-Mount Double Bowl', 'kitchen_cabinet', 600, 450, 250, 12000),
        item('Hob — 3-Burner Built-In Glass Top Auto-Ignition', 'kitchen_cabinet', 600, 500, 50, 15000),
        item('Corner Carousel — Magic Corner / Lazy Susan', 'kitchen_cabinet', 900, 900, 750, 18000),
        item('Cutlery Tray + Thali Basket Inserts', 'kitchen_cabinet', 600, 450, 100, 5500),
        item('Bottle Pull-Out (150mm)', 'kitchen_cabinet', 150, 500, 750, 7000),
        item('Under-Cabinet LED Strip Light', 'kitchen_cabinet', 3000, 20, 20, 4500),
      ];

    case 'dining':
      return [
        item('6-Seater Dining Table', 'dining_table', 1500, 900, 750, 65000),
        item('Crockery Unit', 'crockery', 1500, 400, 2100, 58000),
      ];

    case 'bathroom':
      return [
        item('Vanity Unit', 'kitchen_cabinet', 900, 450, 850, 28000),
        item('Mirror Cabinet', 'kitchen_cabinet', 750, 150, 600, 12000),
      ];

    case 'puja':
      return [
        item('Puja Unit / Mandir', 'pooja_unit', 900, 400, 1500, 48000),
        item('Bell Mount Bracket', 'pooja_unit', 100, 100, 300, 3500),
      ];

    case 'entrance':
      return [
        item('Shoe Rack', 'shoe_rack', 900, 350, 1200, 22000),
        item('Console Table', 'console', 1200, 350, 850, 25000),
        item('Wall Mirror', 'console', 600, 50, 900, 8000),
      ];

    case 'balcony':
      return [
        item('Balcony Chair', 'sofa', 600, 600, 850, 15000),
        item('Balcony Chair', 'sofa', 600, 600, 850, 15000),
        item('Small Table', 'console', 600, 600, 500, 10000),
        item('Planter Box', 'console', 300, 300, 400, 5000),
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
  switch (roomType) {
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
    case 'parking':
      return 'entrance';
    default:
      return 'bedroom';
  }
}
