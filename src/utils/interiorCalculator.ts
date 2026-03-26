import type {
  RoomInterior,
  Layout,
  InteriorDesignData,
  InteriorExecutionPhase,
  InteriorBOQItem,
  InteriorMoodBoard,
} from '../types';
import { STYLE_TEMPLATES } from './interiorTemplates';

/* ================================================================
   CURRENCY FORMATTER
   ================================================================ */

const inrFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatINR(amount: number): string {
  return inrFormat.format(amount);
}

/* ================================================================
   ROOM AREA HELPERS
   ================================================================ */

/** Get room area in sqft from the layout. Falls back to estimate if room not found. */
function getRoomAreaSqFt(roomId: string, layout: Layout): number {
  for (const fl of layout.floors) {
    for (const room of fl.rooms) {
      if (room.id === roomId) {
        // room.width and room.depth are in metres
        const areaSqM = room.width * room.depth;
        return areaSqM * 10.7639; // convert to sqft
      }
    }
  }
  return 120; // default fallback ~11 sqm
}

function getRoomDimensionsM(roomId: string, layout: Layout): { width: number; depth: number } {
  for (const fl of layout.floors) {
    for (const room of fl.rooms) {
      if (room.id === roomId) {
        return { width: room.width, depth: room.depth };
      }
    }
  }
  return { width: 3.5, depth: 3.2 };
}

function getRoomPerimeterFt(roomId: string, layout: Layout): number {
  const dim = getRoomDimensionsM(roomId, layout);
  return (2 * (dim.width + dim.depth)) * 3.28084;
}

/** Assume 10 ft (3.05 m) floor-to-floor height, deduct 1.5 ft for openings per running ft of wall */
function getWallAreaSqFt(roomId: string, layout: Layout, ceilingHeightMM: number): number {
  const perimeterFt = getRoomPerimeterFt(roomId, layout);
  const heightFt = (ceilingHeightMM / 304.8); // mm to ft
  const grossWallArea = perimeterFt * heightFt;
  // Deduct ~15% for doors/windows
  return grossWallArea * 0.85;
}

/* ================================================================
   EXECUTION PLAN
   ================================================================ */

interface PhaseTemplate {
  id: string;
  phase: string;
  description: string;
  trade: string;
  durationDays: number;
  dependencies: string[];
  materials: string[];
  costPctOfTotal: number; // rough % of total interior cost
}

