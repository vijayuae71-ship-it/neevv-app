import { Layout } from '../../types';
import { C, MARGIN, drawingBorder, legend } from '../drawingHelpers';

interface BBSRow {
  member: string;
  mark: string;
  dia: number;
  shape: string;
  length: number;
  nos: number;
  totalLength: number;
  weight: number;
}

function drawTable(p: string[], x: number, y: number, headers: string[], rows: string[][], colWidths: number[]): void {
  const rowH = 22;
  const headerH = 26;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  // Header background
  p.push(`<rect x="${x}" y="${y}" width="${totalW}" height="${headerH}" fill="#2c3e50" stroke="${C.wall}" stroke-width="1"/>`);

  // Header text
  let hx = x;
  headers.forEach((h, i) => {
    p.push(`<text x="${hx + colWidths[i] / 2}" y="${y + headerH / 2 + 4}" text-anchor="middle" font-size="8" font-weight="bold" fill="white">${h}</text>`);
    hx += colWidths[i];
  });

  // Rows
  rows.forEach((row, ri) => {
    const ry = y + headerH + ri * rowH;
    const bgColor = ri % 2 === 0 ? '#ffffff' : '#f8f9fa';
    p.push(`<rect x="${x}" y="${ry}" width="${totalW}" height="${rowH}" fill="${bgColor}" stroke="${C.dim}" stroke-width="0.5"/>`);
    let rx = x;
    row.forEach((cell, ci) => {
      p.push(`<text x="${rx + colWidths[ci] / 2}" y="${ry + rowH / 2 + 4}" text-anchor="middle" font-size="7.5" fill="${C.text}">${cell}</text>`);
      rx += colWidths[ci];
    });
  });

  // Table border
  p.push(`<rect x="${x}" y="${y}" width="${totalW}" height="${headerH + rows.length * rowH}" fill="none" stroke="${C.wall}" stroke-width="1.5"/>`);
  // Column separator lines
  let lx = x;
  colWidths.forEach((w, i) => {
    if (i > 0) {
      p.push(`<line x1="${lx}" y1="${y}" x2="${lx}" y2="${y + headerH + rows.length * rowH}" stroke="${C.dim}" stroke-width="0.5"/>`);
    }
    lx += w;
  });
}

function barShape(p: string[], x: number, y: number, type: string): void {
  const w = 40, h = 14;
  const cx = x, cy = y - h / 2;
  switch (type) {
    case 'straight':
      p.push(`<line x1="${cx - w / 2}" y1="${cy + h / 2}" x2="${cx + w / 2}" y2="${cy + h / 2}" stroke="${C.accent}" stroke-width="1.5"/>`);
      break;
    case 'bent':
      p.push(`<polyline points="${cx - w / 2},${cy + h / 2} ${cx - w / 2 + 6},${cy + h / 2} ${cx - w / 2 + 6},${cy} ${cx + w / 2 - 6},${cy} ${cx + w / 2 - 6},${cy + h / 2} ${cx + w / 2},${cy + h / 2}" fill="none" stroke="${C.accent}" stroke-width="1.5"/>`);
      break;
    case 'stirrup':
      p.push(`<rect x="${cx - w / 3}" y="${cy + 1}" width="${w * 2 / 3}" height="${h - 2}" fill="none" stroke="${C.accent}" stroke-width="1.5" rx="1"/>`);
      // 135° hooks
      p.push(`<line x1="${cx - w / 3}" y1="${cy + 1}" x2="${cx - w / 3 + 4}" y2="${cy + 5}" stroke="${C.accent}" stroke-width="1.5"/>`);
      p.push(`<line x1="${cx + w / 3}" y1="${cy + 1}" x2="${cx + w / 3 - 4}" y2="${cy + 5}" stroke="${C.accent}" stroke-width="1.5"/>`);
      break;
    case 'Lbar':
      p.push(`<polyline points="${cx - w / 2},${cy} ${cx - w / 2},${cy + h} ${cx + w / 2},${cy + h}" fill="none" stroke="${C.accent}" stroke-width="1.5"/>`);
      break;
    default:
      p.push(`<line x1="${cx - w / 2}" y1="${cy + h / 2}" x2="${cx + w / 2}" y2="${cy + h / 2}" stroke="${C.accent}" stroke-width="1.5"/>`);
  }
}

