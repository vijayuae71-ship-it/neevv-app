import { Layout, ProjectRequirements } from '../types';

/** Convert meters to feet */
const mToFt = (m: number) => Math.round(m * 3.281);

/** Build a detailed architectural prompt from floor plan data for AI image generation */
export function buildArchitecturalPrompt(
  layout: Layout,
  requirements: ProjectRequirements,
  viewAngle: 'front-3/4' | 'rear-3/4' | 'front-elevation' | 'bird-eye' = 'front-3/4'
): string {
  const plotW = requirements.plotWidthFt;
  const plotD = requirements.plotDepthFt;
  const facing = requirements.facing;
  const numFloors = layout.floors.length;
  const hasStilt = layout.floors.some(f => f.floor === 0 && f.rooms.some(r => r.type === 'parking'));
  const hasBalcony = layout.floors.some(f => f.rooms.some(r => r.type === 'balcony'));

  // Gather room info per floor
  const floorDescriptions = layout.floors.map(f => {
    const roomSummary = f.rooms
      .map(r => `${r.name} (${mToFt(r.width)}x${mToFt(r.depth)}ft)`)
      .join(', ');
    return `${f.floorLabel}: ${roomSummary}`;
  }).join('. ');

  // Count bedrooms, bathrooms
  const allRooms = layout.floors.flatMap(f => f.rooms);
  const bedrooms = allRooms.filter(r => r.type === 'bedroom').length;
  const toilets = allRooms.filter(r => r.type === 'toilet').length;
  const kitchens = allRooms.filter(r => r.type === 'kitchen').length;
  const hasPuja = allRooms.some(r => r.type === 'puja');

  // Building dimensions
  const buildingHeight = numFloors * 3; // ~3m per floor
  const totalHeight = hasStilt ? buildingHeight + 0.3 : buildingHeight;
  const floorHeight = 3.0; // 3m floor-to-floor
  const slabThickness = 150; // mm
  const wallThickness = 230; // mm
  const windowSillHeight = 900; // mm
  const windowHeight = 1200; // mm
  const doorHeight = 2100; // mm

  // Calculate setbacks
  const frontSetback = requirements.plotWidthFt >= 40 ? 3.0 : 1.5;
  const sideSetback = requirements.plotWidthFt >= 40 ? 1.5 : 1.0;
  const rearSetback = requirements.plotDepthFt >= 40 ? 1.5 : 1.0;

  // Building footprint (plot minus setbacks)
  const buildingWidthM = layout.plotWidthM - (2 * sideSetback);
  const buildingDepthM = layout.plotDepthM - frontSetback - rearSetback;
  const builtUpAreaSqFt = Math.round(buildingWidthM * buildingDepthM * 10.764);

  // Per-room dimensions for detail
  const roomDimensions = layout.floors.map(f => {
    return f.rooms.map(r => ({
      name: r.name,
      widthFt: mToFt(r.width),
      depthFt: mToFt(r.depth),
      widthM: r.width.toFixed(2),
      depthM: r.depth.toFixed(2),
      areaSqFt: Math.round(r.width * r.depth * 10.764)
    }));
  });

  // Derive which rooms face each wall for consistency with floor plans
  const wallRooms: Record<string, string[]> = { front: [], rear: [], left: [], right: [] };
  for (const floor of layout.floors) {
    const floorLabel = floor.floorLabel || `Floor ${floor.floor}`;
    for (const room of floor.rooms) {
      const rx = room.x || 0;
      const ry = room.y || 0;
      const rw = room.width || 0;
      const rd = room.depth || 0;
      const rName = `${room.name} (${floorLabel})`;
      if (ry <= 0.5) wallRooms.front.push(rName);
      if (ry + rd >= buildingDepthM - 0.5) wallRooms.rear.push(rName);
      if (rx <= 0.5) wallRooms.left.push(rName);
      if (rx + rw >= buildingWidthM - 0.5) wallRooms.right.push(rName);
    }
  }

  const compassMap: Record<string, Record<string, string>> = {
    'North': { front: 'North', rear: 'South', left: 'West', right: 'East' },
    'South': { front: 'South', rear: 'North', left: 'East', right: 'West' },
    'East':  { front: 'East', rear: 'West', left: 'North', right: 'South' },
    'West':  { front: 'West', rear: 'East', left: 'South', right: 'North' },
  };
  const compass = compassMap[facing] || compassMap['East'];

  const architecturalBrief = `
ARCHITECTURAL CONSISTENCY (3D render MUST match floor plan layout):
- FRONT WALL (${compass.front}-facing): ${wallRooms.front.join(', ') || 'N/A'} → windows visible here
- REAR WALL (${compass.rear}-facing): ${wallRooms.rear.join(', ') || 'N/A'}
- LEFT WALL (${compass.left}-facing): ${wallRooms.left.join(', ') || 'N/A'}
- RIGHT WALL (${compass.right}-facing): ${wallRooms.right.join(', ') || 'N/A'}
- Window positions, door placement, and balcony location MUST match the floor plan exactly.
- Entrance door on ${compass.front} wall (${facing}-facing).`;

  // Dynamic facade based on architectural style + budget
  const archStyle = requirements.architecturalStyle || 'contemporary_indian';
  const budget = requirements.budget || 'standard';

  const styleFacades: Record<string, string> = {
    modern_minimalist: 'Clean white (#F5F5F5) plastered front facade with charcoal grey (#3A3A3A) accent panels, anthracite (#2C2C2C) window reveals, flush-mounted frameless glazing, no ornamental details, crisp shadow lines from cantilevered slabs, matte finish throughout',
    contemporary_indian: 'Warm sandstone beige (#D4B896) front facade with terracotta (#C0704A) accent band, jali screen element in weathered brass finish, exposed brick feature panel near entrance, earth-tone palette with copper/bronze metalwork highlights',
    traditional: 'Lime-washed cream (#FAF0DC) exterior with ornamental column capitals, carved wood door surround in dark teak (#5B3A1A), terracotta roof tiles visible, arched niches with recessed lighting, warm ochre (#C89440) accent borders around windows',
    tropical: 'Laterite stone (#A0522D) base plinth with white lime-washed upper walls, exposed timber (#6B4226) columns and eave brackets, clay Mangalore tile roof in burnt orange, wide verandah with wooden railing, lush tropical planting integration',
    industrial: 'Exposed fair-face concrete (#8C8C8C) front facade with Corten steel (#8B4513) panel accents, black powder-coated steel window mullions, visible structural steel elements painted matte black, concrete block feature wall, raw material aesthetic',
  };

  const budgetFinishes: Record<string, string> = {
    economy: 'Cement plaster with acrylic emulsion paint, basic MS window grilles, PVC rainwater pipes visible, simple parapet without cladding',
    standard: 'Double-coat plaster with premium emulsion, powder-coated aluminium windows, concealed plumbing, textured paint accent on feature wall',
    premium: 'External stone cladding on feature walls, UPVC double-glazed windows, concealed services, designer entrance canopy with spot lighting, premium texture paint',
    luxury: 'Italian stone/HPL cladding system, thermally-broken aluminium windows with Low-E glass, integrated LED facade lighting, designer landscape lighting, motorized gate, premium stone paving in driveway',
  };

  const facadeDesc = styleFacades[archStyle] || styleFacades.contemporary_indian;
  const finishDesc = budgetFinishes[budget] || budgetFinishes.standard;

  // View description
  const viewDesc: Record<string, string> = {
    'front-3/4': '3/4 front perspective view showing front and one side, camera at eye level slightly elevated, golden hour warm sunlight from the right',
    'rear-3/4': '3/4 rear perspective view showing back garden and one side, camera at eye level slightly elevated, soft afternoon lighting',
    'front-elevation': 'straight-on front elevation view, centered, orthographic feel, even lighting showing all facade details',
    'bird-eye': 'aerial bird-eye view at 45 degrees looking down, showing roof layout, terrace, and full landscaping'
  };

  const prompt = `Professional photorealistic architectural exterior render of a modern Indian residential house WITH DIMENSION ANNOTATIONS.

${architecturalBrief}

BUILDING SPECIFICATIONS (ACTUAL MEASUREMENTS — render must be proportionally accurate):
- Plot size: ${plotW}' × ${plotD}' (${layout.plotWidthM.toFixed(1)}m × ${layout.plotDepthM.toFixed(1)}m)
- Building footprint: ${buildingWidthM.toFixed(1)}m × ${buildingDepthM.toFixed(1)}m (${builtUpAreaSqFt} sq.ft per floor)
- Total built-up area: ${builtUpAreaSqFt * numFloors} sq.ft across ${numFloors} floor(s)
- Total height: ${totalHeight.toFixed(1)}m (${numFloors} floors × ${floorHeight}m floor-to-floor)
- Wall thickness: ${wallThickness}mm (9" brick/block)
- Slab thickness: ${slabThickness}mm RCC
- Setbacks: Front ${frontSetback}m, Sides ${sideSetback}m, Rear ${rearSetback}m
- ${facing}-facing main entrance
- ${bedrooms} bedrooms, ${toilets} bathrooms, ${kitchens} kitchen${kitchens > 1 ? 's' : ''}${hasPuja ? ', 1 puja room' : ''}
- ${hasStilt ? 'Stilt parking on ground floor with open columns (clear height 2.4m)' : 'Ground floor living areas'}
- ${hasBalcony ? 'Cantilevered balconies on upper floors with MS railing (projection: 1.2m)' : 'No balconies'}
- Floor layout: ${floorDescriptions}
- Window: ${windowSillHeight}mm sill, ${windowHeight}mm height, 1200mm typical width
- Doors: ${doorHeight}mm height, main door 1050mm wide, internal doors 900mm wide
- Plinth height: 450mm above ground level

FACADE & MATERIALS (Style: ${archStyle.replace(/_/g, ' ').toUpperCase()}, Budget: ${budget.toUpperCase()}):
- ${facadeDesc}
- ${finishDesc}
- Chajja/sunshade projection above every window appropriate to the architectural style
- Main entrance door and threshold matching the chosen style
- Parapet/roof edge detailing consistent with the architectural style
- Plinth band and slab-level horizontal bands in contrasting color

ARCHITECTURAL DETAILS:
- Front porch with 3 granite steps and flat concrete canopy supported by slim columns
- ${hasBalcony ? 'First floor balcony with MS pipe railing, accessible from bedrooms/living room' : ''}
- Staircase mumty/headroom enclosure on terrace with matching exterior finish and proper door
- Parapet wall on terrace with varying heights (1.2m front, 0.9m sides, 0.8m rear)
- Facade has recesses and projections for depth — not a flat box
- 230mm thick walls with visible thickness at openings
- Water tank area on terrace partially screened

MODULAR KITCHEN DETAILS (visible through kitchen window or in cutaway):
- L-shaped or straight modular kitchen layout with handleless profile cabinets
- Countertop: Premium quartz stone / engineered marble (white/beige with subtle veining, 20mm thick with waterfall edge)
- Backsplash: Full-height subway tile OR nano white glass panel (floor to upper cabinet)
- Upper cabinets: Matte finish acrylic / PU laminate, soft-close hinges, under-cabinet LED strip lighting
- Lower cabinets: Marine ply carcass with tandem box drawers, pull-out waste bin, corner carousel unit
- Built-in appliances: Stainless steel chimney hood, 3-burner glass top hob, under-mount SS 304 double bowl sink
- Color scheme: Two-tone — uppers in lighter shade (white/cream), lowers in contrasting bold color (navy/charcoal/forest green)
- Hardware: Sleek contemporary profile handles in brushed nickel or matte black
- Tall pantry unit with pull-out shelves
- Under-cabinet task lighting (warm white LED strip)

LANDSCAPING & SURROUNDINGS:
- 1.5m compound wall with pilaster columns every 3m and decorative coping
- Metal sliding gate with tall gate pillars at driveway entrance
- Interlocking paver driveway for car parking
- Lush green grass lawn in front setback area
- Tall coconut palm tree and one bushy ficus/neem tree
- Trimmed green hedges along compound wall boundary
- Colorful flower beds with marigolds and bougainvillea
- Large decorative potted plants (areca palm, money plant) flanking entrance
- Stepping stone pathway from gate to entrance porch
- Terrace planter boxes visible on parapet

DIMENSION ANNOTATIONS (MUST be visible on the render like a professional architectural presentation board):
- Show overall building width (${buildingWidthM.toFixed(1)}m) with dimension line along the base
- Show overall building height (${totalHeight.toFixed(1)}m) with dimension line on the side
- Show each floor height (${floorHeight}m) with tick marks on the side
- Show plot width (${plotW}') and depth (${plotD}') with dimension lines at ground level
- Show front setback distance (${frontSetback}m) from compound wall to building face
- Label each floor: ${layout.floors.map(f => f.floorLabel).join(', ')}
- Dimension lines should be thin white or light lines with arrows/ticks at ends, text in clean sans-serif font
- Place dimensions outside the building silhouette, not overlapping the facade
- Style: architectural presentation board annotations — professional, clean, readable

RENDER QUALITY:
- ${viewDesc[viewAngle]}
- Photorealistic V-Ray/Lumion quality architectural visualization
- The building proportions MUST accurately reflect the actual measurements above — width-to-height ratio must be correct
- Realistic material textures: plastered walls, glass reflections, wood grain, granite, metal
- Soft ambient occlusion shadows, contact shadows under overhangs
- Indian residential neighborhood context
- Clear blue sky with a few white clouds
- Small "neevv" brand text discreetly placed at bottom-right corner of the image in a professional architectural font
- 16:9 aspect ratio, high resolution, sharp details`;

  return prompt;
}

/** Generate view-specific prompts for a 4-view elevation set */
export function buildElevationPrompts(
  layout: Layout,
  requirements: ProjectRequirements
): { view: string; prompt: string }[] {
  return [
    { view: 'Front 3/4 Perspective', prompt: buildArchitecturalPrompt(layout, requirements, 'front-3/4') },
    { view: 'Front Elevation', prompt: buildArchitecturalPrompt(layout, requirements, 'front-elevation') },
    { view: 'Rear 3/4 Perspective', prompt: buildArchitecturalPrompt(layout, requirements, 'rear-3/4') },
    { view: 'Bird Eye View', prompt: buildArchitecturalPrompt(layout, requirements, 'bird-eye') },
  ];
}