const PHASE_TEMPLATES: PhaseTemplate[] = [
  {
    id: 'P1',
    phase: 'Site Preparation & Demolition',
    description: 'Remove existing finishes, debris clearance, site protection',
    trade: 'Civil',
    durationDays: 3,
    dependencies: [],
    materials: ['Demolition tools', 'Debris bags', 'Protective sheets'],
    costPctOfTotal: 0.03,
  },
  {
    id: 'P2',
    phase: 'Civil Modifications',
    description: 'Wall niches, platforms, partition walls, waterproofing',
    trade: 'Civil',
    durationDays: 5,
    dependencies: ['P1'],
    materials: ['Bricks', 'Cement', 'Sand', 'Waterproofing compound'],
    costPctOfTotal: 0.06,
  },
  {
    id: 'P3',
    phase: 'Electrical First Fix',
    description: 'Conduit laying, wiring, switch board boxes, AC points',
    trade: 'Electrician',
    durationDays: 7,
    dependencies: ['P2'],
    materials: ['PVC conduits', 'Copper wiring', 'MCBs', 'DB boxes'],
    costPctOfTotal: 0.07,
  },
  {
    id: 'P4',
    phase: 'Plumbing First Fix',
    description: 'Hot/cold water lines, drainage, gas pipeline rough-in',
    trade: 'Plumber',
    durationDays: 5,
    dependencies: ['P2'],
    materials: ['CPVC pipes', 'SWR pipes', 'Fittings', 'Valves'],
    costPctOfTotal: 0.05,
  },
  {
    id: 'P5',
    phase: 'False Ceiling Framework',
    description: 'GI channel framework, peripheral and full false-ceiling grids',
    trade: 'Carpenter',
    durationDays: 5,
    dependencies: ['P3', 'P4'],
    materials: ['GI channels', 'Screws', 'Hangers', 'Gypsum / POP boards'],
    costPctOfTotal: 0.06,
  },
  {
    id: 'P6',
    phase: 'False Ceiling Finishing',
    description: 'POP / gypsum board fixing, sanding, and cove detailing',
    trade: 'POP Worker',
    durationDays: 4,
    dependencies: ['P5'],
    materials: ['POP powder', 'Gypsum boards', 'Mesh tape', 'Sandpaper'],
    costPctOfTotal: 0.04,
  },
  {
    id: 'P7',
    phase: 'Wall Putty & Primer',
    description: 'Wall putty application (2 coats), sanding, primer coat',
    trade: 'Painter',
    durationDays: 5,
    dependencies: ['P6'],
    materials: ['Wall putty', 'Primer', 'Sandpaper', 'Rollers'],
    costPctOfTotal: 0.04,
  },
  {
    id: 'P8',
    phase: 'Flooring & Tiling',
    description: 'Floor tile / marble / laminate laying, bathroom wall tiling, kitchen dado',
    trade: 'Tiling',
    durationDays: 8,
    dependencies: ['P7'],
    materials: ['Tiles / Marble / Laminate', 'Tile adhesive', 'Grout', 'Spacers'],
    costPctOfTotal: 0.12,
  },
  {
    id: 'P9',
    phase: 'Woodwork Installation',
    description: 'Wardrobe, kitchen cabinets, TV units, shoe racks, all custom woodwork',
    trade: 'Carpenter',
    durationDays: 12,
    dependencies: ['P8'],
    materials: ['Plywood / MDF', 'Laminates', 'Edge bands', 'Hinges', 'Channels'],
    costPctOfTotal: 0.25,
  },
  {
    id: 'P10',
    phase: 'Countertop Installation',
    description: 'Kitchen countertop, vanity counters, window sills',
    trade: 'Mason',
    durationDays: 3,
    dependencies: ['P9'],
    materials: ['Granite / Quartz slab', 'Adhesive', 'Sealant'],
    costPctOfTotal: 0.04,
  },
  {
    id: 'P11',
    phase: 'Painting – 2 Coats',
    description: 'Final wall paint (2 coats), ceiling paint, accent walls, texture',
    trade: 'Painter',
    durationDays: 6,
    dependencies: ['P9'],
    materials: ['Premium emulsion paint', 'Texture paint', 'Brushes', 'Rollers'],
    costPctOfTotal: 0.06,
  },
  {
    id: 'P12',
    phase: 'Electrical Second Fix',
    description: 'Switch plates, light fixtures, fans, exhaust, AC indoor units',
    trade: 'Electrician',
    durationDays: 4,
    dependencies: ['P11'],
    materials: ['Switches', 'Light fixtures', 'Fans', 'AC brackets'],
    costPctOfTotal: 0.05,
  },
  {
    id: 'P13',
    phase: 'Plumbing Second Fix',
    description: 'CP fittings, taps, shower, WC installation, kitchen sink',
    trade: 'Plumber',
    durationDays: 3,
    dependencies: ['P11'],
    materials: ['CP fittings', 'Taps', 'Shower set', 'WC', 'Kitchen sink'],
    costPctOfTotal: 0.05,
  },
  {
    id: 'P14',
    phase: 'Hardware & Accessories',
    description: 'Handles, locks, soft-close fittings, curtain tracks, mirrors',
    trade: 'Carpenter',
    durationDays: 3,
    dependencies: ['P12', 'P13'],
    materials: ['Handles', 'Locks', 'Soft-close hinges', 'Curtain tracks', 'Mirrors'],
    costPctOfTotal: 0.05,
  },
  {
    id: 'P15',
    phase: 'Deep Cleaning & Handover',
    description: 'Professional deep cleaning, snagging, final inspection',
    trade: 'Housekeeping',
    durationDays: 2,
    dependencies: ['P14'],
    materials: ['Cleaning supplies'],
    costPctOfTotal: 0.03,
  },
];

function resolveStartDays(templates: PhaseTemplate[]): Map<string, number> {
  const starts = new Map<string, number>();

  function resolve(id: string): number {
    if (starts.has(id)) return starts.get(id)!;
    const tmpl = templates.find((t) => t.id === id)!;
    if (tmpl.dependencies.length === 0) {
      starts.set(id, 1);
      return 1;
    }
    let maxEnd = 0;
    for (const dep of tmpl.dependencies) {
      const depTmpl = templates.find((t) => t.id === dep)!;
      const depStart = resolve(dep);
      const depEnd = depStart + depTmpl.durationDays;
      if (depEnd > maxEnd) maxEnd = depEnd;
    }
    starts.set(id, maxEnd);
    return maxEnd;
  }

  for (const t of templates) resolve(t.id);
  return starts;
}