export function renderBarBending(layout: Layout, numFloors: number): string {
  const floor = layout.floors[0];
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const sb = layout.setbacks;
  const bw = plotW - sb.left - sb.right;
  const bd = plotD - sb.front - sb.rear;
  const svgW = 800;
  const svgH = 650;
  const p: string[] = [];

  // Calculate bar counts based on layout
  const numCols = (floor.columns || []).length || 4;
  const perimeterM = 2 * (bw + bd);

  // BBS Data
  const bbsData: BBSRow[] = [
    { member: 'Footing', mark: 'A1', dia: 12, shape: 'straight', length: 1.1, nos: numCols * 8, totalLength: 0, weight: 0 },
    { member: 'Footing', mark: 'A2', dia: 12, shape: 'straight', length: 1.1, nos: numCols * 8, totalLength: 0, weight: 0 },
    { member: 'Column', mark: 'B1', dia: 16, shape: 'straight', length: 3.2 * numFloors + 0.5, nos: numCols * 4, totalLength: 0, weight: 0 },
    { member: 'Column', mark: 'B2', dia: 8, shape: 'stirrup', length: 0.9, nos: numCols * Math.ceil(3.2 / 0.15) * numFloors, totalLength: 0, weight: 0 },
    { member: 'Beam', mark: 'C1', dia: 16, shape: 'straight', length: bw + 0.6, nos: Math.ceil(bd / 3) * 2, totalLength: 0, weight: 0 },
    { member: 'Beam', mark: 'C2', dia: 12, shape: 'straight', length: bw + 0.6, nos: Math.ceil(bd / 3) * 2, totalLength: 0, weight: 0 },
    { member: 'Beam', mark: 'C3', dia: 16, shape: 'bent', length: bd + 0.6, nos: Math.ceil(bw / 3) * 2, totalLength: 0, weight: 0 },
    { member: 'Beam', mark: 'C4', dia: 8, shape: 'stirrup', length: 0.78, nos: Math.ceil(perimeterM / 0.15) * 2, totalLength: 0, weight: 0 },
    { member: 'Slab', mark: 'D1', dia: 10, shape: 'straight', length: bw + 0.3, nos: Math.ceil(bd / 0.15), totalLength: 0, weight: 0 },
    { member: 'Slab', mark: 'D2', dia: 8, shape: 'straight', length: bd + 0.3, nos: Math.ceil(bw / 0.20), totalLength: 0, weight: 0 },
  ];

  // Calculate totals
  const unitWeights: Record<number, number> = { 8: 0.395, 10: 0.617, 12: 0.889, 16: 1.580 };
  bbsData.forEach((row) => {
    row.totalLength = +(row.length * row.nos).toFixed(1);
    row.weight = +(row.totalLength * (unitWeights[row.dia] || 0.617)).toFixed(1);
  });

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);
  p.push(drawingBorder(svgW, svgH, 'BAR BENDING SCHEDULE', `Plot: ${plotW}m × ${plotD}m | ${numFloors}-Storey | M25/Fe500`));

  // Table headers
  const headers = ['Member', 'Bar Mark', 'Dia (mm)', 'Shape', 'Length (m)', 'Nos.', 'Total Len (m)', 'Weight (kg)'];
  const colWidths = [80, 65, 60, 80, 75, 55, 85, 80];
  const tableX = 60;
  const tableY = 80;

  // Convert data to string rows
  const rows = bbsData.map((r) => [
    r.member, r.mark, r.dia.toString(), '', r.length.toFixed(2), r.nos.toString(), r.totalLength.toFixed(1), r.weight.toFixed(1),
  ]);

  drawTable(p, tableX, tableY, headers, rows, colWidths);

  // Draw bar shapes in the shape column
  const shapeColX = tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] / 2;
  bbsData.forEach((r, i) => {
    const ry = tableY + 26 + i * 22 + 11;
    barShape(p, shapeColX, ry, r.shape);
  });

  // Totals row
  const totalWeight = bbsData.reduce((s, r) => s + r.weight, 0);
  const totalLength = bbsData.reduce((s, r) => s + r.totalLength, 0);
  const totY = tableY + 26 + bbsData.length * 22;
  const totW = colWidths.reduce((a, b) => a + b, 0);
  p.push(`<rect x="${tableX}" y="${totY}" width="${totW}" height="${24}" fill="#2c3e50" stroke="${C.wall}" stroke-width="1.5"/>`);
  p.push(`<text x="${tableX + colWidths[0] / 2}" y="${totY + 16}" text-anchor="middle" font-size="9" font-weight="bold" fill="white">TOTAL</text>`);
  p.push(`<text x="${tableX + totW - colWidths[7] - colWidths[6] / 2}" y="${totY + 16}" text-anchor="middle" font-size="9" font-weight="bold" fill="white">${totalLength.toFixed(1)}</text>`);
  p.push(`<text x="${tableX + totW - colWidths[7] / 2}" y="${totY + 16}" text-anchor="middle" font-size="9" font-weight="bold" fill="white">${totalWeight.toFixed(1)}</text>`);

  // Weight per floor
  const perFloorNote = numFloors > 1 ? ` (×${numFloors} floors ≈ ${(totalWeight * numFloors).toFixed(0)} kg total)` : '';

  // Summary section
  const sumY = totY + 50;
  p.push(`<text x="${tableX}" y="${sumY}" font-size="10" font-weight="bold" fill="${C.text}">SUMMARY</text>`);
  p.push(`<text x="${tableX}" y="${sumY + 18}" font-size="8" fill="${C.text}">Total steel weight (per floor): ${totalWeight.toFixed(1)} kg${perFloorNote}</text>`);
  p.push(`<text x="${tableX}" y="${sumY + 33}" font-size="8" fill="${C.text}">Steel ratio: ~${((totalWeight / (bw * bd * 0.125 * 2400)) * 100).toFixed(2)}% of slab concrete</text>`);

  // Bar shape legend
  const legY = sumY + 55;
  p.push(`<text x="${tableX}" y="${legY}" font-size="10" font-weight="bold" fill="${C.text}">BAR SHAPE LEGEND</text>`);
  const shapes = [
    { name: 'Straight Bar', type: 'straight' },
    { name: 'Bent-up Bar', type: 'bent' },
    { name: 'Stirrup (135° hook)', type: 'stirrup' },
    { name: 'L-Bar', type: 'Lbar' },
  ];
  shapes.forEach((s, i) => {
    const sx = tableX + 30 + i * 160;
    barShape(p, sx, legY + 22, s.type);
    p.push(`<text x="${sx}" y="${legY + 36}" text-anchor="middle" font-size="7" fill="${C.dim}">${s.name}</text>`);
  });

  // Unit weight table
  const uwY = legY + 55;
  p.push(`<text x="${tableX}" y="${uwY}" font-size="9" font-weight="bold" fill="${C.text}">UNIT WEIGHT OF STEEL (Fe500)</text>`);
  const uwHeaders = ['Dia (mm)', '8', '10', '12', '16', '20', '25'];
  const uwValues = ['kg/m', '0.395', '0.617', '0.889', '1.580', '2.469', '3.854'];
  const uwColW = 75;
  uwHeaders.forEach((h, i) => {
    p.push(`<rect x="${tableX + i * uwColW}" y="${uwY + 5}" width="${uwColW}" height="18" fill="${i === 0 ? '#2c3e50' : '#f8f9fa'}" stroke="${C.dim}" stroke-width="0.5"/>`);
    p.push(`<text x="${tableX + i * uwColW + uwColW / 2}" y="${uwY + 18}" text-anchor="middle" font-size="7.5" fill="${i === 0 ? 'white' : C.text}" font-weight="${i === 0 ? 'bold' : 'normal'}">${h}</text>`);
    p.push(`<rect x="${tableX + i * uwColW}" y="${uwY + 23}" width="${uwColW}" height="18" fill="${i === 0 ? '#34495e' : '#ffffff'}" stroke="${C.dim}" stroke-width="0.5"/>`);
    p.push(`<text x="${tableX + i * uwColW + uwColW / 2}" y="${uwY + 36}" text-anchor="middle" font-size="7.5" fill="${i === 0 ? 'white' : C.text}" font-weight="${i === 0 ? 'bold' : 'normal'}">${uwValues[i]}</text>`);
  });

  const notes = [
    'NOTES:',
    '1. All steel: Fe500D TMT bars as per IS 1786',
    '2. Cutting length = Clear span + 2×Ld - 2×bend deductions',
    '3. Lap length: 50d (columns), 40d (beams/slabs)',
    '4. Stirrup hooks: 135° as per IS 456:2000',
    '5. Wastage: Add 3-5% to total quantities',
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}
