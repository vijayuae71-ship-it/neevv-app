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

  // Determine facade description based on facing
  let facadeDesc = '';
  if (facing === 'North' || facing === 'East') {
    facadeDesc = 'bright mustard saffron (#D49428) front facade with terracotta orange (#E07030) accent band near entrance, sky blue (#70B8D8) left side wall, mint green (#88C898) right side wall';
  } else {
    facadeDesc = 'warm terracotta orange (#E07030) front facade with mustard saffron (#D49428) accent panel, sky blue (#70B8D8) left side wall, mint green (#88C898) right side wall';
  }

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

FACADE & COLORS (Bold Indian Contemporary Style):
- ${facadeDesc}
- Rich brown wood cladding panels (#7B5B3A) with decorative horizontal slats on front facade accent zone
- Color-coordinated parapets matching each wall face
- Dark brown (#4A3520) window frames and door surrounds
- White UPVC window frames with 4-pane glass mullion grid, clearly visible glass panels with subtle blue-green tint
- Solid wood main entrance door with raised panels and granite threshold
- Concrete chajja (sunshade projection) above every window in matching wall color
- Protruding window sills
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
