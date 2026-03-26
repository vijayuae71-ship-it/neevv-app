import { Layout } from '../../types';
import { C, MARGIN, SC, dimChain, drawingBorder, northArrow, legend, gridLabels } from '../drawingHelpers';

export function renderRCCDetail(layout: Layout, numFloors: number): string {
  const floor = layout.floors[0];
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const sb = layout.setbacks;
  const bx0 = sb.left;
  const by0 = sb.front;
  const bw = plotW - sb.left - sb.right;
  const bd = plotD - sb.front - sb.rear;
  const svgW = Math.max(700, MARGIN * 2 + plotW * SC + 120);
  const svgH = Math.max(500, MARGIN * 2 + plotD * SC + 80);
  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => MARGIN + m * SC;
  const p: string[] = [];

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);
  p.push(drawingBorder(svgW, svgH, 'RCC STRUCTURAL LAYOUT', `${numFloors}-Storey | M25 Concrete / Fe500 Steel`));
  p.push(northArrow(svgW - 40, 70));

  // Defs
  p.push(`<defs>`);
  p.push(`<pattern id="slabMesh" width="10" height="10" patternUnits="userSpaceOnUse">`);
  p.push(`<line x1="0" y1="0" x2="10" y2="0" stroke="#bdc3c7" stroke-width="0.3"/>`);
  p.push(`<line x1="0" y1="0" x2="0" y2="10" stroke="#bdc3c7" stroke-width="0.3"/>`);
  p.push(`</pattern>`);
  p.push(`<pattern id="colHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`);
  p.push(`<line x1="0" y1="0" x2="0" y2="6" stroke="${C.accent}" stroke-width="0.5"/>`);
  p.push(`</pattern>`);
  p.push(`</defs>`);

  // Plot boundary
  p.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${plotW * SC}" height="${plotD * SC}" fill="none" stroke="${C.plot}" stroke-width="1" stroke-dasharray="10,5"/>`);

  // Slab outline with mesh pattern
  p.push(`<rect x="${tx(bx0)}" y="${ty(by0)}" width="${bw * SC}" height="${bd * SC}" fill="url(#slabMesh)" stroke="${C.wall}" stroke-width="2"/>`);
  p.push(`<text x="${tx(bx0 + bw / 2)}" y="${ty(by0 + bd / 2)}" text-anchor="middle" font-size="10" fill="${C.dim}" font-style="italic">SLAB (125mm thick)</text>`);
  p.push(`<text x="${tx(bx0 + bw / 2)}" y="${ty(by0 + bd / 2) + 14}" text-anchor="middle" font-size="8" fill="${C.dim}">10mm Ø @ 150mm c/c (main) + 8mm Ø @ 200mm c/c (dist.)</text>`);

  // Column positions
  const columns = floor.columns && floor.columns.length > 0
    ? floor.columns
    : generateDefaultColumns(bw, bd);

  const colWidthM = 0.23;
  const colDepthM = 0.30;
  const colWidthPx = colWidthM * SC;
  const colDepthPx = colDepthM * SC;

  columns.forEach((col, i) => {
    const cx = tx(bx0 + col.x) - colWidthPx / 2;
    const cy = ty(by0 + col.y) - colDepthPx / 2;
    const label = `C${i + 1}`;

    // Column rectangle with cross-hatch
    p.push(`<rect x="${cx}" y="${cy}" width="${colWidthPx}" height="${colDepthPx}" fill="url(#colHatch)" stroke="${C.wall}" stroke-width="1.5"/>`);
    // Cross inside column
    p.push(`<line x1="${cx}" y1="${cy}" x2="${cx + colWidthPx}" y2="${cy + colDepthPx}" stroke="${C.accent}" stroke-width="0.5"/>`);
    p.push(`<line x1="${cx + colWidthPx}" y1="${cy}" x2="${cx}" y2="${cy + colDepthPx}" stroke="${C.accent}" stroke-width="0.5"/>`);

    // Column label
    p.push(`<circle cx="${cx + colWidthPx / 2}" cy="${cy - 10}" r="8" fill="white" stroke="${C.accent}" stroke-width="1"/>`);
    p.push(`<text x="${cx + colWidthPx / 2}" y="${cy - 7}" text-anchor="middle" font-size="7" font-weight="bold" fill="${C.accent}">${label}</text>`);

    // Leader line
    p.push(`<line x1="${cx + colWidthPx / 2}" y1="${cy - 2}" x2="${cx + colWidthPx / 2}" y2="${cy}" stroke="${C.accent}" stroke-width="0.5"/>`);
  });

  // Beam lines connecting columns
  let beamCount = 0;
  const beamThickPx = 0.15 * SC; // 150mm beam width

  // Sort columns by position for beam connections
  const sortedCols = [...columns].sort((a, b) => a.y - b.y || a.x - b.x);

  // Group columns by approximate Y position (rows)
  const rowGroups: Array<Array<{ x: number; y: number; idx: number }>> = [];
  let currentRow: Array<{ x: number; y: number; idx: number }> = [];
  let lastY = -1;

  sortedCols.forEach((col, i) => {
    if (lastY >= 0 && Math.abs(col.y - lastY) > 0.5) {
      if (currentRow.length > 0) rowGroups.push(currentRow);
      currentRow = [];
    }
    currentRow.push({ ...col, idx: i });
    lastY = col.y;
  });
  if (currentRow.length > 0) rowGroups.push(currentRow);

  // Draw horizontal beams within rows
  rowGroups.forEach((row) => {
    row.sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length - 1; i++) {
      beamCount++;
      const x1 = tx(bx0 + row[i].x);
      const y1 = ty(by0 + row[i].y);
      const x2 = tx(bx0 + row[i + 1].x);

      // Beam rectangle
      p.push(`<rect x="${x1}" y="${y1 - beamThickPx / 2}" width="${x2 - x1}" height="${beamThickPx}" fill="#ecf0f1" fill-opacity="0.6" stroke="${C.wall}" stroke-width="1.2"/>`);
      // Center line
      p.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="${C.wall}" stroke-width="0.5" stroke-dasharray="4,2"/>`);
      // Label
      p.push(`<text x="${(x1 + x2) / 2}" y="${y1 - beamThickPx / 2 - 3}" text-anchor="middle" font-size="6" fill="${C.wall}" font-weight="bold">B${beamCount}</text>`);
    }
  });

  // Draw vertical beams between rows
  if (rowGroups.length > 1) {
    // Connect columns vertically
    const colGroups: Array<Array<{ x: number; y: number }>> = [];
    const allByX = [...columns].sort((a, b) => a.x - b.x);
    let currentCol: Array<{ x: number; y: number }> = [];
    let lastX = -1;

    allByX.forEach((col) => {
      if (lastX >= 0 && Math.abs(col.x - lastX) > 0.5) {
        if (currentCol.length > 0) colGroups.push(currentCol);
        currentCol = [];
      }
      currentCol.push(col);
      lastX = col.x;
    });
    if (currentCol.length > 0) colGroups.push(currentCol);

    colGroups.forEach((col) => {
      col.sort((a, b) => a.y - b.y);
      for (let i = 0; i < col.length - 1; i++) {
        beamCount++;
        const x1 = tx(bx0 + col[i].x);
        const y1 = ty(by0 + col[i].y);
        const y2 = ty(by0 + col[i + 1].y);

        p.push(`<rect x="${x1 - beamThickPx / 2}" y="${y1}" width="${beamThickPx}" height="${y2 - y1}" fill="#ecf0f1" fill-opacity="0.6" stroke="${C.wall}" stroke-width="1.2"/>`);
        p.push(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="${C.wall}" stroke-width="0.5" stroke-dasharray="4,2"/>`);
        p.push(`<text x="${x1 - beamThickPx / 2 - 3}" y="${(y1 + y2) / 2}" text-anchor="end" font-size="6" fill="${C.wall}" font-weight="bold" transform="rotate(-90,${x1 - beamThickPx / 2 - 3},${(y1 + y2) / 2})">B${beamCount}</text>`);
      }
    });
  }

  // Room labels (lighter, behind structure)
  floor.rooms.forEach((r) => {
    const cx = tx(bx0 + r.x + r.width / 2);
    const cy = ty(by0 + r.y + r.depth / 2);
    p.push(`<text x="${cx}" y="${cy + 25}" text-anchor="middle" font-size="7" fill="${C.dim}">${r.name}</text>`);
  });

  // Dimension chains
  p.push(dimChain(tx(0), ty(plotD) + 30, tx(plotW), ty(plotD) + 30, `${plotW.toFixed(1)}m`, 'h'));
  p.push(dimChain(tx(bx0), ty(plotD) + 50, tx(bx0 + bw), ty(plotD) + 50, `${bw.toFixed(1)}m`, 'h'));
  p.push(dimChain(tx(plotW) + 30, ty(0), tx(plotW) + 30, ty(plotD), `${plotD.toFixed(1)}m`, 'v'));
  p.push(dimChain(tx(plotW) + 50, ty(by0), tx(plotW) + 50, ty(by0 + bd), `${bd.toFixed(1)}m`, 'v'));

  p.push(gridLabels(tx, ty, bx0, by0, bw, bd, floor.rooms));

  // Column schedule mini-table
  const tblX = tx(0) + 10;
  const tblY = ty(plotD) + 35;
  p.push(`<text x="${tblX}" y="${tblY}" font-size="9" font-weight="bold" fill="${C.text}">STRUCTURAL SCHEDULE</text>`);
  const schedItems = [
    ['Column', `${colWidthM * 1000}×${colDepthM * 1000}mm`, '4-16mm Ø', '8mm Ø @ 150mm c/c'],
    ['Beam', '150×300mm', '2-16mm(T) + 2-12mm(B)', '8mm Ø @ 150mm c/c'],
    ['Slab', '125mm thick', '10mm Ø @ 150mm c/c', '8mm Ø @ 200mm c/c (dist)'],
    ['Footing', '1200×1200×450mm', '12mm Ø @ 150mm c/c', 'Both ways'],
  ];
  const schColW = [60, 110, 140, 130];
  const schW = schColW.reduce((a, b) => a + b, 0);
  const schHeaders = ['Member', 'Size', 'Main Steel', 'Stirrups / Dist.'];

  // Header
  p.push(`<rect x="${tblX}" y="${tblY + 5}" width="${schW}" height="16" fill="#2c3e50" stroke="${C.wall}" stroke-width="1"/>`);
  let shx = tblX;
  schHeaders.forEach((h, i) => {
    p.push(`<text x="${shx + schColW[i] / 2}" y="${tblY + 17}" text-anchor="middle" font-size="6.5" font-weight="bold" fill="white">${h}</text>`);
    shx += schColW[i];
  });

  schedItems.forEach((row, ri) => {
    const ry = tblY + 21 + ri * 15;
    const bg = ri % 2 === 0 ? '#fff' : '#f8f9fa';
    p.push(`<rect x="${tblX}" y="${ry}" width="${schW}" height="15" fill="${bg}" stroke="${C.dim}" stroke-width="0.3"/>`);
    let rx = tblX;
    row.forEach((cell, ci) => {
      p.push(`<text x="${rx + schColW[ci] / 2}" y="${ry + 11}" text-anchor="middle" font-size="6" fill="${C.text}">${cell}</text>`);
      rx += schColW[ci];
    });
  });
  p.push(`<rect x="${tblX}" y="${tblY + 5}" width="${schW}" height="${16 + schedItems.length * 15}" fill="none" stroke="${C.wall}" stroke-width="1"/>`);

  const notes = [
    'NOTES:',
    '1. Concrete: M25 grade (fck = 25 N/mm²)',
    '2. Steel: Fe500D TMT as per IS 1786',
    `3. Columns: ${columns.length} nos., ${colWidthM * 1000}×${colDepthM * 1000}mm`,
    `4. Beams: ${beamCount} nos., 150×300mm`,
    '5. Slab: 125mm thick RCC, two-way where Ly/Lx < 2',
    '6. Min. clear cover as per IS 456:2000',
    '7. All dimensions in mm unless otherwise noted',
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}

/** Generate default column positions if layout doesn't specify them */
function generateDefaultColumns(bw: number, bd: number): Array<{ x: number; y: number }> {
  const cols: Array<{ x: number; y: number }> = [];
  const spacingX = bw > 6 ? bw / Math.ceil(bw / 3.5) : bw;
  const spacingY = bd > 6 ? bd / Math.ceil(bd / 3.5) : bd;
  const nx = Math.ceil(bw / spacingX) + 1;
  const ny = Math.ceil(bd / spacingY) + 1;

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      cols.push({
        x: Math.min(ix * spacingX, bw),
        y: Math.min(iy * spacingY, bd),
      });
    }
  }
  return cols;
}
