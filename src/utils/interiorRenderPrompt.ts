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
   Spatial coordination — one canonical XY layout for every view
   ----------------------------------------------------------------
   The scene data names the wall an item belongs to, but does not carry
   plan coordinates. These helpers deterministically derive approximate
   centre points from that shared scene so plan, elevation and 3D prompts
   all receive the same coordinate reference without a schema change.
   Origin is the internal south-west corner of the room.
   ---------------------------------------------------------------- */

interface PositionedItem {
  name: string;
  xMM: number; // distance from the west wall (centre point)
  yMM: number; // distance from the south wall (centre point)
  widthMM: number;
  depthMM: number;
  heightMM: number;
  mountHeightMM: number;
  wall: string;
  material: string;
  description: string;
}

interface PositionedOpening {
  opening: SceneOpening;
  centerMM: number; // X on north/south walls, Y on east/west walls
}

const roundMM = (value: number): number => Math.round(value);
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

function wallLength(scene: InteriorScene, wall: string): number {
  return wall === 'east' || wall === 'west' ? scene.depthMM : scene.widthMM;
}

/** Deterministically place openings along their host wall. The same opening
 * positions are also reserved when distributing items on that wall. */
function computeOpeningPositions(scene: InteriorScene): PositionedOpening[] {
  const byWall = new Map<string, SceneOpening[]>();
  for (const opening of scene.openings) {
    const group = byWall.get(opening.wall) || [];
    group.push(opening);
    byWall.set(opening.wall, group);
  }

  return scene.openings.map(opening => {
    const group = byWall.get(opening.wall) || [opening];
    const index = group.indexOf(opening);
    const length = wallLength(scene, opening.wall);
    // One opening is intentionally offset from the corner rather than placed
    // at mid-wall; several openings are evenly divided along the wall.
    const preferred = group.length === 1 ? length * 0.7 : (length * (index + 1)) / (group.length + 1);
    const halfWidth = Math.min(opening.widthMM / 2, length / 2);
    return {
      opening,
      centerMM: roundMM(clamp(preferred, halfWidth, Math.max(halfWidth, length - halfWidth))),
    };
  });
}

/** Return evenly ordered longitudinal coordinates and move any coordinate out
 * of an opening clearance zone. This is deliberately a best-effort layout:
 * overlapping stacked kitchen components can retain a common logical centre. */
function distributeAlongWall(
  scene: InteriorScene,
  wall: string,
  items: PositionedItem[],
  openingPositions: PositionedOpening[],
): number[] {
  const length = wallLength(scene, wall);
  const blocked = openingPositions
    .filter(position => position.opening.wall === wall)
    .map(position => ({
      start: Math.max(0, position.centerMM - position.opening.widthMM / 2 - 100),
      end: Math.min(length, position.centerMM + position.opening.widthMM / 2 + 100),
    }));

  return items.map((item, index) => {
    const span = Math.min(item.widthMM, length);
    const minimum = span / 2;
    const maximum = Math.max(minimum, length - span / 2);
    let coordinate = clamp((length * (index + 1)) / (items.length + 1), minimum, maximum);

    // Shift a coordinate to the closest side of an opening, retaining a small
    // gap. Repeat because a wall can have more than one opening.
    for (const interval of blocked) {
      if (coordinate >= interval.start && coordinate <= interval.end) {
        const before = clamp(interval.start - 75, minimum, maximum);
        const after = clamp(interval.end + 75, minimum, maximum);
        coordinate = Math.abs(coordinate - before) <= Math.abs(after - coordinate) ? before : after;
      }
    }
    return roundMM(coordinate);
  });
}

/**
 * Produce stable approximate plan centre points for the combined furniture and
 * fixture list. South/north use X as the distributed coordinate; west/east
 * use Y. The perpendicular offset follows the wall-placement convention
 * (south/west = item depth; north/east = room dimension minus item depth).
 */