export function generateExecutionPlan(
  rooms: RoomInterior[],
): { phases: InteriorExecutionPhase[]; totalDays: number } {
  const starts = resolveStartDays(PHASE_TEMPLATES);

  // Rough total cost estimate for proportional split — use ₹1,800/sqft as baseline
  // We'll compute a rough total from room count
  const roughTotalForProportions = rooms.length * 150000; // rough average per room

  const phases: InteriorExecutionPhase[] = PHASE_TEMPLATES.map((tmpl) => ({
    id: tmpl.id,
    phase: tmpl.phase,
    description: tmpl.description,
    trade: tmpl.trade,
    durationDays: tmpl.durationDays,
    startDay: starts.get(tmpl.id)!,
    dependencies: tmpl.dependencies,
    materials: tmpl.materials,
    estimatedCost: Math.round(roughTotalForProportions * tmpl.costPctOfTotal),
  }));

  const totalDays = phases.reduce(
    (max, p) => Math.max(max, p.startDay + p.durationDays - 1),
    0,
  );

  return { phases, totalDays };
}

/* ================================================================
   INTERIOR BOQ GENERATION
   ================================================================ */

export function generateInteriorBOQ(
  rooms: RoomInterior[],
  layout: Layout,
): {
  items: InteriorBOQItem[];
  total: number;
  breakdown: InteriorDesignData['costBreakdown'];
} {
  const items: InteriorBOQItem[] = [];
  let sno = 0;

  const breakdown: InteriorDesignData['costBreakdown'] = {
    civil: 0,
    falseCeiling: 0,
    flooring: 0,
    woodwork: 0,
    painting: 0,
    electrical: 0,
    plumbing: 0,
    hardware: 0,
    furnishing: 0,
    miscellaneous: 0,
  };

  function addItem(
    category: InteriorBOQItem['category'],
    description: string,
    room: string,
    quantity: number,
    unit: string,
    rate: number,
    remark?: string,
  ): void {
    sno += 1;
    const amount = Math.round(quantity * rate);
    items.push({ sno, category, description, room, quantity: Math.round(quantity * 100) / 100, unit, rate, amount, remark });

    // Accumulate in breakdown
    switch (category) {
      case 'civil': breakdown.civil += amount; break;
      case 'false_ceiling': breakdown.falseCeiling += amount; break;
      case 'flooring': breakdown.flooring += amount; break;
      case 'woodwork': breakdown.woodwork += amount; break;
      case 'painting': breakdown.painting += amount; break;
      case 'electrical': breakdown.electrical += amount; break;
      case 'plumbing': breakdown.plumbing += amount; break;
      case 'hardware': breakdown.hardware += amount; break;
      case 'furnishing': breakdown.furnishing += amount; break;
      case 'miscellaneous': breakdown.miscellaneous += amount; break;
    }
  }

  for (const room of rooms) {
    const areaSqFt = getRoomAreaSqFt(room.roomId, layout);
    const perimeterFt = getRoomPerimeterFt(room.roomId, layout);
    const wallArea = getWallAreaSqFt(room.roomId, layout, room.ceilingHeight);
    const roomLabel = room.roomName;

    /* ---------- 1. CIVIL ---------- */
    if (room.specialFeatures.length > 0) {
      const civilFeatures = room.specialFeatures.filter(
        (f) => f.includes('niche') || f.includes('platform') || f.includes('partition'),
      );
      if (civilFeatures.length > 0) {
        const civilRate = 1000; // ₹/sqft
        const civilArea = civilFeatures.length * 15; // ~15 sqft per feature
        addItem('civil', `Civil modifications — ${civilFeatures.join(', ')}`, roomLabel, civilArea, 'sqft', civilRate);
      }
    }

    /* ---------- 2. FALSE CEILING ---------- */
    if (room.ceilingType !== 'plain') {
      let ceilingArea: number;
      let ceilingRate: number;
      let ceilingDesc: string;

      if (room.ceilingType === 'false_ceiling_peripheral') {
        ceilingArea = areaSqFt * 0.6;
        ceilingRate = 75;
        ceilingDesc = 'Peripheral false ceiling (POP/Gypsum)';
      } else if (room.ceilingType === 'false_ceiling_full') {
        ceilingArea = areaSqFt;
        ceilingRate = 85;
        ceilingDesc = 'Full false ceiling (POP/Gypsum)';
      } else {
        // wooden_ceiling
        ceilingArea = areaSqFt;
        ceilingRate = 150;
        ceilingDesc = 'Wooden panel false ceiling';
      }

      addItem('false_ceiling', ceilingDesc, roomLabel, ceilingArea, 'sqft', ceilingRate);
    }

    /* ---------- 3. FLOORING ---------- */
    addItem(
      'flooring',
      `${room.flooring.name} — ${room.flooring.finish}`,
      roomLabel,
      areaSqFt,
      'sqft',
      room.flooring.ratePerUnit,
    );
    // Skirting
    const skirtingRate = 65;
    addItem('flooring', 'Skirting', roomLabel, perimeterFt, 'rft', skirtingRate, 'Matching skirting');

    /* ---------- 4. WOODWORK ---------- */
    for (const furn of room.furniture) {
      addItem('woodwork', furn.name, roomLabel, 1, 'nos', furn.estimatedCost, furn.material);
    }

    /* ---------- 5. PAINTING ---------- */
    addItem(
      'painting',
      `Wall finish — ${room.wallFinish.name}`,
      roomLabel,
      wallArea,
      'sqft',
      room.wallFinish.ratePerUnit,
    );
    // Ceiling paint (if plain ceiling or extra coat on false ceiling)
    const ceilingPaintRate = 18;
    addItem('painting', 'Ceiling paint', roomLabel, areaSqFt, 'sqft', ceilingPaintRate);

    /* ---------- 6. ELECTRICAL ---------- */
    const ep = room.electricalPoints;
    const elecItems: { desc: string; qty: number; rate: number }[] = [
      { desc: 'Switch points', qty: ep.switches, rate: 350 },
      { desc: 'Socket points', qty: ep.sockets, rate: 450 },
      { desc: 'Light points', qty: ep.lightPoints, rate: 650 },
      { desc: 'Fan points', qty: ep.fanPoints, rate: 550 },
      { desc: 'AC points', qty: ep.acPoints, rate: 2500 },
      { desc: 'Data points', qty: ep.dataPoints, rate: 850 },
    ];
    for (const ei of elecItems) {
      if (ei.qty > 0) {
        addItem('electrical', ei.desc, roomLabel, ei.qty, 'nos', ei.rate);
      }
    }

    /* ---------- 7. PLUMBING ---------- */
    if (room.roomType === 'bathroom') {
      addItem('plumbing', 'CP fittings & fixtures (bathroom)', roomLabel, 1, 'set', 25000, 'Includes taps, shower, diverter, health faucet');
    } else if (room.roomType === 'kitchen') {
      addItem('plumbing', 'Kitchen sink + fittings', roomLabel, 1, 'set', 12000, 'SS sink with tap and accessories');
    }

    /* ---------- 8. HARDWARE ---------- */
    const hardwareCost =
      room.roomType === 'kitchen' ? 15000 :
      room.roomType === 'bathroom' ? 8000 :
      room.furniture.length > 0 ? 12000 :
      5000;
    addItem('hardware', 'Handles, hinges, soft-close channels, locks', roomLabel, 1, 'lot', hardwareCost);

    /* ---------- 9. FURNISHING ---------- */
    if (room.roomType === 'living' || room.roomType === 'bedroom' || room.roomType === 'master_bedroom') {
      // Curtains for bedrooms & living
      const curtainArea = perimeterFt * 0.25 * 8; // ~25% of perimeter has windows, 8 ft drop
      const curtainRate = 750;
      addItem('furnishing', 'Curtains & blinds', roomLabel, curtainArea, 'sqft', curtainRate);
    }
  }

  /* ---------- 10. MISCELLANEOUS (5% contingency) ---------- */
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const contingency = Math.round(subtotal * 0.05);
  sno += 1;
  items.push({
    sno,
    category: 'miscellaneous',
    description: 'Contingency & miscellaneous (5%)',
    room: 'All',
    quantity: 1,
    unit: 'lot',
    rate: contingency,
    amount: contingency,
    remark: '5% of subtotal',
  });
  breakdown.miscellaneous += contingency;

  const total = subtotal + contingency;

  return { items, total, breakdown };
}

/* ================================================================
   MAIN FUNCTION
   ================================================================ */

export function generateInteriorDesign(
  rooms: RoomInterior[],
  layout: Layout,
): InteriorDesignData {
  // Collect unique style moodboards
  const uniqueStyles = new Set(rooms.map((r) => r.style));
  const moodBoards: InteriorMoodBoard[] = Array.from(uniqueStyles).map(
    (s) => STYLE_TEMPLATES[s],
  );

  // Execution plan
  const { phases, totalDays } = generateExecutionPlan(rooms);

  // BOQ
  const { items: boqItems, total: totalCost, breakdown } = generateInteriorBOQ(rooms, layout);

  // Update execution plan costs proportionally based on actual total
  for (const phase of phases) {
    const tmpl = PHASE_TEMPLATES.find((t) => t.id === phase.id)!;
    phase.estimatedCost = Math.round(totalCost * tmpl.costPctOfTotal);
  }

  return {
    rooms,
    moodBoards,
    executionPlan: phases,
    totalDurationDays: totalDays,
    boqItems,
    totalCost,
    costBreakdown: breakdown,
  };
}
