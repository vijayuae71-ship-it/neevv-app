import { C, MARGIN, SC, drawingBorder, northArrow, drawTable } from '../drawingHelpers';
import { Layout, Room, ProjectRequirements } from '../../types';

interface TileSpec {
  size: string;
  type: string;
  fill: string;
  gridSpacingMM: number;
  pattern: 'grid' | 'diagonal' | 'irregular' | 'steps';
}

function getTileSpec(roomType: string): TileSpec {
  switch (roomType) {
    case 'hall':
    case 'dining':
      return { size: '600×600', type: 'VITRIFIED', fill: '#F5F0E0', gridSpacingMM: 600, pattern: 'grid' };
    case 'bedroom':
    case 'master_bedroom':
      return { size: '600×600', type: 'VITRIFIED (MATT)', fill: '#F0ECD8', gridSpacingMM: 600, pattern: 'grid' };
    case 'kitchen':
      return { size: '400×400', type: 'CERAMIC ANTI-SKID', fill: '#F0E0C0', gridSpacingMM: 400, pattern: 'grid' };
    case 'toilet':
      return { size: '300×300', type: 'ANTI-SKID', fill: '#D8E0E8', gridSpacingMM: 300, pattern: 'diagonal' };
    case 'balcony':
      return { size: '300×300', type: 'EXTERIOR CERAMIC', fill: '#E0E8D8', gridSpacingMM: 300, pattern: 'grid' };
    case 'parking':
      return { size: '—', type: 'KOTA STONE / VDF', fill: '#E0D8C8', gridSpacingMM: 0, pattern: 'irregular' };
    case 'staircase':
      return { size: '—', type: 'GRANITE TREAD+RISER', fill: '#D8D0C8', gridSpacingMM: 0, pattern: 'steps' };
    case 'puja':
      return { size: '600×600', type: 'ITALIAN MARBLE', fill: '#F8F4F0', gridSpacingMM: 600, pattern: 'grid' };
    default:
      return { size: '600×600', type: 'VITRIFIED', fill: '#F2EEE0', gridSpacingMM: 600, pattern: 'grid' };
  }
}

