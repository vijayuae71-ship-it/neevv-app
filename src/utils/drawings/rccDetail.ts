import { C, MARGIN, SC, dimChain, concreteHatch, drawingBorder, northArrow, legend, drawTable } from '../drawingHelpers';
import { Layout, Room, ProjectRequirements } from '../../types';

interface SlabPanel {
  id: string;
  x: number; y: number;
  w: number; h: number;
  lx: number; ly: number;
  type: 'ONE-WAY' | 'TWO-WAY';
  isOpening?: boolean;
  isCantilever?: boolean;
}

interface BeamInfo {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  lengthM: number;
  sizeLabel: string;
}

export function renderRCCDetail(layout: Layout, requirements: ProjectRequirements): string {
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const svgW = Math.round((plotW + 6) * SC);
  const svgH = Math.round((plotD + 6) * SC);
  const ox = MARGIN + 2 * SC;
  const oy = MARGIN + 1.5 * SC;

  const rooms = layout.floors[0]?.rooms || [];
  const columns = layout.floors[0]?.columns || [];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" preserveAspectRatio="xMidYMin meet" font-family="'Courier New',monospace">`;
  svg += `<rect width="${svgW}" height="${svgH}" fill="${C.bg}"/>`;
  svg += drawingBorder(svgW, svgH, 'RCC SLAB &amp; BEAM LAYOUT', `Plot: ${plotW}m × ${plotD}m | Structural Plan`);
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
  svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bd}" fill="#FAFAFA" stroke="${C.wall}" stroke-width="1"/>`;

  // Collect unique column grid lines
  const colXs = [...new Set(columns.map(c => c.x))].sort((a, b) => a - b);
  const colYs = [...new Set(columns.map(c => c.y))].sort((a, b) => a - b);

  // Draw columns
  columns.forEach((col, i) => {
    const cx = ox + col.x * SC;
    const cy = oy + col.y * SC;
    const cw = (col.widthMM / 1000) * SC;
    const cd = (col.depthMM / 1000) * SC;
    svg += `<rect x="${cx - cw / 2}" y="${cy - cd / 2}" width="${cw}" height="${cd}" fill="${C.concrete}" stroke="#000" stroke-width="1.2"/>`;
    svg += `<text x="${cx}" y="${cy - cd / 2 - 5}" text-anchor="middle" font-size="6" fill="${C.text}" font-weight="bold">C${i + 1}</text>`;
  });

  // Draw beams between adjacent columns on same grid line
  const beams: BeamInfo[] = [];
  let beamIdx = 0;

  // Horizontal beams (same Y)
  for (const y of colYs) {
    const colsOnY = columns.filter(c => c.y === y).sort((a, b) => a.x - b.x);
    for (let i = 0; i < colsOnY.length - 1; i++) {
      const c1 = colsOnY[i];
      const c2 = colsOnY[i + 1];
      const bx1 = ox + c1.x * SC;
      const bx2 = ox + c2.x * SC;
      const by1 = oy + y * SC;
      const bHalf = 4;
      beamIdx++;
      const lenM = Math.abs(c2.x - c1.x);
      beams.push({ id: `B${beamIdx}`, x1: bx1, y1: by1, x2: bx2, y2: by1, lengthM: lenM, sizeLabel: '230×400' });
      svg += `<line x1="${bx1}" y1="${by1 - bHalf}" x2="${bx2}" y2="${by1 - bHalf}" stroke="${C.concrete}" stroke-width="1.5"/>`;
      svg += `<line x1="${bx1}" y1="${by1 + bHalf}" x2="${bx2}" y2="${by1 + bHalf}" stroke="${C.concrete}" stroke-width="1.5"/>`;
      svg += `<text x="${(bx1 + bx2) / 2}" y="${by1 - bHalf - 4}" text-anchor="middle" font-size="5" fill="${C.dim}">B${beamIdx} (230×400)</text>`;
    }
  }

  // Vertical beams (same X)
  for (const x of colXs) {
    const colsOnX = columns.filter(c => c.x === x).sort((a, b) => a.y - b.y);
    for (let i = 0; i < colsOnX.length - 1; i++) {
      const c1 = colsOnX[i];
      const c2 = colsOnX[i + 1];
      const bx1 = ox + x * SC;
      const by1 = oy + c1.y * SC;
      const by2 = oy + c2.y * SC;
      const bHalf = 4;
      beamIdx++;
      const lenM = Math.abs(c2.y - c1.y);
      beams.push({ id: `B${beamIdx}`, x1: bx1, y1: by1, x2: bx1, y2: by2, lengthM: lenM, sizeLabel: '230×400' });
      svg += `<line x1="${bx1 - bHalf}" y1="${by1}" x2="${bx1 - bHalf}" y2="${by2}" stroke="${C.concrete}" stroke-width="1.5"/>`;
      svg += `<line x1="${bx1 + bHalf}" y1="${by1}" x2="${bx1 + bHalf}" y2="${by2}" stroke="${C.concrete}" stroke-width="1.5"/>`;
      svg += `<text x="${bx1 + bHalf + 4}" y="${(by1 + by2) / 2}" font-size="5" fill="${C.dim}" transform="rotate(90,${bx1 + bHalf + 4},${(by1 + by2) / 2})">B${beamIdx} (230×400)</text>`;
    }
  }

  // Identify slab panels between grid lines
  const panels: SlabPanel[] = [];
  let panelIdx = 0;

  for (let yi = 0; yi < colYs.length - 1; yi++) {
    for (let xi = 0; xi < colXs.length - 1; xi++) {
      const x1 = colXs[xi];
      const x2 = colXs[xi + 1];
      const y1 = colYs[yi];
      const y2 = colYs[yi + 1];
      const lx = Math.abs(x2 - x1);
      const ly = Math.abs(y2 - y1);
      if (lx < 0.3 || ly < 0.3) continue;
      panelIdx++;

      // Check if this panel overlaps a staircase room
      const isStair = rooms.some(r =>
        r.type === 'staircase' &&
        r.x < x2 && r.x + r.width > x1 &&
        r.y < y2 && r.y + r.depth > y1
      );

      // Check if overlaps balcony (cantilever)
      const isBalcony = rooms.some(r =>
        r.type === 'balcony' &&
        r.x < x2 && r.x + r.width > x1 &&
        r.y < y2 && r.y + r.depth > y1
      );

      const ratio = Math.max(lx, ly) / Math.min(lx, ly);
      const type: 'ONE-WAY' | 'TWO-WAY' = ratio > 2 ? 'ONE-WAY' : 'TWO-WAY';

      panels.push({
        id: `S${panelIdx}`,
        x: x1, y: y1, w: lx, h: ly,
        lx: Math.min(lx, ly), ly: Math.max(lx, ly),
        type,
        isOpening: isStair,
        isCantilever: isBalcony,
      });
    }
  }

  // Draw slab panels
  const hatchDefs: string[] = [];
  for (const panel of panels) {
    const px = ox + panel.x * SC;
    const py = oy + panel.y * SC;
    const pw2 = panel.w * SC;
    const ph = panel.h * SC;

    if (panel.isOpening) {
      // Staircase opening - hatched
      const hId = `stHatch_${panel.id}`;
      svg += `<defs><pattern id="${hId}" width="8" height="8" patternUnits="userSpaceOnUse">`;
      svg += `<line x1="0" y1="0" x2="8" y2="8" stroke="${C.dim}" stroke-width="0.5"/>`;
      svg += `<line x1="8" y1="0" x2="0" y2="8" stroke="${C.dim}" stroke-width="0.5"/>`;
      svg += `</pattern></defs>`;
      svg += `<rect x="${px + 6}" y="${py + 6}" width="${pw2 - 12}" height="${ph - 12}" fill="url(#${hId})" stroke="${C.dim}" stroke-width="1" stroke-dasharray="4,2"/>`;
      svg += `<text x="${px + pw2 / 2}" y="${py + ph / 2 + 3}" text-anchor="middle" font-size="6" fill="${C.text}" font-weight="bold">STAIRCASE OPENING</text>`;
    } else if (panel.isCantilever) {
      // Cantilever slab
      svg += `<rect x="${px + 6}" y="${py + 6}" width="${pw2 - 12}" height="${ph - 12}" fill="#E8E0D0" stroke="${C.dim}" stroke-width="1"/>`;
      svg += `<text x="${px + pw2 / 2}" y="${py + ph / 2 - 6}" text-anchor="middle" font-size="6" fill="${C.text}" font-weight="bold">${panel.id}</text>`;
      svg += `<text x="${px + pw2 / 2}" y="${py + ph / 2 + 4}" text-anchor="middle" font-size="5" fill="${C.dim}">CANT. SLAB 120mm</text>`;
      // Top steel direction arrow
      svg += `<line x1="${px + pw2 / 2}" y1="${py + ph / 2 + 10}" x2="${px + pw2 / 2}" y2="${py + ph / 2 + 22}" stroke="${C.steel}" stroke-width="1"/>`;
      svg += `<polygon points="${px + pw2 / 2},${py + ph / 2 + 10} ${px + pw2 / 2 - 3},${py + ph / 2 + 15} ${px + pw2 / 2 + 3},${py + ph / 2 + 15}" fill="${C.steel}"/>`;
      svg += `<text x="${px + pw2 / 2 + 8}" y="${py + ph / 2 + 18}" font-size="4" fill="${C.steel}">TOP STEEL</text>`;
    } else {
      // Normal slab panel
      svg += `<rect x="${px + 6}" y="${py + 6}" width="${pw2 - 12}" height="${ph - 12}" fill="#F5F2EA" stroke="${C.dim}" stroke-width="0.5"/>`;
      svg += `<text x="${px + pw2 / 2}" y="${py + ph / 2 - 8}" text-anchor="middle" font-size="7" fill="${C.text}" font-weight="bold">${panel.id}</text>`;
      svg += `<text x="${px + pw2 / 2}" y="${py + ph / 2 + 2}" text-anchor="middle" font-size="5" fill="${C.dim}">${panel.type}</text>`;
      svg += `<text x="${px + pw2 / 2}" y="${py + ph / 2 + 11}" text-anchor="middle" font-size="5" fill="${C.dim}">${panel.w.toFixed(1)}m × ${panel.h.toFixed(1)}m</text>`;

      // Reinforcement direction arrows
      const acx = px + pw2 / 2;
      const acy = py + ph / 2 + 18;
      if (panel.type === 'ONE-WAY') {
        // Arrow in short span direction
        const isWideX = panel.w > panel.h;
        if (isWideX) {
          // Short span is vertical
          svg += `<line x1="${acx}" y1="${acy - 6}" x2="${acx}" y2="${acy + 6}" stroke="${C.steel}" stroke-width="1.2"/>`;
          svg += `<polygon points="${acx},${acy - 6} ${acx - 3},${acy - 2} ${acx + 3},${acy - 2}" fill="${C.steel}"/>`;
          svg += `<polygon points="${acx},${acy + 6} ${acx - 3},${acy + 2} ${acx + 3},${acy + 2}" fill="${C.steel}"/>`;
        } else {
          // Short span is horizontal
          svg += `<line x1="${acx - 6}" y1="${acy}" x2="${acx + 6}" y2="${acy}" stroke="${C.steel}" stroke-width="1.2"/>`;
          svg += `<polygon points="${acx - 6},${acy} ${acx - 2},${acy - 3} ${acx - 2},${acy + 3}" fill="${C.steel}"/>`;
          svg += `<polygon points="${acx + 6},${acy} ${acx + 2},${acy - 3} ${acx + 2},${acy + 3}" fill="${C.steel}"/>`;
        }
      } else {
        // Two-way: crossed arrows
        svg += `<line x1="${acx - 6}" y1="${acy}" x2="${acx + 6}" y2="${acy}" stroke="${C.steel}" stroke-width="1"/>`;
        svg += `<line x1="${acx}" y1="${acy - 6}" x2="${acx}" y2="${acy + 6}" stroke="${C.steel}" stroke-width="1"/>`;
        svg += `<polygon points="${acx - 6},${acy} ${acx - 2},${acy - 2} ${acx - 2},${acy + 2}" fill="${C.steel}"/>`;
        svg += `<polygon points="${acx + 6},${acy} ${acx + 2},${acy - 2} ${acx + 2},${acy + 2}" fill="${C.steel}"/>`;
        svg += `<polygon points="${acx},${acy - 6} ${acx - 2},${acy - 2} ${acx + 2},${acy - 2}" fill="${C.steel}"/>`;
        svg += `<polygon points="${acx},${acy + 6} ${acx - 2},${acy + 2} ${acx + 2},${acy + 2}" fill="${C.steel}"/>`;
      }
    }
  }

  // Construction joint for long spans
  for (const beam of beams) {
    if (beam.lengthM > 6) {
      const mx = (beam.x1 + beam.x2) / 2;
      const my = (beam.y1 + beam.y2) / 2;
      // Zigzag line
      let zigzag = `M${mx - 10},${my - 8}`;
      for (let i = 0; i < 8; i++) {
        const dx = (i % 2 === 0) ? 3 : -3;
        zigzag += ` L${mx + dx},${my - 8 + i * 2}`;
      }
      zigzag += ` L${mx - 10},${my + 8}`;
      svg += `<path d="${zigzag}" fill="none" stroke="${C.dim}" stroke-width="1" stroke-dasharray="2,1"/>`;
      svg += `<text x="${mx + 8}" y="${my}" font-size="4" fill="${C.dim}">CONST. JOINT</text>`;
    }
  }

  // Level annotation
  svg += `<text x="${bx + bw / 2}" y="${by - 10}" text-anchor="middle" font-size="6" fill="${C.text}" font-weight="bold">SLAB LEVEL: +3.000</text>`;

  // Grid labels
  colXs.forEach((x, i) => {
    const px2 = ox + x * SC;
    svg += `<text x="${px2}" y="${oy - 12}" text-anchor="middle" font-size="7" fill="${C.dim}" font-weight="bold">${String.fromCharCode(65 + i)}</text>`;
    svg += `<line x1="${px2}" y1="${oy - 8}" x2="${px2}" y2="${oy + pd + 8}" stroke="${C.grid}" stroke-width="0.3" stroke-dasharray="4,4"/>`;
  });
  colYs.forEach((y, i) => {
    const py2 = oy + y * SC;
    svg += `<text x="${ox - 14}" y="${py2 + 3}" text-anchor="middle" font-size="7" fill="${C.dim}" font-weight="bold">${i + 1}</text>`;
    svg += `<line x1="${ox - 8}" y1="${py2}" x2="${ox + pw + 8}" y2="${py2}" stroke="${C.grid}" stroke-width="0.3" stroke-dasharray="4,4"/>`;
  });

  // Slab schedule table
  const slabRows: string[][] = [];
  for (const panel of panels) {
    if (panel.isOpening) continue;
    const depth = panel.isCantilever ? '120' : '150';
    const mainSteel = panel.isCantilever ? '10φ@150 (TOP)' : '10φ@150';
    const distSteel = '8φ@200';
    slabRows.push([panel.id, `${panel.w.toFixed(1)}×${panel.h.toFixed(1)}`, panel.isCantilever ? 'CANTILEVER' : panel.type, depth, mainSteel, distSteel]);
  }

  if (slabRows.length > 0) {
    const tableX = svgW - MARGIN - 310;
    const tableY = svgH - MARGIN - 20 - slabRows.length * 14;
    svg += `<text x="${tableX}" y="${tableY - 6}" font-size="7" fill="${C.text}" font-weight="bold">SLAB SCHEDULE</text>`;
    svg += drawTable(tableX, tableY,
      ['Panel', 'Size (m)', 'Type', 'Depth mm', 'Main Steel', 'Dist Steel'],
      slabRows,
      [40, 55, 65, 45, 65, 45]
    );
  }

  // Legend
  const lgX = MARGIN + 10;
  const lgY = svgH - MARGIN - 100;
  svg += `<rect x="${lgX}" y="${lgY}" width="150" height="90" fill="#FAFAFA" stroke="${C.dim}" stroke-width="0.5"/>`;
  svg += `<text x="${lgX + 75}" y="${lgY + 12}" text-anchor="middle" font-size="7" fill="${C.text}" font-weight="bold">LEGEND</text>`;

  // Column symbol
  svg += `<rect x="${lgX + 8}" y="${lgY + 20}" width="8" height="8" fill="${C.concrete}" stroke="#000" stroke-width="1"/>`;
  svg += `<text x="${lgX + 25}" y="${lgY + 28}" font-size="6" fill="${C.text}">RCC Column</text>`;

  // Beam symbol
  svg += `<line x1="${lgX + 6}" y1="${lgY + 36}" x2="${lgX + 18}" y2="${lgY + 36}" stroke="${C.concrete}" stroke-width="1.5"/>`;
  svg += `<line x1="${lgX + 6}" y1="${lgY + 40}" x2="${lgX + 18}" y2="${lgY + 40}" stroke="${C.concrete}" stroke-width="1.5"/>`;
  svg += `<text x="${lgX + 25}" y="${lgY + 40}" font-size="6" fill="${C.text}">RCC Beam</text>`;

  // One-way arrow
  svg += `<line x1="${lgX + 8}" y1="${lgY + 50}" x2="${lgX + 16}" y2="${lgY + 50}" stroke="${C.steel}" stroke-width="1.2"/>`;
  svg += `<polygon points="${lgX + 16},${lgY + 50} ${lgX + 13},${lgY + 48} ${lgX + 13},${lgY + 52}" fill="${C.steel}"/>`;
  svg += `<text x="${lgX + 25}" y="${lgY + 53}" font-size="6" fill="${C.text}">One-Way Slab Span</text>`;

  // Two-way arrows
  svg += `<line x1="${lgX + 8}" y1="${lgY + 62}" x2="${lgX + 16}" y2="${lgY + 62}" stroke="${C.steel}" stroke-width="1"/>`;
  svg += `<line x1="${lgX + 12}" y1="${lgY + 58}" x2="${lgX + 12}" y2="${lgY + 66}" stroke="${C.steel}" stroke-width="1"/>`;
  svg += `<text x="${lgX + 25}" y="${lgY + 65}" font-size="6" fill="${C.text}">Two-Way Slab Span</text>`;

  // Staircase hatch
  const shId = 'lgStHatch';
  svg += `<defs><pattern id="${shId}" width="6" height="6" patternUnits="userSpaceOnUse">`;
  svg += `<line x1="0" y1="0" x2="6" y2="6" stroke="${C.dim}" stroke-width="0.4"/>`;
  svg += `<line x1="6" y1="0" x2="0" y2="6" stroke="${C.dim}" stroke-width="0.4"/>`;
  svg += `</pattern></defs>`;
  svg += `<rect x="${lgX + 6}" y="${lgY + 72}" width="12" height="8" fill="url(#${shId})" stroke="${C.dim}" stroke-width="0.5"/>`;
  svg += `<text x="${lgX + 25}" y="${lgY + 80}" font-size="6" fill="${C.text}">Staircase Opening</text>`;

  // Notes
  svg += `<text x="${bx}" y="${by + bd + 15}" font-size="5" fill="${C.text}">NOTES: 1. ALL BEAMS 230×400mm UNLESS NOTED. 2. SLAB THICKNESS 150mm (CANT: 120mm).</text>`;
  svg += `<text x="${bx}" y="${by + bd + 24}" font-size="5" fill="${C.text}">3. CONCRETE GRADE M25. 4. STEEL GRADE Fe500D. 5. CLEAR COVER: SLAB 20mm, BEAM 25mm.</text>`;

  svg += `</svg>`;
  return svg;
}
