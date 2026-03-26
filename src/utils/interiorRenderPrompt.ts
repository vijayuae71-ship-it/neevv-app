import type { Room, RoomInterior, InteriorMoodBoard } from '../types';
import { STYLE_TEMPLATES } from './interiorTemplates';

/* ================================================================
   INTERIOR ROOM AI PROMPT BUILDER
   Generates Gemini prompts for:
   1. Architectural Plan View (top-down schematic)
   2. Wall Elevation View (front elevation with material callouts)
   3. Photorealistic 3D Interior Render
   ================================================================ */

const mmToFtIn = (mm: number): string => {
  const totalInches = mm / 25.4;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return inches > 0 ? `${ft}'-${inches}"` : `${ft}'-0"`;
};

const mToFt = (m: number): string => {
  const ft = Math.round(m * 3.281);
  return `${ft}'`;
};

const mToFtNum = (m: number): number => Math.round(m * 3.281);

const sqmToSqft = (sqm: number): number => Math.round(sqm * 10.764);

/** Get room dimensions in multiple units */
function getRoomDims(room: Room) {
  const widthFt = mToFtNum(room.width);
  const depthFt = mToFtNum(room.depth);
  const widthMM = Math.round(room.width * 1000);
  const depthMM = Math.round(room.depth * 1000);
  const areaSqft = sqmToSqft(room.width * room.depth);
  const widthCm = Math.round(room.width * 100);
  const depthCm = Math.round(room.depth * 100);
  return { widthFt, depthFt, widthMM, depthMM, areaSqft, widthCm, depthCm };
}

/** Get style-specific material descriptions */
function getStyleMaterials(moodBoard: InteriorMoodBoard) {
  return {
    materials: moodBoard.keyMaterials.join(', '),
    furniture: moodBoard.keyFurniture.join(', '),
    palette: moodBoard.palette,
    styleName: moodBoard.styleName,
  };
}

/* ----------------------------------------------------------------
   ROOM-SPECIFIC FIXTURE DESCRIPTIONS
   ---------------------------------------------------------------- */

function getBathroomFixtures(dims: ReturnType<typeof getRoomDims>) {
  const isCompact = dims.areaSqft < 40;
  return {
    fixtures: [
      isCompact ? 'Wall-hung EWC (European Water Closet)' : 'Floor-mount EWC with concealed cistern',
      isCompact ? 'Wall-mount wash basin 450mm' : 'Counter-top wash basin on vanity unit 600mm',
      isCompact ? 'Corner shower with tempered glass partition' : 'Shower enclosure 900×900mm with rain shower head',
      'Health faucet (jet spray)',
      'Towel rail (600mm SS 304)',
      'Mirror with LED backlight',
      isCompact ? 'Shelf niche 300×300mm in shower wall' : 'Recessed niche 400×300mm with accent tile',
      'Floor trap with grating 150×150mm',
      'Door: 750mm (opens outward)',
    ],
    zones: [
      { name: 'DRY ZONE', desc: 'Vanity + WC area', color: 'light blue tint' },
      { name: 'WET ZONE', desc: 'Shower area with glass partition', color: 'medium blue tint' },
      { name: 'CIRCULATION', desc: `Clear path ${isCompact ? '2\'-0"' : '2\'-6"'} min width`, color: 'dashed outline' },
    ],
    wallTiling: 'Full height ceramic tiles up to 7\'-0" (2100mm), paint above',
    floorTiling: 'Anti-skid ceramic tiles with 1:40 slope towards floor trap',
  };
}