function computeItemPositions(scene: InteriorScene): PositionedItem[] {
  const items: PositionedItem[] = [
    ...scene.furniture.map(item => ({
      name: item.name,
      xMM: 0,
      yMM: 0,
      widthMM: item.widthMM,
      depthMM: item.depthMM,
      heightMM: item.heightMM,
      mountHeightMM: 0,
      wall: item.wall,
      material: item.material,
      description: item.description,
    })),
    ...scene.fixtures.map(item => ({
      name: item.name,
      xMM: 0,
      yMM: 0,
      widthMM: item.widthMM,
      depthMM: item.depthMM,
      heightMM: item.heightMM,
      mountHeightMM: item.mountHeightMM,
      wall: item.wall,
      material: item.material,
      description: item.description,
    })),
  ];
  const openingPositions = computeOpeningPositions(scene);

  for (const wall of ['south', 'north', 'west', 'east'] as const) {
    const wallItems = items.filter(item => item.wall === wall);
    const longitudinal = distributeAlongWall(scene, wall, wallItems, openingPositions);

    wallItems.forEach((item, index) => {
      const cornerItem = /corner/i.test(item.name);
      if (wall === 'south') {
        item.xMM = cornerItem ? roundMM(clamp(item.widthMM, item.widthMM / 2, scene.widthMM - item.widthMM / 2)) : longitudinal[index];
        item.yMM = roundMM(clamp(item.depthMM, item.depthMM / 2, scene.depthMM - item.depthMM / 2));
      } else if (wall === 'north') {
        item.xMM = longitudinal[index];
        item.yMM = roundMM(clamp(scene.depthMM - item.depthMM, item.depthMM / 2, scene.depthMM - item.depthMM / 2));
      } else if (wall === 'west') {
        item.xMM = roundMM(clamp(item.depthMM, item.depthMM / 2, scene.widthMM - item.depthMM / 2));
        item.yMM = cornerItem ? roundMM(clamp(item.widthMM, item.widthMM / 2, scene.depthMM - item.widthMM / 2)) : longitudinal[index];
      } else {
        item.xMM = roundMM(clamp(scene.widthMM - item.depthMM, item.depthMM / 2, scene.widthMM - item.depthMM / 2));
        item.yMM = longitudinal[index];
      }
    });
  }

  for (const item of items) {
    if (item.wall === 'floor') {
      // A floor trap belongs in the wet-side lower third; other floor fixtures
      // sit centrally unless their resolver gave them a cardinal wall.
      const isFloorTrap = /floor trap/i.test(item.name);
      item.xMM = roundMM(isFloorTrap ? scene.widthMM * 0.42 : scene.widthMM / 2);
      item.yMM = roundMM(isFloorTrap ? scene.depthMM * 0.35 : scene.depthMM / 2);
    } else if (item.wall === 'center') {
      item.xMM = roundMM(scene.widthMM / 2);
      item.yMM = roundMM(scene.depthMM / 2);
    }
  }

  return items;
}

function openingPositionDescription(scene: InteriorScene, position: PositionedOpening): string {
  const { opening, centerMM } = position;
  const axis = opening.wall === 'north' || opening.wall === 'south' ? 'x' : 'y';
  if (opening.type === 'door') {
    return `- Door: ${opening.wall} wall, centered at ${axis}=${centerMM}mm, ${opening.widthMM}mm wide × ${opening.heightMM}mm high, opens ${opening.openDirection || 'inward'}`;
  }
  return `- Window: ${opening.wall} wall, centered at ${axis}=${centerMM}mm, ${opening.widthMM}mm wide × ${opening.heightMM}mm high, sill at ${opening.sillHeightMM}mm`;
}

