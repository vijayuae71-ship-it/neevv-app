import { C, MARGIN, SC, dimChain, levelMark, concreteHatch, crossHatch, brickHatch, drawingBorder, northArrow, legend, gridLabels, drawTable } from '../drawingHelpers';
import { Layout, Column, Room, ProjectRequirements } from '../../types';

export function renderBrickwork(layout: Layout, requirements: ProjectRequirements): string {
  const pW = layout.plotWidthM;
  const pD = layout.plotDepthM;
  const svgW = Math.round((pW + 9) * SC); // extra width for notes panel on right
  const svgH = Math.round((pD + 6) * SC);

  const ox = MARGIN + 2 * SC;
  const oy = MARGIN + 1.5 * SC;
  const plotW = pW * SC;
  const plotH = pD * SC;

  const sb = layout.setbacks;
  const bx = ox + sb.left * SC;
  const by = oy + sb.front * SC;
  const bW = layout.buildableWidthM * SC;
  const bD = layout.buildableDepthM * SC;

  const rooms = layout.floors[0]?.rooms || [];
  const cols = layout.floors[0]?.columns || [];

  // Wall thickness in pixels
  const extWallPx = 0.23 * SC; // 230mm external
  const intWallPx = 0.115 * SC; // 115mm partition

  let svg = '';
  let hatchDefs = '';
  let hatchIdx = 0;

  // --- Plot boundary ---
  svg += `<rect x="${ox}" y="${oy}" width="${plotW}" height="${plotH}" fill="none" stroke="${C.dim}" stroke-width="1" stroke-dasharray="12,4,3,4"/>`;
  svg += `<text x="${ox + plotW / 2}" y="${oy - 8}" font-size="7" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">PLOT BOUNDARY</text>`;

  // --- Setback / buildable area ---
  svg += `<rect x="${bx}" y="${by}" width="${bW}" height="${bD}" fill="none" stroke="${C.grid}" stroke-width="0.5" stroke-dasharray="4,3"/>`;

  // --- Draw rooms as wall outlines ---
  const drawnWalls: string[] = [];

  // Determine which rooms are on exterior
  function isExteriorEdge(room: Room, edge: 'left' | 'right' | 'top' | 'bottom'): boolean {
    // Check if any room edge aligns with buildable boundary
    const tolerance = 0.05;
    if (edge === 'left') return room.x < tolerance;
    if (edge === 'right') return Math.abs(room.x + room.width - layout.buildableWidthM) < tolerance;
    if (edge === 'top') return room.y < tolerance;
    if (edge === 'bottom') return Math.abs(room.y + room.depth - layout.buildableDepthM) < tolerance;
    return false;
  }

  function isWetRoom(room: Room): boolean {
    const t = room.type?.toLowerCase() || '';
    const n = room.name?.toLowerCase() || '';
    return t.includes('bath') || t.includes('toilet') || t.includes('kitchen') ||
      n.includes('bath') || n.includes('toilet') || n.includes('kitchen') || n.includes('wash');
  }

  for (const room of rooms) {
    const rx = bx + room.x * SC;
    const ry = by + room.y * SC;
    const rw = room.width * SC;
    const rd = room.depth * SC;

    // Draw wall outlines
    // External walls: 230mm double lines, internal: 115mm
    const edges: Array<{ x1: number; y1: number; x2: number; y2: number; ext: boolean; side: string }> = [
      { x1: rx, y1: ry, x2: rx + rw, y2: ry, ext: isExteriorEdge(room, 'top'), side: 'top' },
      { x1: rx, y1: ry + rd, x2: rx + rw, y2: ry + rd, ext: isExteriorEdge(room, 'bottom'), side: 'bottom' },
      { x1: rx, y1: ry, x2: rx, y2: ry + rd, ext: isExteriorEdge(room, 'left'), side: 'left' },
      { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rd, ext: isExteriorEdge(room, 'right'), side: 'right' },
    ];

    for (const e of edges) {
      const wallKey = `${Math.round(e.x1)},${Math.round(e.y1)}-${Math.round(e.x2)},${Math.round(e.y2)}`;
      const wallKeyRev = `${Math.round(e.x2)},${Math.round(e.y2)}-${Math.round(e.x1)},${Math.round(e.y1)}`;
      if (drawnWalls.includes(wallKey) || drawnWalls.includes(wallKeyRev)) continue;
      drawnWalls.push(wallKey);

      const wt = e.ext ? extWallPx : intWallPx;
      const isHoriz = Math.abs(e.y1 - e.y2) < 1;

      if (isHoriz) {
        // Horizontal wall
        const wy = e.ext && e.side === 'top' ? e.y1 - wt / 2 : e.ext && e.side === 'bottom' ? e.y1 - wt / 2 : e.y1 - wt / 2;
        svg += `<rect x="${Math.min(e.x1, e.x2)}" y="${wy}" width="${Math.abs(e.x2 - e.x1)}" height="${wt}" fill="${C.brick}" fill-opacity="${e.ext ? 0.25 : 0.12}" stroke="${C.wall}" stroke-width="${e.ext ? 1.2 : 0.8}"/>`;
        if (e.ext) {
          const hid = `bh-${hatchIdx++}`;
          hatchDefs += brickHatch(hid, Math.min(e.x1, e.x2), wy, Math.abs(e.x2 - e.x1), wt);
        }
      } else {
        // Vertical wall
        const wx = e.ext && e.side === 'left' ? e.x1 - wt / 2 : e.ext && e.side === 'right' ? e.x1 - wt / 2 : e.x1 - wt / 2;
        svg += `<rect x="${wx}" y="${Math.min(e.y1, e.y2)}" width="${wt}" height="${Math.abs(e.y2 - e.y1)}" fill="${C.brick}" fill-opacity="${e.ext ? 0.25 : 0.12}" stroke="${C.wall}" stroke-width="${e.ext ? 1.2 : 0.8}"/>`;
        if (e.ext) {
          const hid = `bh-${hatchIdx++}`;
          hatchDefs += brickHatch(hid, wx, Math.min(e.y1, e.y2), wt, Math.abs(e.y2 - e.y1));
        }
      }

      // Wall type label (for longer walls)
      const wallLen = Math.sqrt((e.x2 - e.x1) ** 2 + (e.y2 - e.y1) ** 2);
      if (wallLen > 2.5 * SC && !drawnWalls.includes('label-' + wallKey)) {
        drawnWalls.push('label-' + wallKey);
        const lx = (e.x1 + e.x2) / 2;
        const ly = (e.y1 + e.y2) / 2;
        const label = e.ext ? '230 EXT WALL' : '115 PARTITION';
        const offset = e.ext ? wt / 2 + 8 : wt / 2 + 6;
        if (isHoriz) {
          svg += `<text x="${lx}" y="${ly - offset}" font-size="5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">${label}</text>`;
        } else {
          svg += `<text x="${lx + offset}" y="${ly}" font-size="5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle" transform="rotate(-90,${lx + offset},${ly})">${label}</text>`;
        }
      }
    }

    // --- Room labels ---
    const rcx = rx + rw / 2;
    const rcy = ry + rd / 2;
    svg += `<text x="${rcx}" y="${rcy - 3}" font-size="7" fill="${C.text}" font-family="sans-serif" font-weight="bold" text-anchor="middle">${(room.name || room.type || '').toUpperCase()}</text>`;
    svg += `<text x="${rcx}" y="${rcy + 8}" font-size="5.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">${room.width.toFixed(1)}m × ${room.depth.toFixed(1)}m</text>`;

    // Waterproof plaster note for wet rooms
    if (isWetRoom(room)) {
      svg += `<text x="${rcx}" y="${rcy + 17}" font-size="4.5" fill="${C.water}" font-family="sans-serif" text-anchor="middle" font-style="italic">WATERPROOF PLASTER</text>`;
    }

    // --- Door openings (on one wall, ~900mm wide) ---
    const doorW = 0.9 * SC;
    // Place a door on the longest internal wall
    if (room.depth > room.width) {
      // Door on left wall
      const dy = ry + rd / 2 - doorW / 2;
      svg += `<rect x="${rx - intWallPx}" y="${dy}" width="${intWallPx * 2}" height="${doorW}" fill="${C.bg}" stroke="none"/>`;
      // Door swing arc
      svg += `<path d="M ${rx + intWallPx} ${dy} A ${doorW} ${doorW} 0 0 1 ${rx + intWallPx} ${dy + doorW}" fill="none" stroke="${C.dim}" stroke-width="0.5" stroke-dasharray="3,2"/>`;
      // Lintel indication (dashed)
      svg += `<line x1="${rx - intWallPx - 3}" y1="${dy - 2}" x2="${rx - intWallPx - 3}" y2="${dy + doorW + 2}" stroke="${C.concrete}" stroke-width="1" stroke-dasharray="4,2"/>`;
    } else {
      // Door on top wall
      const dx = rx + rw / 2 - doorW / 2;
      svg += `<rect x="${dx}" y="${ry - intWallPx}" width="${doorW}" height="${intWallPx * 2}" fill="${C.bg}" stroke="none"/>`;
      svg += `<path d="M ${dx} ${ry + intWallPx} A ${doorW} ${doorW} 0 0 0 ${dx + doorW} ${ry + intWallPx}" fill="none" stroke="${C.dim}" stroke-width="0.5" stroke-dasharray="3,2"/>`;
      svg += `<line x1="${dx - 2}" y1="${ry - intWallPx - 3}" x2="${dx + doorW + 2}" y2="${ry - intWallPx - 3}" stroke="${C.concrete}" stroke-width="1" stroke-dasharray="4,2"/>`;
    }

    // --- Window openings on exterior walls ---
    if (isExteriorEdge(room, 'left') || isExteriorEdge(room, 'right')) {
      const winH = 1.2 * SC;
      const wy = ry + rd / 2 - winH / 2;
      const wx = isExteriorEdge(room, 'left') ? rx - extWallPx / 2 : rx + rw - extWallPx / 2;
      svg += `<rect x="${wx - 1}" y="${wy}" width="${extWallPx + 2}" height="${winH}" fill="${C.glass}" fill-opacity="0.15" stroke="${C.glass}" stroke-width="0.8"/>`;
      svg += `<line x1="${wx}" y1="${wy + winH / 2}" x2="${wx + extWallPx}" y2="${wy + winH / 2}" stroke="${C.glass}" stroke-width="0.5"/>`;
      svg += `<text x="${wx - 6}" y="${wy + winH + 10}" font-size="4.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle" transform="rotate(-90,${wx - 6},${wy + winH + 10})">SILL: 900</text>`;
    }
    if (isExteriorEdge(room, 'top') || isExteriorEdge(room, 'bottom')) {
      const winW = 1.2 * SC;
      const wxx = rx + rw / 2 - winW / 2;
      const wyy = isExteriorEdge(room, 'top') ? ry - extWallPx / 2 : ry + rd - extWallPx / 2;
      svg += `<rect x="${wxx}" y="${wyy - 1}" width="${winW}" height="${extWallPx + 2}" fill="${C.glass}" fill-opacity="0.15" stroke="${C.glass}" stroke-width="0.8"/>`;
      svg += `<line x1="${wxx + winW / 2}" y1="${wyy}" x2="${wxx + winW / 2}" y2="${wyy + extWallPx}" stroke="${C.glass}" stroke-width="0.5"/>`;
      svg += `<text x="${wxx + winW / 2}" y="${wyy - 6}" font-size="4.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">SILL: 900</text>`;
    }
  }

  // --- Column locations as filled rectangles ---
  for (const col of cols) {
    const cx = bx + col.x * SC;
    const cy = by + col.y * SC;
    const cw = (col.widthMM / 1000) * SC;
    const cd = (col.depthMM / 1000) * SC;
    svg += `<rect x="${cx - cw / 2}" y="${cy - cd / 2}" width="${cw}" height="${cd}" fill="${C.concrete}" stroke="${C.wall}" stroke-width="1.5"/>`;
  }

  // --- Dimensions ---
  svg += dimChain(ox, oy + plotH + 20, ox + plotW, oy + plotH + 20, `${pW.toFixed(2)}m`, 0, true);
  svg += dimChain(ox - 20, oy, ox - 20, oy + plotH, `${pD.toFixed(2)}m`, 0, false);

  // Setback dims
  svg += dimChain(ox, oy + plotH + 36, bx, oy + plotH + 36, `${sb.left.toFixed(1)}m`, 0, true);
  svg += dimChain(bx + bW, oy + plotH + 36, ox + plotW, oy + plotH + 36, `${sb.right.toFixed(1)}m`, 0, true);

  // Room width dims along bottom of buildable
  if (rooms.length > 0) {
    const sortedByX = [...rooms].sort((a, b) => a.x - b.x);
    let lastX = bx;
    for (const room of sortedByX) {
      const rx = bx + room.x * SC;
      const rw = room.width * SC;
      if (rx + rw > lastX) {
        svg += dimChain(rx, by + bD + 10, rx + rw, by + bD + 10, `${room.width.toFixed(2)}m`, 0, true);
        lastX = rx + rw;
      }
    }
  }

  // --- Grid references ---
  const gxPx = [...new Set(cols.map(c => bx + c.x * SC))].sort((a, b) => a - b);
  const gyPx = [...new Set(cols.map(c => by + c.y * SC))].sort((a, b) => a - b);
  if (gxPx.length > 0 && gyPx.length > 0) {
    svg += gridLabels(gxPx, gyPx, plotW, plotH);
  }

  // --- Mortar specification note ---
  const noteX = ox + plotW + 15;
  const noteY = oy + 10;
  svg += `<rect x="${noteX}" y="${noteY}" width="120" height="80" fill="${C.bg}" stroke="${C.wall}" stroke-width="0.8" rx="2"/>`;
  svg += `<text x="${noteX + 5}" y="${noteY + 14}" font-size="7" fill="${C.text}" font-family="sans-serif" font-weight="bold">MASONRY NOTES</text>`;
  svg += `<text x="${noteX + 5}" y="${noteY + 28}" font-size="6" fill="${C.text}" font-family="sans-serif">All masonry in CM 1:6</text>`;
  svg += `<text x="${noteX + 5}" y="${noteY + 40}" font-size="6" fill="${C.text}" font-family="sans-serif">Ext walls: 230mm (9")</text>`;
  svg += `<text x="${noteX + 5}" y="${noteY + 52}" font-size="6" fill="${C.text}" font-family="sans-serif">Int walls: 115mm (4.5")</text>`;
  svg += `<text x="${noteX + 5}" y="${noteY + 64}" font-size="6" fill="${C.text}" font-family="sans-serif">Brick: 230×115×75mm</text>`;
  svg += `<text x="${noteX + 5}" y="${noteY + 76}" font-size="6" fill="${C.text}" font-family="sans-serif">Mortar: 10mm joints</text>`;

  // --- Brick course detail box ---
  const bdX = noteX;
  const bdY = noteY + 95;
  svg += `<rect x="${bdX}" y="${bdY}" width="120" height="85" fill="${C.bg}" stroke="${C.wall}" stroke-width="0.8" rx="2"/>`;
  svg += `<text x="${bdX + 60}" y="${bdY + 12}" font-size="6.5" fill="${C.text}" font-family="sans-serif" font-weight="bold" text-anchor="middle">STRETCHER BOND</text>`;
  svg += `<text x="${bdX + 60}" y="${bdY + 22}" font-size="5.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">230mm Wall - Plan</text>`;

  // Mini plan view of stretcher bond
  const bpX = bdX + 10;
  const bpY = bdY + 28;
  const brickW = 23;
  const brickH = 8;
  const mortarG = 1;
  // Course 1
  for (let i = 0; i < 4; i++) {
    svg += `<rect x="${bpX + i * (brickW + mortarG)}" y="${bpY}" width="${brickW}" height="${brickH}" fill="${C.brick}" fill-opacity="0.3" stroke="${C.wall}" stroke-width="0.5"/>`;
  }
  // Course 2 (offset by half)
  for (let i = 0; i < 4; i++) {
    svg += `<rect x="${bpX + (brickW + mortarG) / 2 + i * (brickW + mortarG)}" y="${bpY + brickH + mortarG}" width="${brickW}" height="${brickH}" fill="${C.brick}" fill-opacity="0.3" stroke="${C.wall}" stroke-width="0.5"/>`;
  }
  // Course 3
  for (let i = 0; i < 4; i++) {
    svg += `<rect x="${bpX + i * (brickW + mortarG)}" y="${bpY + 2 * (brickH + mortarG)}" width="${brickW}" height="${brickH}" fill="${C.brick}" fill-opacity="0.3" stroke="${C.wall}" stroke-width="0.5"/>`;
  }

  // Mini elevation label
  svg += `<text x="${bdX + 60}" y="${bpY + 3 * (brickH + mortarG) + 10}" font-size="5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">230 × 115 × 75 mm bricks</text>`;

  // --- North arrow ---
  svg += northArrow(ox + plotW - 30, oy + 30);

  // --- Legend ---
  svg += legend(svgW, svgH, `BRICKWORK LAYOUT - GROUND FLOOR | Scale 1:${Math.round(1000 / SC)} | All dims in meters`);

  // --- Drawing border ---
  const border = drawingBorder(svgW, svgH, 'BRICKWORK / MASONRY LAYOUT', `${requirements.city || 'Project'} - Residential Building`);

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${hatchDefs}${border}${svg}</svg>`;
}