function getKitchenFixtures(dims: ReturnType<typeof getRoomDims>) {
  const isCompact = dims.areaSqft < 55;
  const layout = isCompact ? 'L-shaped' : (dims.widthFt >= 8 ? 'U-shaped' : 'L-shaped');
  return {
    layout,
    fixtures: [
      `${layout} modular kitchen counter — Marine ply carcass`,
      'Countertop: Polished White Quartz / Engineered Marble (20mm thick, waterfall edge)',
      'Backsplash: Subway tile / Nano white glass (full height between upper and lower cabinets)',
      'Upper cabinets: Acrylic/PU laminate, soft-close hinges (350mm deep, 750mm high)',
      'Lower cabinets: Tandem box drawers, corner carousel, bottle pull-out (600mm deep, 850mm high)',
      'Tall pantry unit with pull-out shelves (600×600×2100mm)',
      'Auto-clean chimney hood 60cm (filterless)',
      '3-burner glass top hob with auto-ignition',
      'SS 304 under-mount single/double bowl sink (24"×18")',
      'Under-cabinet LED strip lighting (warm white 3000K)',
      `Clear circulation path: ${isCompact ? '3\'-6"' : '4\'-0"'} wide`,
      'Plinth: 100mm SS kick plate',
    ],
    zones: [
      { name: 'COOKING ZONE', desc: 'Hob + chimney', color: 'warm orange tint' },
      { name: 'WASH ZONE', desc: 'Sink + dishwasher area', color: 'light blue tint' },
      { name: 'PREP ZONE', desc: 'Counter workspace', color: 'light green tint' },
      { name: 'STORAGE ZONE', desc: 'Tall unit + pantry', color: 'light yellow tint' },
      { name: 'CIRCULATION', desc: `${isCompact ? '3\'-6"' : '4\'-0"'} clear path`, color: 'dashed outline' },
    ],
    dimensions: {
      counterHeight: '850mm (34") from FFL',
      upperCabinetBottom: '1450mm from FFL',
      backsplashHeight: '600mm (between counter and upper)',
      plinthHeight: '100mm',
      counterDepth: '600mm (24")',
    },
  };
}

function getBedroomFixtures(dims: ReturnType<typeof getRoomDims>, isMaster: boolean) {
  return {
    fixtures: [
      isMaster ? 'King bed 6\'×6\'6" (1800×2000mm) with upholstered headboard' : 'Queen bed 5\'×6\'6" (1500×2000mm)',
      isMaster ? '2× side tables 500×400mm' : '1× side table 450×400mm',
      `Wardrobe ${isMaster ? '8\'-0"' : '6\'-0"'} wide × 2\'-0" deep × 8\'-0" high (loft + shutter)`,
      isMaster ? 'Dressing table with mirror 1200×450mm' : 'Study table 1200×600mm',
      isMaster ? 'TV unit wall-mounted 1500×400mm' : '',
      'AC point location (split unit)',
      `Window: ${isMaster ? '1500mm' : '1200mm'} wide × 1200mm high, sill at 900mm`,
      'Door: 900mm wide × 2100mm high (opens inward)',
    ].filter(Boolean),
    zones: [
      { name: 'SLEEPING ZONE', desc: `Bed area with ${isMaster ? '2' : '1'} side clearance`, color: 'soft lavender tint' },
      { name: 'STORAGE ZONE', desc: 'Wardrobe wall', color: 'warm beige tint' },
      { name: 'ACTIVITY ZONE', desc: isMaster ? 'Dressing + TV' : 'Study area', color: 'light green tint' },
      { name: 'CIRCULATION', desc: 'Min 2\'-6" clearance around bed', color: 'dashed outline' },
    ],
  };
}

function getLivingFixtures(dims: ReturnType<typeof getRoomDims>) {
  return {
    fixtures: [
      'L-shape sofa 2700×1800mm (3+2 seating) in neutral upholstery',
      'Center table 1200×600mm',
      'TV unit wall-mounted 2100×400mm with back panel',
      'Bookshelf / display unit 900×300×1800mm',
      'Console table at entrance 1200×350mm',
      'AC point (split unit)',
      'Main window: 1800mm wide × 1200mm high',
      'Balcony door: 1200mm sliding/french',
    ],
    zones: [
      { name: 'SEATING ZONE', desc: 'Sofa + center table', color: 'warm beige tint' },
      { name: 'ENTERTAINMENT', desc: 'TV unit wall', color: 'light blue tint' },
      { name: 'CIRCULATION', desc: 'Min 3\'-0" main pathway', color: 'dashed outline' },
    ],
  };
}

/* ================================================================
   PLAN VIEW PROMPT
   ================================================================ */