function zoneBoundaryDescription(scene: InteriorScene, zone: SceneZone): string {
  const name = zone.name.toUpperCase();
  const w = scene.widthMM;
  const d = scene.depthMM;
  if (name.includes('WET')) return `- ${zone.name}: x=0 to ${roundMM(w * 0.55)}mm, y=0 to ${roundMM(d * 0.65)}mm (south-west shower area; ${zone.description})`;
  if (name.includes('DRY')) return `- ${zone.name}: x=${roundMM(w * 0.55)} to ${w}mm, y=0 to ${d}mm (east-side vanity/WC area; ${zone.description})`;
  if (name.includes('COOKING')) return `- ${zone.name}: x=${roundMM(w * 0.2)} to ${roundMM(w * 0.65)}mm, y=0 to ${roundMM(d * 0.42)}mm (south counter band; ${zone.description})`;
  if (name.includes('WASH')) return `- ${zone.name}: x=0 to ${roundMM(w * 0.3)}mm, y=0 to ${roundMM(d * 0.42)}mm (${zone.description})`;
  if (name.includes('PREP')) return `- ${zone.name}: x=${roundMM(w * 0.3)} to ${roundMM(w * 0.7)}mm, y=0 to ${roundMM(d * 0.42)}mm (${zone.description})`;
  // NOTE: check READING before the generic STORAGE check below, since the
  // study resolver's zone is literally named "READING/STORAGE ZONE" and
  // would otherwise always match the (unrelated) kitchen/bedroom STORAGE case.
  if (name.includes('READING')) return `- ${zone.name}: x=${roundMM(w * 0.6)} to ${w}mm, y=0 to ${d}mm (bookshelf/filing side of the room; ${zone.description})`;
  if (name.includes('STORAGE')) return `- ${zone.name}: x=${roundMM(w * 0.7)} to ${w}mm, y=0 to ${d}mm (${zone.description})`;
  if (name.includes('SLEEP')) return `- ${zone.name}: x=0 to ${w}mm, y=${roundMM(d * 0.45)} to ${d}mm (north bed zone; ${zone.description})`;
  if (name.includes('SEATING')) return `- ${zone.name}: x=0 to ${w}mm, y=0 to ${roundMM(d * 0.55)}mm (south seating zone; ${zone.description})`;
  if (name.includes('ENTERTAINMENT')) return `- ${zone.name}: x=0 to ${w}mm, y=${roundMM(d * 0.7)} to ${d}mm (north TV-wall zone; ${zone.description})`;
  if (name.includes('CIRCULATION')) return `- ${zone.name}: central clear route, approximately x=${roundMM(w * 0.35)} to ${roundMM(w * 0.65)}mm and y=${roundMM(d * 0.35)} to ${roundMM(d * 0.65)}mm (${zone.description})`;

  /* --------------------------------------------------------------
     New zones — dining, pooja, study, balcony, and office room types
     -------------------------------------------------------------- */
  if (name.includes('DINING')) return `- ${zone.name}: x=${roundMM(w * 0.15)} to ${roundMM(w * 0.85)}mm, y=${roundMM(d * 0.15)} to ${roundMM(d * 0.85)}mm (central table zone; ${zone.description})`;
  if (name.includes('PRAYER')) return `- ${zone.name}: x=0 to ${roundMM(w * 0.7)}mm, y=0 to ${d}mm (floor seating facing the east mandir wall; ${zone.description})`;
  if (name.includes('OFFERING')) return `- ${zone.name}: x=${roundMM(w * 0.7)} to ${w}mm, y=0 to ${d}mm (east wall mandir + offering shelf; ${zone.description})`;
  // WORKSTATION must be checked before the generic WORK case below, since
  // "WORKSTATION ZONE" (open office) contains "WORK" as a substring.
  if (name.includes('WORKSTATION')) return `- ${zone.name}: x=0 to ${w}mm, y=${roundMM(d * 0.15)} to ${roundMM(d * 0.85)}mm (central desk-cluster grid; ${zone.description})`;
  if (name.includes('WORK')) return `- ${zone.name}: x=0 to ${w}mm, y=${roundMM(d * 0.55)} to ${d}mm (north desk wall zone; ${zone.description})`;
  if (name.includes('PLANTER')) return `- ${zone.name}: x=0 to ${w}mm, y=${roundMM(d * 0.75)} to ${d}mm (along the railing wall; ${zone.description})`;
  if (name.includes('MEETING')) return `- ${zone.name}: x=${roundMM(w * 0.15)} to ${roundMM(w * 0.85)}mm, y=${roundMM(d * 0.15)} to ${roundMM(d * 0.85)}mm (central table zone; ${zone.description})`;
  if (name.includes('PRESENTATION')) return `- ${zone.name}: x=0 to ${w}mm, y=${roundMM(d * 0.75)} to ${d}mm (screen/whiteboard wall zone; ${zone.description})`;
  if (name.includes('RECEPTION')) return `- ${zone.name}: x=0 to ${w}mm, y=${roundMM(d * 0.6)} to ${d}mm (desk wall zone facing the entrance; ${zone.description})`;
  if (name.includes('WAITING')) return `- ${zone.name}: x=0 to ${roundMM(w * 0.6)}mm, y=0 to ${roundMM(d * 0.6)}mm (sofa + chairs near the entrance; ${zone.description})`;
  // EATING must be checked after SEATING above, since "SEATING ZONE" contains
  // "EATING" as a substring (S-EATING) — checking order avoids a false match.
  if (name.includes('EATING')) return `- ${zone.name}: x=${roundMM(w * 0.3)} to ${w}mm, y=${roundMM(d * 0.42)} to ${d}mm (small dining table zone; ${zone.description})`;
  if (name.includes('BREAKOUT')) return `- ${zone.name}: x=0 to ${roundMM(w * 0.25)}mm, y=0 to ${d}mm (informal seating away from the desk grid; ${zone.description})`;
  if (name.includes('RACK')) return `- ${zone.name}: x=${roundMM(w * 0.6)} to ${w}mm, y=0 to ${d}mm (rack enclosures along the wall; ${zone.description})`;
  if (name.includes('COOLING')) return `- ${zone.name}: x=0 to ${roundMM(w * 0.6)}mm, y=0 to ${d}mm (cooling airflow path; ${zone.description})`;
  if (name.includes('ACCESS')) return `- ${zone.name}: central clear service aisle, approximately x=${roundMM(w * 0.35)} to ${roundMM(w * 0.65)}mm and y=0 to ${d}mm (${zone.description})`;

  return `- ${zone.name}: x=0 to ${w}mm, y=0 to ${d}mm (${zone.description})`;
}