function drawTilePattern(rx: number, ry: number, rw: number, rd: number, spec: TileSpec): string {
  let s = '';
  // Clip path for this room
  const clipId = `clip_${Math.round(rx)}_${Math.round(ry)}`;
  s += `<defs><clipPath id="${clipId}"><rect x="${rx}" y="${ry}" width="${rw}" height="${rd}"/></clipPath></defs>`;

  s += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rd}" fill="${spec.fill}"/>`;

  if (spec.pattern === 'grid' && spec.gridSpacingMM > 0) {
    const spacingPx = (spec.gridSpacingMM / 1000) * SC;
    s += `<g clip-path="url(#${clipId})" opacity="0.3">`;
    // Vertical lines
    for (let x = rx + spacingPx; x < rx + rw; x += spacingPx) {
      s += `<line x1="${x}" y1="${ry}" x2="${x}" y2="${ry + rd}" stroke="${C.dim}" stroke-width="0.4"/>`;
    }
    // Horizontal lines
    for (let y = ry + spacingPx; y < ry + rd; y += spacingPx) {
      s += `<line x1="${rx}" y1="${y}" x2="${rx + rw}" y2="${y}" stroke="${C.dim}" stroke-width="0.4"/>`;
    }
    s += `</g>`;
  } else if (spec.pattern === 'diagonal') {
    const spacingPx = (spec.gridSpacingMM / 1000) * SC;
    const diagSpacing = spacingPx * Math.SQRT2;
    s += `<g clip-path="url(#${clipId})" opacity="0.25">`;
    for (let d = -rw - rd; d < rw + rd; d += diagSpacing) {
      s += `<line x1="${rx + d}" y1="${ry}" x2="${rx + d + rd}" y2="${ry + rd}" stroke="${C.dim}" stroke-width="0.4"/>`;
      s += `<line x1="${rx + d + rd}" y1="${ry}" x2="${rx + d}" y2="${ry + rd}" stroke="${C.dim}" stroke-width="0.4"/>`;
    }
    s += `</g>`;
  } else if (spec.pattern === 'irregular') {
    // Kota stone: random-ish lines
    s += `<g clip-path="url(#${clipId})" opacity="0.2">`;
    const step = rw / 5;
    for (let i = 1; i < 5; i++) {
      const xOff = (i % 2 === 0) ? 3 : -3;
      s += `<line x1="${rx + i * step + xOff}" y1="${ry}" x2="${rx + i * step - xOff}" y2="${ry + rd}" stroke="${C.dim}" stroke-width="0.5"/>`;
    }
    const stepY = rd / 4;
    for (let i = 1; i < 4; i++) {
      const yOff = (i % 2 === 0) ? 4 : -4;
      s += `<line x1="${rx}" y1="${ry + i * stepY + yOff}" x2="${rx + rw}" y2="${ry + i * stepY - yOff}" stroke="${C.dim}" stroke-width="0.5"/>`;
    }
    s += `</g>`;
  } else if (spec.pattern === 'steps') {
    // Horizontal lines for stair treads
    const treadH = rd / 12;
    s += `<g clip-path="url(#${clipId})" opacity="0.3">`;
    for (let y = ry + treadH; y < ry + rd; y += treadH) {
      s += `<line x1="${rx}" y1="${y}" x2="${rx + rw}" y2="${y}" stroke="${C.dim}" stroke-width="0.6"/>`;
    }
    // Arrow showing direction
    s += `<line x1="${rx + rw / 2}" y1="${ry + rd - 5}" x2="${rx + rw / 2}" y2="${ry + 5}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<polygon points="${rx + rw / 2},${ry + 5} ${rx + rw / 2 - 4},${ry + 12} ${rx + rw / 2 + 4},${ry + 12}" fill="${C.dim}"/>`;
    s += `<text x="${rx + rw / 2 + 8}" y="${ry + rd / 2}" font-size="5" fill="${C.dim}">UP</text>`;
    s += `</g>`;
  }

  return s;
}