export function buildInteriorPlanPrompt(
  room: Room,
  interior: RoomInterior | undefined,
  moodBoard: InteriorMoodBoard,
): string {
  const dims = getRoomDims(room);
  const style = getStyleMaterials(moodBoard);
  const roomType = room.type;

  let fixtureSection = '';
  let zoneSection = '';
  let specificNotes = '';

  if (roomType === 'toilet') {
    const bath = getBathroomFixtures(dims);
    fixtureSection = bath.fixtures.map((f, i) => `${i + 1}. ${f}`).join('\n');
    zoneSection = bath.zones.map(z => `- ${z.name}: ${z.desc} (${z.color})`).join('\n');
    specificNotes = `Floor slope: 1:40 towards floor trap. Wall tiling: ${bath.wallTiling}. Floor: ${bath.floorTiling}.`;
  } else if (roomType === 'kitchen') {
    const kit = getKitchenFixtures(dims);
    fixtureSection = kit.fixtures.map((f, i) => `${i + 1}. ${f}`).join('\n');
    zoneSection = kit.zones.map(z => `- ${z.name}: ${z.desc} (${z.color})`).join('\n');
    specificNotes = `Kitchen layout: ${kit.layout}. Counter height: ${kit.dimensions.counterHeight}. Backsplash: ${kit.dimensions.backsplashHeight}. Work triangle between sink-hob-refrigerator must be efficient.`;
  } else if (roomType === 'master_bedroom' || roomType === 'bedroom') {
    const bed = getBedroomFixtures(dims, roomType === 'master_bedroom');
    fixtureSection = bed.fixtures.map((f, i) => `${i + 1}. ${f}`).join('\n');
    zoneSection = bed.zones.map(z => `- ${z.name}: ${z.desc} (${z.color})`).join('\n');
    specificNotes = 'Bed head against wall opposite to door entry. Wardrobe near door wall for easy access. Min 750mm clearance on dressing side.';
  } else if (roomType === 'hall') {
    const liv = getLivingFixtures(dims);
    fixtureSection = liv.fixtures.map((f, i) => `${i + 1}. ${f}`).join('\n');
    zoneSection = liv.zones.map(z => `- ${z.name}: ${z.desc} (${z.color})`).join('\n');
    specificNotes = 'TV wall opposite sofa. Main circulation path from entrance to other rooms. Sofa facing entertainment zone.';
  } else {
    // Generic room
    fixtureSection = (interior?.furniture || []).map((f, i) => `${i + 1}. ${f.name} (${f.widthMM}×${f.depthMM}mm)`).join('\n');
    zoneSection = '- MAIN ZONE: Primary function area\n- CIRCULATION: Clear path minimum 2\'-6"';
  }

  return `PROFESSIONAL ARCHITECTURAL INTERIOR PLAN drawing of a ${room.name} — ${style.styleName} style.

This must look like a professional architect's/draftsman's plan drawing — NOT a 3D render. Clean technical drawing on white/light background with blue-gray linework.

ROOM SPECIFICATIONS:
- Room name: ${room.name}
- Room width: ${dims.widthFt}'-0" (${dims.widthCm} cm / ${dims.widthMM} mm)
- Room depth: ${dims.depthFt}'-0" (${dims.depthCm} cm / ${dims.depthMM} mm)
- Carpet area: ${dims.areaSqft} sq.ft
- Clear height: 10'-0" (3050mm) floor to ceiling
- Wall thickness: 230mm (9" brick/block) — shown as double-line hatched walls

FIXTURES & ELEMENTS:
${fixtureSection}

ZONE MAPPING (color-coded zones with labels):
${zoneSection}

DRAWING REQUIREMENTS:
1. TOP-DOWN PLAN VIEW — orthographic projection, NO perspective
2. Double-line walls (230mm thick) with cross-hatch pattern showing brick/block
3. Door shown as 90° arc swing with door leaf line
4. Window shown as double parallel lines with glass indication
5. Each fixture drawn in PLAN VIEW with realistic proportions — NOT just labeled rectangles
   - Toilet/WC: Show bowl outline from top, cistern rectangle behind
   - Wash basin: Oval/rectangular basin outline on counter
   - Shower: Dashed enclosure with shower head symbol (⊗)
   - Bed: Rectangle with pillow shapes at head, headboard line
   - Sofa: Rounded armrest outline, seat cushion divisions
   - Kitchen counter: L/U shape with sink circle, hob circles (3 burners), chimney hood dashed outline above
   - Wardrobe: Rectangle with shutter division lines and handle marks
6. DIMENSION CHAINS on all 4 sides:
   - Overall room dimensions (width × depth) as primary chain
   - Internal dimensions for fixture positions as secondary chain
   - Extension lines, tick marks at ends, dimension text above line
   - Text: clean architectural font, dimensions in BOTH feet-inches AND mm
7. ZONE LABELS with boundary lines:
   - Each zone has a label with leader arrow pointing to the zone area
   - Zones separated by thin dashed lines
   - Zone name in CAPS, description in regular text
8. MATERIAL LEGEND in bottom-right corner:
   - Floor: ${interior?.flooring?.name || 'As per style'}
   - Wall: ${interior?.wallFinish?.name || 'As per style'}
   - Counter/Platform: As specified
9. CIRCULATION PATH shown as dashed arrows with width annotation
10. North arrow symbol in top-right
11. Scale bar at bottom: 1:20 metric scale
12. Title block bottom: "${room.name} — FURNITURE LAYOUT PLAN" with room dimensions and area

${specificNotes}

STYLE: Clean technical linework. Thin lines (0.25mm) for fixtures, medium (0.5mm) for dimensions, thick (0.7mm) for walls. Blue-gray ink color palette. White/off-white background. Professional architectural sheet appearance.

IMPORTANT: This is a TECHNICAL PLAN drawing, not a decorative illustration. It should look exactly like what a draftsman would produce on a drawing board — precise, measured, annotated.

Small "neevv" brand text at bottom-right corner.
Image aspect ratio: 1:1 (square).`;
}