/** Shared textual source of truth injected unchanged into every render prompt. */
function buildSpatialLayoutReference(scene: InteriorScene): string {
  const positions = computeItemPositions(scene);
  const openingPositions = computeOpeningPositions(scene);
  const itemLines = positions.map((item, index) => {
    const mounting = item.mountHeightMM > 0 ? ` at ${item.mountHeightMM}mm height` : ' on floor';
    return `${index + 1}. ${item.name} — center at (${item.xMM}, ${item.yMM})mm, ${item.widthMM}×${item.depthMM}mm, on ${item.wall} wall${mounting}; ${item.material}`;
  });
  const partition = scene.roomType === 'toilet'
    ? `\n- Glass partition: vertical line at approximately x=${roundMM(scene.widthMM * 0.55)}mm, south wall to mid-room, separating wet and dry zones`
    : '';

  return `CANONICAL FIXTURE LAYOUT (all three views MUST match this layout exactly):
Room origin: south-west corner (0,0). X = west→east. Y = south→north.
Room: ${scene.widthMM}mm (W) × ${scene.depthMM}mm (D).

FIXTURE POSITIONS (centre-point coordinates from origin):
${itemLines.join('\n') || '- No furniture or fixtures configured.'}

OPENINGS (canonical positions):
${openingPositions.map(position => openingPositionDescription(scene, position)).join('\n') || '- No openings configured.'}

ZONE BOUNDARIES:
${scene.zones.map(zone => zoneBoundaryDescription(scene, zone)).join('\n')}${partition}`;
}

function elevationWallForRoomType(roomType: string): 'south' | 'north' {
  return roomType === 'hall' ? 'north' : 'south';
}

/** Translate canonical plan coordinates into the viewer-left datum for the
 * selected elevation. This tells the renderer how the XY source of truth is
 * visible in an orthographic wall view. */
function buildElevationSpatialCoordination(scene: InteriorScene): string {
  const wall = elevationWallForRoomType(scene.roomType);
  const positions = computeItemPositions(scene).filter(item => item.wall === wall);
  const visiblePosition = (item: PositionedItem): number =>
    wall === 'south' ? scene.widthMM - item.xMM : item.xMM;
  const lines = positions.map(item =>
    `- ${item.name}: plan centre (${item.xMM}, ${item.yMM})mm; draw centre ${visiblePosition(item)}mm from the viewer's LEFT edge of the ${wall} wall.`,
  );

  return `ELEVATION HORIZONTAL COORDINATION:
This elevation must show fixtures at the EXACT horizontal positions given in the spatial layout. Viewing the ${wall} wall from inside the room, ${wall === 'south' ? 'viewer-left to right maps X=room width to X=0' : 'viewer-left to right maps X=0 to X=room width'}.
${lines.join('\n') || '- No item is mounted on this wall; retain the canonical opening and adjacent-wall positions.'}
Items on adjacent walls retain their plan coordinates in the canonical layout; do not move them to make the elevation look balanced.`;
}

