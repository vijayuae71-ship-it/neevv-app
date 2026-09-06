import type { Room, RoomInterior, InteriorMoodBoard, InteriorScene, SceneZone, SceneOpening, SceneMaterials, SceneDimensions } from '../types';
import { buildInteriorScene } from './buildInteriorScene';

/* ================================================================
   INTERIOR ROOM AI PROMPT BUILDER — "Locked Interior Scene" edition
   ----------------------------------------------------------------
   Every prompt builder below consumes the SAME `InteriorScene`
   object (see buildInteriorScene.ts). None of them branch on
   room type — all room-type-specific decisions (which fixtures
   exist, their sizes, mount heights, materials, zones, openings)
   were already resolved once when the scene was built. These
   builders only serialize that resolved data into text for the
   three render types (plan / elevation / render3d), so the three
   outputs can never disagree about what is actually in the room.
   ================================================================ */

export type InteriorRenderType = 'plan' | 'elevation' | 'render3d';

/* ----------------------------------------------------------------
   Serialization helpers — shared by all three prompt builders
   ---------------------------------------------------------------- */

function serializeFurnitureForPlan(scene: InteriorScene): string {
  const lines: string[] = [];
  let n = 1;
  for (const f of scene.furniture) {
    lines.push(`${n++}. ${f.name} — ${f.widthMM}×${f.depthMM}mm, ${f.heightMM}mm high, on ${f.wall} wall. ${f.description} (${f.material})`);
  }
  for (const fx of scene.fixtures) {
    lines.push(`${n++}. ${fx.name} — ${fx.widthMM}×${fx.depthMM}mm, mounted at ${fx.mountHeightMM}mm on ${fx.wall} wall/floor. ${fx.description} (${fx.material})`);
  }
  return lines.join('\n');
}

function serializeFurnitureForElevation(scene: InteriorScene): string {
  type Item = { name: string; bottomMM: number; topMM: number; wall: string; material: string; description: string };
  const items: Item[] = [
    ...scene.furniture.map(f => ({ name: f.name, bottomMM: 0, topMM: f.heightMM, wall: f.wall, material: f.material, description: f.description })),
    ...scene.fixtures.map(fx => ({ name: fx.name, bottomMM: fx.mountHeightMM, topMM: fx.mountHeightMM + fx.heightMM, wall: fx.wall, material: fx.material, description: fx.description })),
  ];
  items.sort((a, b) => a.bottomMM - b.bottomMM);
  return items
    .map(it => `- ${it.name}: ${it.bottomMM}mm to ${it.topMM}mm from FFL, on ${it.wall} wall. ${it.description} (${it.material})`)
    .join('\n');
}

function serializeFurnitureFor3D(scene: InteriorScene): string {
  const lines: string[] = [];
  for (const f of scene.furniture) {
    lines.push(`- ${f.name} (${f.widthMM}×${f.depthMM}×${f.heightMM}mm): ${f.description}, finish: ${f.material}, tone: ${f.color}`);
  }
  for (const fx of scene.fixtures) {
    lines.push(`- ${fx.name} (${fx.widthMM}×${fx.depthMM}×${fx.heightMM}mm, at ${fx.mountHeightMM}mm height): ${fx.description}, finish: ${fx.material}`);
  }
  return lines.join('\n');
}

function serializeZones(zones: SceneZone[]): string {
  return zones.map(z => `- ${z.name}: ${z.description} (${z.color})`).join('\n');
}

function serializeOpenings(openings: SceneOpening[]): string {
  return openings
    .map(o => {
      if (o.type === 'door') {
        return `- Door on ${o.wall} wall: ${o.widthMM}mm wide × ${o.heightMM}mm high, opens ${o.openDirection || 'inward'}, ${o.material}`;
      }
      return `- Window on ${o.wall} wall: ${o.widthMM}mm wide × ${o.heightMM}mm high, sill at ${o.sillHeightMM}mm, ${o.material}`;
    })
    .join('\n');
}

function serializeMaterials(materials: SceneMaterials): string {
  const lines: string[] = [
    `Floor: ${materials.flooring.name} (${materials.flooring.finish}${materials.flooring.tileSize ? `, ${materials.flooring.tileSize} tiles` : ''})`,
    `Wall: ${materials.wallFinish.name} (${materials.wallFinish.finish})`,
  ];
  if (materials.accentWall) {
    lines.push(`Accent wall: ${materials.accentWall.name} — ${materials.accentWall.description}`);
  }
  if (materials.countertop) {
    lines.push(`Countertop: ${materials.countertop.name}, ${materials.countertop.thickness}mm thick, ${materials.countertop.finish}`);
  }
  lines.push(
    `Ceiling: ${materials.ceiling.type.replace(/_/g, ' ')} at ${materials.ceiling.height}mm${
      materials.ceiling.falseCeilingHeight ? ` (false ceiling drop to ${materials.ceiling.falseCeilingHeight}mm)` : ''
    }, ${materials.ceiling.finish}`,
  );
  return lines.join('\n');
}