/* ================================================================
   ELEVATION VIEW PROMPT
   ================================================================ */

export function buildInteriorElevationPrompt(
  room: Room,
  interior: RoomInterior | undefined,
  moodBoard: InteriorMoodBoard,
): string {
  const dims = getRoomDims(room);
  const style = getStyleMaterials(moodBoard);
  const roomType = room.type;

  let wallDesc = '';
  let elevationElements = '';
  let dimensionDetails = '';

  if (roomType === 'toilet') {
    wallDesc = 'Bathroom long wall elevation showing shower zone to WC zone';
    elevationElements = `
- Floor level line (FFL +0.000) with anti-skid tile pattern (staggered bond)
- Dado tiles from floor to 7'-0" height (2100mm) with tile joint pattern
- Paint finish above 2100mm to ceiling (3050mm)
- Wall-hung EWC with concealed cistern (flush plate symbol) — side view profile
- Wash basin on vanity counter at 850mm height — front view with faucet
- Mirror above basin (LED backlit border)
- Shower zone: rain head at 2100mm, hand shower at 1200mm, glass partition line
- Recessed niche: 400×300mm at 1200mm height with accent tile
- Towel rail at 1500mm height
- Health faucet at 600mm height near WC
- Exhaust fan symbol at 2400mm height`;
    dimensionDetails = `
- FFL to dado tile top: 2100mm
- FFL to vanity counter: 850mm
- FFL to mirror bottom: 1050mm / mirror top: 1650mm
- FFL to shower head: 2100mm
- FFL to ceiling: 3050mm
- Door height: 2100mm, width: 750mm`;
  } else if (roomType === 'kitchen') {
    wallDesc = 'Kitchen counter wall elevation — the primary working wall';
    elevationElements = `
- Floor level (FFL +0.000) with vitrified tile pattern
- SS kick plinth: 0–100mm (metal hatch)
- Lower cabinets: 100–950mm (shutter faces with handle hardware, show 3-4 shutters + 2 drawer stacks)
- Countertop band: 950–970mm (20mm quartz — show nose edge profile, speckle texture)
- Backsplash zone: 970–1570mm (600mm of subway tile in brick bond pattern OR nano glass)
- Under-cabinet LED strip: dashed line at 1570mm
- Upper cabinets: 1570–2320mm (750mm high — show 3-4 shutter faces with handles, soft-close hinge symbols)
- Gap/Pelmet: 2320–2400mm
- Loft cabinets: 2400–2700mm (if applicable)
- Ceiling: 3050mm

FIXTURES ON ELEVATION:
- Sink with faucet (gooseneck mixer tap profile) — front view
- 3-burner glass hob — top visible with burner rings
- Chimney hood above hob — trapezoidal profile with filter grille
- Tall pantry unit at one end — full height with pull-out shelves visible
- Corner carousel zone indication

DIMENSION CHAIN (vertical on left side):
100 plinth → 850 lower cabinet → 20 counter → 600 backsplash → 750 upper cabinet → (loft if any) → ceiling

DIMENSION CHAIN (horizontal on top):
Show each cabinet module width
Show sink position, hob position

HARDWARE CALLOUTS with leader arrows:
- "Hettich Tandem Box" pointing to drawer
- "Soft-close hinge" pointing to upper cabinet
- "SS 304 Sink" pointing to sink
- "Auto-clean chimney" pointing to hood
- "Quartz 20mm" pointing to countertop edge
- "Subway tile backsplash" pointing to splash zone`;
    dimensionDetails = `Counter height: 950mm, Backsplash: 600mm, Upper cabinet: 750mm high starting at 1570mm`;
  } else if (roomType === 'master_bedroom' || roomType === 'bedroom') {
    wallDesc = 'Wardrobe wall elevation — full wall view showing wardrobe + loft';
    const wWidth = roomType === 'master_bedroom' ? '2400mm (8\'-0")' : '1800mm (6\'-0")';
    elevationElements = `
- Floor level (FFL +0.000) with flooring pattern
- Wardrobe unit: ${wWidth} wide × 600mm deep × 2400mm high
  - Lower section (0–2100mm): 4 shutters with wood grain/laminate finish, handles at 1050mm
  - Loft section (2100–2400mm): 2 smaller loft shutters with separate handles
  - Internal layout hint: dashed lines showing shelf positions
- Adjacent elements:
  ${roomType === 'master_bedroom' ? '- Dressing table zone (1200mm wide) with mirror above' : '- Study table zone (1200mm wide)'}
  - AC unit (split) at 2400mm height — profile view
  - Switch board at 1200mm height — rectangular outline with switch symbols
  - Window on adjacent wall if visible — show frame profile in side elevation
- Ceiling line at 3050mm with false ceiling drop indication (dashed at 2750mm)`;
    dimensionDetails = `Wardrobe: 0-2100mm shutters, 2100-2400mm loft. Total width: ${wWidth}. Depth: 600mm.`;
  } else if (roomType === 'hall') {
    wallDesc = 'TV unit wall elevation — the primary entertainment wall';
    elevationElements = `
- Floor level (FFL +0.000) with flooring pattern
- TV unit (2100mm wide × 400mm deep):
  - Base unit: FFL to 450mm — drawers/shutters
  - Open shelf zone: 450–600mm — books/decor display
  - TV panel: 600–1800mm — back panel with 55" TV outline (1230×710mm) mounted center
  - Floating shelves flanking TV
  - Concealed wiring chase behind panel
- Wall elements:
  - Feature wall treatment (accent paint/wallpaper/texture) behind TV unit
  - Spot lights on ceiling pointing at feature wall
  - AC unit at 2400mm
  - Switch board 1200mm height
- Ceiling: 3050mm with false ceiling at 2750mm, cove LED around TV wall`;
    dimensionDetails = `TV unit base: 0-450mm. TV center: 1200mm from FFL. Total unit width: 2100mm.`;
  } else {
    wallDesc = `${room.name} — primary wall elevation`;
    elevationElements = 'Show major wall elements, door, window, any built-in furniture';
    dimensionDetails = `Room height: 3050mm. Door: 2100mm. Window sill: 900mm.`;
  }

  return `PROFESSIONAL ARCHITECTURAL INTERIOR WALL ELEVATION drawing — ${room.name}, ${style.styleName} style.

This must look like a draftsman's elevation drawing — NOT a 3D render. Clean technical side-view projection with precise dimensions.

ROOM: ${room.name}
ROOM SIZE: ${dims.widthFt}'-0" × ${dims.depthFt}'-0" (${dims.areaSqft} sq.ft)
WALL SHOWN: ${wallDesc}
CLEAR HEIGHT: 10'-0" (3050mm) floor to ceiling

ELEVATION ELEMENTS:
${elevationElements}

DIMENSIONS:
${dimensionDetails}

DRAWING STANDARDS:
1. FRONT ELEVATION VIEW — orthographic projection, NO perspective
2. Show the wall as a clean rectangular frame (room width × 3050mm height)
3. All elements drawn with proper architectural conventions:
   - Visible edges: solid lines (0.5mm)
   - Hidden/behind edges: dashed lines (0.25mm)
   - Walls/structure: thick lines (0.7mm)
   - Dimension lines: thin (0.18mm) with extension lines and tick marks
4. MATERIAL INDICATIONS:
   - Wood grain: diagonal parallel lines
   - Tile: brick-bond or grid pattern
   - Glass: diagonal cross hatch or light blue fill
   - Metal: dense cross hatch
   - Stone/counter: subtle speckle dots
5. VERTICAL DIMENSION CHAIN on left side showing all key heights
6. HORIZONTAL DIMENSION CHAIN on top showing all widths
7. CALLOUT LEADERS with arrows pointing to specific materials and hardware
8. Level marks: FFL +0.000, counter top, window sill, door head, ceiling
9. Title block: "${room.name} — WALL ELEVATION (${wallDesc.split('—')[0].trim()})" with scale 1:20
10. Scale bar at bottom

COLORS: Materials shown with appropriate texture fills on white background. Blue-gray linework. Callout text in black. Zone fills in very light watercolor washes (barely visible tints).

Small "neevv" brand text at bottom-right corner.
Image aspect ratio: 16:9 (landscape).`;
}