function buildCrossViewCoordinationMandate(scene: InteriorScene): string {
  return `COORDINATION MANDATE:
This view MUST show the IDENTICAL room layout as the architectural plan view.
- Same fixtures in same positions
- Same openings on same walls
- Same zone boundaries
- Same room proportions (${scene.widthFt}'×${scene.depthFt}')
Do NOT add, remove, relocate, or resize any fixture.`;
}


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
  const lines: string[] = [];
  if (ep.switches > 0) lines.push(`S  — Switches: ${ep.switches} nos. (mount height: 1200mm from FFL)`);
  if (ep.sockets > 0) lines.push(`P  — Sockets: ${ep.sockets} nos. (mount height: 300mm from FFL, 450mm in kitchen)`);
  if (ep.dataPoints > 0) lines.push(`D  — Data points: ${ep.dataPoints} nos. (mount height: 300mm from FFL)`);
  if (ep.lightPoints > 0) lines.push(`L  — Light points: ${ep.lightPoints} nos. (ceiling-mounted)`);
  if (ep.fanPoints > 0) lines.push(`F  — Ceiling fan points: ${ep.fanPoints} nos. (ceiling-mounted)`);
  if (ep.acPoints > 0) lines.push(`AC — AC points: ${ep.acPoints} nos. (mount height: 1800mm from FFL)`);
  lines.push(`Wiring color code per IS 732: Phase = Red, Neutral = Black, Earth = Green`);
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
    case 'dining':
      return 'Sideboard/crockery wall — the primary dining storage and serving wall';
    case 'puja':
      return 'Mandir wall — the east wall showing the temple unit';
    case 'study':
      return 'Desk wall — the window-facing wall showing the study desk and bookshelf';
    case 'balcony':
      return 'Railing wall — the open parapet/railing side';
    case 'cabin_manager':
    case 'cabin_director':
    case 'cabin_md':
      return 'Desk wall — the wall behind the executive desk';
    case 'conference_small':
    case 'conference_large':
    case 'board_room':
      return 'Presentation wall — the wall with the screen and whiteboard';
    case 'reception':
      return 'Reception desk wall — the signage wall behind the front desk';
    case 'pantry':
      return 'Counter wall — the primary pantry working wall';
    case 'workstation_open':
      return 'Workstation wall — a representative desk-cluster row';
    case 'server_room':
      return 'Rack wall — the wall lined with server rack enclosures';
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
    case 'dining':
      return 'Eye-level interior view from the entry doorway at a slight angle, capturing the full dining table, chairs, and sideboard wall. 24mm lens.';
    case 'puja':
      return 'Eye-level interior view facing the mandir on the east wall, capturing the temple unit, offering shelf, and floor seating area. 28mm lens.';
    case 'study':
      return 'Eye-level interior view from the door, angled toward the desk and window, capturing the bookshelf wall. 28mm lens.';
    case 'balcony':
      return 'Eye-level view from just inside the room looking out through the open railing side, capturing seating and planters with the outdoor view beyond. 24mm lens.';
    case 'cabin_manager':
    case 'cabin_director':
    case 'cabin_md':
      return 'Eye-level interior view from the cabin door, angled to show the executive desk, visitor seating, and window wall. 28mm lens.';
    case 'conference_small':
    case 'conference_large':
    case 'board_room':
      return 'Eye-level interior view from the doorway corner, capturing the full conference table, chairs, and presentation screen wall. 20mm wide lens.';
    case 'reception':
      return 'Eye-level interior view from just inside the main entrance, capturing the reception desk, signage wall, and waiting area. 24mm lens.';
    case 'pantry':
      return 'Eye-level interior view from the doorway, angled to show the counter, appliances, and small dining table. 28mm lens.';
    case 'workstation_open':
      return 'Eye-level interior view down a main aisle between workstation clusters, capturing desk rows and the breakout zone in the distance. 20mm wide lens.';
    case 'server_room':
      return 'Eye-level interior view from the entry, angled along the service aisle to show the rack wall and cooling unit. 24mm lens.';
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

${buildSpatialLayoutReference(scene)}

Place every item AT the coordinates given in the spatial layout — this is the canonical layout.

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
ALL DIMENSIONS ARE IN MILLIMETRES (mm) — NEVER label as metres (m). Example: "2134mm" NOT "2134m".

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

${buildSpatialLayoutReference(scene)}

${buildElevationSpatialCoordination(scene)}

${buildCrossViewCoordinationMandate(scene)}

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
ALL DIMENSIONS ARE IN MILLIMETRES (mm) — NEVER label as metres (m). Example: "600mm × 450mm" NOT "600m × 450m".

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

CRITICAL SIZE CONSTRAINT:
This room is ONLY ${scene.widthFt}'×${scene.depthFt}' (${scene.widthMM}×${scene.depthMM}mm).
This is a COMPACT space — ${scene.areaSqft} square feet total.
DO NOT render a spacious room. The walls should feel CLOSE together.
A person standing in this room can touch both side walls by stretching arms.
${scene.roomType === 'toilet' ? 'The shower area takes up approximately 1/4 of the floor space.' : 'Allocate floor area only to the configured fixtures and zones; do not invent empty spacious circulation.'}
There is barely 2 feet of clear walking space between fixtures.

FURNITURE & FIXTURES (exact list — render each item, in this exact position/size/material, nothing more, nothing less):
${serializeFurnitureFor3D(scene)}

${buildSpatialLayoutReference(scene)}

This 3D render must show the EXACT same room layout. Every fixture must be in the EXACT position shown in the spatial layout. The room is ONLY ${scene.widthFt}×${scene.depthFt} feet — do NOT make it look larger.

${buildCrossViewCoordinationMandate(scene)}

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