function serializeKeyDimensions(dims: SceneDimensions): string {
  const lines: string[] = [];
  if (dims.counterHeight !== undefined) lines.push(`Counter height: ${dims.counterHeight}mm`);
  if (dims.upperCabinetBottom !== undefined) lines.push(`Upper cabinet bottom: ${dims.upperCabinetBottom}mm`);
  if (dims.backsplashHeight !== undefined) lines.push(`Backsplash height: ${dims.backsplashHeight}mm`);
  if (dims.plinthHeight !== undefined) lines.push(`Plinth height: ${dims.plinthHeight}mm`);
  if (dims.dadoHeight !== undefined) lines.push(`Dado tile height: ${dims.dadoHeight}mm`);
  return lines.length ? lines.join('\n') : 'No special vertical datums for this room.';
}

function serializeElectricalPoints(ep: InteriorScene['electricalPoints']): string {
  const lines: string[] = [
    `S  — Switches: ${ep.switches} nos. (mount height: 1200mm from FFL)`,
    `P  — Sockets: ${ep.sockets} nos. (mount height: 300mm from FFL, 450mm in kitchen)`,
    `D  — Data points: ${ep.dataPoints} nos. (mount height: 300mm from FFL)`,
    `L  — Light points: ${ep.lightPoints} nos. (ceiling-mounted)`,
    `F  — Fan points: ${ep.fanPoints} nos. (ceiling-mounted)`,
    `AC — AC points: ${ep.acPoints} nos. (mount height: 1800mm from FFL)`,
    `Wiring color code per IS 732: Phase = Red, Neutral = Black, Earth = Green`,
  ];
  return lines.join('\n');
}

/** Wall description for the elevation view — the one room-type-aware
 *  decision left in the prompt layer, since it only picks WHICH wall
 *  to draw, not what's on it (that's resolved in the scene already). */
function elevationWallDescription(roomType: string): string {
  switch (roomType) {
    case 'toilet':
      return 'Shower-zone-to-WC-zone wall — the primary wet/dry wall';
    case 'kitchen':
      return 'Counter wall — the primary kitchen working wall';
    case 'master_bedroom':
    case 'bedroom':
      return 'Wardrobe wall — full wall view showing wardrobe and loft';
    case 'hall':
      return 'TV unit wall — the primary entertainment wall';
    default:
      return 'Primary wall — main furnished wall of the room';
  }
}

/** Camera framing for the 3D render — the one room-type-aware
 *  decision left in the prompt layer (composition, not content). */
function render3DCameraDescription(roomType: string): string {
  switch (roomType) {
    case 'toilet':
      return 'Interior eye-level camera at door entry looking into the bathroom at a slight angle to show both wet and dry zones. 24mm lens equivalent.';
    case 'kitchen':
      return 'Interior view from kitchen doorway at eye level, slight angle to see the full counter layout, cabinet heights, and backsplash. 28mm lens.';
    case 'master_bedroom':
    case 'bedroom':
      return 'Eye-level interior view from door entry at slight angle, capturing bed, headboard accent wall, and window with natural light streaming in. 24mm lens.';
    case 'hall':
      return 'Interior view at seated eye level from a corner, capturing sofa arrangement, TV wall, and window with natural light. 20mm wide lens for a spacious feel.';
    default:
      return 'Interior eye-level view from the entry doorway at a slight angle. 24mm lens.';
  }
}

/* ================================================================
   PLAN VIEW PROMPT
   ================================================================ */