/* ================================================================
   3D INTERIOR RENDER PROMPT
   ================================================================ */

export function buildInterior3DPrompt(
  room: Room,
  interior: RoomInterior | undefined,
  moodBoard: InteriorMoodBoard,
): string {
  const dims = getRoomDims(room);
  const style = getStyleMaterials(moodBoard);
  const palette = moodBoard.palette;
  const roomType = room.type;

  let roomSpecificDesc = '';
  let furnitureDesc = '';
  let materialDesc = '';
  let lightingDesc = '';
  let cameraDesc = '';

  if (roomType === 'toilet') {
    roomSpecificDesc = `Compact Indian bathroom (${dims.widthFt}'×${dims.depthFt}') with wet and dry zone separation.`;
    furnitureDesc = `
- Wall-hung WC with concealed cistern and dual-flush plate
- Vanity counter with rectangular wash basin, single-lever mixer tap
- LED-backlit rectangular mirror above vanity
- Glass shower partition (8mm tempered clear glass) with SS 304 fittings
- Rain shower head (200mm round) + adjustable hand shower on slide bar
- Recessed wall niche with accent tile for toiletries
- Towel rail and robe hook in brushed SS finish
- Health faucet near WC`;
    materialDesc = `
- Floor: Anti-skid ceramic tiles in ${palette.wall} tones, staggered bond, 300×300mm
- Walls: ${interior?.wallFinish?.name || 'Ceramic wall tiles'} full height up to 7ft, paint above
- Counter: Quartz/engineered stone in white with waterfall edge
- Accent: One feature wall with contrasting patterned tile (herringbone or hexagonal)
- Fixtures: Chrome/brushed nickel finish hardware throughout
- Glass: Clear tempered glass shower partition with frameless mounting`;
    lightingDesc = 'Warm white 3000K LED mirror backlight, recessed ceiling downlights (IP65 rated), accent light in niche';
    cameraDesc = 'Interior eye-level camera at door entry looking into the bathroom at slight angle to show both wet and dry zones. 24mm lens equivalent.';
  } else if (roomType === 'kitchen') {
    const kit = getKitchenFixtures(dims);
    roomSpecificDesc = `Modern Indian modular kitchen (${dims.widthFt}'×${dims.depthFt}') with ${kit.layout} layout, designed for Indian cooking with heavy-duty ventilation.`;
    furnitureDesc = `
- ${kit.layout} modular counter with handleless profile cabinets
- Upper cabinets in lighter shade (white/cream matte acrylic finish) with soft-close hinges
- Lower cabinets in contrasting bold color (navy blue / charcoal / forest green) with tandem box drawers
- Quartz countertop (20mm, polished white with subtle grey veining, waterfall edge at island/end)
- Full-height subway tile backsplash in white/cream between counter and upper cabinets
- Built-in 3-burner glass top hob with auto-ignition
- Auto-clean filterless chimney hood (60cm, stainless steel + glass canopy)
- Under-mount SS 304 double bowl sink with gooseneck mixer faucet
- Under-cabinet LED strip (warm white 3000K, continuous strip)
- Tall pantry pull-out unit at one end
- Corner carousel / magic corner unit
- Bottle pull-out beside hob
- Cutlery tray inserts in drawers visible slightly open
- SS kick plinth at base`;
    materialDesc = `
- Floor: ${interior?.flooring?.name || 'Italian vitrified tiles'} (600×600mm)
- Counter: Premium polished quartz (white/light grey with fine veining)
- Backsplash: White subway tiles in running bond (or nano white glass panel)
- Cabinet finish: Marine ply carcass + PU/acrylic laminate (two-tone: light uppers, dark lowers)
- Hardware: Hettich/Hafele soft-close, tandem boxes, brushed nickel/matte black handles
- Sink: SS 304 under-mount satin finish
- Ceiling: Gypsum false ceiling with recessed lights above work zones`;
    lightingDesc = 'Under-cabinet LED strip (continuous warm white), recessed ceiling downlights over work zones, pendant light over counter if space permits, chimney hood integrated light';
    cameraDesc = 'Interior view from kitchen doorway at eye level, slight angle to see the L-shape/U-shape counter layout. Show counter depth, cabinet heights, and backsplash. 28mm lens.';
  } else if (roomType === 'master_bedroom' || roomType === 'bedroom') {
    const isMaster = roomType === 'master_bedroom';
    roomSpecificDesc = `${isMaster ? 'Master' : 'Guest'} bedroom (${dims.widthFt}'×${dims.depthFt}') — ${style.styleName} design.`;
    furnitureDesc = `
- ${isMaster ? 'King size bed (6\'×6\'6") with tall upholstered/wooden headboard panel' : 'Queen size bed (5\'×6\'6") with headboard'}
- ${isMaster ? 'Matching side tables on both sides with table lamps' : 'One side table with lamp'}
- Full-height wardrobe (${isMaster ? '8ft' : '6ft'} wide) with ${style.styleName.toLowerCase()} finish shutters, loft section on top
- ${isMaster ? 'Wall-mounted TV unit with floating shelf and back panel' : 'Study table with bookshelf above'}
- ${isMaster ? 'Dressing table with mirror and stool' : ''}
- Curtains: Full-length blackout curtains with sheer layer
- AC split unit mounted at 7ft height`.trim();
    materialDesc = `
- Floor: ${interior?.flooring?.name || style.materials.split(',')[0]}
- Walls: ${interior?.wallFinish?.name || 'Premium emulsion paint'} — ${palette.wall}
- Accent wall behind bed: ${moodBoard.style === 'contemporary_indian' ? 'Textured paint / ethnic wallpaper' : moodBoard.style === 'industrial' ? 'Exposed brick cladding' : 'Feature wallpaper / panel moulding'}
- Wardrobe: ${style.furniture.split(',')[0]} finish
- Ceiling: Gypsum false ceiling with peripheral cove + center flat`;
    lightingDesc = `Warm ambient cove LED in false ceiling (2700K), bedside wall sconces or table lamps, recessed downlights, AC indicator light`;
    cameraDesc = `Eye-level interior view from door entry at slight angle, capturing bed, headboard accent wall, one window with light streaming in. ${isMaster ? 'Show wardrobe wall partially visible on left/right.' : 'Show study zone on one side.'} 24mm lens.`;
  } else if (roomType === 'hall') {
    roomSpecificDesc = `Living room (${dims.widthFt}'×${dims.depthFt}') — ${style.styleName} style, the social hub of the home.`;
    furnitureDesc = `
- L-shape sofa (2700×1800mm) in ${moodBoard.style === 'industrial' ? 'leather' : 'fabric'} upholstery (${palette.primary} tone)
- Center table — ${moodBoard.style === 'traditional' ? 'marble top with carved legs' : 'clean-line wooden/glass top'}
- TV unit (2100mm wide) with back panel feature wall
- ${moodBoard.style === 'contemporary_indian' ? 'Brass-inlay console table near entrance' : 'Slim console table near entrance'}
- Bookshelf / display unit on side wall
- ${moodBoard.style === 'traditional' ? 'Decorative brass lamps and ethnic artifacts' : 'Minimal décor pieces and indoor plant'}
- Curtains: Full-length with sheer layer at large window / balcony door`;
    materialDesc = `
- Floor: ${interior?.flooring?.name || style.materials.split(',')[0]}
- Walls: ${interior?.wallFinish?.name || 'Emulsion paint'} in ${palette.wall}
- TV feature wall: ${moodBoard.style === 'industrial' ? 'Brick cladding / concrete texture' : 'PU-panel / wallpaper / textured paint'}
- Ceiling: False ceiling with cove LED perimeter, flat center with downlights
- Sofa: Premium upholstery fabric in ${palette.primary}
- Rug: ${moodBoard.style === 'scandinavian' ? 'Woven jute / wool rug' : moodBoard.style === 'contemporary_indian' ? 'Handloom dhurrie' : 'Area rug in neutral tone'}`;
    lightingDesc = `Cove LED (warm white 3000K) around false ceiling, 4× recessed downlights, pendant/chandelier at center, wall-wash lights on feature wall, natural light from window/balcony door`;
    cameraDesc = `Interior view at seated eye level from corner, capturing sofa arrangement, TV wall, and window with natural light. Show ceiling cove lighting and floor. 20mm wide lens for spacious feel.`;
  } else {
    roomSpecificDesc = `${room.name} (${dims.widthFt}'×${dims.depthFt}') — ${style.styleName} style.`;
    furnitureDesc = (interior?.furniture || []).map(f => `- ${f.name}`).join('\n');
    materialDesc = `Floor: ${interior?.flooring?.name || 'Standard'}. Walls: ${interior?.wallFinish?.name || 'Standard'}.`;
    lightingDesc = 'Warm white ceiling lights, accent lighting as needed';
    cameraDesc = 'Interior eye-level view from entry doorway at slight angle. 24mm lens.';
  }

  return `PROFESSIONAL PHOTOREALISTIC INTERIOR 3D RENDER of ${room.name} — ${style.styleName} style.

This must look like a high-end interior design visualization (V-Ray / Corona Renderer quality). Photorealistic materials, accurate proportions, beautiful lighting.

ROOM: ${roomSpecificDesc}

EXACT DIMENSIONS (render must be proportionally accurate):
- Room width: ${dims.widthFt}'-0" (${dims.widthMM}mm)
- Room depth: ${dims.depthFt}'-0" (${dims.depthMM}mm)
- Carpet area: ${dims.areaSqft} sq.ft
- Floor-to-ceiling: 10'-0" (3050mm)
- False ceiling: 9'-0" (2750mm)

FURNITURE & FIXTURES:
${furnitureDesc}

MATERIALS & FINISHES (${style.styleName}):
${materialDesc}

COLOR PALETTE:
- Primary: ${palette.primary} (${palette.name})
- Secondary: ${palette.secondary}
- Accent: ${palette.accent}
- Walls: ${palette.wall}
- Ceiling: ${palette.ceiling}

LIGHTING:
${lightingDesc}

CAMERA & COMPOSITION:
${cameraDesc}

RENDER QUALITY:
- Photorealistic V-Ray/Corona quality — NOT a sketch or illustration
- Accurate material textures: wood grain, tile joints, fabric weave, metal reflections
- Soft global illumination with natural light from window + warm artificial lighting
- Subtle ambient occlusion and contact shadows
- Show actual proportions — room should FEEL like ${dims.widthFt}'×${dims.depthFt}' (${dims.areaSqft} sq.ft)
- Depth of field: slight bokeh on background elements
- Professional interior photography composition
- High resolution, sharp details, 8K quality

DIMENSION ANNOTATIONS (overlaid on render):
- Show room width and depth as thin dimension lines at floor level
- Label key fixture dimensions (e.g., "Counter Ht: 850mm", "Wardrobe: 8'×8'")
- Annotations in clean white/light sans-serif font, semi-transparent background
- Professional architectural presentation board style

Small "neevv" brand text at bottom-right corner.
Image aspect ratio: 16:9 (landscape).`;
}

/* ================================================================
   COMBINED PROMPT SET FOR A ROOM
   ================================================================ */

export type InteriorRenderType = 'plan' | 'elevation' | 'render3d';

export function buildInteriorRoomPrompt(
  type: InteriorRenderType,
  room: Room,
  interior: RoomInterior | undefined,
  moodBoard: InteriorMoodBoard,
): string {
  switch (type) {
    case 'plan':
      return buildInteriorPlanPrompt(room, interior, moodBoard);
    case 'elevation':
      return buildInteriorElevationPrompt(room, interior, moodBoard);
    case 'render3d':
      return buildInterior3DPrompt(room, interior, moodBoard);
  }
}