export function renderTiling(layout: Layout, requirements: ProjectRequirements): string {
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const svgW = Math.round((plotW + 5) * SC);
  const svgH = Math.round((plotD + 7) * SC);
  const ox = MARGIN + 1.5 * SC;
  const oy = MARGIN + 1.5 * SC;

  const rooms = layout.floors[0]?.rooms || [];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" preserveAspectRatio="xMidYMin meet" font-family="'Courier New',monospace">`;
  svg += `<rect width="${svgW}" height="${svgH}" fill="${C.bg}"/>`;
  svg += drawingBorder(svgW, svgH, 'TILING / FLOORING LAYOUT', `Plot: ${plotW}m × ${plotD}m | Ground Floor`);
  svg += northArrow(svgW - MARGIN - 30, MARGIN + 40);

  // Plot outline
  const pw = plotW * SC;
  const pd = plotD * SC;
  svg += `<rect x="${ox}" y="${oy}" width="${pw}" height="${pd}" fill="none" stroke="${C.grid}" stroke-width="0.5" stroke-dasharray="6,3"/>`;

  // Building footprint
  const bx = ox + layout.setbacks.left * SC;
  const by = oy + layout.setbacks.front * SC;
  const bw = layout.buildableWidthM * SC;
  const bd = layout.buildableDepthM * SC;
  svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bd}" fill="#FAFAFA" stroke="${C.wall}" stroke-width="1.5"/>`;

  // Draw tile patterns for each room
  const materialRows: string[][] = [];

  for (const room of rooms) {
    const rx = ox + room.x * SC;
    const ry = oy + room.y * SC;
    const rw = room.width * SC;
    const rd = room.depth * SC;
    const spec = getTileSpec(room.type);

    // Tile pattern fill
    svg += drawTilePattern(rx + 2, ry + 2, rw - 4, rd - 4, spec);

    // Double-line walls
    const wallT = 3;
    svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rd}" fill="none" stroke="${C.wall}" stroke-width="2"/>`;
    svg += `<rect x="${rx + wallT}" y="${ry + wallT}" width="${rw - wallT * 2}" height="${rd - wallT * 2}" fill="none" stroke="${C.wall}" stroke-width="0.5"/>`;

    // Room label and tile spec
    svg += `<text x="${rx + rw / 2}" y="${ry + rd / 2 - 5}" text-anchor="middle" font-size="7" fill="${C.text}" font-weight="bold">${room.name}</text>`;
    svg += `<text x="${rx + rw / 2}" y="${ry + rd / 2 + 5}" text-anchor="middle" font-size="5" fill="${C.text}" opacity="0.7">${spec.size} ${spec.type}</text>`;

    // Skirting indication - thin line inside walls
    svg += `<rect x="${rx + wallT + 2}" y="${ry + wallT + 2}" width="${rw - wallT * 2 - 4}" height="${rd - wallT * 2 - 4}" fill="none" stroke="${C.tile}" stroke-width="0.5" stroke-dasharray="2,3"/>`;

    // Wall tiles for toilet (full height)
    if (room.type === 'toilet') {
      svg += `<rect x="${rx + wallT}" y="${ry + wallT}" width="${rw - wallT * 2}" height="${rd - wallT * 2}" fill="none" stroke="${C.tileBlue}" stroke-width="1.5" stroke-dasharray="3,1"/>`;
      svg += `<text x="${rx + rw / 2}" y="${ry + rd / 2 + 14}" text-anchor="middle" font-size="4" fill="${C.tileBlue}">WALL TILES FULL HT 2100mm</text>`;
    }

    // Kitchen dado tiles
    if (room.type === 'kitchen') {
      // Hatched strip along top wall (cooking wall)
      const dadoH = 8;
      svg += `<rect x="${rx + wallT}" y="${ry + wallT}" width="${rw - wallT * 2}" height="${dadoH}" fill="${C.tileGreen}" opacity="0.25" stroke="${C.tileGreen}" stroke-width="0.5"/>`;
      for (let dx = rx + wallT; dx < rx + rw - wallT; dx += 4) {
        svg += `<line x1="${dx}" y1="${ry + wallT}" x2="${dx + dadoH}" y2="${ry + wallT + dadoH}" stroke="${C.tileGreen}" stroke-width="0.3" opacity="0.4"/>`;
      }
      svg += `<text x="${rx + rw / 2}" y="${ry + wallT + dadoH + 8}" text-anchor="middle" font-size="4" fill="${C.tileGreen}">DADO TILES UP TO 600mm</text>`;
    }

    // Threshold at approximate door position (bottom wall center)
    const thW = 12;
    const thH = 4;
    const thX = rx + rw / 2 - thW / 2;
    const thY = ry + rd - wallT - thH / 2;
    svg += `<rect x="${thX}" y="${thY}" width="${thW}" height="${thH}" fill="none" stroke="${C.dim}" stroke-width="0.8"/>`;
    // Cross hatch for threshold
    svg += `<line x1="${thX}" y1="${thY}" x2="${thX + thW}" y2="${thY + thH}" stroke="${C.dim}" stroke-width="0.4"/>`;
    svg += `<line x1="${thX + thW}" y1="${thY}" x2="${thX}" y2="${thY + thH}" stroke="${C.dim}" stroke-width="0.4"/>`;

    // Material schedule row
    const areaSqM = (room.width * room.depth).toFixed(1);
    const qty = (room.width * room.depth * 1.1).toFixed(1);
    materialRows.push([room.name, spec.size, spec.type, areaSqM, qty]);
  }

  // Skirting note
  svg += `<text x="${bx + bw / 2}" y="${by + bd + 18}" text-anchor="middle" font-size="6" fill="${C.text}" opacity="0.7">NOTE: 100mm SKIRTING IN ALL ROOMS MATCHING FLOOR TILE</text>`;

  // Joint spec note
  svg += `<text x="${bx + bw / 2}" y="${by + bd + 28}" text-anchor="middle" font-size="5" fill="${C.text}" opacity="0.6">JOINTS: 2mm SPACER, EPOXY GROUT IN WET AREAS, CEMENT GROUT IN DRY AREAS</text>`;

  // Material schedule table
  const tableX = svgW - MARGIN - 260;
  const tableY = svgH - MARGIN - 30 - materialRows.length * 14;
  svg += `<text x="${tableX}" y="${tableY - 6}" font-size="7" fill="${C.text}" font-weight="bold">MATERIAL SCHEDULE</text>`;
  svg += drawTable(tableX, tableY,
    ['Room', 'Tile Size', 'Type', 'Area m²', 'Qty (+10%)'],
    materialRows,
    [55, 50, 70, 40, 45]
  );

  // Tile laying pattern detail box
  const patX = MARGIN + 10;
  const patY = svgH - MARGIN - 100;
  svg += `<rect x="${patX}" y="${patY}" width="120" height="90" fill="#FAFAFA" stroke="${C.dim}" stroke-width="0.5"/>`;
  svg += `<text x="${patX + 60}" y="${patY + 12}" text-anchor="middle" font-size="6" fill="${C.text}" font-weight="bold">LAYING PATTERNS</text>`;

  // Grid pattern
  const gx = patX + 10;
  const gy = patY + 22;
  svg += `<rect x="${gx}" y="${gy}" width="30" height="20" fill="#F5F0E0" stroke="${C.dim}" stroke-width="0.5"/>`;
  for (let x = gx + 10; x < gx + 30; x += 10) {
    svg += `<line x1="${x}" y1="${gy}" x2="${x}" y2="${gy + 20}" stroke="${C.dim}" stroke-width="0.3"/>`;
  }
  for (let y = gy + 10; y < gy + 20; y += 10) {
    svg += `<line x1="${gx}" y1="${y}" x2="${gx + 30}" y2="${y}" stroke="${C.dim}" stroke-width="0.3"/>`;
  }
  svg += `<text x="${gx + 15}" y="${gy + 30}" text-anchor="middle" font-size="5" fill="${C.text}">GRID</text>`;

  // Brick bond pattern
  const bbx = patX + 50;
  svg += `<rect x="${bbx}" y="${gy}" width="30" height="20" fill="#F0ECD8" stroke="${C.dim}" stroke-width="0.5"/>`;
  for (let y = gy; y < gy + 20; y += 6) {
    svg += `<line x1="${bbx}" y1="${y}" x2="${bbx + 30}" y2="${y}" stroke="${C.dim}" stroke-width="0.3"/>`;
    const offset = ((y - gy) / 6) % 2 === 0 ? 0 : 5;
    for (let x = bbx + 10 + offset; x < bbx + 30; x += 10) {
      svg += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 6}" stroke="${C.dim}" stroke-width="0.3"/>`;
    }
  }
  svg += `<text x="${bbx + 15}" y="${gy + 30}" text-anchor="middle" font-size="5" fill="${C.text}">BRICK BOND</text>`;

  // Diagonal pattern
  const dx = patX + 10;
  const dy = patY + 58;
  svg += `<rect x="${dx}" y="${dy}" width="30" height="20" fill="#D8E0E8" stroke="${C.dim}" stroke-width="0.5"/>`;
  const dClip = `clip_diag_legend`;
  svg += `<defs><clipPath id="${dClip}"><rect x="${dx}" y="${dy}" width="30" height="20"/></clipPath></defs>`;
  svg += `<g clip-path="url(#${dClip})" opacity="0.4">`;
  for (let d = -30; d < 60; d += 8) {
    svg += `<line x1="${dx + d}" y1="${dy}" x2="${dx + d + 20}" y2="${dy + 20}" stroke="${C.dim}" stroke-width="0.3"/>`;
    svg += `<line x1="${dx + d + 20}" y1="${dy}" x2="${dx + d}" y2="${dy + 20}" stroke="${C.dim}" stroke-width="0.3"/>`;
  }
  svg += `</g>`;
  svg += `<text x="${dx + 15}" y="${dy + 30}" text-anchor="middle" font-size="5" fill="${C.text}">DIAGONAL</text>`;

  svg += `</svg>`;
  return svg;
}