export function buildPlanPromptFromScene(scene: InteriorScene): string {
  return `PROFESSIONAL ARCHITECTURAL INTERIOR PLAN drawing of a ${scene.roomName} — ${scene.styleName} style.

This must look like a professional architect's/draftsman's plan drawing — NOT a 3D render. Clean technical drawing on white/light background with blue-gray linework.

ROOM SPECIFICATIONS:
- Room name: ${scene.roomName}
- Room width: ${scene.widthFt}'-0" (${scene.widthMM} mm)
- Room depth: ${scene.depthFt}'-0" (${scene.depthMM} mm)
- Carpet area: ${scene.areaSqft} sq.ft
- Clear height: ${Math.round(scene.clearHeightMM / 305) / 10}'-0" (${scene.clearHeightMM}mm) floor to ceiling
- Wall thickness: ${scene.wallThicknessMM}mm (9" brick/block) — shown as double-line hatched walls

FURNITURE & FIXTURES (exact list — draw each item, in this exact position/size, nothing more, nothing less):
${serializeFurnitureForPlan(scene)}

OPENINGS:
${serializeOpenings(scene.openings)}

ZONE MAPPING (color-coded zones with labels):
${serializeZones(scene.zones)}

ELECTRICAL POINTS (show with IS standard symbols on plan):
${serializeElectricalPoints(scene.electricalPoints)}
- Show switch board near door entry at 1200mm height mark
- Show socket locations along walls at standard heights
- Show light points on ceiling with ⊕ symbols
- Show fan points on ceiling with circled F
- Show AC points on wall with □AC symbol
- Dashed wiring runs from DB to each point in appropriate circuit colors

DRAWING REQUIREMENTS:
1. TOP-DOWN PLAN VIEW — orthographic projection, NO perspective
2. Double-line walls (${scene.wallThicknessMM}mm thick) with cross-hatch pattern showing brick/block
3. Door shown as 90° arc swing with door leaf line, per the openings list above
4. Window shown as double parallel lines with glass indication, per the openings list above
5. Each fixture/furniture item drawn in PLAN VIEW with realistic proportions matching the exact dimensions listed above — NOT just labeled rectangles
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
${serializeMaterials(scene.materials)
  .split('\n')
  .map(l => `   - ${l}`)
  .join('\n')}
9. CIRCULATION PATH shown as dashed arrows with width annotation
10. North arrow symbol in top-right
11. Scale bar at bottom: 1:20 metric scale
12. Title block bottom: "${scene.roomName} — FURNITURE LAYOUT PLAN" with room dimensions and area

KEY DATUMS:
${serializeKeyDimensions(scene.keyDimensions)}

NOTES: ${scene.specificNotes}

STYLE: Clean technical linework. Thin lines (0.25mm) for fixtures, medium (0.5mm) for dimensions, thick (0.7mm) for walls. Blue-gray ink color palette. White/off-white background. Professional architectural sheet appearance.

IMPORTANT: This is a TECHNICAL PLAN drawing, not a decorative illustration. It should look exactly like what a draftsman would produce on a drawing board — precise, measured, annotated. Draw ONLY the items listed above — do not invent additional furniture or fixtures.

Small "neevv" brand text at bottom-right corner.
Image aspect ratio: 1:1 (square).`;
}

/* ================================================================
   ELEVATION VIEW PROMPT
   ================================================================ */

export function buildElevationPromptFromScene(scene: InteriorScene): string {
  const wallDesc = elevationWallDescription(scene.roomType);

  return `PROFESSIONAL ARCHITECTURAL INTERIOR WALL ELEVATION drawing — ${scene.roomName}, ${scene.styleName} style.

This must look like a draftsman's elevation drawing — NOT a 3D render. Clean technical side-view projection with precise dimensions.

ROOM: ${scene.roomName}
ROOM SIZE: ${scene.widthFt}'-0" × ${scene.depthFt}'-0" (${scene.areaSqft} sq.ft)
WALL SHOWN: ${wallDesc}
CLEAR HEIGHT: ${Math.round(scene.clearHeightMM / 305) / 10}'-0" (${scene.clearHeightMM}mm) floor to ceiling
FALSE CEILING DROP: ${scene.falseCeilingHeightMM}mm

ELEVATION ELEMENTS (exact vertical stack — draw each item at its stated height range, nothing more, nothing less):
${serializeFurnitureForElevation(scene)}

OPENINGS VISIBLE ON THIS WALL OR ADJACENT (for reference):
${serializeOpenings(scene.openings)}

KEY VERTICAL DATUMS (dimension chain on left side, floor to ceiling):
${serializeKeyDimensions(scene.keyDimensions)}
- FFL +0.000 at floor
- Ceiling at ${scene.clearHeightMM}mm
- False ceiling drop at ${scene.falseCeilingHeightMM}mm

ELECTRICAL POINTS ON THIS WALL (show mount heights):
${serializeElectricalPoints(scene.electricalPoints)}
- Switch at 1200mm from FFL
- Socket at 300mm from FFL (450mm in kitchen)
- AC point at 1800mm from FFL
- Show as IS standard symbols with height dimension marks

MATERIAL CALLOUTS (leader arrows to each element):
${serializeMaterials(scene.materials)}

DRAWING STANDARDS:
1. FRONT ELEVATION VIEW — orthographic projection, NO perspective
2. Show the wall as a clean rectangular frame (room width × ${scene.clearHeightMM}mm height)
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
5. VERTICAL DIMENSION CHAIN on left side showing all key heights listed above
6. HORIZONTAL DIMENSION CHAIN on top showing all widths
7. CALLOUT LEADERS with arrows pointing to specific materials and hardware, per the material list above
8. Level marks: FFL +0.000, key datum lines, window sill, door head, ceiling
9. Title block: "${scene.roomName} — WALL ELEVATION (${wallDesc.split('—')[0].trim()})" with scale 1:20
10. Scale bar at bottom

NOTES: ${scene.specificNotes}

COLORS: Materials shown with appropriate texture fills on white background. Blue-gray linework. Callout text in black. Zone fills in very light watercolor washes (barely visible tints).

IMPORTANT: Draw ONLY the items listed above, at the exact height ranges given — do not invent additional elements or change stated dimensions.

Small "neevv" brand text at bottom-right corner.
Image aspect ratio: 16:9 (landscape).`;
}

/* ================================================================
   3D INTERIOR RENDER PROMPT
   ================================================================ */

export function build3DPromptFromScene(scene: InteriorScene): string {
  const palette = scene.palette;
  const cameraDesc = render3DCameraDescription(scene.roomType);

  return `PROFESSIONAL PHOTOREALISTIC INTERIOR 3D RENDER of ${scene.roomName} — ${scene.styleName} style.

This must look like a high-end interior design visualization (V-Ray / Corona Renderer quality). Photorealistic materials, accurate proportions, beautiful lighting.

ROOM: ${scene.roomName} (${scene.widthFt}'×${scene.depthFt}') — ${scene.styleName} style.

EXACT DIMENSIONS (render must be proportionally accurate):
- Room width: ${scene.widthFt}'-0" (${scene.widthMM}mm)
- Room depth: ${scene.depthFt}'-0" (${scene.depthMM}mm)
- Carpet area: ${scene.areaSqft} sq.ft
- Floor-to-ceiling: ${Math.round(scene.clearHeightMM / 305) / 10}'-0" (${scene.clearHeightMM}mm)
- False ceiling: ${Math.round(scene.falseCeilingHeightMM / 305) / 10}'-0" (${scene.falseCeilingHeightMM}mm)

FURNITURE & FIXTURES (exact list — render each item, in this exact position/size/material, nothing more, nothing less):
${serializeFurnitureFor3D(scene)}

OPENINGS:
${serializeOpenings(scene.openings)}

MATERIALS & FINISHES (${scene.styleName}):
${serializeMaterials(scene.materials)}

COLOR PALETTE:
- Primary: ${palette.primary} (${palette.name})
- Secondary: ${palette.secondary}
- Accent: ${palette.accent}
- Walls: ${palette.wall}
- Ceiling: ${palette.ceiling}

LIGHTING:
${scene.lighting.description}
Fixtures: ${scene.lighting.fixtures.join(', ')}

CAMERA & COMPOSITION:
${cameraDesc}

RENDER QUALITY:
- Photorealistic V-Ray/Corona quality — NOT a sketch or illustration
- Accurate material textures: wood grain, tile joints, fabric weave, metal reflections
- Soft global illumination with natural light from window + warm artificial lighting
- Subtle ambient occlusion and contact shadows
- Show actual proportions — room should FEEL like ${scene.widthFt}'×${scene.depthFt}' (${scene.areaSqft} sq.ft)
- Depth of field: slight bokeh on background elements
- Professional interior photography composition
- High resolution, sharp details, 8K quality

DIMENSION ANNOTATIONS (overlaid on render):
- Show room width and depth as thin dimension lines at floor level
- Label key fixture dimensions from the list above (e.g. mount heights, widths)
- Annotations in clean white/light sans-serif font, semi-transparent background
- Professional architectural presentation board style

NOTES: ${scene.specificNotes}

IMPORTANT: Render ONLY the furniture and fixtures listed above, in the materials/colors specified — do not invent additional items or change specified finishes.

Small "neevv" brand text at bottom-right corner.
Image aspect ratio: 16:9 (landscape).`;
}

/* ================================================================
   DISPATCH
   ================================================================ */

export function buildPromptFromScene(type: InteriorRenderType, scene: InteriorScene): string {
  switch (type) {
    case 'plan':
      return buildPlanPromptFromScene(scene);
    case 'elevation':
      return buildElevationPromptFromScene(scene);
    case 'render3d':
      return build3DPromptFromScene(scene);
  }
}

/* ================================================================
   BACKWARD-COMPATIBLE ENTRY POINT
   ----------------------------------------------------------------
   Keeps the original signature used by InteriorAIDrawings.tsx and
   any other caller. Internally it now builds the locked scene once
   and serializes it, instead of branching on room type itself.
   ================================================================ */

export function buildInteriorRoomPrompt(
  type: InteriorRenderType,
  room: Room,
  interior: RoomInterior | undefined,
  moodBoard: InteriorMoodBoard,
): string {
  const scene = buildInteriorScene(room, interior, moodBoard);
  return buildPromptFromScene(type, scene);
}
